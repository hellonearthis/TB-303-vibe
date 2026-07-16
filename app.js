document.addEventListener('DOMContentLoaded', () => {
    const sequencer_engine_instance = window.SequencerEngine;
    const audio_engine_instance = window.AudioEngine;

    // --- UI Elements ---
    const grid_container_element = document.getElementById('grid-container');
    const play_button_element = document.getElementById('btn-play');
    const stop_button_element = document.getElementById('btn-stop');
    const clear_button_element = document.getElementById('btn-clear');
    const tempo_input_element = document.getElementById('tempo');
    
    // Synth Controls
    const wave_select_element = document.getElementById('wave-type');
    const cutoff_input_element = document.getElementById('cutoff');
    const resonance_input_element = document.getElementById('resonance');
    const envelope_modulation_input_element = document.getElementById('env-mod');
    const decay_input_element = document.getElementById('decay');
    const accent_amount_input_element = document.getElementById('accent-amount');
    
    // Pedals
    const pedal_overdrive_element = document.getElementById('pedal-overdrive');
    const pedal_delay_element = document.getElementById('pedal-delay');
    const pedal_phaser_element = document.getElementById('pedal-phaser');



    // --- Build Grid UI ---
    // WHAT: Renders the entire 16-step sequencer grid dynamically based on the current scale and internal state.
    // WHY: We use a data-driven approach. The Javascript model is the source of truth, and this function simply draws the DOM elements to match the model. It destroys and rebuilds the grid on demand.
    function renderGrid() {
        grid_container_element.innerHTML = '';
        
        // Notes rows
        sequencer_engine_instance.scale.forEach(musical_note_string => {
            const row_element_node = document.createElement('div');
            row_element_node.className = 'grid-row';
            
            const label_element_node = document.createElement('div');
            label_element_node.className = 'grid-label';
            label_element_node.textContent = musical_note_string;
            row_element_node.appendChild(label_element_node);

            for (let step_index_number = 0; step_index_number < sequencer_engine_instance.steps; step_index_number++) {
                const cell_element_node = document.createElement('div');
                cell_element_node.className = 'grid-cell note-cell';
                cell_element_node.dataset.step = step_index_number;
                cell_element_node.dataset.note = musical_note_string;
                
                if (sequencer_engine_instance.grid[step_index_number].note === musical_note_string) {
                    cell_element_node.classList.add('active-note');
                }

                cell_element_node.addEventListener('click', () => {
                    sequencer_engine_instance.toggleNote(step_index_number, musical_note_string);
                    renderGrid(); // Re-render to clear other notes in column
                });

                row_element_node.appendChild(cell_element_node);
            }
            grid_container_element.appendChild(row_element_node);
        });

        // Slide Row
        const slide_row_element = document.createElement('div');
        slide_row_element.className = 'grid-row';
        const slide_label_element = document.createElement('div');
        slide_label_element.className = 'grid-label';
        slide_label_element.textContent = 'SLIDE';
        slide_row_element.appendChild(slide_label_element);
        
        for (let step_index_number = 0; step_index_number < sequencer_engine_instance.steps; step_index_number++) {
            const cell_element_node = document.createElement('div');
            cell_element_node.className = 'grid-cell slide-cell';
            if (sequencer_engine_instance.grid[step_index_number].slide) cell_element_node.classList.add('active-slide');
            
            cell_element_node.addEventListener('click', () => {
                sequencer_engine_instance.toggleSlide(step_index_number);
                cell_element_node.classList.toggle('active-slide');
            });
            slide_row_element.appendChild(cell_element_node);
        }
        grid_container_element.appendChild(slide_row_element);

        // Accent Row
        const accent_row_element = document.createElement('div');
        accent_row_element.className = 'grid-row';
        const accent_label_element = document.createElement('div');
        accent_label_element.className = 'grid-label';
        accent_label_element.textContent = 'ACCENT';
        accent_row_element.appendChild(accent_label_element);
        
        for (let step_index_number = 0; step_index_number < sequencer_engine_instance.steps; step_index_number++) {
            const cell_element_node = document.createElement('div');
            cell_element_node.className = 'grid-cell accent-cell';
            if (sequencer_engine_instance.grid[step_index_number].accent) cell_element_node.classList.add('active-accent');
            
            cell_element_node.addEventListener('click', () => {
                sequencer_engine_instance.toggleAccent(step_index_number);
                renderGrid(); // Re-render to clear mutually exclusive ghost
            });
            accent_row_element.appendChild(cell_element_node);
        }
        grid_container_element.appendChild(accent_row_element);

        // Ghost Row
        const ghost_row_element = document.createElement('div');
        ghost_row_element.className = 'grid-row';
        const ghost_label_element = document.createElement('div');
        ghost_label_element.className = 'grid-label';
        ghost_label_element.textContent = 'GHOST';
        ghost_row_element.appendChild(ghost_label_element);
        
        for (let step_index_number = 0; step_index_number < sequencer_engine_instance.steps; step_index_number++) {
            const cell_element_node = document.createElement('div');
            cell_element_node.className = 'grid-cell ghost-cell';
            if (sequencer_engine_instance.grid[step_index_number].ghost) cell_element_node.classList.add('active-ghost');
            
            cell_element_node.addEventListener('click', () => {
                sequencer_engine_instance.toggleGhost(step_index_number);
                renderGrid(); // Re-render to clear mutually exclusive accent
            });
            ghost_row_element.appendChild(cell_element_node);
        }
        grid_container_element.appendChild(ghost_row_element);
    }

    // --- Keyboard Shortcuts (1-9) ---
    // WHAT: Listens for number keys (1-9) to save or recall patterns. Shift + number saves, just number recalls.
    // WHY: Enables rapid live performance and pattern switching without taking hands off the keyboard. It specifically ignores inputs if the user is typing in a text field so they don't accidentally switch patterns.
    window.addEventListener('keydown', (event_object) => {
        // Ignore if user is typing in a text/number input (but allow if they are on a range slider or checkbox)
        if (event_object.target.tagName === 'INPUT' && (event_object.target.type === 'text' || event_object.target.type === 'number')) return;

        if (event_object.code && event_object.code.startsWith('Digit')) {
            // e.key might be '!' if shift is pressed, so extract number from e.code
            const key_integer_value = parseInt(event_object.code.replace('Digit', ''));
            if (key_integer_value >= 1 && key_integer_value <= 9) {
                if (event_object.shiftKey) {
                    // Save pattern
                    sequencer_engine_instance.savePattern(key_integer_value);
                } else {
                    // Recall pattern
                    if (sequencer_engine_instance.recallPattern(key_integer_value)) {
                        renderGrid();
                    }
                }
            }
        }
    });

    // --- Sequencer UI Sync ---
    // WHAT: Visually updates the CSS classes on the grid to highlight the currently playing step column.
    // WHY: Provides vital visual feedback to the user so they can see exactly where they are in the 16-step loop. This callback is triggered directly by the Tone.js transport for sample-accurate timing.
    sequencer_engine_instance.setUICallback((current_step_index_number) => {
        // Remove playhead from all cells
        document.querySelectorAll('.grid-cell').forEach(cell_element_node => cell_element_node.classList.remove('playhead'));
        
        if (current_step_index_number >= 0) {
            // Add playhead to current column
            // We have 15 rows total (13 notes + slide + accent)
            // Selecting via nth-child logic can be tricky with grid, so we filter by dataset or index
            
            // Note cells
            const note_cells_node_list = document.querySelectorAll(`.note-cell:nth-child(${current_step_index_number + 2})`);
            note_cells_node_list.forEach(cell_element_node => cell_element_node.classList.add('playhead'));
            
            // Slide cell
            const slide_cells_node_list = document.querySelectorAll(`.slide-cell:nth-child(${current_step_index_number + 2})`);
            slide_cells_node_list.forEach(cell_element_node => cell_element_node.classList.add('playhead'));
            
            // Accent cell
            const accent_cells_node_list = document.querySelectorAll(`.accent-cell:nth-child(${current_step_index_number + 2})`);
            accent_cells_node_list.forEach(cell_element_node => cell_element_node.classList.add('playhead'));
            
            // Ghost cell
            const ghost_cells_node_list = document.querySelectorAll(`.ghost-cell:nth-child(${current_step_index_number + 2})`);
            ghost_cells_node_list.forEach(cell_element_node => cell_element_node.classList.add('playhead'));
        }
    });

    // --- Event Listeners ---
    play_button_element.addEventListener('click', async () => {
        await Tone.start(); // Required by browsers
        sequencer_engine_instance.start();
    });

    stop_button_element.addEventListener('click', () => {
        sequencer_engine_instance.stop();
    });

    clear_button_element.addEventListener('click', () => {
        sequencer_engine_instance.clearGrid();
        renderGrid();
    });

    tempo_input_element.addEventListener('change', (event_object) => {
        sequencer_engine_instance.setBpm(parseFloat(event_object.target.value));
        if (typeof window.updateGmSyncRate === 'function') window.updateGmSyncRate();
    });

    // Synth control listeners
    // WHAT: Routes UI slider changes directly into the TB-303 audio engine.
    // WHY: Basic event binding to make the knobs actually change the sound.
    wave_select_element.addEventListener('change', (event_object) => audio_engine_instance.setParam('wave', event_object.target.value));
    cutoff_input_element.addEventListener('input', (event_object) => audio_engine_instance.setParam('cutoff', parseFloat(event_object.target.value)));
    resonance_input_element.addEventListener('input', (event_object) => audio_engine_instance.setParam('resonance', parseFloat(event_object.target.value)));
    envelope_modulation_input_element.addEventListener('input', (event_object) => audio_engine_instance.setParam('envMod', parseFloat(event_object.target.value)));
    decay_input_element.addEventListener('input', (event_object) => audio_engine_instance.setParam('decay', parseFloat(event_object.target.value)));
    accent_amount_input_element.addEventListener('input', (event_object) => audio_engine_instance.setParam('accentAmount', parseFloat(event_object.target.value)));

    // Pedal listeners
    pedal_overdrive_element.addEventListener('change', (event_object) => audio_engine_instance.setPedal('overdrive', event_object.target.checked));
    pedal_delay_element.addEventListener('change', (event_object) => audio_engine_instance.setPedal('delay', event_object.target.checked));
    pedal_phaser_element.addEventListener('change', (event_object) => audio_engine_instance.setPedal('phaser', event_object.target.checked));

    // ==========================================
    // MOOG GRANDMOTHER — Drone Synth Controls
    // ==========================================
    const grandmother_engine_instance = window.GrandmotherEngine;
    const grandmother_section_element = document.getElementById('grandmother-section');
    const drone_indicator_element = document.getElementById('drone-indicator');
    const button_drone_toggle_element = document.getElementById('btn-drone-toggle');

    // Drone Toggle
    // WHAT: Turns the Moog Grandmother synthesizer on or off and updates the UI styling.
    // WHY: Since it's a drone synth, it doesn't wait for sequencer notes. The user manually powers it on, so we need a dedicated button and visual state changes.
    button_drone_toggle_element.addEventListener('click', async () => {
        await Tone.start();
        if (!grandmother_engine_instance.isPlaying) {
            grandmother_engine_instance.startDrone();
            grandmother_section_element.classList.add('drone-active');
            drone_indicator_element.classList.add('active');
            button_drone_toggle_element.classList.remove('btn-drone-off');
            button_drone_toggle_element.textContent = 'DRONE: ON';
        } else {
            grandmother_engine_instance.stopDrone();
            grandmother_section_element.classList.remove('drone-active');
            drone_indicator_element.classList.remove('active');
            button_drone_toggle_element.classList.add('btn-drone-off');
            button_drone_toggle_element.textContent = 'DRONE: OFF';
        }
    });

    // Grandmother knob controls — map element IDs to engine param keys
    const grandmother_controls_array = [
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

    grandmother_controls_array.forEach(({ id, param, valId }) => {
        const input_element_node = document.getElementById(id);
        const value_display_element_node = document.getElementById(valId);

        if (input_element_node) {
            input_element_node.addEventListener('input', (event_object) => {
                const slider_value_float = parseFloat(event_object.target.value);
                grandmother_engine_instance.setParam(param, slider_value_float);
                value_display_element_node.textContent = Math.round(slider_value_float * 100) + '%';
            });
        }
    });

    // --- LFO BPM Sync ---
    const grandmother_mod_sync_checkbox_element = document.getElementById('gm-mod-sync');
    const grandmother_mod_rate_slider_element = document.getElementById('gm-mod-rate');
    const grandmother_sync_rate_slider_element = document.getElementById('gm-sync-rate');
    const grandmother_mod_rate_value_element = document.getElementById('gm-mod-rate-val');

    const grandmother_sync_rates_array = [
        { label: '4 Bars', beats: 16 },
        { label: '2 Bars', beats: 8 },
        { label: '1 Bar', beats: 4 },
        { label: '1/2 Note', beats: 2 },
        { label: 'Dotted 1/4', beats: 1.5 },
        { label: '1/4 Note', beats: 1 },
        { label: 'Dotted 1/8', beats: 0.75 },
        { label: '1/8 Note', beats: 0.5 },
        { label: '1/16 Note', beats: 0.25 },
        { label: '1/32 Note', beats: 0.125 }
    ];

    // WHAT: Recalculates the LFO frequency based on the master sequencer tempo and the chosen musical subdivision.
    // WHY: When BPM sync is enabled, the LFO needs to wobble perfectly in time with the drums/bassline instead of running freely.
    window.updateGmSyncRate = function() {
        if (!grandmother_mod_sync_checkbox_element || !grandmother_mod_sync_checkbox_element.checked) return;
        const current_beats_per_minute = parseFloat(tempo_input_element.value) || 120;
        const selected_sync_index = parseInt(grandmother_sync_rate_slider_element.value);
        const sync_rate_object = grandmother_sync_rates_array[selected_sync_index];
        const calculated_frequency_hertz = (current_beats_per_minute / 60) / sync_rate_object.beats;
        grandmother_engine_instance.setModRateHz(calculated_frequency_hertz);
        if (grandmother_mod_rate_value_element) grandmother_mod_rate_value_element.textContent = sync_rate_object.label;
    };

    if (grandmother_mod_sync_checkbox_element) {
        grandmother_mod_sync_checkbox_element.addEventListener('change', (event_object) => {
            if (event_object.target.checked) {
                grandmother_mod_rate_slider_element.style.display = 'none';
                grandmother_sync_rate_slider_element.style.display = 'block';
                window.updateGmSyncRate();
            } else {
                grandmother_mod_rate_slider_element.style.display = 'block';
                grandmother_sync_rate_slider_element.style.display = 'none';
                const slider_value_float = parseFloat(grandmother_mod_rate_slider_element.value);
                grandmother_engine_instance.setParam('modRate', slider_value_float);
                if (grandmother_mod_rate_value_element) grandmother_mod_rate_value_element.textContent = Math.round(slider_value_float * 100) + '%';
            }
        });
        grandmother_sync_rate_slider_element.addEventListener('input', window.updateGmSyncRate);
        grandmother_mod_sync_checkbox_element.dispatchEvent(new Event('change')); // Sync initial state
    }

    const grandmother_aux_switch_element = document.getElementById('gm-aux');
    if (grandmother_aux_switch_element) {
        // WHAT: Routes the main TB-303 output into the Grandmother mixer.
        // WHY: Acts like plugging a patch cable between the two synths, allowing the 303 to be processed by the Grandmother's filter and reverb.
        grandmother_aux_switch_element.addEventListener('change', (event_object) => {
            if (window.AudioEngine) {
                if (event_object.target.checked) {
                    window.AudioEngine.volume.disconnect(Tone.Destination);
                    window.AudioEngine.volume.connect(grandmother_engine_instance.extInput);
                } else {
                    window.AudioEngine.volume.disconnect(grandmother_engine_instance.extInput);
                    window.AudioEngine.volume.connect(Tone.Destination);
                }
            }
        });
        grandmother_aux_switch_element.dispatchEvent(new Event('change')); // Sync initial state
    }

    // ==========================================
    // MIDI CONTROLLER INTEGRATION
    // ==========================================
    const midi_controller_instance = window.MIDIController;
    const midi_status_indicator_dot_element = document.getElementById('midi-dot');
    const midi_status_label_element = document.getElementById('midi-label');
    const button_midi_learn_element = document.getElementById('btn-midi-learn');
    const button_midi_reset_element = document.getElementById('btn-midi-reset');

    // --- MIDI Status Indicator ---
    window.addEventListener('midiDeviceChange', (event_object) => {
        const { type, device } = event_object.detail;
        midi_status_indicator_dot_element.classList.remove('connected', 'unsupported');

        if (type === 'connected') {
            midi_status_indicator_dot_element.classList.add('connected');
            midi_status_label_element.textContent = device ? device.name : 'MIDI';
        } else if (type === 'disconnected') {
            // Check if any devices still connected
            if (midi_controller_instance.isConnected) {
                midi_status_indicator_dot_element.classList.add('connected');
                midi_status_label_element.textContent = midi_controller_instance.deviceNames[0] || 'MIDI';
            } else {
                midi_status_label_element.textContent = 'MIDI';
            }
        } else if (type === 'unsupported') {
            midi_status_indicator_dot_element.classList.add('unsupported');
            midi_status_label_element.textContent = 'NO MIDI';
        }
    });

    // --- Learnable Parameter Registry ---
    // Maps parameter names to { element, inputId, type }
    const learnable_parameters_registry_object = {};

    // TB-303 knobs
    const tb303_learnable_parameters_array = [
        { param: 'cutoff',       inputId: 'cutoff',         element: cutoff_input_element.closest('.knob-group') },
        { param: 'resonance',    inputId: 'resonance',      element: resonance_input_element.closest('.knob-group') },
        { param: 'envMod',       inputId: 'env-mod',        element: envelope_modulation_input_element.closest('.knob-group') },
        { param: 'decay',        inputId: 'decay',          element: decay_input_element.closest('.knob-group') },
        { param: 'accentAmount', inputId: 'accent-amount',  element: accent_amount_input_element.closest('.knob-group') },
    ];

    tb303_learnable_parameters_array.forEach(({ param, inputId, element }) => {
        learnable_parameters_registry_object[param] = { element, inputId, type: 'range' };
    });

    // TB-303 pedals
    const pedal_learnable_parameters_array = [
        { param: 'pedal-overdrive', inputId: 'pedal-overdrive', element: pedal_overdrive_element.closest('.pedal') },
        { param: 'pedal-delay',     inputId: 'pedal-delay',     element: pedal_delay_element.closest('.pedal') },
        { param: 'pedal-phaser',    inputId: 'pedal-phaser',    element: pedal_phaser_element.closest('.pedal') },
    ];

    pedal_learnable_parameters_array.forEach(({ param, inputId, element }) => {
        learnable_parameters_registry_object[param] = { element, inputId, type: 'toggle' };
    });

    // Transport
    learnable_parameters_registry_object['transport-play'] = { element: play_button_element, inputId: null, type: 'transport' };
    learnable_parameters_registry_object['transport-stop'] = { element: stop_button_element, inputId: null, type: 'transport' };

    // Grandmother knobs
    grandmother_controls_array.forEach(({ id, param }) => {
        const element_node = document.getElementById(id)?.closest('.gm-knob-group');
        if (element_node) {
            learnable_parameters_registry_object[`gm-${param}`] = { element: element_node, inputId: id, type: 'range' };
        }
    });

    // --- MIDI Learn Mode ---
    let is_midi_learn_active_boolean = false;
    let currently_listening_element_node = null;
    let tooltip_element_node = null;

    // WHAT: Displays a floating tooltip to guide the user during the MIDI mapping process.
    // WHY: Without this, the user wouldn't know if the app is waiting for their input or if their knob tweak was successfully registered.
    function showTooltip(tooltip_text_string) {
        removeTooltip();
        tooltip_element_node = document.createElement('div');
        tooltip_element_node.className = 'midi-learn-tooltip';
        tooltip_element_node.textContent = tooltip_text_string;
        document.body.appendChild(tooltip_element_node);
    }

    // WHAT: Destroys the MIDI learn tooltip from the DOM.
    // WHY: Keeps the UI clean when learning is not active.
    function removeTooltip() {
        if (tooltip_element_node) {
            tooltip_element_node.remove();
            tooltip_element_node = null;
        }
    }

    // WHAT: Toggles the global MIDI Learn state and updates the UI (flashing buttons, cursor changes).
    // WHY: Puts the entire application into a special state where clicks no longer interact with the synth, but instead select UI elements to be mapped to hardware controllers.
    function toggleLearnMode() {
        is_midi_learn_active_boolean = !is_midi_learn_active_boolean;
        document.body.classList.toggle('midi-learn-active', is_midi_learn_active_boolean);
        button_midi_learn_element.classList.toggle('active', is_midi_learn_active_boolean);

        if (is_midi_learn_active_boolean) {
            showTooltip('MIDI LEARN: Click a control to assign...');
        } else {
            // Cancel any active listening
            if (currently_listening_element_node) {
                currently_listening_element_node.classList.remove('midi-listening');
                currently_listening_element_node = null;
            }
            midi_controller_instance.exitLearnMode();
            removeTooltip();
        }
    }

    button_midi_learn_element.addEventListener('click', toggleLearnMode);

    button_midi_reset_element.addEventListener('click', () => {
        midi_controller_instance.resetMap();
        // Exit learn mode if active
        if (is_midi_learn_active_boolean) toggleLearnMode();
        updateMappedIndicators();
    });

    // Escape key exits learn mode
    window.addEventListener('keydown', (event_object) => {
        if (event_object.key === 'Escape' && is_midi_learn_active_boolean) {
            toggleLearnMode();
        }
    });

    // Click handler for learnable elements
    // WHAT: Prepares a specific UI parameter to listen for the next incoming MIDI hardware message.
    // WHY: This happens when the user clicks a knob while in Learn Mode. It highlights the knob and tells the MIDI controller class what software parameter it should bind to.
    function handleLearnClick(software_parameter_name_string) {
        if (!is_midi_learn_active_boolean) return;

        // Clear previous listening state
        if (currently_listening_element_node) {
            currently_listening_element_node.classList.remove('midi-listening');
        }

        const learnable_parameter_object = learnable_parameters_registry_object[software_parameter_name_string];
        if (!learnable_parameter_object) return;

        currently_listening_element_node = learnable_parameter_object.element;
        currently_listening_element_node.classList.add('midi-listening');

        midi_controller_instance.enterLearnMode(software_parameter_name_string);
        showTooltip(`Move a MIDI control for: ${software_parameter_name_string.toUpperCase()}`);
    }

    // Attach learn-mode click handlers to all learnable parameters
    Object.entries(learnable_parameters_registry_object).forEach(([software_parameter_name_string, { element }]) => {
        if (!element) return;
        element.addEventListener('click', (event_object) => {
            if (is_midi_learn_active_boolean) {
                event_object.preventDefault();
                event_object.stopPropagation();
                handleLearnClick(software_parameter_name_string);
            }
        }, true); // Use capture to intercept before normal handlers
    });

    // Learn complete → update UI
    window.addEventListener('midiLearnComplete', (event_object) => {
        const { parameter, sourceId } = event_object.detail;
        console.log(`[UI] MIDI Learn complete: ${sourceId} → ${parameter}`);

        if (currently_listening_element_node) {
            currently_listening_element_node.classList.remove('midi-listening');
            currently_listening_element_node = null;
        }

        const formatted_source_label_string = midi_controller_instance.getSourceLabel(sourceId);
        showTooltip(`✓ Mapped ${formatted_source_label_string} → ${parameter.toUpperCase()}`);

        // Auto-exit learn mode after a successful mapping
        setTimeout(() => {
            if (is_midi_learn_active_boolean) toggleLearnMode();
        }, 1500);

        updateMappedIndicators();
    });

    // WHAT: Iterates over all learnable UI elements and adds a visual blue dot to them if they are currently mapped to a hardware controller.
    // WHY: Gives the user immediate visual feedback on which knobs are controlled by their MIDI keyboard.
    function updateMappedIndicators() {
        Object.entries(learnable_parameters_registry_object).forEach(([software_parameter_name_string, { element }]) => {
            if (!element) return;
            const mapped_source_id_string = midi_controller_instance.getSourceForParameter(software_parameter_name_string);
            element.classList.toggle('midi-mapped', !!mapped_source_id_string);
            element.style.position = mapped_source_id_string ? 'relative' : '';
        });
    }

    // Run once on init
    updateMappedIndicators();

    // --- MIDI CC → UI Slider Sync ---
    // When a hardware control moves, update the on-screen slider position
    const tb303_input_mapping_object = {
        'cutoff':       cutoff_input_element,
        'resonance':    resonance_input_element,
        'envMod':       envelope_modulation_input_element,
        'decay':        decay_input_element,
        'accentAmount': accent_amount_input_element,
    };

    window.addEventListener('midiCCChange', (event_object) => {
        const { parameter, scaledValue } = event_object.detail;

        // TB-303 sliders
        if (tb303_input_mapping_object[parameter]) {
            tb303_input_mapping_object[parameter].value = scaledValue;
            return;
        }

        // Grandmother sliders
        if (parameter.startsWith('gm-')) {
            const grandmother_parameter_name_string = parameter.replace('gm-', '');
            
            // Override modRate if BPM SYNC is enabled
            if (grandmother_parameter_name_string === 'modRate' && grandmother_mod_sync_checkbox_element && grandmother_mod_sync_checkbox_element.checked) {
                const synchronized_index_integer = Math.round(scaledValue * 9); // Map 0-1 to 0-9
                if (grandmother_sync_rate_slider_element) grandmother_sync_rate_slider_element.value = synchronized_index_integer;
                window.updateGmSyncRate();
                return;
            }

            const grandmother_control_object = grandmother_controls_array.find(grandmother_control_object => grandmother_control_object.param === grandmother_parameter_name_string);
            if (grandmother_control_object) {
                const hardware_input_element_node = document.getElementById(grandmother_control_object.id);
                const value_display_element_node = document.getElementById(grandmother_control_object.valId);
                if (hardware_input_element_node) hardware_input_element_node.value = scaledValue;
                if (value_display_element_node) value_display_element_node.textContent = Math.round(scaledValue * 100) + '%';
            }
        }
    });

    // --- MIDI Transport ---
    window.addEventListener('midiTransport', async (event_object) => {
        const { action } = event_object.detail;
        if (action === 'play') {
            await Tone.start();
            sequencer_engine_instance.start();
        } else if (action === 'stop') {
            sequencer_engine_instance.stop();
        }
    });

    // --- MIDI Pedal Toggle ---
    window.addEventListener('midiToggle', (event_object) => {
        const { parameter, state } = event_object.detail;
        const pedal_mapping_object = {
            'pedal-overdrive': { checkbox: pedal_overdrive_element, name: 'overdrive' },
            'pedal-delay':     { checkbox: pedal_delay_element,     name: 'delay' },
            'pedal-phaser':    { checkbox: pedal_phaser_element,    name: 'phaser' },
        };

        const current_pedal_object = pedal_mapping_object[parameter];
        if (current_pedal_object) {
            current_pedal_object.checkbox.checked = state;
            audio_engine_instance.setPedal(current_pedal_object.name, state);
        }
    });

    // --- MIDI Program Change → Pattern Recall ---
    window.addEventListener('midiProgramChange', (event_object) => {
        const { program } = event_object.detail;
        if (sequencer_engine_instance.recallPattern(program)) {
            renderGrid();
        }
    });

    // Initialize grid layout
    renderGrid();
});
