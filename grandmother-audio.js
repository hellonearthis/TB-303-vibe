/**
 * Moog Grandmother-inspired semi-modular drone engine.
 * Free mode uses independent modulation timing; 303 mode follows sequencer steps.
 */
class MoogGrandmotherEngine {
    constructor() {
        this.isPlaying = false;
        this.oscillatorsStarted = false;
        this.envelopeOpen = false;
        this.pendingClockStart = false;
        this.clockStepCounter = 0;

        this.params = {
            osc1Wave: 'sawtooth',
            osc2Wave: 'sawtooth',
            osc1Level: 0.8,
            osc2Level: 0.8,
            detune: 0.15,
            noiseLevel: 0.12,
            cutoff: 0.2,
            resonance: 0.35,
            attack: 0.35,
            decay: 0.25,
            sustain: 1,
            release: 0.45,
            modWheel: 0.25,
            modRate: 0.3,
            modWave: 'sine',
            modTarget: 'both',
            shRate: 0.4,
            shDepth: 0.3,
            volume: 0.7,
            reverb: 0.3
        };

        this.timing = {
            clockMode: 'free',
            startMode: 'bar',
            cycleBars: 1,
            envelopeMode: 'hold',
            shDivision: 4,
            followGate: false,
            lfoSync: false,
            stopWith303: true
        };

        this.osc1 = new Tone.Oscillator({ type: 'sawtooth', frequency: 'C2', volume: -6 });
        this.osc2 = new Tone.Oscillator({ type: 'sawtooth', frequency: 'C1', volume: -6 });
        this.noise = new Tone.Noise('white');
        this.noiseGain = new Tone.Gain(0.05);
        this.noise.connect(this.noiseGain);

        this.mixer = new Tone.Gain(1);
        this.osc1.connect(this.mixer);
        this.osc2.connect(this.mixer);
        this.noiseGain.connect(this.mixer);

        this.filter = new Tone.Filter({ type: 'lowpass', frequency: 200, rolloff: -24, Q: 3 });
        this.mixer.connect(this.filter);

        this.envelope = new Tone.AmplitudeEnvelope({
            attack: 2,
            decay: 0.5,
            sustain: 1,
            release: 3
        });
        this.filter.connect(this.envelope);

        this.volume = new Tone.Volume(-12);
        this.envelope.connect(this.volume);
        this.reverb = new Tone.Freeverb({ roomSize: 0.75, dampening: 3000 });
        this.volume.connect(this.reverb);
        this.reverb.toDestination();

        this.extInput = new Tone.Gain(1);
        this.extInput.connect(this.mixer);

        this.modLFO = new Tone.LFO({ type: 'sine', frequency: 0.5, min: -30, max: 30 });
        this.modLFOFilterGain = new Tone.Gain(0);
        this.modLFO.connect(this.modLFOFilterGain);
        this.modLFOFilterGain.connect(this.filter.frequency);
        this.modLFOPitchGain = new Tone.Gain(0);
        this.modLFO.connect(this.modLFOPitchGain);
        this.modLFOPitchGain.connect(this.osc1.frequency);
        this.modLFOPitchGain.connect(this.osc2.frequency);

        this.shLoop = null;
        this.shGain = new Tone.Gain(0);
        this.shSignal = new Tone.Signal(0);
        this.shSignal.connect(this.shGain);
        this.shGain.connect(this.osc2.frequency);

        // WHAT: Registers the Grandmother's external input with the global AudioBus.
        // WHY:  Allows UI code (or other instruments) to route signals here by name
        //       without needing direct access to this engine instance.
        if (window.Bus) {
            window.Bus.registerDestination('grandmother_ext_in', this.extInput);
        }

        this._applyParams();
    }

    _levelToDecibels(normalized_level) {
        return normalized_level <= 0 ? -Infinity : -36 + (normalized_level * 36);
    }

    _applyParams() {
        const parameters = this.params;
        this.osc1.type = parameters.osc1Wave;
        this.osc2.type = parameters.osc2Wave;
        this.osc1.volume.value = this._levelToDecibels(parameters.osc1Level);
        this.osc2.volume.value = this._levelToDecibels(parameters.osc2Level);
        this.osc2.detune.value = parameters.detune * 50;
        this.noiseGain.gain.value = parameters.noiseLevel * 0.4;

        this.filter.frequency.value = 60 + (parameters.cutoff * 1940);
        this.filter.Q.value = 0.5 + (parameters.resonance * 17.5);

        this.envelope.attack = 0.005 + (Math.pow(parameters.attack, 2) * 10);
        this.envelope.decay = 0.01 + (Math.pow(parameters.decay, 2) * 10);
        this.envelope.sustain = parameters.sustain;
        this.envelope.release = 0.02 + (Math.pow(parameters.release, 2) * 10);

        this.modLFO.type = parameters.modWave;
        if (!this.timing.lfoSync) this.modLFO.frequency.value = 0.05 + (parameters.modRate * 4.95);
        const filter_enabled = parameters.modTarget === 'filter' || parameters.modTarget === 'both';
        const pitch_enabled = parameters.modTarget === 'pitch' || parameters.modTarget === 'both';
        this.modLFOFilterGain.gain.value = filter_enabled ? parameters.modWheel * 500 : 0;
        this.modLFOPitchGain.gain.value = pitch_enabled ? parameters.modWheel * 8 : 0;

        this.shGain.gain.value = parameters.shDepth * 500;
        this.volume.volume.value = -30 + (parameters.volume * 30);
        this.reverb.wet.value = parameters.reverb;
    }

    setParam(parameter_name, parameter_value) {
        this.params[parameter_name] = parameter_value;
        this._applyParams();
        if (parameter_name === 'shRate' && this.isPlaying && this.timing.clockMode === 'free') {
            this._startFreeSH();
        }
    }

    setTimingParam(parameter_name, parameter_value) {
        if (['cycleBars', 'shDivision'].includes(parameter_name)) parameter_value = Number(parameter_value);
        this.timing[parameter_name] = parameter_value;
        if (parameter_name === 'lfoSync' && !parameter_value) {
            this.modLFO.frequency.value = 0.05 + (this.params.modRate * 4.95);
        }

        if (parameter_name === 'clockMode' && this.isPlaying) {
            this.clockStepCounter = 0;
            if (parameter_value === '303') {
                this._stopSH();
                this.pendingClockStart = this.timing.startMode !== 'immediate';
                if (this.pendingClockStart && this.envelopeOpen) this._closeEnvelope(Tone.now());
                if (!this.pendingClockStart) this._openEnvelope(Tone.now());
            } else {
                this.pendingClockStart = false;
                this._startFreeSH();
                this._openEnvelope(Tone.now());
            }
        }
    }

    setModRateHz(frequency_hertz) {
        this.modLFO.frequency.setTargetAtTime(frequency_hertz, Tone.now(), 0.05);
    }

    _setRandomVoltage(scheduled_audio_time) {
        const random_voltage = (Math.random() * 2) - 1;
        this.shSignal.setTargetAtTime(random_voltage, scheduled_audio_time, 0.01);
    }

    _startFreeSH() {
        this._stopSH();
        if (!this.isPlaying || this.timing.clockMode !== 'free') return;
        const interval_seconds = 2 - (this.params.shRate * 1.95);
        this.shLoop = new Tone.Loop(time => this._setRandomVoltage(time), interval_seconds).start(0);
        this._setRandomVoltage(Tone.now());
    }

    _stopSH() {
        if (!this.shLoop) return;
        this.shLoop.stop();
        this.shLoop.dispose();
        this.shLoop = null;
    }

    _openEnvelope(scheduled_audio_time, velocity = 1) {
        this.envelope.triggerAttack(scheduled_audio_time, velocity);
        this.envelopeOpen = true;
    }

    _closeEnvelope(scheduled_audio_time) {
        this.envelope.triggerRelease(scheduled_audio_time);
        this.envelopeOpen = false;
    }


    _retriggerEnvelope(scheduled_audio_time) {
        this.envelope.triggerRelease(scheduled_audio_time);
        this.envelope.triggerAttack(scheduled_audio_time + 0.01);
        this.envelopeOpen = true;
    }    _resetClockCycle() {
        this.clockStepCounter = 0;
        if (this.timing.lfoSync) this.modLFO.phase = 0;
    }

    handle303Step(step_index, scheduled_audio_time, step_data, step_duration, previous_step, next_step) {
        if (step_index < 0) {
            this.clockStepCounter = 0;
            if (this.isPlaying && this.timing.clockMode === '303' && this.timing.stopWith303) {
                this._closeEnvelope(scheduled_audio_time);
                this.pendingClockStart = true;
            }
            return;
        }
        if (!this.isPlaying || this.timing.clockMode !== '303') return;

        if (this.pendingClockStart) {
            const start_ready = this.timing.startMode === 'step' || step_index === 0;
            if (!start_ready) return;
            this.pendingClockStart = false;
            this._resetClockCycle();
            if (!this.timing.followGate) this._openEnvelope(scheduled_audio_time);
        }

        const cycle_steps = Math.max(1, Math.round(this.timing.cycleBars * 16));
        const cycle_boundary = this.clockStepCounter > 0 && this.clockStepCounter % cycle_steps === 0;
        if (cycle_boundary) {
            if (this.timing.lfoSync) this.modLFO.phase = 0;
            if (this.timing.envelopeMode === 'retrigger' && !this.timing.followGate) {
                this._retriggerEnvelope(scheduled_audio_time);
            }
        }

        if (this.clockStepCounter % this.timing.shDivision === 0) {
            this._setRandomVoltage(scheduled_audio_time);
        }

        if (this.timing.followGate) {
            if (step_data.tie) {
                if (!next_step.tie) this._closeEnvelope(scheduled_audio_time + (step_duration * 0.95));
            } else if (step_data.note) {
                const is_legato = previous_step && (previous_step.slide || previous_step.tie);
                if (!is_legato) this._openEnvelope(scheduled_audio_time, step_data.accent ? 1 : 0.75);
                if (!step_data.slide && !next_step.tie) {
                    this._closeEnvelope(scheduled_audio_time + (step_duration * 0.8));
                }
            } else {
                this._closeEnvelope(scheduled_audio_time);
            }
        }

        this.clockStepCounter += 1;
    }

    startDrone() {
        if (this.isPlaying) return;
        this.isPlaying = true;
        this._applyParams();

        // WHAT: Register the Grandmother as an active Clock client.
        // WHY: The shared Clock keeps the transport alive as long as any instrument needs it,
        //      preventing stop-stealing between instruments.
        window.Clock.start('grandmother');
        if (!this.oscillatorsStarted) {
            this.osc1.start();
            this.osc2.start();
            this.noise.start();
            this.modLFO.start();
            this.oscillatorsStarted = true;
        }

        if (this.timing.clockMode === '303') {
            this._stopSH();
            this.pendingClockStart = this.timing.startMode !== 'immediate';
            this._resetClockCycle();
            if (!this.pendingClockStart && !this.timing.followGate) this._openEnvelope(Tone.now());
        } else {
            this.pendingClockStart = false;
            this._startFreeSH();
            this._openEnvelope(Tone.now());
        }
    }

    stopDrone() {
        if (!this.isPlaying) return;
        this.isPlaying = false;
        this.pendingClockStart = false;
        // WHAT: Unregister the Grandmother from the Clock.
        // WHY: Allows the transport to stop if no other instruments need it.
        window.Clock.stop('grandmother');
        this._closeEnvelope(Tone.now());
        this._stopSH();
    }

    async noteOn(frequency_hertz, velocity = 1) {
        await Tone.start();
        if (!this.oscillatorsStarted) {
            this.osc1.start();
            this.osc2.start();
            this.noise.start();
            this.modLFO.start();
            this.oscillatorsStarted = true;
        }
        this.osc1.frequency.setTargetAtTime(frequency_hertz, Tone.now(), 0.01);
        this.osc2.frequency.setTargetAtTime(frequency_hertz / 2, Tone.now(), 0.01);
        this._openEnvelope(Tone.now(), velocity);
    }

    noteOff() {
        this._closeEnvelope(Tone.now());
    }
}

window.GrandmotherEngine = new MoogGrandmotherEngine();

window.addEventListener('midiCCChange', midi_event => {
    const { parameter, scaledValue } = midi_event.detail;
    if (parameter.startsWith('gm-')) {
        window.GrandmotherEngine.setParam(parameter.replace('gm-', ''), scaledValue);
    }
});
window.addEventListener('midiNoteOn', event => {
    if (document.getElementById('midi-note-target')?.value !== 'grandmother') return;
    const { frequency, velocity } = event.detail;
    window.GrandmotherEngine.noteOn(frequency, velocity / 127);
});

window.addEventListener('midiNoteOff', () => {
    if (document.getElementById('midi-note-target')?.value === 'grandmother') window.GrandmotherEngine.noteOff();
});