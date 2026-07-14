document.addEventListener('DOMContentLoaded', () => {
    const seq = window.SequencerEngine;
    const audio = window.AudioEngine;

    // --- UI Elements ---
    const gridContainer = document.getElementById('grid-container');
    const playBtn = document.getElementById('btn-play');
    const stopBtn = document.getElementById('btn-stop');
    const clearBtn = document.getElementById('btn-clear');
    const tempoInput = document.getElementById('tempo');
    
    // Synth Controls
    const waveSelect = document.getElementById('wave-type');
    const cutoffInput = document.getElementById('cutoff');
    const resInput = document.getElementById('resonance');
    const envModInput = document.getElementById('env-mod');
    const decayInput = document.getElementById('decay');
    const accentInput = document.getElementById('accent-amount');
    
    // Pedals
    const pedalOverdrive = document.getElementById('pedal-overdrive');
    const pedalDelay = document.getElementById('pedal-delay');
    const pedalPhaser = document.getElementById('pedal-phaser');



    // --- Build Grid UI ---
    function renderGrid() {
        gridContainer.innerHTML = '';
        
        // Notes rows
        seq.scale.forEach(note => {
            const row = document.createElement('div');
            row.className = 'grid-row';
            
            const label = document.createElement('div');
            label.className = 'grid-label';
            label.textContent = note;
            row.appendChild(label);

            for (let i = 0; i < seq.steps; i++) {
                const cell = document.createElement('div');
                cell.className = 'grid-cell note-cell';
                cell.dataset.step = i;
                cell.dataset.note = note;
                
                if (seq.grid[i].note === note) {
                    cell.classList.add('active-note');
                }

                cell.addEventListener('click', () => {
                    seq.toggleNote(i, note);
                    renderGrid(); // Re-render to clear other notes in column
                });

                row.appendChild(cell);
            }
            gridContainer.appendChild(row);
        });

        // Slide Row
        const slideRow = document.createElement('div');
        slideRow.className = 'grid-row';
        const slideLabel = document.createElement('div');
        slideLabel.className = 'grid-label';
        slideLabel.textContent = 'SLIDE';
        slideRow.appendChild(slideLabel);
        
        for (let i = 0; i < seq.steps; i++) {
            const cell = document.createElement('div');
            cell.className = 'grid-cell slide-cell';
            if (seq.grid[i].slide) cell.classList.add('active-slide');
            
            cell.addEventListener('click', () => {
                seq.toggleSlide(i);
                cell.classList.toggle('active-slide');
            });
            slideRow.appendChild(cell);
        }
        gridContainer.appendChild(slideRow);

        // Accent Row
        const accRow = document.createElement('div');
        accRow.className = 'grid-row';
        const accLabel = document.createElement('div');
        accLabel.className = 'grid-label';
        accLabel.textContent = 'ACCENT';
        accRow.appendChild(accLabel);
        
        for (let i = 0; i < seq.steps; i++) {
            const cell = document.createElement('div');
            cell.className = 'grid-cell accent-cell';
            if (seq.grid[i].accent) cell.classList.add('active-accent');
            
            cell.addEventListener('click', () => {
                seq.toggleAccent(i);
                renderGrid(); // Re-render to clear mutually exclusive ghost
            });
            accRow.appendChild(cell);
        }
        gridContainer.appendChild(accRow);

        // Ghost Row
        const ghostRow = document.createElement('div');
        ghostRow.className = 'grid-row';
        const ghostLabel = document.createElement('div');
        ghostLabel.className = 'grid-label';
        ghostLabel.textContent = 'GHOST';
        ghostRow.appendChild(ghostLabel);
        
        for (let i = 0; i < seq.steps; i++) {
            const cell = document.createElement('div');
            cell.className = 'grid-cell ghost-cell';
            if (seq.grid[i].ghost) cell.classList.add('active-ghost');
            
            cell.addEventListener('click', () => {
                seq.toggleGhost(i);
                renderGrid(); // Re-render to clear mutually exclusive accent
            });
            ghostRow.appendChild(cell);
        }
        gridContainer.appendChild(ghostRow);
    }

    // --- Keyboard Shortcuts (1-9) ---
    window.addEventListener('keydown', (e) => {
        // Ignore if user is typing in a text/number input (but allow if they are on a range slider or checkbox)
        if (e.target.tagName === 'INPUT' && (e.target.type === 'text' || e.target.type === 'number')) return;

        if (e.code && e.code.startsWith('Digit')) {
            // e.key might be '!' if shift is pressed, so extract number from e.code
            const key = parseInt(e.code.replace('Digit', ''));
            if (key >= 1 && key <= 9) {
                if (e.shiftKey) {
                    // Save pattern
                    seq.savePattern(key);
                } else {
                    // Recall pattern
                    if (seq.recallPattern(key)) {
                        renderGrid();
                    }
                }
            }
        }
    });

    // --- Sequencer UI Sync ---
    seq.setUICallback((stepIndex) => {
        // Remove playhead from all cells
        document.querySelectorAll('.grid-cell').forEach(c => c.classList.remove('playhead'));
        
        if (stepIndex >= 0) {
            // Add playhead to current column
            // We have 15 rows total (13 notes + slide + accent)
            // Selecting via nth-child logic can be tricky with grid, so we filter by dataset or index
            
            // Note cells
            const noteCells = document.querySelectorAll(`.note-cell:nth-child(${stepIndex + 2})`);
            noteCells.forEach(c => c.classList.add('playhead'));
            
            // Slide cell
            const slideCells = document.querySelectorAll(`.slide-cell:nth-child(${stepIndex + 2})`);
            slideCells.forEach(c => c.classList.add('playhead'));
            
            // Accent cell
            const accCells = document.querySelectorAll(`.accent-cell:nth-child(${stepIndex + 2})`);
            accCells.forEach(c => c.classList.add('playhead'));
            
            // Ghost cell
            const ghostCells = document.querySelectorAll(`.ghost-cell:nth-child(${stepIndex + 2})`);
            ghostCells.forEach(c => c.classList.add('playhead'));
        }
    });

    // --- Event Listeners ---
    playBtn.addEventListener('click', async () => {
        await Tone.start(); // Required by browsers
        seq.start();
    });

    stopBtn.addEventListener('click', () => {
        seq.stop();
    });

    clearBtn.addEventListener('click', () => {
        seq.clearGrid();
        renderGrid();
    });

    tempoInput.addEventListener('change', (e) => {
        seq.setBpm(parseFloat(e.target.value));
    });

    // Synth control listeners
    waveSelect.addEventListener('change', (e) => audio.setParam('wave', e.target.value));
    cutoffInput.addEventListener('input', (e) => audio.setParam('cutoff', parseFloat(e.target.value)));
    resInput.addEventListener('input', (e) => audio.setParam('resonance', parseFloat(e.target.value)));
    envModInput.addEventListener('input', (e) => audio.setParam('envMod', parseFloat(e.target.value)));
    decayInput.addEventListener('input', (e) => audio.setParam('decay', parseFloat(e.target.value)));
    accentInput.addEventListener('input', (e) => audio.setParam('accentAmount', parseFloat(e.target.value)));

    // Pedal listeners
    pedalOverdrive.addEventListener('change', (e) => audio.setPedal('overdrive', e.target.checked));
    pedalDelay.addEventListener('change', (e) => audio.setPedal('delay', e.target.checked));
    pedalPhaser.addEventListener('change', (e) => audio.setPedal('phaser', e.target.checked));

    // ==========================================
    // MOOG GRANDMOTHER — Drone Synth Controls
    // ==========================================
    const gm = window.GrandmotherEngine;
    const gmSection = document.getElementById('grandmother-section');
    const droneIndicator = document.getElementById('drone-indicator');
    const btnDroneOn = document.getElementById('btn-drone-on');
    const btnDroneOff = document.getElementById('btn-drone-off');

    // Drone ON / OFF
    btnDroneOn.addEventListener('click', async () => {
        await Tone.start();
        gm.startDrone();
        gmSection.classList.add('drone-active');
        droneIndicator.classList.add('active');
    });

    btnDroneOff.addEventListener('click', () => {
        gm.stopDrone();
        gmSection.classList.remove('drone-active');
        droneIndicator.classList.remove('active');
    });

    // Grandmother knob controls — map element IDs to engine param keys
    const gmControls = [
        { id: 'gm-detune',     param: 'detune',    valId: 'gm-detune-val' },
        { id: 'gm-noise',      param: 'noiseLevel', valId: 'gm-noise-val' },
        { id: 'gm-cutoff',     param: 'cutoff',    valId: 'gm-cutoff-val' },
        { id: 'gm-resonance',  param: 'resonance', valId: 'gm-resonance-val' },
        { id: 'gm-attack',     param: 'attack',    valId: 'gm-attack-val' },
        { id: 'gm-mod-wheel',  param: 'modWheel',  valId: 'gm-mod-wheel-val' },
        { id: 'gm-mod-rate',   param: 'modRate',   valId: 'gm-mod-rate-val' },
        { id: 'gm-sh-rate',    param: 'shRate',    valId: 'gm-sh-rate-val' },
        { id: 'gm-sh-depth',   param: 'shDepth',   valId: 'gm-sh-depth-val' },
        { id: 'gm-volume',     param: 'volume',    valId: 'gm-volume-val' },
        { id: 'gm-reverb',     param: 'reverb',    valId: 'gm-reverb-val' }
    ];

    gmControls.forEach(({ id, param, valId }) => {
        const input = document.getElementById(id);
        const valDisplay = document.getElementById(valId);

        input.addEventListener('input', (e) => {
            const value = parseFloat(e.target.value);
            gm.setParam(param, value);
            valDisplay.textContent = Math.round(value * 100) + '%';
        });
    });

    const gmAuxSwitch = document.getElementById('gm-aux');
    if (gmAuxSwitch) {
        gmAuxSwitch.addEventListener('change', (e) => {
            if (window.AudioEngine) {
                if (e.target.checked) {
                    window.AudioEngine.volume.disconnect(Tone.Destination);
                    window.AudioEngine.volume.connect(gm.extInput);
                } else {
                    window.AudioEngine.volume.disconnect(gm.extInput);
                    window.AudioEngine.volume.connect(Tone.Destination);
                }
            }
        });
    }

    // ==========================================
    // MIDI CONTROLLER INTEGRATION
    // ==========================================
    const midi = window.MIDIController;
    const midiDot = document.getElementById('midi-dot');
    const midiLabel = document.getElementById('midi-label');
    const midiLearnBtn = document.getElementById('btn-midi-learn');
    const midiResetBtn = document.getElementById('btn-midi-reset');

    // --- MIDI Status Indicator ---
    window.addEventListener('midiDeviceChange', (e) => {
        const { type, device } = e.detail;
        midiDot.classList.remove('connected', 'unsupported');

        if (type === 'connected') {
            midiDot.classList.add('connected');
            midiLabel.textContent = device ? device.name : 'MIDI';
        } else if (type === 'disconnected') {
            // Check if any devices still connected
            if (midi.isConnected) {
                midiDot.classList.add('connected');
                midiLabel.textContent = midi.deviceNames[0] || 'MIDI';
            } else {
                midiLabel.textContent = 'MIDI';
            }
        } else if (type === 'unsupported') {
            midiDot.classList.add('unsupported');
            midiLabel.textContent = 'NO MIDI';
        }
    });

    // --- Learnable Parameter Registry ---
    // Maps parameter names to { element, inputId, type }
    const learnableParams = {};

    // TB-303 knobs
    const tb303Learnables = [
        { param: 'cutoff',       inputId: 'cutoff',         element: cutoffInput.closest('.knob-group') },
        { param: 'resonance',    inputId: 'resonance',      element: resInput.closest('.knob-group') },
        { param: 'envMod',       inputId: 'env-mod',        element: envModInput.closest('.knob-group') },
        { param: 'decay',        inputId: 'decay',          element: decayInput.closest('.knob-group') },
        { param: 'accentAmount', inputId: 'accent-amount',  element: accentInput.closest('.knob-group') },
    ];

    tb303Learnables.forEach(({ param, inputId, element }) => {
        learnableParams[param] = { element, inputId, type: 'range' };
    });

    // TB-303 pedals
    const pedalLearnables = [
        { param: 'pedal-overdrive', inputId: 'pedal-overdrive', element: pedalOverdrive.closest('.pedal') },
        { param: 'pedal-delay',     inputId: 'pedal-delay',     element: pedalDelay.closest('.pedal') },
        { param: 'pedal-phaser',    inputId: 'pedal-phaser',    element: pedalPhaser.closest('.pedal') },
    ];

    pedalLearnables.forEach(({ param, inputId, element }) => {
        learnableParams[param] = { element, inputId, type: 'toggle' };
    });

    // Transport
    learnableParams['transport-play'] = { element: playBtn, inputId: null, type: 'transport' };
    learnableParams['transport-stop'] = { element: stopBtn, inputId: null, type: 'transport' };

    // Grandmother knobs
    gmControls.forEach(({ id, param }) => {
        const element = document.getElementById(id)?.closest('.gm-knob-group');
        if (element) {
            learnableParams[`gm-${param}`] = { element, inputId: id, type: 'range' };
        }
    });

    // --- MIDI Learn Mode ---
    let midiLearnActive = false;
    let currentListeningElement = null;
    let learnTooltip = null;

    function showTooltip(text) {
        removeTooltip();
        learnTooltip = document.createElement('div');
        learnTooltip.className = 'midi-learn-tooltip';
        learnTooltip.textContent = text;
        document.body.appendChild(learnTooltip);
    }

    function removeTooltip() {
        if (learnTooltip) {
            learnTooltip.remove();
            learnTooltip = null;
        }
    }

    function toggleLearnMode() {
        midiLearnActive = !midiLearnActive;
        document.body.classList.toggle('midi-learn-active', midiLearnActive);
        midiLearnBtn.classList.toggle('active', midiLearnActive);

        if (midiLearnActive) {
            showTooltip('MIDI LEARN: Click a control to assign...');
        } else {
            // Cancel any active listening
            if (currentListeningElement) {
                currentListeningElement.classList.remove('midi-listening');
                currentListeningElement = null;
            }
            midi.exitLearnMode();
            removeTooltip();
        }
    }

    midiLearnBtn.addEventListener('click', toggleLearnMode);

    midiResetBtn.addEventListener('click', () => {
        midi.resetMap();
        // Exit learn mode if active
        if (midiLearnActive) toggleLearnMode();
        updateMappedIndicators();
    });

    // Escape key exits learn mode
    window.addEventListener('keydown', (e) => {
        if (e.key === 'Escape' && midiLearnActive) {
            toggleLearnMode();
        }
    });

    // Click handler for learnable elements
    function handleLearnClick(paramName) {
        if (!midiLearnActive) return;

        // Clear previous listening state
        if (currentListeningElement) {
            currentListeningElement.classList.remove('midi-listening');
        }

        const learnable = learnableParams[paramName];
        if (!learnable) return;

        currentListeningElement = learnable.element;
        currentListeningElement.classList.add('midi-listening');

        midi.enterLearnMode(paramName);
        showTooltip(`Move a MIDI control for: ${paramName.toUpperCase()}`);
    }

    // Attach learn-mode click handlers to all learnable parameters
    Object.entries(learnableParams).forEach(([paramName, { element }]) => {
        if (!element) return;
        element.addEventListener('click', (e) => {
            if (midiLearnActive) {
                e.preventDefault();
                e.stopPropagation();
                handleLearnClick(paramName);
            }
        }, true); // Use capture to intercept before normal handlers
    });

    // Learn complete → update UI
    window.addEventListener('midiLearnComplete', (e) => {
        const { parameter, sourceId } = e.detail;
        console.log(`[UI] MIDI Learn complete: ${sourceId} → ${parameter}`);

        if (currentListeningElement) {
            currentListeningElement.classList.remove('midi-listening');
            currentListeningElement = null;
        }

        const sourceLabel = midi.getSourceLabel(sourceId);
        showTooltip(`✓ Mapped ${sourceLabel} → ${parameter.toUpperCase()}`);

        // Auto-exit learn mode after a successful mapping
        setTimeout(() => {
            if (midiLearnActive) toggleLearnMode();
        }, 1500);

        updateMappedIndicators();
    });

    // Update blue dot indicators on mapped controls
    function updateMappedIndicators() {
        Object.entries(learnableParams).forEach(([paramName, { element }]) => {
            if (!element) return;
            const source = midi.getSourceForParameter(paramName);
            element.classList.toggle('midi-mapped', !!source);
            element.style.position = source ? 'relative' : '';
        });
    }

    // Run once on init
    updateMappedIndicators();

    // --- MIDI CC → UI Slider Sync ---
    // When a hardware control moves, update the on-screen slider position
    const tb303InputMap = {
        'cutoff':       cutoffInput,
        'resonance':    resInput,
        'envMod':       envModInput,
        'decay':        decayInput,
        'accentAmount': accentInput,
    };

    window.addEventListener('midiCCChange', (e) => {
        const { parameter, scaledValue } = e.detail;

        // TB-303 sliders
        if (tb303InputMap[parameter]) {
            tb303InputMap[parameter].value = scaledValue;
            return;
        }

        // Grandmother sliders
        if (parameter.startsWith('gm-')) {
            const gmParam = parameter.replace('gm-', '');
            const ctrl = gmControls.find(c => c.param === gmParam);
            if (ctrl) {
                const input = document.getElementById(ctrl.id);
                const valDisplay = document.getElementById(ctrl.valId);
                if (input) input.value = scaledValue;
                if (valDisplay) valDisplay.textContent = Math.round(scaledValue * 100) + '%';
            }
        }
    });

    // --- MIDI Transport ---
    window.addEventListener('midiTransport', async (e) => {
        const { action } = e.detail;
        if (action === 'play') {
            await Tone.start();
            seq.start();
        } else if (action === 'stop') {
            seq.stop();
        }
    });

    // --- MIDI Pedal Toggle ---
    window.addEventListener('midiToggle', (e) => {
        const { parameter, state } = e.detail;
        const pedalMap = {
            'pedal-overdrive': { checkbox: pedalOverdrive, name: 'overdrive' },
            'pedal-delay':     { checkbox: pedalDelay,     name: 'delay' },
            'pedal-phaser':    { checkbox: pedalPhaser,    name: 'phaser' },
        };

        const pedal = pedalMap[parameter];
        if (pedal) {
            pedal.checkbox.checked = state;
            audio.setPedal(pedal.name, state);
        }
    });

    // --- MIDI Program Change → Pattern Recall ---
    window.addEventListener('midiProgramChange', (e) => {
        const { program } = e.detail;
        if (seq.recallPattern(program)) {
            renderGrid();
        }
    });

    // Initialize grid layout
    renderGrid();
});
