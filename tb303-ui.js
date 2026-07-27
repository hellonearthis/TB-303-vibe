class TB303Instrument extends window.Instrument {
    constructor() {
        super('tb303', document.getElementById('tb303-section'));
        this.audioEngine = window.AudioEngine;
        this.sequencerEngine = window.SequencerEngine;
    }

    mount() {
        super.mount();
        this.setupUI();
    }

    setupUI() {
        const sequencer_engine_instance = this.sequencerEngine;
        const audio_engine_instance = this.audioEngine;

        // --- UI Elements ---
        const grid_container_element = document.getElementById('grid-container');
        const play_button_element = document.getElementById('btn-play');
        const stop_button_element = document.getElementById('btn-stop');
        const clear_button_element = document.getElementById('btn-clear');
        const tempo_input_element = document.getElementById('tempo');
        
        // Synth Controls
        const wave_select_element = document.getElementById('wave-type');
        const tuning_input_element = document.getElementById('tuning');
        const cutoff_input_element = document.getElementById('cutoff');
        const resonance_input_element = document.getElementById('resonance');
        const envelope_modulation_input_element = document.getElementById('env-mod');
        const decay_input_element = document.getElementById('decay');
        const accent_amount_input_element = document.getElementById('accent-amount');
        const volume_input_element = document.getElementById('volume');
        
        // Pedals
        const pedal_overdrive_element = document.getElementById('pedal-overdrive');
        const pedal_delay_element = document.getElementById('pedal-delay');
        const pedal_phaser_element = document.getElementById('pedal-phaser');

        // --- Build Grid UI ---
        const renderGrid = () => {
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

            // Per-step octave switches mirror the original TB-303 octave up/down modifiers.
            const appendOctaveRow = (label_text, octave_value, class_name) => {
                const row_element = document.createElement('div');
                row_element.className = 'grid-row';
                const label_element = document.createElement('div');
                label_element.className = 'grid-label';
                label_element.textContent = label_text;
                row_element.appendChild(label_element);

                for (let step_index = 0; step_index < sequencer_engine_instance.steps; step_index++) {
                    const cell_element = document.createElement('div');
                    cell_element.className = `grid-cell octave-cell ${class_name}`;
                    if ((sequencer_engine_instance.grid[step_index].octave || 0) === octave_value) {
                        cell_element.classList.add(octave_value > 0 ? 'active-octave-up' : 'active-octave-down');
                    }
                    cell_element.addEventListener('click', () => {
                        sequencer_engine_instance.toggleOctave(step_index, octave_value);
                        renderGrid();
                    });
                    row_element.appendChild(cell_element);
                }
                grid_container_element.appendChild(row_element);
            };

            appendOctaveRow('OCT +', 1, 'octave-up-cell');
            appendOctaveRow('OCT -', -1, 'octave-down-cell');
            // Timing tie: sustain the previous note without consuming a new attack.
            const tie_row_element = document.createElement('div');
            tie_row_element.className = 'grid-row';
            const tie_label_element = document.createElement('div');
            tie_label_element.className = 'grid-label';
            tie_label_element.textContent = 'TIE';
            tie_row_element.appendChild(tie_label_element);
            for (let step_index = 0; step_index < sequencer_engine_instance.steps; step_index++) {
                const cell_element = document.createElement('div');
                cell_element.className = 'grid-cell tie-cell';
                if (sequencer_engine_instance.grid[step_index].tie) cell_element.classList.add('active-tie');
                cell_element.addEventListener('click', () => {
                    sequencer_engine_instance.toggleTie(step_index);
                    renderGrid();
                });
                tie_row_element.appendChild(cell_element);
            }
            grid_container_element.appendChild(tie_row_element);
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
        };

        // --- Keyboard Shortcuts (1-9) ---
        window.addEventListener('keydown', (event_object) => {
            if (event_object.target.tagName === 'INPUT' && (event_object.target.type === 'text' || event_object.target.type === 'number')) return;

            if (event_object.code && event_object.code.startsWith('Digit')) {
                const key_integer_value = parseInt(event_object.code.replace('Digit', ''));
                if (key_integer_value >= 1 && key_integer_value <= 9) {
                    if (event_object.shiftKey) {
                        sequencer_engine_instance.savePattern(key_integer_value);
                    } else {
                        sequencer_engine_instance.queuePattern(key_integer_value);
                    }
                }
            }
        });

        sequencer_engine_instance.setPatternChangeCallback(() => {
            renderGrid();
        });

        // --- Sequencer UI Sync ---
        sequencer_engine_instance.setUICallback((current_step_index_number) => {
            document.querySelectorAll('.grid-cell').forEach(cell_element_node => cell_element_node.classList.remove('playhead'));
            
            if (current_step_index_number >= 0) {
                const note_cells_node_list = document.querySelectorAll(`.note-cell:nth-child(${current_step_index_number + 2})`);
                note_cells_node_list.forEach(cell_element_node => cell_element_node.classList.add('playhead'));
                
                document.querySelectorAll('.octave-cell:nth-child(' + (current_step_index_number + 2) + ')').forEach(cell => cell.classList.add('playhead'));
                document.querySelectorAll('.tie-cell:nth-child(' + (current_step_index_number + 2) + ')').forEach(cell => cell.classList.add('playhead'));
                
                const slide_cells_node_list = document.querySelectorAll(`.slide-cell:nth-child(${current_step_index_number + 2})`);
                slide_cells_node_list.forEach(cell_element_node => cell_element_node.classList.add('playhead'));
                
                const accent_cells_node_list = document.querySelectorAll(`.accent-cell:nth-child(${current_step_index_number + 2})`);
                accent_cells_node_list.forEach(cell_element_node => cell_element_node.classList.add('playhead'));
                
                const ghost_cells_node_list = document.querySelectorAll(`.ghost-cell:nth-child(${current_step_index_number + 2})`);
                ghost_cells_node_list.forEach(cell_element_node => cell_element_node.classList.add('playhead'));
            }
        });

        // --- Event Listeners ---
        play_button_element.addEventListener('click', async () => {
            await Tone.start();
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
        wave_select_element.addEventListener('change', (event_object) => audio_engine_instance.setParam('wave', event_object.target.value));
        tuning_input_element.addEventListener('input', (event_object) => audio_engine_instance.setParam('tuning', parseFloat(event_object.target.value)));
        cutoff_input_element.addEventListener('input', (event_object) => audio_engine_instance.setParam('cutoff', parseFloat(event_object.target.value)));
        resonance_input_element.addEventListener('input', (event_object) => audio_engine_instance.setParam('resonance', parseFloat(event_object.target.value)));
        envelope_modulation_input_element.addEventListener('input', (event_object) => audio_engine_instance.setParam('envMod', parseFloat(event_object.target.value)));
        decay_input_element.addEventListener('input', (event_object) => audio_engine_instance.setParam('decay', parseFloat(event_object.target.value)));
        accent_amount_input_element.addEventListener('input', (event_object) => audio_engine_instance.setParam('accentAmount', parseFloat(event_object.target.value)));
        volume_input_element.addEventListener('input', (event_object) => audio_engine_instance.setParam('volume', parseFloat(event_object.target.value)));

        // Pedal listeners
        pedal_overdrive_element.addEventListener('change', (event_object) => audio_engine_instance.setPedal('overdrive', event_object.target.checked));
        pedal_delay_element.addEventListener('change', (event_object) => audio_engine_instance.setPedal('delay', event_object.target.checked));
        pedal_phaser_element.addEventListener('change', (event_object) => audio_engine_instance.setPedal('phaser', event_object.target.checked));
        
        // --- MIDI CC & Learn Registration ---
        if (window.MIDIRegistry) {
            window.MIDIRegistry.register('tuning', tuning_input_element.closest('.knob-group'));
            window.MIDIRegistry.register('cutoff', cutoff_input_element.closest('.knob-group'));
            window.MIDIRegistry.register('resonance', resonance_input_element.closest('.knob-group'));
            window.MIDIRegistry.register('envMod', envelope_modulation_input_element.closest('.knob-group'));
            window.MIDIRegistry.register('decay', decay_input_element.closest('.knob-group'));
            window.MIDIRegistry.register('accentAmount', accent_amount_input_element.closest('.knob-group'));
            window.MIDIRegistry.register('volume', volume_input_element.closest('.knob-group'));

            window.MIDIRegistry.register('pedal-overdrive', pedal_overdrive_element.closest('.pedal'));
            window.MIDIRegistry.register('pedal-delay', pedal_delay_element.closest('.pedal'));
            window.MIDIRegistry.register('pedal-phaser', pedal_phaser_element.closest('.pedal'));

            window.MIDIRegistry.register('transport-play', play_button_element);
            window.MIDIRegistry.register('transport-stop', stop_button_element);
        }

        const tb303_input_mapping_object = {
            'tuning':       tuning_input_element,
            'cutoff':       cutoff_input_element,
            'resonance':    resonance_input_element,
            'envMod':       envelope_modulation_input_element,
            'decay':        decay_input_element,
            'accentAmount': accent_amount_input_element,
            'volume':       volume_input_element,
        };

        window.addEventListener('midiCCChange', (event_object) => {
            const { parameter, scaledValue } = event_object.detail;
            if (tb303_input_mapping_object[parameter]) {
                tb303_input_mapping_object[parameter].value = scaledValue;
                // Dispatch input event to trigger synth change
                tb303_input_mapping_object[parameter].dispatchEvent(new Event('input'));
            }
        });

        // Transport
        window.addEventListener('midiTransport', async (event_object) => {
            const { action } = event_object.detail;
            if (action === 'play') {
                await Tone.start();
                sequencer_engine_instance.start();
            } else if (action === 'stop') {
                sequencer_engine_instance.stop();
            }
        });

        // Program Change
        window.addEventListener('midiProgramChange', (event_object) => {
            const { program } = event_object.detail;
            sequencer_engine_instance.queuePattern(program);
        });

        // Initial render
        renderGrid();
    }
}

document.addEventListener('DOMContentLoaded', () => {
    window.Rack.register(new TB303Instrument());
});
