class MonotronAudio {
    // WHAT: Initializes the Monotron audio engine, creating oscillators, filters, LFOs, and routing.
    // WHY: We need an independent audio graph that accurately models the Korg Monotron's analog circuitry (like the MS-20 filter and X-MOD) without interfering with the other synths.
    constructor() {
        this.ctx = Tone.getContext().rawContext;
        
        // 1. Oscillators
        this.vco1 = this.ctx.createOscillator();
        this.vco2 = this.ctx.createOscillator();
        this.vco1.type = 'square';
        this.vco2.type = 'square';
        
        // 2. X-MOD (Cross Modulation)
        // VCO2 modulates VCO1 frequency
        this.xmodGain = this.ctx.createGain();
        this.xmodGain.gain.value = 0; // Intensity
        
        this.vco2.connect(this.xmodGain);
        this.xmodGain.connect(this.vco1.frequency);
        
        // 3. Filter (MS-20 style Lowpass)
        this.vcf = this.ctx.createBiquadFilter();
        this.vcf.type = 'lowpass';
        this.vcf.frequency.value = 1000;
        this.vcf.Q.value = 1;
        
        // External Input to Filter (e.g. for TB-303 routing)
        this.extInput = this.ctx.createGain();
        this.extInput.gain.value = 1.0; // Aux volume
        this.extInput.connect(this.vcf);
        
        // LFO (for Original Monotron)
        this.lfo = this.ctx.createOscillator();
        this.lfo.type = 'triangle';
        this.lfo.frequency.value = 5;
        this.lfo.start();
        
        this.lfoPitchGain = this.ctx.createGain();
        this.lfoPitchGain.gain.value = 0;
        this.lfo.connect(this.lfoPitchGain);
        this.lfoPitchGain.connect(this.vco1.frequency);
        
        this.lfoCutoffGain = this.ctx.createGain();
        this.lfoCutoffGain.gain.value = 0;
        this.lfo.connect(this.lfoCutoffGain);
        this.lfoCutoffGain.connect(this.vcf.frequency);
        
        this.lfoInt = 0;
        this.modTarget = 'standby'; // 'standby', 'pitch', 'cutoff'
        
        // 4. VCA & Envelope
        this.vca = this.ctx.createGain();
        this.vca.gain.value = 0;
        
        // Master Volume
        this.masterVolume = this.ctx.createGain();
        this.masterVolume.gain.value = 0.4; // lowered default volume to balance with 303
        
        // Routing (VCA is before VCF so Aux In bypasses the gate!)
        this.vco2Level = this.ctx.createGain();
        this.vco2Level.gain.value = 0.18;
        this.vco2.connect(this.vco2Level);
        this.vco2Level.connect(this.vca);
        this.vco1.connect(this.vca);
        this.vca.connect(this.vcf);
        // Monotron Delay-style signal path: dry filter output plus a feedback echo.
        this.dryGain = this.ctx.createGain();
        this.delay = this.ctx.createDelay(1.5);
        this.delayFeedback = this.ctx.createGain();
        this.delayWet = this.ctx.createGain();
        this.dryGain.gain.value = 1;
        this.delayWet.gain.value = 0;
        this.delay.delayTime.value = 0.25;
        this.delayFeedback.gain.value = 0.45;
        this.vcf.connect(this.dryGain);
        this.dryGain.connect(this.masterVolume);
        this.vcf.connect(this.delay);
        this.delay.connect(this.delayWet);
        this.delayWet.connect(this.masterVolume);
        this.delay.connect(this.delayFeedback);
        this.delayFeedback.connect(this.delay);
        Tone.connect(this.masterVolume, Tone.Destination);
        
        // Start oscillators immediately (VCA keeps them silent)
        this.vco1.start();
        this.vco2.start();
        
        this.baseFreq = 440;
        this.pitchRatio = 1;
        this.lastPeak = 0.2;
    }
    
    // WHAT: Sets the base frequency of the primary oscillator.
    // WHY: When the user slides their finger on the ribbon, the pitch must glide smoothly to the new frequency.
    setPitch(frequency_hertz) {
        this.baseFreq = frequency_hertz;
        this.vco1.frequency.setTargetAtTime(frequency_hertz, this.ctx.currentTime, 0.05);
    }
    
    setVCO1Pitch(normalized_parameter_value) {
        this.pitchRatio = Math.pow(2, (normalized_parameter_value - 0.5) * 2);
        this.vco1.frequency.setTargetAtTime(this.baseFreq * this.pitchRatio, this.ctx.currentTime, 0.05);
    }

    setModel(model_name) {
        const delay_enabled = model_name === 'delay';
        this.delayWet.gain.setTargetAtTime(delay_enabled ? 0.65 : 0, this.ctx.currentTime, 0.03);
        this.vco2Level.gain.setTargetAtTime(model_name === 'duo' ? 0.18 : 0, this.ctx.currentTime, 0.03);
        this.vcf.Q.setTargetAtTime(delay_enabled ? 4 : 1 + this.lastPeak * 30, this.ctx.currentTime, 0.03);
    }

    setDelayTime(normalized_parameter_value) {
        const seconds = 0.03 * Math.pow(25, normalized_parameter_value);
        this.delay.delayTime.setTargetAtTime(seconds, this.ctx.currentTime, 0.025);
    }

    setDelayFeedback(normalized_parameter_value) {
        this.delayFeedback.gain.setTargetAtTime(Math.min(0.92, normalized_parameter_value), this.ctx.currentTime, 0.03);
    }

    setLFOWave(waveform_name) { this.lfo.type = waveform_name === 'square' ? 'square' : 'triangle'; }
    // WHAT: Sets the pitch of the secondary oscillator (VCO2).
    // WHY: In the Duo model, VCO2 provides a constant frequency that can cross-modulate VCO1. We map a 0-1 knob value to an exponential frequency curve.
    setVCO2Pitch(normalized_parameter_value) {
        const frequency_hertz = 50 * Math.pow(40, normalized_parameter_value);
        this.vco2.frequency.setTargetAtTime(frequency_hertz, this.ctx.currentTime, 0.05);
    }
    
    // WHAT: Sets the cross-modulation (X-MOD) intensity.
    // WHY: Controls how aggressively VCO2 modulates the frequency of VCO1, producing harsh, metallic, and complex harmonic tones.
    setXMod(normalized_parameter_value) {
        this.xmodGain.gain.setTargetAtTime(normalized_parameter_value * 3000, this.ctx.currentTime, 0.05);
    }
    
    // WHAT: Sets the lowpass filter cutoff frequency.
    // WHY: Maps a 0-1 knob value exponentially across the human hearing range (20Hz to 20kHz) for natural-sounding sweeps.
    setCutoff(normalized_parameter_value) {
        const frequency_hertz = 20 * Math.pow(1000, normalized_parameter_value);
        this.vcf.frequency.setTargetAtTime(frequency_hertz, this.ctx.currentTime, 0.05);
    }
    
    // WHAT: Sets the filter resonance (Peak).
    // WHY: Increases the Q-factor of the filter, creating a sharp resonant peak near the cutoff frequency that gives the Monotron its signature screech.
    setPeak(normalized_parameter_value) {
        this.lastPeak = normalized_parameter_value;
        const q_factor = 0.1 + normalized_parameter_value * 30;
        this.vcf.Q.setTargetAtTime(q_factor, this.ctx.currentTime, 0.05);
    }
    
    // WHAT: Sets the master output volume of the Monotron engine.
    // WHY: Allows the user to balance the Monotron's volume against the other synthesizers in the rack.
    setVolume(normalized_parameter_value) {
        this.masterVolume.gain.setTargetAtTime(normalized_parameter_value, this.ctx.currentTime, 0.05);
    }
    
    // WHAT: Sets the input volume for the external audio signal routed into the Monotron's filter.
    // WHY: Allows the user to push external signals (like the 303) harder into the MS-20 filter for saturation.
    setAuxVolume(normalized_parameter_value) {
        this.extInput.gain.setTargetAtTime(normalized_parameter_value * 2, this.ctx.currentTime, 0.05);
    }
    
    // WHAT: Sets the speed (frequency) of the Low Frequency Oscillator.
    // WHY: Controls how fast the pitch or filter wobbles, mapping a 0-1 knob to a 0.1Hz to 30Hz range.
    setLFORate(normalized_parameter_value) {
        const frequency_hertz = 0.1 + normalized_parameter_value * 30;
        this.lfo.frequency.setTargetAtTime(frequency_hertz, this.ctx.currentTime, 0.05);
    }
    
    // WHAT: Stores the LFO intensity and recalculates the modulation routing gains.
    // WHY: The intensity determines the depth of the wobble. We store it and call the routing function because the actual gain node modified depends on the current target switch.
    setLFOInt(normalized_parameter_value) {
        this.lfoInt = normalized_parameter_value;
        this.updateLFORouting();
    }
    
    // WHAT: Sets the destination target for the LFO (pitch, cutoff, or standby).
    // WHY: Emulates the physical switch on the Original Monotron that routes the LFO circuit to different parts of the synthesizer.
    setModTarget(modulation_target_string) {
        this.modTarget = modulation_target_string;
        this.updateLFORouting();
    }
    
    // WHAT: Updates the gain nodes that route the LFO signal to the oscillator pitch and filter cutoff.
    // WHY: We must silence the unused routing path and apply the stored LFO intensity to the currently active path to ensure only the selected parameter is modulated.
    updateLFORouting() {
        this.lfoPitchGain.gain.setTargetAtTime(0, this.ctx.currentTime, 0.05);
        this.lfoCutoffGain.gain.setTargetAtTime(0, this.ctx.currentTime, 0.05);
        
        if (this.modTarget === 'pitch') {
            this.lfoPitchGain.gain.setTargetAtTime(this.lfoInt * 1000, this.ctx.currentTime, 0.05);
        } else if (this.modTarget === 'cutoff') {
            this.lfoCutoffGain.gain.setTargetAtTime(this.lfoInt * 4000, this.ctx.currentTime, 0.05);
        }
    }
    
    // WHAT: Triggers the amplifier envelope to open when the ribbon is touched.
    // WHY: We use setTargetAtTime to smoothly ramp the volume up, preventing audio pops that occur from instantaneous voltage changes.
    noteOn(frequency_hertz) {
        if(frequency_hertz) {
            this.setPitch(frequency_hertz);
        }
        const current_audio_time = this.ctx.currentTime;
        this.vca.gain.cancelScheduledValues(current_audio_time);
        this.vca.gain.setTargetAtTime(0.3, current_audio_time, 0.015);
    }
    
    // WHAT: Triggers the amplifier envelope to close when the finger is lifted from the ribbon.
    // WHY: We smoothly ramp the volume down to zero to prevent clicking, ensuring a clean release.
    noteOff() {
        const current_audio_time = this.ctx.currentTime;
        this.vca.gain.cancelScheduledValues(current_audio_time);
        this.vca.gain.setTargetAtTime(0, current_audio_time, 0.05);
    }
}

const monotronAudio = new MonotronAudio();
window.MonotronAudio = monotronAudio;

// WHAT: Listens for MIDI control change events and forwards them to the Monotron audio engine.
// WHY: Allows external MIDI hardware to control the Monotron's knobs dynamically.
window.addEventListener('midiCCChange', (midi_control_change_event_object) => {
    const { parameter, scaledValue } = midi_control_change_event_object.detail;
    const monotron_parameter_routes_object = {
        'monotron-vco1':      'setVCO1Pitch',
        'monotron-lforate':   'setLFORate',
        'monotron-lfoint':    'setLFOInt',
        'monotron-dlforate':  'setLFORate',
        'monotron-dlfoint':   'setLFOInt',
        'monotron-delaytime': 'setDelayTime',
        'monotron-feedback':  'setDelayFeedback',
        'monotron-cutoff':  'setCutoff',
        'monotron-peak':    'setPeak',
        'monotron-xmod':    'setXMod',
        'monotron-volume':  'setVolume',
        'monotron-vco2':    'setVCO2Pitch',
        'monotron-auxvol':  'setAuxVolume',
    };
    if (monotron_parameter_routes_object[parameter]) {
        monotronAudio[monotron_parameter_routes_object[parameter]](scaledValue);
    }
});

// WHAT: Listens for MIDI note on events to trigger the Monotron synthesizer.
// WHY: Allows playing the Monotron ribbon synth using a standard external MIDI keyboard.
window.addEventListener('midiNoteOn', async (midi_note_on_event_object) => {
    if (document.getElementById('midi-note-target')?.value !== 'monotron') return;
    const { frequency } = midi_note_on_event_object.detail;
    if (Tone.context.state !== 'running') {
        await Tone.start();
    }
    monotronAudio.noteOn(frequency);
});

// WHAT: Listens for MIDI note off events to stop the Monotron synthesizer.
// WHY: Tells the envelope to close when a key is released on an external MIDI keyboard.
window.addEventListener('midiNoteOff', () => {
    if (document.getElementById('midi-note-target')?.value !== 'monotron') return;
    monotronAudio.noteOff();
});
