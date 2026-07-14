/**
 * Moog Grandmother Semi-Modular Drone Engine
 * 
 * Signal chain:
 *   Osc1 (saw) ─┐
 *   Osc2 (saw, -1 oct, detuned, S&H FM) ─┤─► Mixer ─► VCF (lowpass) ─► Amp Envelope ─► Volume ─► Destination
 *   Noise (white) ─┘
 *   
 *   LFO (mod wheel) ─► VCF cutoff + Osc1/Osc2 pitch
 *   S&H (random step) ─► Osc2 frequency (linear FM)
 */
class MoogGrandmotherEngine {
    constructor() {
        this.isPlaying = false;

        // --- Parameters (0-1 normalized) ---
        this.params = {
            detune: 0.15,       // Osc2 detune amount
            noiseLevel: 0.12,   // Noise mixer level
            cutoff: 0.2,        // VCF cutoff (low = dark drone)
            resonance: 0.35,    // VCF resonance
            attack: 0.35,       // Amp envelope attack time
            modWheel: 0.25,     // Mod depth (pitch + filter)
            modRate: 0.3,       // LFO rate
            shRate: 0.4,        // Sample & Hold rate
            shDepth: 0.3,       // Sample & Hold depth → Osc2 FM
            volume: 0.7,        // Master volume
            reverb: 0.3         // Spring Reverb amount
        };

        // --- Oscillator 1 (base) ---
        this.osc1 = new Tone.Oscillator({
            type: 'sawtooth',
            frequency: 'C2',
            volume: -6
        });

        // --- Oscillator 2 (−1 octave, detuned) ---
        this.osc2 = new Tone.Oscillator({
            type: 'sawtooth',
            frequency: 'C1',
            volume: -6
        });

        // --- Noise source ---
        this.noise = new Tone.Noise('white');
        this.noiseGain = new Tone.Gain(0.05);
        this.noise.connect(this.noiseGain);

        // --- Mixer (merge osc1, osc2, noise) ---
        this.mixer = new Tone.Gain(1);
        this.osc1.connect(this.mixer);
        this.osc2.connect(this.mixer);
        this.noiseGain.connect(this.mixer);

        // --- VCF (low-pass filter) ---
        this.filter = new Tone.Filter({
            type: 'lowpass',
            frequency: 200,
            rolloff: -24,
            Q: 3
        });
        this.mixer.connect(this.filter);

        // --- Amplitude Envelope (drone-style: slow attack, full sustain) ---
        this.envelope = new Tone.AmplitudeEnvelope({
            attack: 2.0,
            decay: 0.5,
            sustain: 1.0,
            release: 3.0
        });
        this.filter.connect(this.envelope);

        // --- Output & Reverb ---
        this.volume = new Tone.Volume(-12);
        this.envelope.connect(this.volume);
        
        // Simulating Spring Reverb
        this.reverb = new Tone.Freeverb({
            roomSize: 0.75,
            dampening: 3000
        });
        
        this.volume.connect(this.reverb);
        this.reverb.toDestination();

        // --- External Instrument In (Mixer) ---
        this.extInput = new Tone.Gain(1.0);
        this.extInput.connect(this.mixer);

        // --- Modulation LFO (Mod Wheel controls depth, Mod Rate controls speed) ---
        this.modLFO = new Tone.LFO({
            type: 'sine',
            frequency: 0.5,
            min: -30,
            max: 30
        });
        // Route LFO to filter cutoff
        this.modLFOFilterGain = new Tone.Gain(0);
        this.modLFO.connect(this.modLFOFilterGain);
        this.modLFOFilterGain.connect(this.filter.frequency);

        // Route LFO to oscillator pitch (vibrato)
        this.modLFOPitchGain = new Tone.Gain(0);
        this.modLFO.connect(this.modLFOPitchGain);
        this.modLFOPitchGain.connect(this.osc1.frequency);
        this.modLFOPitchGain.connect(this.osc2.frequency);

        // --- Sample & Hold → Osc2 Linear FM ---
        // Simulated by scheduling random frequency offsets at a configurable rate
        this.shLoop = null;
        this.shGain = new Tone.Gain(0);
        // We'll use a Tone.Signal to send random values
        this.shSignal = new Tone.Signal(0);
        this.shSignal.connect(this.shGain);
        this.shGain.connect(this.osc2.frequency);

        this._applyParams();
    }

    _applyParams() {
        const p = this.params;

        // Osc2 detune: map 0-1 → 0-50 cents
        this.osc2.detune.value = p.detune * 50;

        // Noise level: map 0-1 → gain 0-0.4
        this.noiseGain.gain.value = p.noiseLevel * 0.4;

        // VCF Cutoff: map 0-1 → 60-2000 Hz (low range for dark drone)
        this.filter.frequency.value = 60 + (p.cutoff * 1940);

        // VCF Resonance: map 0-1 → Q 0.5-18
        this.filter.Q.value = 0.5 + (p.resonance * 17.5);

        // Envelope attack: map 0-1 → 0.1s-6s
        this.envelope.attack = 0.1 + (p.attack * 5.9);

        // Mod LFO rate: map 0-1 → 0.05-5 Hz
        this.modLFO.frequency.value = 0.05 + (p.modRate * 4.95);

        // Mod Wheel (depth): controls how much the LFO affects filter and pitch
        // Filter mod depth: 0-500 Hz swing
        this.modLFOFilterGain.gain.value = p.modWheel * 500;
        // Pitch mod depth: 0-8 Hz detune swing
        this.modLFOPitchGain.gain.value = p.modWheel * 8;

        // S&H depth → Osc2 FM: map 0-1 → gain 0-40
        this.shGain.gain.value = p.shDepth * 40;

        // Master volume: map 0-1 → -30 to 0 dB
        this.volume.volume.value = -30 + (p.volume * 30);
        
        // Reverb mix: 0 to 1
        this.reverb.wet.value = p.reverb;
    }

    setModRateHz(freq) {
        if (this.modLFO && this.modLFO.frequency) {
            this.modLFO.frequency.setTargetAtTime(freq, Tone.now(), 0.05);
        }
    }

    _startSH() {
        // Stop any existing S&H loop
        this._stopSH();

        // S&H rate: map 0-1 → interval 2s down to 0.05s
        const interval = 2 - (this.params.shRate * 1.95);

        this.shLoop = new Tone.Loop((time) => {
            // Generate random voltage: -1 to 1
            const randomValue = (Math.random() * 2) - 1;
            this.shSignal.setValueAtTime(randomValue, time);
        }, interval);

        this.shLoop.start(0);
    }

    _stopSH() {
        if (this.shLoop) {
            this.shLoop.stop();
            this.shLoop.dispose();
            this.shLoop = null;
        }
    }

    setParam(key, value) {
        this.params[key] = value;
        this._applyParams();

        // If S&H rate changes while playing, restart the loop with new interval
        if (key === 'shRate' && this.isPlaying) {
            this._startSH();
        }
    }

    startDrone() {
        if (this.isPlaying) return;
        this.isPlaying = true;

        this._applyParams();

        this.osc1.start();
        this.osc2.start();
        this.noise.start();
        this.modLFO.start();
        this._startSH();
        this.envelope.triggerAttack();
    }

    stopDrone() {
        if (!this.isPlaying) return;
        this.isPlaying = false;

        this.envelope.triggerRelease();

        // Let the release tail finish before stopping oscillators
        setTimeout(() => {
            if (!this.isPlaying) {
                this.osc1.stop();
                this.osc2.stop();
                this.noise.stop();
                this.modLFO.stop();
                this._stopSH();
            }
        }, (this.envelope.release * 1000) + 500);
    }
}

window.GrandmotherEngine = new MoogGrandmotherEngine();

// MIDI → Grandmother audio routing
window.addEventListener('midiCCChange', (e) => {
    const { parameter, scaledValue } = e.detail;
    if (parameter.startsWith('gm-')) {
        const gmParam = parameter.replace('gm-', '');
        window.GrandmotherEngine.setParam(gmParam, scaledValue);
    }
});
