class TB303AudioEngine {
    // WHAT: Initializes the TB-303 audio engine, setting up the synthesizer, pedals, and default parameters.
    // WHY: We need a central class to manage the Tone.js nodes and signal chain so the sequencer and UI can easily interact with it without worrying about Web Audio API internals.
    constructor() {
        this.synth = new Tone.MonoSynth({
            oscillator: { type: 'sawtooth' },
            filter: { type: 'lowpass', rolloff: -24, Q: 2 },
            envelope: { attack: 0.01, decay: 0.4, sustain: 0, release: 0.1 },
            filterEnvelope: { attack: 0.01, decay: 0.4, sustain: 0, release: 0.1, baseFrequency: 300, octaves: 4, exponent: 2 }
        });

        // Pedals
        this.distortion = new Tone.Distortion(0.8);
        this.distortion.wet.value = 0; // Off by default

        this.phaser = new Tone.Phaser({ frequency: 0.5, octaves: 3, baseFrequency: 1000 });
        this.phaser.wet.value = 0; // Off by default

        this.delay = new Tone.FeedbackDelay("8n.", 0.4);
        this.delay.wet.value = 0; // Off by default

        this.volume = new Tone.Volume(-6); // Prevent clipping

        this.synth.chain(this.distortion, this.phaser, this.delay, this.volume, Tone.Destination);

        // Parameters
        this.params = {
            wave: 'sawtooth',
            cutoff: 0.5,
            resonance: 0.5,
            envMod: 0.7,
            decay: 0.4,
            accentAmount: 0.7
        };

        this.updateSynthParams();
    }

    // WHAT: Updates a specific synthesizer parameter and recalculates the audio engine states.
    // WHY: Provides a single entry point for UI knobs and MIDI controllers to change sound settings safely.
    setParam(parameter_name, parameter_value) {
        this.params[parameter_name] = parameter_value;
        this.updateSynthParams();
    }

    // WHAT: Toggles the effect pedals on or off in the signal chain.
    // WHY: Allows the user to bypass or engage effects like overdrive, phaser, and delay dynamically during playback.
    setPedal(pedal_name, is_pedal_active) {
        if (pedal_name === 'overdrive') {
            this.distortion.wet.value = is_pedal_active ? 1 : 0;
        } else if (pedal_name === 'phaser') {
            this.phaser.wet.value = is_pedal_active ? 1 : 0;
        } else if (pedal_name === 'delay') {
            // Mix delay to 50% when active
            this.delay.wet.value = is_pedal_active ? 0.5 : 0;
        }
    }

    // WHAT: Applies the normalized parameters (0-1) to the actual Tone.js synthesizer nodes.
    // WHY: Tone.js requires specific real-world values (like Hertz or seconds). This function translates our abstract UI slider values into usable DSP numbers.
    updateSynthParams() {
        // Wave
        this.synth.oscillator.type = this.params.wave;

        // Cutoff (map 0-1 to frequency)
        const base_frequency_hertz = Tone.Frequency(100).toFrequency() + (this.params.cutoff * 1000);
        this.synth.filterEnvelope.baseFrequency = base_frequency_hertz;

        // Resonance
        this.synth.filter.Q.value = this.params.resonance * 20;

        // Env Mod (how many octaves the envelope sweeps)
        this.synth.filterEnvelope.octaves = this.params.envMod * 6;

        // Decay
        const decay_time_seconds = 0.1 + (this.params.decay * 1.5);
        this.synth.envelope.decay = decay_time_seconds;
        this.synth.filterEnvelope.decay = decay_time_seconds;
    }

    // WHAT: Triggers a specific musical step on the synthesizer, applying 303-specific logic like slides, accents, and ghosts.
    // WHY: The TB-303's unique sound comes from how steps interact with each other (e.g., overlapping envelopes). This function orchestrates those interactions based on the sequencer state.
    playStep(musical_note, scheduled_time, is_slide_enabled, is_accent_enabled, is_ghost_enabled, step_duration_seconds, previous_step_slide_enabled) {
        if (!musical_note) {
            if (previous_step_slide_enabled) {
                this.synth.triggerRelease(scheduled_time);
            }
            return;
        }

        // Accent / Ghost logic
        const base_decay_time_seconds = 0.1 + (this.params.decay * 1.5);
        
        if (is_accent_enabled) {
            const accent_intensity_amount = this.params.accentAmount;
            // Accent pushes volume, filter cutoff, and changes decay based on slide
            this.volume.volume.setValueAtTime(-8 + (6 * accent_intensity_amount), scheduled_time); // Boost vol
            this.synth.filterEnvelope.octaves = (this.params.envMod * 6) + (2.5 * accent_intensity_amount); // Boost env mod
            
            if (is_slide_enabled) {
                // The ultimate 303 trick: Accent + Slide stretches out and bleeds
                this.synth.envelope.decay = base_decay_time_seconds * (1 + 0.5 * accent_intensity_amount);
                this.synth.filterEnvelope.decay = base_decay_time_seconds * (1 + 0.5 * accent_intensity_amount);
            } else {
                // Snappy decay for normal accent
                this.synth.envelope.decay = base_decay_time_seconds * (1 - 0.7 * accent_intensity_amount);
                this.synth.filterEnvelope.decay = base_decay_time_seconds * (1 - 0.7 * accent_intensity_amount);
            }
        } else if (is_ghost_enabled) {
            // Ghost does the reverse: lowers volume, reduces filter intensity
            this.volume.volume.setValueAtTime(-14, scheduled_time); // Lower vol
            this.synth.filterEnvelope.octaves = (this.params.envMod * 6) - 1.5; // Reduce env mod
            this.synth.envelope.decay = base_decay_time_seconds * 1.2; // Slightly longer/softer decay
            this.synth.filterEnvelope.decay = base_decay_time_seconds * 1.2;
        } else {
            this.volume.volume.setValueAtTime(-8, scheduled_time);
            this.synth.filterEnvelope.octaves = this.params.envMod * 6;
            this.synth.envelope.decay = base_decay_time_seconds;
            this.synth.filterEnvelope.decay = base_decay_time_seconds;
        }

        // Slide (Portamento)
        if (previous_step_slide_enabled) {
            // Previous note slides into this one
            this.synth.portamento = step_duration_seconds * 0.8;
            this.synth.setNote(musical_note, scheduled_time);
            
            // If this note doesn't slide into the next, release it normally
            if (!is_slide_enabled) {
                this.synth.triggerRelease(scheduled_time + step_duration_seconds * 0.5);
            }
        } else {
            this.synth.portamento = 0;
            if (is_slide_enabled) {
                // This note slides into the next, so don't release it
                this.synth.triggerAttack(musical_note, scheduled_time);
            } else {
                // Normal note, standard gate
                this.synth.triggerAttackRelease(musical_note, step_duration_seconds * 0.5, scheduled_time);
            }
        }
    }
}

window.AudioEngine = new TB303AudioEngine();

// WHAT: Listens for custom MIDI control change events and updates the synthesizer parameters.
// WHY: We want external MIDI controllers to be able to turn the software knobs in real time without needing direct access to the AudioEngine instance.
window.addEventListener('midiCCChange', (midi_control_change_event_object) => {
    const { parameter, scaledValue } = midi_control_change_event_object.detail;
    const tb303_valid_parameters_array = ['cutoff', 'resonance', 'envMod', 'decay', 'accentAmount'];
    if (tb303_valid_parameters_array.includes(parameter)) {
        window.AudioEngine.setParam(parameter, scaledValue);
    }
});
