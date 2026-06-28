class TB303AudioEngine {
    constructor() {
        this.synth = new Tone.MonoSynth({
            oscillator: { type: 'sawtooth' },
            filter: { type: 'lowpass', rolloff: -24, Q: 2 },
            envelope: { attack: 0.01, decay: 0.4, sustain: 0, release: 0.1 },
            filterEnvelope: { attack: 0.01, decay: 0.4, sustain: 0, release: 0.1, baseFrequency: 300, octaves: 4, exponent: 2 }
        });

        // The 303 distortion
        this.distortion = new Tone.Distortion(0.5);
        this.volume = new Tone.Volume(-6); // Prevent clipping

        this.synth.chain(this.distortion, this.volume, Tone.Destination);

        // Parameters
        this.params = {
            wave: 'sawtooth',
            cutoff: 0.5,
            resonance: 0.5,
            envMod: 0.7,
            decay: 0.4
        };

        this.updateSynthParams();
    }

    setParam(key, value) {
        this.params[key] = value;
        this.updateSynthParams();
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

    playStep(note, time, slide, accent, ghost, stepDuration) {
        if (!note) return;

        // Accent / Ghost logic
        const currentDecay = this.synth.envelope.decay;
        
        if (accent) {
            // Accent pushes volume, filter cutoff, and shortens decay slightly for punch
            this.volume.volume.setValueAtTime(-2, time); // Boost vol
            this.synth.filterEnvelope.octaves = (this.params.envMod * 6) + 1.5; // Boost env mod
            this.synth.envelope.decay = currentDecay * 0.5;
            this.synth.filterEnvelope.decay = currentDecay * 0.5;
        } else if (ghost) {
            // Ghost does the reverse: lowers volume, reduces filter intensity
            this.volume.volume.setValueAtTime(-14, time); // Lower vol
            this.synth.filterEnvelope.octaves = (this.params.envMod * 6) - 1.5; // Reduce env mod
            this.synth.envelope.decay = currentDecay * 1.2; // Slightly longer/softer decay
            this.synth.filterEnvelope.decay = currentDecay * 1.2;
        } else {
            this.volume.volume.setValueAtTime(-8, time);
            this.synth.filterEnvelope.octaves = this.params.envMod * 6;
            this.synth.envelope.decay = currentDecay;
            this.synth.filterEnvelope.decay = currentDecay;
        }

        // Slide (Portamento)
        if (slide) {
            this.synth.portamento = stepDuration * 0.8; 
            // Don't retrigger envelopes if it's a slide and synth is already playing
            // Tone.js MonoSynth handles portamento automatically if we just set the frequency
            this.synth.setNote(note, time);
        } else {
            this.synth.portamento = 0;
            // Trigger attack
            this.synth.triggerAttackRelease(note, stepDuration * 0.8, time);
        }
    }
}

window.AudioEngine = new TB303AudioEngine();
