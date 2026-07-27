class SamplerInstrument extends window.Instrument {
    constructor() {
        super('sampler', document.getElementById('sampler-section'));
        this.engine = window.SamplerEngine;
        this.engine.onRender = () => this.render();
        this.engine.onMessage = (p, s) => this.message(p, s);
        this.engine.onUpdateActiveSteps = (s) => this.updateActiveSteps(s);
    }

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
            this.engine.slots.forEach((slot_object, slot_index) => {
                const pad_button_element = document.createElement('button');
                pad_button_element.className = 'sampler-pad';
                pad_button_element.dataset.slot = slot_index;
                pad_button_element.innerHTML = `<span>${slot_object.type === 'melodic' ? 'M' : 'D'}${slot_index % 8 + 1}</span><small>EMPTY</small>`;
                sample_bank_container_element.appendChild(pad_button_element);
            });
    
            // Build 16 step sequencer buttons
            const step_sequencer_container_element = document.getElementById('sampler-steps');
            for (let step_index = 0; step_index < 16; step_index++) {
                const step_button_element = document.createElement('button');
                step_button_element.className = 'sampler-step';
                step_button_element.dataset.step = step_index;
                step_button_element.textContent = step_index + 1;
                step_sequencer_container_element.appendChild(step_button_element);
            }
    
            // Build chromatic keyboard for live pitch-shifting of melodic samples
            const keyboard_container_element = document.getElementById('sampler-keys');
            ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B', 'C'].forEach((note_name, pitch_index) => {
                const key_button_element = document.createElement('button');
                key_button_element.className = 'sampler-key' + (pitch_index === 0 ? ' root' : '');
                key_button_element.dataset.pitch = pitch_index;
                key_button_element.textContent = note_name;
                keyboard_container_element.appendChild(key_button_element);
            });
    
            // Build pattern selector dropdown
            const pattern_select_element = document.getElementById('sampler-pattern');
            for (let pattern_index = 0; pattern_index < 16; pattern_index++) {
                pattern_select_element.add(new Option(String(pattern_index + 1).padStart(2, '0'), pattern_index));
            }
        }

    // WHY: Separated from build() so each concern is easy to find and edit independently.
        bind() {
            // --- Sample Bank Pad Clicks ---
            // WHAT: Clicking a pad selects it as the active slot and previews the stored sample.
            // WHY: The selected slot determines which sample gets programmed into the sequence steps.
            document.getElementById('sampler-slots').onclick = (click_event_object) => {
                const pad_element = click_event_object.target.closest('.sampler-pad');
                if (!pad_element) return;
                this.engine.selectedSlot = +pad_element.dataset.slot;
                this.engine.play(this.engine.selectedSlot);
                this.render();
            };
    
            // --- Pitch Keyboard Clicks ---
            // WHAT: Clicking a key plays the melodic slot transposed by the key's pitch offset.
            // WHY: Allows auditioning samples at different pitches before programming them into steps.
            document.getElementById('sampler-keys').onclick = (click_event_object) => {
                const key_element = click_event_object.target.closest('.sampler-key');
                if (key_element && this.engine.selectedSlot < 8) {
                    this.engine.play(this.engine.selectedSlot, Tone.now(), +key_element.dataset.pitch);
                }
            };
    
            // --- Step Sequencer Clicks ---
            // WHAT: Toggle steps on/off, or select an active step to open the pitch/velocity editor.
            // WHY: Two-mode interaction: empty step → program it; active step → edit its parameters.
            document.getElementById('sampler-steps').onclick = (click_event_object) => {
                const step_element = click_event_object.target.closest('.sampler-step');
                if (!step_element) return;
    
                const step_index = +step_element.dataset.step;
                const current_step_data = this.engine.patterns[this.engine.patternIndex][step_index];
                if (current_step_data !== null) {
                    if (this.engine.selectedStep === step_index) {
                        this.engine.selectedStep = null;
                    } else {
                        this.engine.selectedStep = step_index;
                        this.engine.play(current_step_data.slotIndex, Tone.now(), current_step_data.transposeSemitones, current_step_data.velocityFloat);
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

            document.getElementById('sampler-step-transpose').oninput = (e) => {
                if (this.engine.selectedStep === null) return;
                const step = this.engine.patterns[this.engine.patternIndex][this.engine.selectedStep];
                if (!step) return;
                step.transposeSemitones = parseInt(e.target.value);
                document.getElementById('sampler-step-transpose-val').textContent = this.semitoneLabel(step.transposeSemitones);
                this.engine.play(step.slotIndex, Tone.now(), step.transposeSemitones, step.velocityFloat);
                this.render();
            };

            document.getElementById('sampler-step-velocity').oninput = (e) => {
                if (this.engine.selectedStep === null) return;
                const step = this.engine.patterns[this.engine.patternIndex][this.engine.selectedStep];
                if (!step) return;
                step.velocityFloat = parseFloat(e.target.value);
                document.getElementById('sampler-step-velocity-val').textContent = Math.round(step.velocityFloat * 100) + '%';
            };

            document.getElementById('sampler-step-fx').onchange = (e) => {
                if (this.engine.selectedStep === null) return;
                const step = this.engine.patterns[this.engine.patternIndex][this.engine.selectedStep];
                if (!step) return;
                step.fxOverrideString = e.target.value;
            };

            document.getElementById('sampler-step-clear-step').onclick = () => {
                if (this.engine.selectedStep === null) return;
                this.engine.patterns[this.engine.patternIndex][this.engine.selectedStep] = null;
                this.engine.selectedStep = null;
                this.render();
            };

            document.getElementById('sampler-source').onclick = (e) => {
                const idx = this.engine.sourceOrder.indexOf(this.engine.source);
                this.engine.source = this.engine.sourceOrder[(idx + 1) % this.engine.sourceOrder.length];
                e.target.textContent = `SRC: ${this.engine.source.toUpperCase()}`;
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

            document.getElementById('sampler-pattern').onchange = (e) => {
                this.engine.patternIndex = +e.target.value;
                this.engine.selectedStep = null;
                this.render();
            };

            document.getElementById('sampler-volume').oninput = (e) => {
                this.engine.output.volume.value = -36 + (+e.target.value * 36);
            };

            document.getElementById('sampler-fx').onchange = (e) => {
                this.engine.setEffect(e.target.value);
            };

            document.getElementById('btn-play').addEventListener('click', () => {
                this.engine.startSequence();
            });
            document.getElementById('btn-stop').addEventListener('click', () => {
                this.engine.stopSequence();
            });
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
    
            // Update remaining memory display
            document.getElementById('sampler-time').textContent =
                `${Math.max(0, this.engine.maxSeconds - this.engine.used()).toFixed(1)}s`;
    
            // Sync the step editor panel to the selected step
            this.syncStepEditor();
    
            // Update the screen message if not currently recording
            if (!this.engine.recorder) {
                this.message(
                    this.engine.slots[this.engine.selectedSlot].buffer ? this.engine.slotName(this.engine.selectedSlot) : 'SELECTED · EMPTY',
                    `${this.engine.slotName(this.engine.selectedSlot)} · PATTERN ${String(this.engine.patternIndex + 1).padStart(2, '0')}`
                );
            }
        }

    // WHY: Displaying "D# (+3)" is far more musical and useful to the user than a raw number like "3".
        semitoneLabel(transpose_semitones_integer) {
            const note_names_array = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
            const base_note_index = ((transpose_semitones_integer % 12) + 12) % 12;
            const note_name_string = note_names_array[base_note_index];
            const sign_string = transpose_semitones_integer > 0 ? '+' : '';
            return `${note_name_string} (${sign_string}${transpose_semitones_integer})`;
        }



}

document.addEventListener('DOMContentLoaded', () => {
    setTimeout(() => {
        window.Rack.register(new SamplerInstrument());
    }, 100);
});
