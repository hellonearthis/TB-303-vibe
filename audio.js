class TB303AudioEngine {
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

    setParam(key, value) {
        this.params[key] = value;
        this.updateSynthParams();
    }

    setPedal(pedalName, isActive) {
        if (pedalName === 'overdrive') {
            this.distortion.wet.value = isActive ? 1 : 0;
        } else if (pedalName === 'phaser') {
            this.phaser.wet.value = isActive ? 1 : 0;
        } else if (pedalName === 'delay') {
            // Mix delay to 50% when active
            this.delay.wet.value = isActive ? 0.5 : 0;
        }
    }

    updateSynthParams() {
        // Wave
        this.synth.oscillator.type = this.params.wave;

        // Cutoff (map 0-1 to frequency)
        const baseFreq = Tone.Frequency(100).toFrequency() + (this.params.cutoff * 1000);
        this.synth.filterEnvelope.baseFrequency = baseFreq;

        // Resonance
        this.synth.filter.Q.value = this.params.resonance * 20;

        // Env Mod (how many octaves the envelope sweeps)
        this.synth.filterEnvelope.octaves = this.params.envMod * 6;

        // Decay
        const decayTime = 0.1 + (this.params.decay * 1.5);
        this.synth.envelope.decay = decayTime;
        this.synth.filterEnvelope.decay = decayTime;
    }

    playStep(note, time, slide, accent, ghost, stepDuration, prevSlide) {
        if (!note) {
            if (prevSlide) {
                this.synth.triggerRelease(time);
            }
            return;
        }

        // Accent / Ghost logic
        const baseDecay = 0.1 + (this.params.decay * 1.5);
        
        if (accent) {
            const amt = this.params.accentAmount;
            // Accent pushes volume, filter cutoff, and changes decay based on slide
            this.volume.volume.setValueAtTime(-8 + (6 * amt), time); // Boost vol
            this.synth.filterEnvelope.octaves = (this.params.envMod * 6) + (2.5 * amt); // Boost env mod
            
            if (slide) {
                // The ultimate 303 trick: Accent + Slide stretches out and bleeds
                this.synth.envelope.decay = baseDecay * (1 + 0.5 * amt);
                this.synth.filterEnvelope.decay = baseDecay * (1 + 0.5 * amt);
            } else {
                // Snappy decay for normal accent
                this.synth.envelope.decay = baseDecay * (1 - 0.7 * amt);
                this.synth.filterEnvelope.decay = baseDecay * (1 - 0.7 * amt);
            }
        } else if (ghost) {
            // Ghost does the reverse: lowers volume, reduces filter intensity
            this.volume.volume.setValueAtTime(-14, time); // Lower vol
            this.synth.filterEnvelope.octaves = (this.params.envMod * 6) - 1.5; // Reduce env mod
            this.synth.envelope.decay = baseDecay * 1.2; // Slightly longer/softer decay
            this.synth.filterEnvelope.decay = baseDecay * 1.2;
        } else {
            this.volume.volume.setValueAtTime(-8, time);
            this.synth.filterEnvelope.octaves = this.params.envMod * 6;
            this.synth.envelope.decay = baseDecay;
            this.synth.filterEnvelope.decay = baseDecay;
        }

        // Slide (Portamento)
        if (prevSlide) {
            // Previous note slides into this one
            this.synth.portamento = stepDuration * 0.8;
            this.synth.setNote(note, time);
            
            // If this note doesn't slide into the next, release it normally
            if (!slide) {
                this.synth.triggerRelease(time + stepDuration * 0.5);
            }
        } else {
            this.synth.portamento = 0;
            if (slide) {
                // This note slides into the next, so don't release it
                this.synth.triggerAttack(note, time);
            } else {
                // Normal note, standard gate
                this.synth.triggerAttackRelease(note, stepDuration * 0.5, time);
            }
        }
    }
}

window.AudioEngine = new TB303AudioEngine();

// MIDI → TB-303 audio routing
window.addEventListener('midiCCChange', (e) => {
    const { parameter, scaledValue } = e.detail;
    const tb303Params = ['cutoff', 'resonance', 'envMod', 'decay', 'accentAmount'];
    if (tb303Params.includes(parameter)) {
        window.AudioEngine.setParam(parameter, scaledValue);
    }
});
