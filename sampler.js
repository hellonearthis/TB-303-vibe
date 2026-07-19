class KO40Sampler {
    // WHAT: Initializes all sampler state, audio routing nodes, and kicks off the UI build.
    // WHY: Central class managing the KO-40 sample bank, pattern sequencer, recording pipeline,
    //      and all MIDI integration. Everything flows through this constructor.
    constructor() {
        // Maximum combined sample bank duration in seconds (KO-40 style memory budget)
        this.maxSeconds = 40;

        // WHAT: 16 sample slots — first 8 melodic (support pitch-shifting), last 8 drum (one-shot)
        // WHY: Separating melodic from drum lets us disable the pitch keyboard for drum pads,
        //      mirroring how the original KO hardware treats the two pad banks differently.
        this.slots = Array.from({ length: 16 }, (_, slot_index) => ({
            buffer: null,
            duration: 0,
            type: slot_index < 8 ? 'melodic' : 'drum'
        }));

        // WHAT: 16 patterns of 16 steps each. Each step is null (rest) or a rich step-data object.
        // WHY: Upgrading from a flat slot index to an object allows per-step pitch, velocity, and
        //      FX override — the core feature that unlocks melodic sequencing in the sampler.
        //      Step object shape: { slotIndex, transposeSemitones, velocityFloat, fxOverrideString }
        this.patterns = Array.from({ length: 16 }, () => Array(16).fill(null));

        this.selectedSlot = 0;

        // WHAT: Tracks which sequencer step is currently open in the step editor panel.
        // WHY: Null means the editor is hidden. An integer 0-15 means that step's settings
        //      are being displayed and edited in the inspector below the step grid.
        this.selectedStep = null;

        this.patternIndex = 0;
        this.source = 'mic';
        this.sourceOrder = ['mic', '303', 'moog', 'monotron'];
        this.recorder = null;
        this.mic = null;
        this.recordingSourceNode = null;

        // WHAT: Audio routing chain — fxInput → [optional global effect] → output → destination
        // WHY: All sample players route through fxInput so the global FX chain affects them all.
        //      Per-step FX overrides bypass this by changing the player's own playback mode.
        this.output = new Tone.Volume(-2).toDestination();
        this.fxInput = new Tone.Gain().connect(this.output);
        this.effect = null;

        // WHAT: A Tone.Sequence drives the 16-step pattern at 16th-note intervals.
        // WHY: Tone.Sequence handles all sample-accurate scheduling, calling our tick() method
        //      for every step so the audio engine places sounds with zero drift.
        this.sequence = new Tone.Sequence(
            (scheduled_audio_time, current_step_index) => this.tick(scheduled_audio_time, current_step_index),
            [...Array(16).keys()],
            '16n'
        );

        this.isSequencerRunning = false;

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
        this.slots.forEach((slot_object, slot_index) => {
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

    // WHAT: Attaches all DOM event listeners for user interaction.
    // WHY: Separated from build() so each concern is easy to find and edit independently.
    bind() {
        // --- Sample Bank Pad Clicks ---
        // WHAT: Clicking a pad selects it as the active slot and previews the stored sample.
        // WHY: The selected slot determines which sample gets programmed into the sequence steps.
        document.getElementById('sampler-slots').onclick = (click_event_object) => {
            const pad_element = click_event_object.target.closest('.sampler-pad');
            if (!pad_element) return;
            this.selectedSlot = +pad_element.dataset.slot;
            this.play(this.selectedSlot);
            this.render();
        };

        // --- Pitch Keyboard Clicks ---
        // WHAT: Clicking a key plays the melodic slot transposed by the key's pitch offset.
        // WHY: Allows auditioning samples at different pitches before programming them into steps.
        document.getElementById('sampler-keys').onclick = (click_event_object) => {
            const key_element = click_event_object.target.closest('.sampler-key');
            if (key_element && this.selectedSlot < 8) {
                this.play(this.selectedSlot, Tone.now(), +key_element.dataset.pitch);
            }
        };

        // --- Step Sequencer Clicks ---
        // WHAT: Toggle steps on/off, or select an active step to open the pitch/velocity editor.
        // WHY: Two-mode interaction: empty step → program it; active step → edit its parameters.
        document.getElementById('sampler-steps').onclick = (click_event_object) => {
            const step_element = click_event_object.target.closest('.sampler-step');
            if (!step_element) return;

            const step_index = +step_element.dataset.step;
            const current_step_data = this.patterns[this.patternIndex][step_index];

            if (current_step_data !== null) {
                // WHAT: Step already programmed — toggle selection for editing or deselect if already selected.
                // WHY: Clicking an active step opens the step inspector so pitch, velocity, and FX can be adjusted.
                if (this.selectedStep === step_index) {
                    // Already selected — deselect and close the editor
                    this.selectedStep = null;
                } else {
                    this.selectedStep = step_index;
                    // Preview the sample at its stored pitch so the user hears what they've got
                    this.play(current_step_data.slotIndex, Tone.now(), current_step_data.transposeSemitones, current_step_data.velocityFloat);
                }
            } else {
                // WHAT: Empty step — program it with the currently selected slot at zero transposition.
                // WHY: Defaults give a clean starting point; the user can then refine it via the step editor.
                this.patterns[this.patternIndex][step_index] = {
                    slotIndex: this.selectedSlot,
                    transposeSemitones: 0,
                    velocityFloat: 1.0,
                    fxOverrideString: ''
                };
                this.selectedStep = step_index;
                this.play(this.selectedSlot);
            }

            this.render();
        };

        // --- Step Editor: Pitch Slider ---
        // WHAT: Adjusts the semitone transposition of the currently selected step.
        // WHY: Changing this value re-pitches the sample on that specific step, enabling melodic sequencing.
        document.getElementById('sampler-step-transpose').oninput = (input_event_object) => {
            if (this.selectedStep === null) return;
            const step_data_object = this.patterns[this.patternIndex][this.selectedStep];
            if (!step_data_object) return;

            const transpose_semitones_integer = parseInt(input_event_object.target.value);
            step_data_object.transposeSemitones = transpose_semitones_integer;
            document.getElementById('sampler-step-transpose-val').textContent = this.semitoneLabel(transpose_semitones_integer);

            // Preview the updated pitch live as the slider moves
            this.play(step_data_object.slotIndex, Tone.now(), transpose_semitones_integer, step_data_object.velocityFloat);
            this.render();
        };

        // --- Step Editor: Velocity Slider ---
        // WHAT: Adjusts the playback volume of the currently selected step.
        // WHY: Per-step velocity allows accents, ghost notes, and dynamic variation in the pattern.
        document.getElementById('sampler-step-velocity').oninput = (input_event_object) => {
            if (this.selectedStep === null) return;
            const step_data_object = this.patterns[this.patternIndex][this.selectedStep];
            if (!step_data_object) return;

            step_data_object.velocityFloat = parseFloat(input_event_object.target.value);
            document.getElementById('sampler-step-velocity-val').textContent =
                Math.round(step_data_object.velocityFloat * 100) + '%';
        };

        // --- Step Editor: FX Override Selector ---
        // WHAT: Sets a per-step playback override (reverse, pitch-up, stutter) that bypasses the global FX.
        // WHY: Allows individual hits to have unique playback characteristics without changing the global chain.
        document.getElementById('sampler-step-fx').onchange = (change_event_object) => {
            if (this.selectedStep === null) return;
            const step_data_object = this.patterns[this.patternIndex][this.selectedStep];
            if (!step_data_object) return;
            step_data_object.fxOverrideString = change_event_object.target.value;
        };

        // --- Step Editor: Clear This Step ---
        // WHAT: Removes the sample assignment from the selected step and closes the editor.
        // WHY: Provides a one-click way to erase a step without having to click to deselect first.
        document.getElementById('sampler-step-clear-step').onclick = () => {
            if (this.selectedStep === null) return;
            this.patterns[this.patternIndex][this.selectedStep] = null;
            this.selectedStep = null;
            this.render();
        };

        // --- Source Cycle Button ---
        document.getElementById('sampler-source').onclick = (click_event_object) => {
            const current_source_index = this.sourceOrder.indexOf(this.source);
            this.source = this.sourceOrder[(current_source_index + 1) % this.sourceOrder.length];
            click_event_object.target.textContent = `SRC: ${this.source.toUpperCase()}`;
            this.message(`${this.source.toUpperCase()} INPUT`, 'SELECT SLOT + RECORD');
        };

        document.getElementById('sampler-record').onclick = () =>
            this.recorder ? this.stopRecording() : this.startRecording();

        document.getElementById('sampler-clear').onclick = () => {
            const slot_object = this.slots[this.selectedSlot];
            slot_object.buffer?.dispose();
            slot_object.buffer = null;
            slot_object.duration = 0;
            this.render();
        };

        document.getElementById('sampler-pattern-clear').onclick = () => {
            this.patterns[this.patternIndex].fill(null);
            this.selectedStep = null;
            this.render();
        };

        // --- Independent Sampler PLAY ---
        // WHAT: Starts the sampler sequence independently, without requiring the 303 to be running.
        // WHY: The user wants to be able to run the sampler by itself — decoupled from the 303 bassline transport.
        document.getElementById('sampler-pattern-play').onclick = async () => {
            await Tone.start();
            // Start the global Tone.Transport if it isn't already running (required for sequences to tick)
            if (Tone.Transport.state !== 'started') {
                Tone.Transport.start();
            }
            this.sequence.start(0);
            this.isSequencerRunning = true;
            this.message('PATTERN PLAYING', `PATTERN ${String(this.patternIndex + 1).padStart(2, '0')}`);
        };

        // --- Independent Sampler STOP ---
        // WHAT: Stops only the sampler sequence — does NOT touch the 303 transport or other sequences.
        // WHY: Decouples sampler playback so the 303 bassline can continue without the sampler pattern.
        document.getElementById('sampler-pattern-stop').onclick = () => {
            this.sequence.stop();
            this.clearPlayhead();
            this.isSequencerRunning = false;
            this.render();
        };

        document.getElementById('sampler-pattern').onchange = (change_event_object) => {
            this.patternIndex = +change_event_object.target.value;
            this.selectedStep = null;
            this.render();
        };

        document.getElementById('sampler-volume').oninput = (input_event_object) => {
            this.output.volume.value = -36 + (+input_event_object.target.value * 36);
        };

        document.getElementById('sampler-fx').onchange = (change_event_object) => {
            this.setEffect(change_event_object.target.value);
        };

        // WHAT: Hook into the global 303 transport so the sampler also follows when the 303 starts/stops.
        // WHY: Maintains the original coupled behaviour — starting the 303 brings the sampler along too.
        document.getElementById('btn-play').addEventListener('click', () => {
            this.sequence.start(0);
            this.isSequencerRunning = true;
        });
        document.getElementById('btn-stop').addEventListener('click', () => {
            this.sequence.stop();
            this.clearPlayhead();
            this.isSequencerRunning = false;
        });
    }

    // WHAT: Sets up MIDI bindings for pad triggering and sampler volume CC.
    // WHY: Allows hardware MIDI controllers to fire sample pads and remotely adjust the sampler level.
    bindMidi() {
        window.addEventListener('midiNoteOn', async (midi_note_on_event_object) => {
            if (document.getElementById('midi-note-target')?.value !== 'sampler') return;
            await Tone.start();
            const { note: midi_note_number } = midi_note_on_event_object.detail;
            // WHAT: Notes 36-43 map to drum pads 8-15 (standard drum MIDI mapping)
            if (midi_note_number >= 36 && midi_note_number <= 43) {
                this.selectedSlot = 8 + (midi_note_number - 36);
                this.play(this.selectedSlot);
                this.render();
                return;
            }
            // Otherwise play the melodic slot transposed relative to middle C
            if (this.selectedSlot < 8) {
                this.play(this.selectedSlot, Tone.now(), midi_note_number - 60);
            }
        });

        window.addEventListener('midiCCChange', (midi_cc_event_object) => {
            if (midi_cc_event_object.detail.parameter !== 'sampler-volume') return;
            const level_float = midi_cc_event_object.detail.scaledValue;
            document.getElementById('sampler-volume').value = level_float;
            this.output.volume.value = -36 + (level_float * 36);
        });

        // Register the sampler volume slider for MIDI Learn
        const sampler_volume_slider_element = document.getElementById('sampler-volume');
        const midi_controller_instance = window.MIDIController;
        const volume_label_element = sampler_volume_slider_element.closest('label');
        if (!midi_controller_instance || !volume_label_element) return;

        const refresh_mapped_indicator = () =>
            volume_label_element.classList.toggle('midi-mapped', !!midi_controller_instance.getSourceForParameter('sampler-volume'));

        refresh_mapped_indicator();

        volume_label_element.addEventListener('click', (click_event_object) => {
            if (!document.body.classList.contains('midi-learn-active')) return;
            click_event_object.preventDefault();
            click_event_object.stopPropagation();
            document.querySelectorAll('.midi-listening').forEach(listening_node => listening_node.classList.remove('midi-listening'));
            volume_label_element.classList.add('midi-listening');
            midi_controller_instance.enterLearnMode('sampler-volume');
            const tooltip_element = document.querySelector('.midi-learn-tooltip');
            if (tooltip_element) tooltip_element.textContent = 'Move a MIDI control for: SAMPLER LEVEL';
        }, true);

        window.addEventListener('midiLearnComplete', refresh_mapped_indicator);
    }

    // WHAT: Returns the Tone.js audio node used as the recording source for non-mic capture.
    // WHY: Allows the sampler to record directly from the 303, Grandmother, or Monotron output nodes.
    getSourceNode() {
        const available_source_nodes_object = {
            '303': window.AudioEngine?.volume,
            'moog': window.GrandmotherEngine?.reverb,
            'monotron': window.MonotronAudio?.masterVolume
        };
        return available_source_nodes_object[this.source] || null;
    }

    // WHAT: Starts the audio recording process for the currently selected sample slot.
    // WHY: Captures audio from mic or a synth output into a ToneAudioBuffer for playback.
    async startRecording() {
        await Tone.start();
        const remaining_record_time_seconds = this.maxSeconds - this.used() + this.slots[this.selectedSlot].duration;
        if (remaining_record_time_seconds < 0.1) {
            return this.message('MEMORY FULL', 'CLEAR A SLOT');
        }

        try {
            this.recorder = new Tone.Recorder();
            if (this.source === 'mic') {
                this.mic = new Tone.UserMedia();
                await this.mic.open();
                this.mic.connect(this.recorder);
            } else {
                this.recordingSourceNode = this.getSourceNode();
                if (!this.recordingSourceNode) throw new Error(this.source + ' source unavailable');
                Tone.connect(this.recordingSourceNode, this.recorder);
            }

            await this.recorder.start();
            this.recordingStartTime = performance.now();
            document.getElementById('sampler-record').classList.add('recording');

            this.recordingTimerInterval = setInterval(() => {
                const elapsed_seconds = (performance.now() - this.recordingStartTime) / 1000;
                document.getElementById('sampler-meter-fill').style.width =
                    `${Math.min(100, (elapsed_seconds / remaining_record_time_seconds) * 100)}%`;
                this.message(
                    `RECORDING ${elapsed_seconds.toFixed(1)}s`,
                    `${this.slotName(this.selectedSlot)} · ${this.source.toUpperCase()}`
                );
                if (elapsed_seconds >= remaining_record_time_seconds) this.stopRecording();
            }, 80);
        } catch (recording_error_object) {
            this.cleanup();
            this.message('INPUT ERROR', this.source === 'mic' ? 'ALLOW MICROPHONE ACCESS' : 'SOURCE UNAVAILABLE');
            console.error(recording_error_object);
        }
    }

    // WHAT: Stops recording, decodes the audio blob, and saves it as a ToneAudioBuffer into the selected slot.
    // WHY: Tone.Recorder produces a Blob that must be decoded via the Web Audio API before it can be played.
    async stopRecording() {
        if (!this.recorder) return;
        const finished_recorder_instance = this.recorder;
        clearInterval(this.recordingTimerInterval);

        try {
            const recorded_blob_object = await finished_recorder_instance.stop();
            const raw_array_buffer = await recorded_blob_object.arrayBuffer();
            const decoded_audio_buffer = await Tone.getContext().rawContext.decodeAudioData(raw_array_buffer);
            const slot_object = this.slots[this.selectedSlot];
            slot_object.buffer?.dispose();
            slot_object.buffer = new Tone.ToneAudioBuffer(decoded_audio_buffer);
            slot_object.duration = decoded_audio_buffer.duration;
            this.message('SAMPLE SAVED', `${this.slotName(this.selectedSlot)} · ${slot_object.duration.toFixed(1)}s`);
        } catch (stop_error_object) {
            this.message('RECORD ERROR', 'TRY AGAIN');
            console.error(stop_error_object);
        }

        this.cleanup();
        this.render();
    }

    // WHAT: Disposes recording nodes and resets the recording UI state.
    // WHY: Ensures microphone access and recorder nodes are properly released after each recording session.
    cleanup() {
        clearInterval(this.recordingTimerInterval);
        if (this.mic) {
            this.mic.close();
            this.mic.dispose();
            this.mic = null;
        }
        if (this.recorder) {
            if (this.recordingSourceNode) {
                Tone.disconnect(this.recordingSourceNode, this.recorder);
                this.recordingSourceNode = null;
            }
            this.recorder.dispose();
            this.recorder = null;
        }
        document.getElementById('sampler-record').classList.remove('recording');
        document.getElementById('sampler-meter-fill').style.width = '0%';
    }

    // WHAT: Creates a temporary Tone.Player for a single sample hit with per-hit pitch, velocity, and FX.
    // WHY: Ephemeral players allow multiple samples to overlap (polyphony). Each player is disposed after playback.
    //      Pitch transposition and velocity are per-hit parameters to support melodic sequencing.
    play(slot_index_integer, scheduled_audio_time = Tone.now(), transpose_semitones_integer = 0, velocity_float = 1.0, fx_override_string = '') {
        const slot_object = this.slots[slot_index_integer];
        if (!slot_object.buffer) return this.message('EMPTY SLOT', this.slotName(slot_index_integer));

        const player_node = new Tone.Player(slot_object.buffer);

        // WHAT: Apply velocity by adjusting the player's own volume parameter in decibels.
        // WHY: Player.volume is built-in and avoids inserting an extra Gain node in the audio graph.
        const clamped_velocity_float = Math.max(0.01, velocity_float);
        player_node.volume.value = Tone.gainToDb(clamped_velocity_float);

        // WHAT: Conditionally insert a PitchShift node between the player and fxInput.
        // WHY: PitchShift is CPU-intensive. Skipping it when transposition is zero saves processing
        //      on every unshifted drum hit — which may be most hits in a drum pattern.
        let pitch_shift_node_or_null = null;
        if (transpose_semitones_integer !== 0 && slot_index_integer < 8) {
            pitch_shift_node_or_null = new Tone.PitchShift({ pitch: transpose_semitones_integer, windowSize: 0.08 });
            player_node.connect(pitch_shift_node_or_null);
            pitch_shift_node_or_null.connect(this.fxInput);
        } else {
            player_node.connect(this.fxInput);
        }

        // WHAT: Determine the effective FX preset — per-step override takes priority over the global selector.
        // WHY: If a step has its own FX override, it should sound different from adjacent steps even if the
        //      global FX is set to something else entirely.
        const effective_fx_name_string = fx_override_string || document.getElementById('sampler-fx').value;
        if (effective_fx_name_string === 'reverse') player_node.reverse = true;
        if (effective_fx_name_string === 'pitchup') player_node.playbackRate = Math.pow(2, 7 / 12);
        if (effective_fx_name_string === 'pitchdown') player_node.playbackRate = Math.pow(2, -7 / 12);

        // WHAT: Cleanup function that disposes all temporary nodes created for this single hit.
        // WHY: Without disposal, every hit leaks a Tone.Player (and optionally a PitchShift) into memory.
        const dispose_sample_nodes = () => {
            player_node.dispose();
            pitch_shift_node_or_null?.dispose();
        };

        if (effective_fx_name_string === 'stutter') {
            player_node.loop = true;
            player_node.loopEnd = Math.min(0.09, slot_object.duration);
            setTimeout(() => { player_node.stop(); dispose_sample_nodes(); }, 360);
        }

        player_node.start(scheduled_audio_time);

        if (effective_fx_name_string !== 'stutter') {
            // WHAT: Schedule node disposal after the sample finishes playing (plus a safety margin).
            // WHY: The Web Audio API requires nodes be disposed after their playback completes,
            //      not before — otherwise you get audio glitches or cut-off tails.
            setTimeout(dispose_sample_nodes, (slot_object.duration / player_node.playbackRate + 0.5) * 1000);
        }

        // Flash the pad on-screen when the sample plays
        Tone.Draw.schedule(() => {
            const pad_element = document.querySelector(`[data-slot="${slot_index_integer}"]`);
            pad_element?.classList.add('playing');
            setTimeout(() => pad_element?.classList.remove('playing'), 100);
        }, scheduled_audio_time);
    }

    // WHAT: Builds or replaces the global audio effect in the fxInput → output chain.
    // WHY: Only one global effect can be active at a time. Old effects must be disposed before new ones connect.
    setEffect(effect_name_string) {
        this.fxInput.disconnect();
        this.effect?.dispose();
        this.effect = null;

        const effect_factory_map = {
            lowpass:    () => new Tone.Filter(650, 'lowpass'),
            highpass:   () => new Tone.Filter(1200, 'highpass'),
            drive:      () => new Tone.Distortion(0.75),
            crusher:    () => new Tone.BitCrusher(4),
            delay:      () => new Tone.FeedbackDelay('8n', 0.45),
            reverb:     () => new Tone.Reverb({ decay: 2.5, wet: 0.65 }),
            chorus:     () => new Tone.Chorus(3, 3.5, 0.6).start(),
            phaser:     () => new Tone.Phaser({ frequency: 4, octaves: 4 }),
            tremolo:    () => new Tone.Tremolo(9, 0.8).start(),
            vibrato:    () => new Tone.Vibrato(7, 0.35),
            filtermove: () => new Tone.AutoFilter({ frequency: 2, baseFrequency: 180, octaves: 5 }).start()
        };

        if (effect_factory_map[effect_name_string]) {
            this.effect = effect_factory_map[effect_name_string]();
            this.fxInput.chain(this.effect, this.output);
        } else {
            this.fxInput.connect(this.output);
        }

        this.message(
            `FX: ${document.getElementById('sampler-fx').selectedOptions[0].text}`,
            this.slotName(this.selectedSlot)
        );
    }

    // WHAT: Core sequencer tick — called once per 16th note by Tone.Sequence.
    // WHY: Reads the step data at the current position and fires the sample with its stored
    //      pitch, velocity, and FX override so each step can sound completely different.
    tick(scheduled_audio_time, current_step_index) {
        const step_data_object = this.patterns[this.patternIndex][current_step_index];

        if (step_data_object !== null) {
            this.play(
                step_data_object.slotIndex,
                scheduled_audio_time,
                step_data_object.transposeSemitones,
                step_data_object.velocityFloat,
                step_data_object.fxOverrideString
            );
        }

        // WHAT: Schedule the playhead visual update to sync with audio time, not wall time.
        // WHY: Tone.Draw defers DOM updates until the animation frame closest to the scheduled audio event,
        //      giving sample-accurate visual feedback without blocking the audio thread.
        Tone.Draw.schedule(() => {
            this.clearPlayhead();
            document.querySelector(`[data-step="${current_step_index}"]`)?.classList.add('playhead');
        }, scheduled_audio_time);
    }

    // WHAT: Removes the playhead highlight from all step buttons.
    // WHY: Called before moving the indicator to the next step to avoid multiple highlights at once.
    clearPlayhead() {
        document.querySelectorAll('.sampler-step').forEach(step_element => step_element.classList.remove('playhead'));
    }

    // WHAT: Converts a semitone offset integer into a human-readable musical label.
    // WHY: Displaying "D# (+3)" is far more musical and useful to the user than a raw number like "3".
    semitoneLabel(transpose_semitones_integer) {
        const note_names_array = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
        const base_note_index = ((transpose_semitones_integer % 12) + 12) % 12;
        const note_name_string = note_names_array[base_note_index];
        const sign_string = transpose_semitones_integer > 0 ? '+' : '';
        return `${note_name_string} (${sign_string}${transpose_semitones_integer})`;
    }

    // WHAT: Synchronises the step editor panel UI controls to reflect the selected step's data.
    // WHY: When the user selects a different step, all sliders and dropdowns must update instantly
    //      to show that step's stored pitch, velocity, and FX override settings.
    syncStepEditor() {
        const step_editor_panel_element = document.getElementById('sampler-step-editor');
        if (!step_editor_panel_element) return;

        if (this.selectedStep === null) {
            step_editor_panel_element.style.display = 'none';
            return;
        }

        const step_data_object = this.patterns[this.patternIndex][this.selectedStep];
        if (!step_data_object) {
            step_editor_panel_element.style.display = 'none';
            return;
        }

        step_editor_panel_element.style.display = '';

        // Update header label
        document.getElementById('sampler-step-editor-label').textContent =
            `STEP ${this.selectedStep + 1} · ${this.slotName(step_data_object.slotIndex)}`;

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

    // WHAT: Returns the total seconds of audio currently held across all 16 sample slots.
    // WHY: Used to calculate how much recording time remains before the memory budget is exceeded.
    used() {
        return this.slots.reduce((total_duration_seconds, slot_object) => total_duration_seconds + slot_object.duration, 0);
    }

    // WHAT: Returns a human-readable label for a slot index (e.g., "MELODIC 3" or "DRUM 6").
    // WHY: Replaces raw integers in all messages and display strings for clarity.
    slotName(slot_index_integer) {
        return `${slot_index_integer < 8 ? 'MELODIC' : 'DRUM'} ${slot_index_integer % 8 + 1}`;
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
            const slot_object = this.slots[slot_index];
            pad_element.classList.toggle('selected', slot_index === this.selectedSlot);
            pad_element.classList.toggle('loaded', !!slot_object.buffer);
            pad_element.querySelector('small').textContent =
                slot_object.buffer ? `${slot_object.duration.toFixed(1)} SEC` : 'EMPTY';
        });

        // Update step button states and labels
        document.querySelectorAll('.sampler-step').forEach((step_element, step_index) => {
            const step_data_object = this.patterns[this.patternIndex][step_index];
            const is_active_boolean = step_data_object !== null;
            const is_selected_boolean = step_index === this.selectedStep;

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
        document.getElementById('sampler-keys').classList.toggle('disabled', this.selectedSlot >= 8);

        // Update remaining memory display
        document.getElementById('sampler-time').textContent =
            `${Math.max(0, this.maxSeconds - this.used()).toFixed(1)}s`;

        // Sync the step editor panel to the selected step
        this.syncStepEditor();

        // Update the screen message if not currently recording
        if (!this.recorder) {
            this.message(
                this.slots[this.selectedSlot].buffer ? this.slotName(this.selectedSlot) : 'SELECTED · EMPTY',
                `${this.slotName(this.selectedSlot)} · PATTERN ${String(this.patternIndex + 1).padStart(2, '0')}`
            );
        }
    }
}

// WHAT: Instantiates the sampler on DOM ready and exposes it globally.
// WHY: Other modules (app.js) may reference window.SamplerEngine to coordinate transport events.
document.addEventListener('DOMContentLoaded', () => window.SamplerEngine = new KO40Sampler());