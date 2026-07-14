document.addEventListener('DOMContentLoaded', () => {
    // Wait a brief moment to ensure audio.js and monotronAudio are ready
    setTimeout(() => {
        setupMonotronUI();
    }, 100);
});

function setupMonotronUI() {
    // 1. UI Elements
    const ribbon = document.getElementById('monotron-ribbon');
    const scaleSelect = document.getElementById('monotron-scale');
    const vco2PitchKnob = document.getElementById('monotron-vco2-pitch');
    const xmodKnob = document.getElementById('monotron-xmod');
    const cutoffKnob = document.getElementById('monotron-cutoff');
    const peakKnob = document.getElementById('monotron-peak');
    const volumeKnob = document.getElementById('monotron-volume');
    const auxSwitch = document.getElementById('monotron-aux');
    const auxVolKnob = document.getElementById('monotron-aux-vol');

    // 2. Add visual indicator for ribbon touch
    const indicator = document.createElement('div');
    indicator.className = 'ribbon-touch-indicator';
    ribbon.appendChild(indicator);

    // 3. Ribbon state
    let isTouching = false;

    // 4. Scales mapping (frequencies in Hz for 2 octaves)
    // Base C3 = 130.81 Hz
    const getFrequency = (noteIndex) => 130.81 * Math.pow(2, noteIndex / 12);
    
    // Generate arrays of frequencies for scales
    const generateScale = (intervals, octaves = 3) => {
        const freqs = [];
        for (let oct = 0; oct < octaves; oct++) {
            let note = oct * 12;
            freqs.push(getFrequency(note)); // Root
            for (let interval of intervals) {
                note += interval;
                freqs.push(getFrequency(note));
            }
        }
        return freqs;
    };

    const scales = {
        major: generateScale([2, 2, 1, 2, 2, 2, 1]), // Whole, Whole, Half, Whole, Whole, Whole, Half
        minor: generateScale([2, 1, 2, 2, 1, 2, 2]), // Whole, Half, Whole, Whole, Half, Whole, Whole
        chromatic: Array.from({length: 36}, (_, i) => getFrequency(i)),
        off: null // Continuous
    };

    // Calculate frequency based on X position on ribbon
    const calculateFrequency = (x, width, scaleType) => {
        const percentage = Math.max(0, Math.min(1, x / width));
        
        // Map to roughly 3 octaves (130Hz to 1046Hz)
        const minFreq = 130.81;
        const maxFreq = 1046.50;
        
        if (scaleType === 'off') {
            // Continuous pitch
            return minFreq * Math.pow(maxFreq / minFreq, percentage);
        } else {
            // Snapped pitch
            const scaleFreqs = scales[scaleType];
            if (!scaleFreqs) return 440;
            
            // Map percentage to array index
            const index = Math.floor(percentage * (scaleFreqs.length - 1));
            return scaleFreqs[index];
        }
    };

    // 5. Ribbon Events
    const handleTouch = (e) => {
        const rect = ribbon.getBoundingClientRect();
        const clientX = e.touches ? e.touches[0].clientX : e.clientX;
        const x = clientX - rect.left;
        
        // Update visual indicator
        indicator.style.left = `${Math.max(0, Math.min(100, (x / rect.width) * 100))}%`;
        
        const scaleType = scaleSelect.value;
        const freq = calculateFrequency(x, rect.width, scaleType);
        
        monotronAudio.setPitch(freq);
    };

    ribbon.addEventListener('pointerdown', async (e) => {
        if (Tone.context.state !== 'running') {
            await Tone.start();
        }
        
        isTouching = true;
        ribbon.setPointerCapture(e.pointerId);
        indicator.classList.add('active');
        
        const rect = ribbon.getBoundingClientRect();
        const clientX = e.clientX;
        const x = clientX - rect.left;
        const scaleType = scaleSelect.value;
        const freq = calculateFrequency(x, rect.width, scaleType);
        
        monotronAudio.noteOn(freq);
        handleTouch(e);
    });

    ribbon.addEventListener('pointermove', (e) => {
        if (isTouching) {
            handleTouch(e);
        }
    });

    const stopTouch = (e) => {
        if (isTouching) {
            isTouching = false;
            ribbon.releasePointerCapture(e.pointerId);
            indicator.classList.remove('active');
            monotronAudio.noteOff();
        }
    };

    ribbon.addEventListener('pointerup', stopTouch);
    ribbon.addEventListener('pointercancel', stopTouch);

    // 6. Knob Events
    vco2PitchKnob.addEventListener('input', (e) => {
        monotronAudio.setVCO2Pitch(parseFloat(e.target.value));
    });

    xmodKnob.addEventListener('input', (e) => {
        monotronAudio.setXMod(parseFloat(e.target.value));
    });

    cutoffKnob.addEventListener('input', (e) => {
        monotronAudio.setCutoff(parseFloat(e.target.value));
    });

    peakKnob.addEventListener('input', (e) => {
        monotronAudio.setPeak(parseFloat(e.target.value));
    });

    volumeKnob.addEventListener('input', (e) => {
        monotronAudio.setVolume(parseFloat(e.target.value));
    });

    auxVolKnob.addEventListener('input', (e) => {
        monotronAudio.setAuxVolume(parseFloat(e.target.value));
    });

    auxSwitch.addEventListener('change', (e) => {
        const monotronSection = document.getElementById('monotron-section');
        if (window.AudioEngine) {
            if (e.target.checked) {
                // Route 303 to Monotron VCF
                window.AudioEngine.volume.disconnect(Tone.Destination);
                Tone.connect(window.AudioEngine.volume, monotronAudio.extInput);
                monotronSection.classList.add('aux-routed');
            } else {
                // Route 303 back to Destination
                window.AudioEngine.volume.disconnect(monotronAudio.extInput);
                window.AudioEngine.volume.connect(Tone.Destination);
                monotronSection.classList.remove('aux-routed');
            }
        }
    });

    // Initialize values
    monotronAudio.setVCO2Pitch(parseFloat(vco2PitchKnob.value));
    monotronAudio.setXMod(parseFloat(xmodKnob.value));
    monotronAudio.setCutoff(parseFloat(cutoffKnob.value));
    monotronAudio.setPeak(parseFloat(peakKnob.value));
    monotronAudio.setVolume(parseFloat(volumeKnob.value));
    monotronAudio.setAuxVolume(parseFloat(auxVolKnob.value));

    // --- MIDI CC → Monotron Slider Sync ---
    const monotronInputMap = {
        'monotron-cutoff':  cutoffKnob,
        'monotron-peak':    peakKnob,
        'monotron-xmod':    xmodKnob,
        'monotron-volume':  volumeKnob,
        'monotron-vco2':    vco2PitchKnob,
        'monotron-auxvol':  auxVolKnob,
    };

    window.addEventListener('midiCCChange', (e) => {
        const { parameter, scaledValue } = e.detail;
        if (monotronInputMap[parameter]) {
            monotronInputMap[parameter].value = scaledValue;
        }
    });

    // --- MIDI Learn: Register Monotron parameters ---
    // (The MIDI Learn click handlers in app.js cover TB-303 + Grandmother.
    //  Monotron knobs need their own registration here since they're set up in a separate module.)
    const midi = window.MIDIController;
    if (midi) {
        const monotronLearnables = [
            { param: 'monotron-cutoff',  element: cutoffKnob.closest('.monotron-knob-group') },
            { param: 'monotron-peak',    element: peakKnob.closest('.monotron-knob-group') },
            { param: 'monotron-xmod',    element: xmodKnob.closest('.monotron-knob-group') },
            { param: 'monotron-volume',  element: volumeKnob.closest('.monotron-knob-group') },
            { param: 'monotron-vco2',    element: vco2PitchKnob.closest('.monotron-knob-group') },
            { param: 'monotron-auxvol',  element: auxVolKnob.closest('.monotron-knob-group') },
        ];

        monotronLearnables.forEach(({ param, element }) => {
            if (!element) return;

            // Show mapped indicator
            const source = midi.getSourceForParameter(param);
            element.classList.toggle('midi-mapped', !!source);
            if (source) element.style.position = 'relative';

            // Learn-mode click handler
            element.addEventListener('click', (e) => {
                if (document.body.classList.contains('midi-learn-active')) {
                    e.preventDefault();
                    e.stopPropagation();

                    // Clear previous listening
                    document.querySelectorAll('.midi-listening').forEach(el => el.classList.remove('midi-listening'));
                    element.classList.add('midi-listening');

                    midi.enterLearnMode(param);

                    // Update tooltip
                    const existingTooltip = document.querySelector('.midi-learn-tooltip');
                    if (existingTooltip) {
                        existingTooltip.textContent = `Move a MIDI control for: ${param.toUpperCase()}`;
                    }
                }
            }, true);
        });

        // Update indicators when learn completes
        window.addEventListener('midiLearnComplete', (e) => {
            monotronLearnables.forEach(({ param, element }) => {
                if (!element) return;
                const src = midi.getSourceForParameter(param);
                element.classList.toggle('midi-mapped', !!src);
                if (src) element.style.position = 'relative';
            });
        });
    }
}
