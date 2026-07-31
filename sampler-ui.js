// WHAT: UI controller class for the KO-40 Micro Sampler instrument.
// WHY: Manages sample bank DOM rendering, step sequencer button clicks, pitch editing modal state, and MIDI controller bindings.
class SamplerInstrument extends window.Instrument {
    // WHAT: Initializes the sampler UI with references to the audio engine and registers callback handlers.
    // WHY: Connects engine state changes to visual UI re-renders and status message banners.
    constructor() {
        super('sampler', document.getElementById('sampler-section'));
        this.engine = window.SamplerEngine;
        if (!this.engine) {
            throw new Error('Sampler engine is not ready yet');
        }
        this.engine.onRender = () => this.render();
        this.engine.onMessage = (primary_message_string, secondary_message_string) => this.message(primary_message_string, secondary_message_string);
        this.engine.onUpdateActiveSteps = (active_step_index_number) => this.updateActiveSteps(active_step_index_number);

        // WHAT: Subscribe to the engine's sequence-advance event to keep the pill list in sync.
        // WHY:  The engine fires this callback from tick() (audio thread side) via Tone.Draw,
        //       so the DOM update happens on the animation frame closest to the audio event —
        //       giving sample-accurate visual tracking without blocking audio.
        this.engine.onSequenceAdvance = (sequence_position_integer, pattern_index_integer) => {
            this.renderSequenceEditor();
            // WHAT: Mirror the currently playing pattern in the PATTERN dropdown.
            // WHY:  Lets the user see which pattern is live at a glance without
            //       needing to watch only the pill list.
            const pattern_select_element = document.getElementById('sampler-pattern');
            if (pattern_select_element) pattern_select_element.value = pattern_index_integer;
        };
    }

    // WHAT: Mounts the sampler into the active synth rack.
    // WHY: Builds DOM elements, binds click and input events, and triggers initial UI rendering.
    mount() {
        super.mount();
        this.build();
        this.bind();
        this.bindMidi();
        this.render();
    }


        // WHAT: Dynamically builds all DOM elements — sample pads, step buttons, pitch keyboard, pattern dropdown.
        // WHY: Data-driven DOM creation keeps the HTML lean and ensures the UI is always in sync with slot/step counts.
        build() {
            // Build 16 sample pad buttons
            const sample_bank_container_element = document.getElementById('sampler-slots');
            sample_bank_container_element.innerHTML = '';
            this.engine.slots.forEach((slot_object, slot_index) => {
                const pad_button_element = document.createElement('button');
                pad_button_element.className = 'sampler-pad';
                pad_button_element.dataset.slot = slot_index;
                pad_button_element.innerHTML = `<span>${slot_object.type === 'melodic' ? 'M' : 'D'}${slot_index % 8 + 1}</span><small>EMPTY</small>`;
                sample_bank_container_element.appendChild(pad_button_element);
            });
    
            // Build 16 step sequencer buttons
            const step_sequencer_container_element = document.getElementById('sampler-steps');
            step_sequencer_container_element.innerHTML = '';
            for (let step_index = 0; step_index < 16; step_index++) {
                const step_button_element = document.createElement('button');
                step_button_element.className = 'sampler-step';
                step_button_element.dataset.step = step_index;
                step_button_element.textContent = step_index + 1;
                step_sequencer_container_element.appendChild(step_button_element);
            }
    
            // Build chromatic keyboard for live pitch-shifting of melodic samples
            const keyboard_container_element = document.getElementById('sampler-keys');
            keyboard_container_element.innerHTML = '';
            ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B', 'C'].forEach((note_name, pitch_index) => {
                const key_button_element = document.createElement('button');
                key_button_element.className = 'sampler-key' + (pitch_index === 0 ? ' root' : '');
                key_button_element.dataset.pitch = pitch_index;
                key_button_element.textContent = note_name;
                keyboard_container_element.appendChild(key_button_element);
            });
    
            // Build pattern selector dropdown
            const pattern_select_element = document.getElementById('sampler-pattern');
            pattern_select_element.innerHTML = '';
            for (let pattern_index = 0; pattern_index < 16; pattern_index++) {
                pattern_select_element.add(new Option(String(pattern_index + 1).padStart(2, '0'), pattern_index));
            }
        }

    // WHAT: Attaches user interaction event listeners to sampler UI buttons, knobs, and inputs.
    // WHY: Separated from build() so each concern is easy to find and edit independently.
        bind() {
            // --- Sample Bank Pad Clicks ---
            // WHAT: Clicking a pad selects it as the active slot and previews the stored sample.
            // WHY: The selected slot determines which sample gets programmed into the sequence steps.
            document.getElementById('sampler-slots').onclick = async (click_event_object) => {
                const pad_element = click_event_object.target.closest('.sampler-pad');
                if (!pad_element) return;
                await Tone.start();
                this.engine.selectedSlot = +pad_element.dataset.slot;
                this.engine.play(this.engine.selectedSlot);
                this.render();
            };
    
            // --- Pitch Keyboard Clicks ---
            // WHAT: Clicking a key plays the melodic slot transposed by the key's pitch offset.
            // WHY: Allows auditioning samples at different pitches before programming them into steps.
            document.getElementById('sampler-keys').onclick = async (click_event_object) => {
                const key_element = click_event_object.target.closest('.sampler-key');
                if (key_element && this.engine.selectedSlot < 8) {
                    await Tone.start();
                    this.engine.play(this.engine.selectedSlot, Tone.now(), +key_element.dataset.pitch);
                }
            };
    
            // --- Step Sequencer Clicks ---
            // WHAT: Toggle steps on/off, or select an active step to open the pitch/velocity editor.
            // WHY: Two-mode interaction: empty step → program it; active step → edit its parameters.
            document.getElementById('sampler-steps').onclick = async (click_event_object) => {
                const step_element = click_event_object.target.closest('.sampler-step');
                if (!step_element) return;
                await Tone.start();
    
                const step_index = +step_element.dataset.step;
                const current_step_data = this.engine.patterns[this.engine.patternIndex][step_index];
                if (current_step_data !== null) {
                    if (this.engine.selectedStep === step_index) {
                        this.engine.selectedStep = null;
                    } else {
                        this.engine.selectedStep = step_index;
                        this.engine.play(current_step_data.slotIndex, Tone.now(), current_step_data.transposeSemitones, current_step_data.velocityFloat, current_step_data.fxOverrideString);
                    }
                } else {
                    this.engine.patterns[this.engine.patternIndex][step_index] = {
                        slotIndex: this.engine.selectedSlot,
                        transposeSemitones: 0,
                        velocityFloat: 1.0,
                        fxOverrideString: ''
                    };
                    this.engine.selectedStep = step_index;
                    this.engine.play(this.engine.selectedSlot);
                }
                this.render();
            };

            document.getElementById('sampler-step-transpose').oninput = async (input_event_object) => {
                if (this.engine.selectedStep === null) return;
                const step = this.engine.patterns[this.engine.patternIndex][this.engine.selectedStep];
                if (!step) return;
                await Tone.start();
                step.transposeSemitones = parseInt(input_event_object.target.value);
                document.getElementById('sampler-step-transpose-val').textContent = this.semitoneLabel(step.transposeSemitones);
                this.engine.play(step.slotIndex, Tone.now(), step.transposeSemitones, step.velocityFloat, step.fxOverrideString);
                this.render();
            };

            document.getElementById('sampler-step-velocity').oninput = async (input_event_object) => {
                if (this.engine.selectedStep === null) return;
                const step = this.engine.patterns[this.engine.patternIndex][this.engine.selectedStep];
                if (!step) return;
                await Tone.start();
                step.velocityFloat = parseFloat(input_event_object.target.value);
                document.getElementById('sampler-step-velocity-val').textContent = Math.round(step.velocityFloat * 100) + '%';
                this.engine.play(step.slotIndex, Tone.now(), step.transposeSemitones, step.velocityFloat, step.fxOverrideString);
            };

            document.getElementById('sampler-step-fx').onchange = async (change_event_object) => {
                if (this.engine.selectedStep === null) return;
                const step = this.engine.patterns[this.engine.patternIndex][this.engine.selectedStep];
                if (!step) return;
                await Tone.start();
                step.fxOverrideString = change_event_object.target.value;
                this.engine.play(step.slotIndex, Tone.now(), step.transposeSemitones, step.velocityFloat, step.fxOverrideString);
            };

            document.getElementById('sampler-step-clear-step').onclick = () => {
                if (this.engine.selectedStep === null) return;
                this.engine.patterns[this.engine.patternIndex][this.engine.selectedStep] = null;
                this.engine.selectedStep = null;
                this.render();
            };

            document.getElementById('sampler-source').onclick = (click_event_object) => {
                const source_index_number = this.engine.sourceOrder.indexOf(this.engine.source);
                this.engine.source = this.engine.sourceOrder[(source_index_number + 1) % this.engine.sourceOrder.length];
                click_event_object.target.textContent = `SRC: ${this.engine.source.toUpperCase()}`;
                this.message(`${this.engine.source.toUpperCase()} INPUT`, 'SELECT SLOT + RECORD');
            };

            document.getElementById('sampler-record').onclick = () => {
                this.engine.recorder ? this.engine.stopRecording() : this.engine.startRecording();
            };
            
            document.getElementById('sampler-clear').onclick = () => {
                const slot = this.engine.slots[this.engine.selectedSlot];
                if(slot.buffer) {
                    slot.buffer.dispose();
                }
                slot.buffer = null;
                slot.duration = 0;
                this.render();
            };

            document.getElementById('sampler-pattern-clear').onclick = () => {
                this.engine.patterns[this.engine.patternIndex].fill(null);
                this.engine.selectedStep = null;
                this.render();
            };

            document.getElementById('sampler-pattern-play').onclick = async () => {
                await Tone.start();
                this.engine.startSequence();
                this.message('PATTERN PLAYING', `PATTERN ${String(this.engine.patternIndex + 1).padStart(2, '0')}`);
            };

            document.getElementById('sampler-pattern-stop').onclick = () => {
                this.engine.stopSequence();
                this.render();
            };

            document.getElementById('sampler-pattern').onchange = (change_event_object) => {
                this.engine.patternIndex = +change_event_object.target.value;
                this.engine.selectedStep = null;
                this.render();
            };

            document.getElementById('sampler-pad-volume').oninput = (input_event_object) => {
                const slot = this.engine.slots[this.engine.selectedSlot];
                if (slot) {
                    slot.volume = parseFloat(input_event_object.target.value);
                }
            };

            document.getElementById('sampler-volume').oninput = (input_event_object) => {
                this.engine.output.volume.value = -36 + (+input_event_object.target.value * 36);
            };

            document.getElementById('sampler-fx').onchange = (change_event_object) => {
                this.engine.setEffect(change_event_object.target.value);
            };

            // WHAT: Wire all sequence editor controls — toggle, textarea, play, stop.
            // WHY:  Kept as a dedicated helper so bind() reads like a table of contents,
            //       not a monolith.
            this.bindSequenceEditor();
        }

        bindMidi() {
            window.addEventListener('midiNoteOn', async (midi_note_on_event_object) => {
                const midi_target = document.getElementById('midi-note-target');
                if (midi_target && midi_target.value !== 'sampler') return;
                await Tone.start();
                const { note: midi_note_number } = midi_note_on_event_object.detail;
                if (midi_note_number >= 36 && midi_note_number <= 43) {
                    this.engine.selectedSlot = 8 + (midi_note_number - 36);
                    this.engine.play(this.engine.selectedSlot);
                    this.render();
                    return;
                }
                if (this.engine.selectedSlot < 8) {
                    this.engine.play(this.engine.selectedSlot, Tone.now(), midi_note_number - 60);
                }
            });
    
            window.addEventListener('midiCCChange', (midi_cc_event_object) => {
                if (midi_cc_event_object.detail.parameter !== 'sampler-volume') return;
                const level_float = midi_cc_event_object.detail.scaledValue;
                document.getElementById('sampler-volume').value = level_float;
                this.engine.output.volume.value = -36 + (level_float * 36);
            });
    
            const sampler_volume_slider_element = document.getElementById('sampler-volume');
            let volume_label_element = null;
            if (sampler_volume_slider_element) {
                volume_label_element = sampler_volume_slider_element.closest('label');
            }
            if (window.MIDIRegistry && volume_label_element) {
                window.MIDIRegistry.register('sampler-volume', volume_label_element);
            }
        }

    //      to show that step's stored pitch, velocity, and FX override settings.
        syncStepEditor() {
            const step_editor_panel_element = document.getElementById('sampler-step-editor');
            if (!step_editor_panel_element) return;
    
            if (this.engine.selectedStep === null) {
                step_editor_panel_element.style.display = 'none';
                return;
            }
    
            const step_data_object = this.engine.patterns[this.engine.patternIndex][this.engine.selectedStep];
            if (!step_data_object) {
                step_editor_panel_element.style.display = 'none';
                return;
            }
    
            step_editor_panel_element.style.display = '';
    
            // Update header label
            document.getElementById('sampler-step-editor-label').textContent =
                `STEP ${this.engine.selectedStep + 1} · ${this.engine.slotName(step_data_object.slotIndex)}`;
    
            // Update pitch slider and display
            const transpose_slider_element = document.getElementById('sampler-step-transpose');
            transpose_slider_element.value = step_data_object.transposeSemitones;
            document.getElementById('sampler-step-transpose-val').textContent =
                this.semitoneLabel(step_data_object.transposeSemitones);
    
            // WHAT: Disable pitch controls for drum slots (indices 8-15).
            // WHY: Drum samples are one-shot hits that don't make musical sense to pitch-shift;
            //      this matches how the hardware KO units treat their drum banks.
            const pitch_controls_disabled_boolean = step_data_object.slotIndex >= 8;
            transpose_slider_element.disabled = pitch_controls_disabled_boolean;
    
            // Update velocity slider and display
            document.getElementById('sampler-step-velocity').value = step_data_object.velocityFloat;
            document.getElementById('sampler-step-velocity-val').textContent =
                Math.round(step_data_object.velocityFloat * 100) + '%';
    
            // Update FX override select
            document.getElementById('sampler-step-fx').value = step_data_object.fxOverrideString || '';
        }

        // WHAT: Updates both lines of the LCD-style screen display element.
        // WHY: The screen is the sampler's main communication channel to the user — status, errors, confirmations.
        message(primary_text_string, secondary_text_string) {
            document.getElementById('sampler-display-main').textContent = primary_text_string;
            document.getElementById('sampler-display-sub').textContent = secondary_text_string;
        }
    
        // WHAT: Full re-render of all sampler UI elements to match current state.
        // WHY: Rather than tracking individual element updates, a full render after each state change
        //      ensures the UI is always consistent with the data model.
        render() {
            // Update sample pad states
            document.querySelectorAll('.sampler-pad').forEach((pad_element, slot_index) => {
                const slot_object = this.engine.slots[slot_index];
                pad_element.classList.toggle('selected', slot_index === this.engine.selectedSlot);
                pad_element.classList.toggle('loaded', !!slot_object.buffer);
                pad_element.querySelector('small').textContent =
                    slot_object.buffer ? `${slot_object.duration.toFixed(1)} SEC` : 'EMPTY';
            });
    
            // Sync selected pad volume slider
            const pad_vol_element = document.getElementById('sampler-pad-volume');
            if (pad_vol_element && this.engine.slots[this.engine.selectedSlot]) {
                pad_vol_element.value = this.engine.slots[this.engine.selectedSlot].volume;
            }

            // Update step button states and labels
            document.querySelectorAll('.sampler-step').forEach((step_element, step_index) => {
                const step_data_object = this.engine.patterns[this.engine.patternIndex][step_index];
                const is_active_boolean = step_data_object !== null;
                const is_selected_boolean = step_index === this.engine.selectedStep;
    
                step_element.classList.toggle('active', is_active_boolean);
                step_element.classList.toggle('step-selected', is_selected_boolean);
    
                if (!is_active_boolean) {
                    step_element.textContent = step_index + 1;
                } else {
                    // WHAT: Two-line label inside each active step showing slot + pitch offset.
                    // WHY: At a glance the user can see which sample and what pitch each step has
                    //      without needing to click into the inspector.
                    const slot_short_label_string = step_data_object.slotIndex < 8
                        ? `M${step_data_object.slotIndex % 8 + 1}`
                        : `D${step_data_object.slotIndex % 8 + 1}`;
    
                    const pitch_offset_label_string = step_data_object.transposeSemitones !== 0
                        ? (step_data_object.transposeSemitones > 0
                            ? `+${step_data_object.transposeSemitones}`
                            : `${step_data_object.transposeSemitones}`)
                        : '';
    
                    step_element.innerHTML =
                        `<span class="step-num">${step_index + 1}</span>` +
                        `<span class="step-slot">${slot_short_label_string}${pitch_offset_label_string}</span>`;
                }
            });
    
            // Disable pitch keyboard for drum slots
            document.getElementById('sampler-keys').classList.toggle('disabled', this.engine.selectedSlot >= 8);
    
            // Update remaining memory display (if element exists)
            const sampler_time_element = document.getElementById('sampler-time');
            if (sampler_time_element) {
                sampler_time_element.textContent =
                    `${Math.max(0, this.engine.maxSeconds - this.engine.used()).toFixed(1)}s`;
            }
    
            // Sync the step editor panel to the selected step
            this.syncStepEditor();
    
            // Update the screen message if not currently recording
            if (!this.engine.recorder) {
                this.message(
                    this.engine.slots[this.engine.selectedSlot].buffer ? this.engine.slotName(this.engine.selectedSlot) : 'SELECTED · EMPTY',
                    `${this.engine.slotName(this.engine.selectedSlot)} · PATTERN ${String(this.engine.patternIndex + 1).padStart(2, '0')}`
                );
            }

            // WHAT: Refresh the sequence editor pill list and active-entry highlight.
            // WHY:  render() is the single full-sync entry point; including the sequence
            //       editor here ensures it stays consistent with the rest of the UI state.
            this.renderSequenceEditor();
        }

    // WHY: Displaying "D# (+3)" is far more musical and useful to the user than a raw number like "3".
        semitoneLabel(transpose_semitones_integer) {
            const note_names_array = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
            const base_note_index = ((transpose_semitones_integer % 12) + 12) % 12;
            const note_name_string = note_names_array[base_note_index];
            const sign_string = transpose_semitones_integer > 0 ? '+' : '';
            return `${note_name_string} (${sign_string}${transpose_semitones_integer})`;
        }

    // WHAT: Attaches event listeners to the sequence editor panel: expand toggle, textarea parse, play and stop.
    // WHY:  Isolated from the main bind() method so the sequence editor's wiring
    //       is easy to find and extend without touching the step sequencer bindings above.
    bindSequenceEditor() {
        // WHAT: Expand/collapse the sequence editor body on toggle button click.
        // WHY:  The panel is collapsible so it doesn't consume vertical space when unused.
        document.getElementById('sampler-seq-toggle').onclick = () => {
            const sequence_body_element = document.getElementById('sampler-seq-body');
            const sequence_toggle_button_element = document.getElementById('sampler-seq-toggle');
            const is_currently_open_boolean = sequence_body_element.style.display !== 'none';

            sequence_body_element.style.display = is_currently_open_boolean ? 'none' : '';
            sequence_toggle_button_element.textContent = is_currently_open_boolean ? '▸ EXPAND' : '▾ COLLAPSE';
            sequence_toggle_button_element.setAttribute('aria-expanded', String(!is_currently_open_boolean));
        };

        // WHAT: Opens and manages the screen-centered modal popup for pattern sequence usage & examples.
        // WHY:  Clicking [?] EXAMPLES displays a floating modal overlay with click-to-load preset cards.
        const sequence_help_button_element = document.getElementById('sampler-seq-help-btn');
        const sequence_modal_overlay_element = document.getElementById('sampler-seq-modal');
        const sequence_modal_close_button_element = document.getElementById('sampler-seq-modal-close');
        const sequence_modal_done_button_element = document.getElementById('sampler-seq-modal-done');

        const open_sequence_help_modal = () => {
            if (!sequence_modal_overlay_element) return;
            sequence_modal_overlay_element.style.display = 'flex';

            // Auto-expand the sequence editor body so the user sees the textarea and pills updated
            const sequence_body_element = document.getElementById('sampler-seq-body');
            const sequence_toggle_button_element = document.getElementById('sampler-seq-toggle');
            if (sequence_body_element && sequence_body_element.style.display === 'none') {
                sequence_body_element.style.display = '';
                if (sequence_toggle_button_element) {
                    sequence_toggle_button_element.textContent = '▾ COLLAPSE';
                    sequence_toggle_button_element.setAttribute('aria-expanded', 'true');
                }
            }
        };

        const close_sequence_help_modal = () => {
            if (sequence_modal_overlay_element) {
                sequence_modal_overlay_element.style.display = 'none';
            }
        };

        if (sequence_help_button_element) {
            sequence_help_button_element.onclick = open_sequence_help_modal;
        }

        if (sequence_modal_close_button_element) {
            sequence_modal_close_button_element.onclick = close_sequence_help_modal;
        }

        if (sequence_modal_done_button_element) {
            sequence_modal_done_button_element.onclick = close_sequence_help_modal;
        }

        // Close modal when clicking on dark backdrop overlay outside the modal card
        if (sequence_modal_overlay_element) {
            sequence_modal_overlay_element.onclick = (click_event) => {
                if (click_event.target === sequence_modal_overlay_element) {
                    close_sequence_help_modal();
                }
            };
        }

        // WHAT: Binds click handlers to example cards to load preset JSON strings into the sequence textarea.
        // WHY:  Allows instant trial of pre-configured pattern arrangements with visual status feedback.
        const example_card_elements_array = Array.from(document.querySelectorAll('.sampler-seq-example-card'));
        example_card_elements_array.forEach((example_card_button_element) => {
            example_card_button_element.onclick = () => {
                const target_json_string = example_card_button_element.getAttribute('data-json');
                const sequence_input_element = document.getElementById('sampler-seq-input');
                const sequence_modal_status_element = document.getElementById('sampler-seq-modal-status');

                if (target_json_string && sequence_input_element) {
                    sequence_input_element.value = target_json_string;
                    this._parseAndApplySequenceInput();
                    this.message('EXAMPLE LOADED', 'PATTERN SEQUENCE UPDATED');

                    if (sequence_modal_status_element) {
                        sequence_modal_status_element.textContent = '✓ Loaded into editor! Click DONE to close.';
                        sequence_modal_status_element.style.color = '#6eff6e';
                    }
                }
            };
        });

        // WHAT: Parse the textarea content on every keystroke and update engine.sequence.
        // WHY:  Live parsing gives the user immediate feedback (error message + pill list update)
        //       as they type, rather than only validating on play-press.
        document.getElementById('sampler-seq-input').oninput = () => {
            this._parseAndApplySequenceInput();
        };

        // WHAT: Start sequence mode from entry 0 when SEQ PLAY is pressed.
        // WHY:  Delegates to engine.startSequenceMode() which handles the patternIndex
        //       pre-load and Tone.Sequence lifecycle cleanly.
        document.getElementById('sampler-seq-play').onclick = async () => {
            await Tone.start();
            this.engine.startSequenceMode();
            this.message(
                'SEQ PLAYING',
                `ENTRY 1 OF ${this.engine.sequence.length} · P${String(this.engine.sequence[0].pattern).padStart(2, '0')}`
            );
            this.renderSequenceEditor();
        };

        // WHAT: Stop sequence mode and reset position to 0.
        // WHY:  Delegates to engine.stopSequenceMode() to keep audio lifecycle management
        //       centralised in the engine, not scattered across the UI.
        document.getElementById('sampler-seq-stop').onclick = () => {
            this.engine.stopSequenceMode();
            this.message('SEQ STOPPED', 'SEQUENCE RESET');
            this.renderSequenceEditor();
        };
    }

    // WHAT: Parses the textarea's JSON and applies it to the engine, updating error display and pills.
    // WHY:  Single source of truth for the parse-validate-apply pipeline so it can be called
    //       from both the oninput handler and any future "load preset" action.
    _parseAndApplySequenceInput() {
        const sequence_input_element = document.getElementById('sampler-seq-input');
        const sequence_error_element = document.getElementById('sampler-seq-error');
        const sequence_play_button_element = document.getElementById('sampler-seq-play');

        const raw_input_string = sequence_input_element.value.trim();

        // WHAT: Empty textarea resets the sequence without showing an error.
        // WHY:  Clearing the textarea is a valid user action (deleting the sequence),
        //       not an error state — showing an error for empty input would be noisy.
        if (!raw_input_string) {
            this.engine.sequence = [];
            sequence_error_element.textContent = '';
            sequence_play_button_element.disabled = true;
            this.renderSequenceEditor();
            return;
        }

        const parse_result_object = this.engine.parseSequence(raw_input_string);

        if (parse_result_object.ok) {
            // WHAT: Only update engine.sequence when parsing succeeds.
            // WHY:  We never want to put the engine in a half-broken state —
            //       if the user is mid-edit the old valid sequence remains active.
            this.engine.sequence = parse_result_object.entries;
            sequence_error_element.textContent = '';
            sequence_play_button_element.disabled = false;
        } else {
            sequence_error_element.textContent = '⚠ ' + parse_result_object.error;
            sequence_play_button_element.disabled = true;
        }

        this.renderSequenceEditor();
    }

    // WHAT: Re-renders the sequence pill list, highlighting the currently active entry.
    // WHY:  Called after any state change that could affect which pill should be lit
    //       (parse, SEQ PLAY, SEQ STOP, or the engine's onSequenceAdvance callback).
    renderSequenceEditor() {
        const sequence_list_element = document.getElementById('sampler-seq-list');
        if (!sequence_list_element) return;

        // WHAT: Clear and rebuild the pill list from engine.sequence.
        // WHY:  The list length can change on every keystroke — rebuilding is simpler
        //       and cheaper here than diffing individual pill elements.
        sequence_list_element.innerHTML = '';

        this.engine.sequence.forEach((sequence_entry_object, entry_index) => {
            const pill_button_element = document.createElement('button');
            pill_button_element.className = 'seq-entry';

            // WHAT: Mark the currently playing pill as active.
            // WHY:  The active pill is the primary real-time playback indicator —
            //       the user needs to see at a glance where the sequence is.
            const is_active_pill_boolean =
                this.engine.sequenceModeActive &&
                entry_index === this.engine.sequencePosition;

            if (is_active_pill_boolean) pill_button_element.classList.add('active');

            // WHAT: Label shows pattern number plus optional per-entry parameters (repeat, transpose, mute, bpm).
            // WHY:  Pill indicators immediately inform the user of complex sequence structures like repeats or pitch transpositions.
            const pattern_number_padded_string = String(sequence_entry_object.pattern).padStart(2, '0');
            let pill_label_string = `P${pattern_number_padded_string}`;

            const repeat_count_integer = sequence_entry_object.repeat ?? sequence_entry_object.repeats;
            if (repeat_count_integer && repeat_count_integer > 1) {
                pill_label_string += ` (x${repeat_count_integer})`;
            }

            if (sequence_entry_object.transpose) {
                const sign_prefix_string = sequence_entry_object.transpose > 0 ? '+' : '';
                pill_label_string += ` (${sign_prefix_string}${sequence_entry_object.transpose}st)`;
            }

            if (sequence_entry_object.mute) {
                pill_label_string += ' (MUTE)';
            }

            const bpm_override_integer = sequence_entry_object.bpm ?? sequence_entry_object.bpmOverride;
            if (bpm_override_integer) {
                pill_label_string += ` (${bpm_override_integer}BPM)`;
            }

            pill_button_element.textContent = pill_label_string;

            // WHAT: Clicking a pill jumps to that entry's pattern (when not in SEQ mode).
            // WHY:  Useful for quick auditioning of individual patterns in the sequence
            //       without having to find them in the dropdown.
            pill_button_element.onclick = () => {
                if (!this.engine.sequenceModeActive) {
                    this.engine.patternIndex = Math.max(0, Math.min(15, (sequence_entry_object.pattern ?? 1) - 1));
                    document.getElementById('sampler-pattern').value = this.engine.patternIndex;
                    this.render();
                }
            };

            sequence_list_element.appendChild(pill_button_element);
        });

        // WHAT: Show an empty-state hint when the sequence is empty.
        // WHY:  A blank list gives no guidance to a first-time user.
        if (this.engine.sequence.length === 0) {
            const hint_span_element = document.createElement('span');
            hint_span_element.className = 'seq-entry-hint';
            hint_span_element.textContent = 'Enter JSON above to build sequence';
            sequence_list_element.appendChild(hint_span_element);
        }
    }



}

document.addEventListener('DOMContentLoaded', () => {
    let sampler_mount_attempt_count = 0;
    const registerSamplerWhenReady = () => {
        sampler_mount_attempt_count += 1;
        if (!window.Rack || !window.Instrument || !window.SamplerEngine) {
            if (sampler_mount_attempt_count < 20) {
                setTimeout(registerSamplerWhenReady, 50);
                return;
            }
            console.error('Sampler UI could not mount because its dependencies were not ready.');
            return;
        }

        window.Rack.register(new SamplerInstrument());
    };

    registerSamplerWhenReady();
});
