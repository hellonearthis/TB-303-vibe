class MonotronAudio {
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
        
        // 4. VCA & Envelope
        this.vca = this.ctx.createGain();
        this.vca.gain.value = 0;
        
        // Master Volume
        this.masterVolume = this.ctx.createGain();
        this.masterVolume.gain.value = 0.4; // lowered default volume to balance with 303
        
        // Routing (VCA is before VCF so Aux In bypasses the gate!)
        this.vco1.connect(this.vca);
        this.vca.connect(this.vcf);
        this.vcf.connect(this.masterVolume);
        this.masterVolume.connect(this.ctx.destination);
        
        // Start oscillators immediately (VCA keeps them silent)
        this.vco1.start();
        this.vco2.start();
        
        this.baseFreq = 440;
    }
    
    // Set pitch of VCO1
    setPitch(freq) {
        this.baseFreq = freq;
        this.vco1.frequency.setTargetAtTime(freq, this.ctx.currentTime, 0.05);
    }
    
    setVCO2Pitch(val) {
        // VCO2 pitch is often set as a ratio or absolute in Duo
        // Let's allow sweeping from e.g. 50Hz to 2000Hz
        const freq = 50 * Math.pow(40, val);
        this.vco2.frequency.setTargetAtTime(freq, this.ctx.currentTime, 0.05);
    }
    
    // UI Controls
    setXMod(val) {
        // val 0 to 1 -> map to modulation depth (e.g. 0 to 3000)
        this.xmodGain.gain.setTargetAtTime(val * 3000, this.ctx.currentTime, 0.05);
    }
    
    setCutoff(val) {
        // val 0 to 1 -> map to 20Hz - 20kHz
        const freq = 20 * Math.pow(1000, val);
        this.vcf.frequency.setTargetAtTime(freq, this.ctx.currentTime, 0.05);
    }
    
    setPeak(val) {
        // val 0 to 1 -> map to Q 0.1 to 30
        const q = 0.1 + val * 30;
        this.vcf.Q.setTargetAtTime(q, this.ctx.currentTime, 0.05);
    }
    
    setVolume(val) {
        this.masterVolume.gain.setTargetAtTime(val, this.ctx.currentTime, 0.05);
    }
    
    setAuxVolume(val) {
        // Boost aux up to 2x (val ranges 0 to 1, mapped to 0 to 2)
        this.extInput.gain.setTargetAtTime(val * 2, this.ctx.currentTime, 0.05);
    }
    
    // Gate controls (Ribbon touch)
    noteOn(freq) {
        if(freq) {
            this.setPitch(freq);
        }
        // Attack
        this.vca.gain.cancelScheduledValues(this.ctx.currentTime);
        this.vca.gain.setValueAtTime(this.vca.gain.value, this.ctx.currentTime);
        this.vca.gain.linearRampToValueAtTime(0.7, this.ctx.currentTime + 0.05);
    }
    
    noteOff() {
        // Release
        this.vca.gain.cancelScheduledValues(this.ctx.currentTime);
        this.vca.gain.setValueAtTime(this.vca.gain.value, this.ctx.currentTime);
        this.vca.gain.linearRampToValueAtTime(0, this.ctx.currentTime + 0.2);
    }
}

const monotronAudio = new MonotronAudio();
