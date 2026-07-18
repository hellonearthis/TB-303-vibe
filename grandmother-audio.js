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
    // WHAT: Initializes the Moog Grandmother synthesizer engine and constructs the internal signal routing.
    // WHY: We define all Tone.js audio nodes here so they are ready when the drone is started. This prevents audio glitches that might occur from creating nodes during playback.
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

    // WHAT: Applies the normalized parameters (0-1) to the actual Tone.js synthesizer nodes.
    // WHY: Tone.js requires specific real-world values (like Hertz or seconds). This function translates our abstract UI slider values into usable DSP numbers.
    _applyParams() {
        const parameters_object = this.params;

        // Osc2 detune: map 0-1 → 0-50 cents
        this.osc2.detune.value = parameters_object.detune * 50;

        // Noise level: map 0-1 → gain 0-0.4
        this.noiseGain.gain.value = parameters_object.noiseLevel * 0.4;

        // VCF Cutoff: map 0-1 → 60-2000 Hz (low range for dark drone)
        this.filter.frequency.value = 60 + (parameters_object.cutoff * 1940);

        // VCF Resonance: map 0-1 → Q 0.5-18
        this.filter.Q.value = 0.5 + (parameters_object.resonance * 17.5);

        // Envelope attack: map 0-1 → 0.1s-6s
        this.envelope.attack = 0.1 + (parameters_object.attack * 5.9);

        // Mod LFO rate: map 0-1 → 0.05-5 Hz
        this.modLFO.frequency.value = 0.05 + (parameters_object.modRate * 4.95);

        // Mod Wheel (depth): controls how much the LFO affects filter and pitch
        // Filter mod depth: 0-500 Hz swing
        this.modLFOFilterGain.gain.value = parameters_object.modWheel * 500;
        // Pitch mod depth: 0-8 Hz detune swing
        this.modLFOPitchGain.gain.value = parameters_object.modWheel * 8;

        // S&H depth → Osc2 FM: map 0-1 → gain 0-500 for dramatic sci-fi computer FM tones
        this.shGain.gain.value = parameters_object.shDepth * 500;

        // Master volume: map 0-1 → -30 to 0 dB
        this.volume.volume.value = -30 + (parameters_object.volume * 30);
        
        // Reverb mix: 0 to 1
        this.reverb.wet.value = parameters_object.reverb;
    }

    // WHAT: Sets the LFO modulation rate explicitly in Hertz.
    // WHY: This is used specifically when syncing the LFO to the sequencer tempo, bypassing the 0-1 slider normalization.
    setModRateHz(frequency_in_hertz) {
        if (this.modLFO && this.modLFO.frequency) {
            this.modLFO.frequency.setTargetAtTime(frequency_in_hertz, Tone.now(), 0.05);
        }
    }

    // WHAT: Starts the audio-thread-locked loop that generates random voltages for the Sample & Hold circuit.
    // WHY: We use Tone.Loop instead of setInterval so the randomizer runs on the same AudioContext clock as
    //      every other synth engine. setInterval runs on the main thread and jitters under load or when the
    //      browser tab is backgrounded, causing the S&H to stutter and lose its rhythmic character.
    _startSH() {
        // Stop any existing S&H loop
        this._stopSH();

        // S&H rate: map 0-1 → interval 2s down to 0.05s
        const interval_duration_seconds = 2 - (this.params.shRate * 1.95);

        this.shLoop = new Tone.Loop((scheduled_audio_time) => {
            // Generate random voltage: -1 to 1
            const random_voltage_value = (Math.random() * 2) - 1;
            // setTargetAtTime adds a tiny glide to prevent harsh clicks at high depths
            this.shSignal.setTargetAtTime(random_voltage_value, scheduled_audio_time, 0.01);
        }, interval_duration_seconds);

        this.shLoop.start(0);

        // Trigger first value immediately
        const initial_random_voltage_value = (Math.random() * 2) - 1;
        this.shSignal.setValueAtTime(initial_random_voltage_value, Tone.now());
    }

    // WHAT: Stops the running Sample & Hold generator loop and releases the Tone.Loop resources.
    // WHY: Prevents memory leaks and unnecessary background processing when the drone synthesizer is powered off.
    _stopSH() {
        if (this.shLoop) {
            this.shLoop.stop();
            this.shLoop.dispose();
            this.shLoop = null;
        }
    }

    // WHAT: Updates a single synthesizer parameter and reapplies the settings to the audio engine.
    // WHY: Provides an easy API for the UI sliders to update internal values. It also handles edge cases like dynamically restarting the S&H loop if its rate changes while playing.
    setParam(parameter_key_string, parameter_value) {
        this.params[parameter_key_string] = parameter_value;
        this._applyParams();

        // If S&H rate changes while playing, restart the loop with new interval
        if (parameter_key_string === 'shRate' && this.isPlaying) {
            this._startSH();
        }
    }

    // WHAT: Powers on the drone synthesizer by starting the oscillators (if they aren't already running) and opening the amplifier envelope.
    // WHY: We leave the oscillators running continuously in the background to prevent audio clicks that happen when they are suddenly spun up. The envelope handles fading the sound in smoothly.
    //      We also ensure Tone.Transport is running because the S&H Tone.Loop depends on it for scheduling.
    startDrone() {
        if (this.isPlaying) return;
        this.isPlaying = true;

        this._applyParams();

        // WHAT: Ensures the global Tone.Transport is running before starting the S&H loop.
        // WHY: Tone.Loop schedules events via the Transport. If the user activates the drone
        //      before pressing Play on the 303 sequencer, the Transport won't be running yet
        //      and the S&H would silently do nothing.
        if (Tone.Transport.state !== 'started') {
            Tone.Transport.start();
        }

        if (!this.oscillatorsStarted) {
            this.osc1.start();
            this.osc2.start();
            this.noise.start();
            this.modLFO.start();
            this.oscillatorsStarted = true;
        }
        
        this._startSH();
        this.envelope.triggerAttack();
    }

    // WHAT: Powers off the drone synthesizer by closing the amplifier envelope and stopping the randomizer loop.
    // WHY: We trigger the release phase of the envelope so the sound fades out naturally based on the current attack/release settings, rather than cutting off abruptly.
    stopDrone() {
        if (!this.isPlaying) return;
        this.isPlaying = false;

        this.envelope.triggerRelease();
        this._stopSH();
    }
}

window.GrandmotherEngine = new MoogGrandmotherEngine();

// WHAT: Listens for custom MIDI control change events specifically targeted at the Moog Grandmother synthesizer.
// WHY: We want external MIDI controllers to be able to turn the software knobs in real time without needing direct access to the GrandmotherEngine instance.
window.addEventListener('midiCCChange', (midi_control_change_event_object) => {
    const { parameter, scaledValue } = midi_control_change_event_object.detail;
    if (parameter.startsWith('gm-')) {
        const grandmother_parameter_name_string = parameter.replace('gm-', '');
        window.GrandmotherEngine.setParam(grandmother_parameter_name_string, scaledValue);
    }
});
