class TB303AudioEngine {
    // WHAT: Initializes the TB-303 audio engine, setting up the synthesizer, pedals, and default parameters.
    // WHY: We need a central class to manage the Tone.js nodes and signal chain so the sequencer and UI can easily interact with it without worrying about Web Audio API internals.
    constructor() {
        this.synth = new Tone.MonoSynth({
            oscillator: { type: 'sawtooth' },
            filter: { type: 'lowpass', rolloff: -12, Q: 2 },
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

        this.dynamicsVolume = new Tone.Volume(-6); // Internal dynamics (accents/ghosts)
        this.masterVolume = new Tone.Volume(-9); // Master volume for user control

        // Blend a two-pole and cascaded four-pole path to approximate the original
        // TB-303's intermediate three-pole (-18 dB/octave) response in Tone.js.
        this.slopeFilter = new Tone.Filter({ type: 'lowpass', frequency: 300, rolloff: -12, Q: 0.2 });
        this.slopeBlend = new Tone.CrossFade(0.38);
        this.synth.connect(this.slopeBlend.a);
        this.synth.connect(this.slopeFilter);
        this.slopeFilter.connect(this.slopeBlend.b);
        this.synth.filterEnvelope.connect(this.slopeFilter.frequency);
        this.slopeBlend.chain(this.distortion, this.phaser, this.delay, this.dynamicsVolume, this.masterVolume, Tone.Destination);

        // WHAT: Expose masterVolume as 'volume' so that aux routing (Grandmother/Monotron) still works.
        // WHY: Other modules reference window.AudioEngine.volume to disconnect/reconnect the final output node.
        this.volume = this.masterVolume;

        // Parameters
        this.params = {
            wave: 'sawtooth',
            tuning: 0.5,
            cutoff: 0.5,
            resonance: 0.5,
            envMod: 0.7,
            decay: 0.4,
            accentAmount: 0.7,
            volume: 0.7
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

        // Tune maps the original panel control to one semitone either side of concert pitch.
        this.synth.detune.value = (this.params.tuning - 0.5) * 200;

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

        // Master Volume
        this.masterVolume.volume.value = -30 + (this.params.volume * 30);
    }

    // WHAT: Triggers a specific musical step on the synthesizer, applying 303-specific logic like slides, accents, and ghosts.
    // WHY: The TB-303's unique sound comes from how steps interact with each other (e.g., overlapping envelopes). This function orchestrates those interactions based on the sequencer state.
    playStep(musical_note, scheduled_time, is_slide_enabled, is_accent_enabled, is_ghost_enabled, step_duration_seconds, previous_step_slide_enabled, next_step_tie_enabled) {
        if (!musical_note) {
            if (previous_step_slide_enabled) {
                this.synth.triggerRelease(scheduled_time);
            }
            return;
        }

        // The original Accent circuit increases VCA level and filter-envelope
        // depth. It does not replace the front-panel decay value per step.
        const base_decay_time_seconds = 0.1 + (this.params.decay * 1.5);
        this.synth.envelope.decay = base_decay_time_seconds;
        this.synth.filterEnvelope.decay = base_decay_time_seconds;

        if (is_accent_enabled) {
            const accent_intensity_amount = this.params.accentAmount;
            this.dynamicsVolume.volume.setValueAtTime(-8 + (5 * accent_intensity_amount), scheduled_time);
            this.synth.filterEnvelope.octaves = (this.params.envMod * 6) + (1.8 * accent_intensity_amount);
        } else if (is_ghost_enabled) {
            // Ghost is a modern extension and only attenuates level/envelope depth.
            this.dynamicsVolume.volume.setValueAtTime(-14, scheduled_time);
            this.synth.filterEnvelope.octaves = Math.max(0, (this.params.envMod * 6) - 1.5);
        } else {
            this.dynamicsVolume.volume.setValueAtTime(-8, scheduled_time);
            this.synth.filterEnvelope.octaves = this.params.envMod * 6;
        }
        // Slide (Portamento)
        if (previous_step_slide_enabled) {
            // Previous note slides into this one
            this.synth.portamento = 0.06;
            this.synth.setNote(musical_note, scheduled_time);
            
            // If this note doesn't slide into the next, release it normally
            if (!is_slide_enabled && !next_step_tie_enabled) {
                this.synth.triggerRelease(scheduled_time + step_duration_seconds * 0.5);
            }
        } else {
            this.synth.portamento = 0;
            if (is_slide_enabled || next_step_tie_enabled) {
                // This note slides into the next, so don't release it
                this.synth.triggerAttack(musical_note, scheduled_time);
            } else {
                // Normal note, standard gate
                this.synth.triggerAttackRelease(musical_note, step_duration_seconds * 0.55, scheduled_time);
            }
        }
    }
    playTie(scheduled_time, step_duration_seconds, continues_to_another_tie) {
        if (!continues_to_another_tie) {
            this.synth.triggerRelease(scheduled_time + (step_duration_seconds * 0.95));
        }
    }
    stopAll() {
        this.synth.triggerRelease(Tone.now());
        this.synth.portamento = 0;
    }
}

window.AudioEngine = new TB303AudioEngine();

// WHAT: Listens for custom MIDI control change events and updates the synthesizer parameters.
// WHY: We want external MIDI controllers to be able to turn the software knobs in real time without needing direct access to the AudioEngine instance.
window.addEventListener('midiCCChange', (midi_control_change_event_object) => {
    const { parameter, scaledValue } = midi_control_change_event_object.detail;
    const tb303_valid_parameters_array = ['tuning', 'cutoff', 'resonance', 'envMod', 'decay', 'accentAmount', 'volume'];
    if (tb303_valid_parameters_array.includes(parameter)) {
        window.AudioEngine.setParam(parameter, scaledValue);
    }
});
window.addEventListener('midiNoteOn', async event => {
    if (document.getElementById('midi-note-target')?.value !== '303') return;
    await Tone.start();
    const { frequency, velocity } = event.detail;
    window.AudioEngine.synth.triggerAttack(frequency, Tone.now(), velocity / 127);
});

window.addEventListener('midiNoteOff', () => {
    if (document.getElementById('midi-note-target')?.value === '303') window.AudioEngine.synth.triggerRelease();
});