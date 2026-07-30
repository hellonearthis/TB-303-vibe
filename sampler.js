class KO40SamplerEngine {
    // WHAT: Initializes all sampler state, audio routing nodes, and kicks off the UI build.
    // WHY: Central class managing the KO-40 sample bank, pattern sequencer, recording pipeline,
    //      and all MIDI integration. Everything flows through this constructor.
    constructor() {        // WHAT: 16 sample slots — first 8 melodic (support pitch-shifting), last 8 drum (one-shot)
        // WHY: Separating melodic from drum lets us disable the pitch keyboard for drum pads,
        //      mirroring how the original KO hardware treats the two pad banks differently.
        this.slots = Array.from({ length: 16 }, (_, slot_index) => ({
            buffer: null,
            duration: 0,
            volume: 1.0,
            type: slot_index < 8 ? 'melodic' : 'drum'
        }));

        // WHAT: 16 patterns of 64 steps each. Preallocating 64 steps avoids out-of-bounds
        //       errors when switching to modes like DnB that use 32 steps.
        // WHY: Upgrading from a flat slot index to an object allows per-step pitch, velocity, and
        //      FX override — the core feature that unlocks melodic sequencing in the sampler.
        //      Step object shape: { slotIndex, transposeSemitones, velocityFloat, fxOverrideString }
        this.patterns = Array.from({ length: 16 }, () => Array(64).fill(null));

        this.selectedSlot = 0;

        // WHAT: Tracks which sequencer step is currently open in the step editor panel.
        // WHY: Null means the editor is hidden. An integer 0-15 means that step's settings
        //      are being displayed and edited in the inspector below the step grid.
        this.selectedStep = null;

        this.patternIndex = 0;

        // WHAT: The ordered list of sequence entries the user wants to play, each
        //       being a JSON object with at minimum a "pattern" key (1-indexed).
        // WHY:  Storing entries as objects (not bare pattern indices) means future
        //       per-entry options like repeat, bpmOverride, or mute can be added
        //       without breaking existing sequences or changing the advance logic.
        this.sequence = [];

        // WHAT: Pointer into this.sequence for the entry currently playing.
        // WHY:  Incremented by tick() on the last step so the engine loads the
        //       next pattern exactly on the bar boundary — no gaps, no restarts.
        this.sequencePosition = 0;

        // WHAT: Flag that distinguishes sequence mode from normal single-pattern play.
        // WHY:  tick() checks this flag before advancing sequencePosition so that
        //       normal single-pattern playback is completely unaffected.
        this.sequenceModeActive = false;

        this.source = 'mic';
        this.sourceOrder = ['mic', '303', 'moog', 'monotron'];
        this.recorder = null;
        this.mic = null;
        this.recordingSourceNode = null;

        // WHAT: Audio routing chain — fxInput → [optional global effect] → pedalInsert → [PedalBoard chain] → output → destination
        // WHY: All sample players route through fxInput so the sampler's own FX chain affects them.
        //      The PedalBoard's serial chain sits between pedalInsert and output,
        //      adding shared pedal effects after the sampler's own per-step FX processing.
        this.output = new Tone.Volume(-2).toDestination();
        this.pedalInsert = new Tone.Gain();
        this.fxInput = new Tone.Gain().connect(this.pedalInsert);
        this.effect = null;

        // WHAT: Register the Sampler module with the shared PedalBoard.
        // WHY:  PedalBoard creates a dedicated set of 8 effect instances for the sampler
        //       and wires them: pedalInsert → [effects] → output.
        if (window.PedalBoard) {
            window.PedalBoard.registerModule('sampler', this.pedalInsert, this.output);
        }

        // WHAT: A shared StepSequencer wrapping Tone.Sequence + Clock registration.
        // WHY: Replaces hand-rolled Tone.Sequence boilerplate with the shared pattern engine,
        //      making step-count a parameter and Clock registration automatic.
        this.stepSequencer = new StepSequencer({
            clientId: 'sampler',
            stepCount: 16,
            subdivision: '16n',
            tickCallback: (scheduled_audio_time, current_step_index) => this.tick(scheduled_audio_time, current_step_index)
        });

        this.isSequencerRunning = false;
    }

    // WHAT: Starts the sampler's step sequencer and updates internal running state.
    // WHY: Single entry point for all play paths (independent button, coupled 303 button,
    //      and external callers like the Grandmother's drone toggle in app.js).
    //      StepSequencer.start() handles Clock registration internally.
    startSequence(fromSequenceMode = false) {
        if (!fromSequenceMode) {
            this.sequenceModeActive = false;
        }
        this.stepSequencer.start();
        this.isSequencerRunning = true;
    }

    // WHAT: Stops the sampler's step sequencer, clears the playhead, and updates state.
    // WHY: Single entry point for all stop paths. StepSequencer.stop() handles Clock
    //      unregistration so the transport survives if other instruments are still playing.
    stopSequence() {
        this.stepSequencer.stop();
        this.clearPlayhead();
        this.isSequencerRunning = false;
    }

    // WHAT: Sets up MIDI bindings for pad triggering and sampler volume CC.
    

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

            let pulse_state = false;
            this.recordingTimerInterval = setInterval(() => {
                const elapsed_seconds = (performance.now() - this.recordingStartTime) / 1000;
                
                // Toggle pulse effect on the meter fill
                pulse_state = !pulse_state;
                document.getElementById('sampler-meter-fill').style.width = pulse_state ? '100%' : '0%';
                
                this.message(
                    `RECORDING ${elapsed_seconds.toFixed(1)}s`,
                    `${this.slotName(this.selectedSlot)} · ${this.source.toUpperCase()}`
                );
            }, 80);
        } catch (recording_error_object) {
            this.cleanup();
            this.message('INPUT ERROR', this.source === 'mic' ? 'ALLOW MICROPHONE ACCESS' : 'SOURCE UNAVAILABLE');
            console.error(recording_error_object);
        }
    }

    // WHAT: Stops the active recording session and processes the captured audio into the selected slot.
    // WHY: Converts the recorded blob into a ToneAudioBuffer so it can be played back immediately by Tone.Players.
    async stopRecording() {
        if (!this.recorder) return;
        const finished_recorder = this.recorder;
        clearInterval(this.recordingTimerInterval);

        try {
            const recorded_audio_blob = await finished_recorder.stop();
            const raw_audio_buffer = await recorded_audio_blob.arrayBuffer();
            const decoded_audio_data = await Tone.getContext().rawContext.decodeAudioData(raw_audio_buffer);
            const slot_object = this.slots[this.selectedSlot];
            slot_object.buffer?.dispose();
            slot_object.buffer = new Tone.ToneAudioBuffer(decoded_audio_data);
            slot_object.duration = decoded_audio_data.duration;
            this.message('SAMPLE SAVED', `${this.slotName(this.selectedSlot)} · ${slot_object.duration.toFixed(1)}s`);
        } catch (recording_error_object) {
            this.message('RECORD ERROR', 'TRY AGAIN');
            console.error(recording_error_object);
        }

        this.cleanup();
    }

    // WHAT: Emits a status message to registered UI display callbacks.
    // WHY: Provides real-time status updates (e.g. recording state, slot saved, errors) to the sampler screen.
    message(primary_text_string, secondary_text_string) {
        if (this.onMessage) this.onMessage(primary_text_string, secondary_text_string);
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

        // WHAT: Apply velocity and per-pad slot volume by adjusting the player's own volume parameter in decibels.
        // WHY: Combining per-step velocity and per-pad slot volume allows individual sample balance.
        const effective_gain_float = Math.max(0.01, velocity_float * (slot_object.volume ?? 1.0));
        player_node.volume.value = Tone.gainToDb(effective_gain_float);

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

    // WHAT: Builds or replaces the global audio effect in the fxInput → pedalInsert chain.
    // WHY: Only one global effect can be active at a time. Old effects must be disposed before new ones connect.
    //      Routes to pedalInsert (not output) because the PedalBoard's serial chain sits between them.
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
            this.fxInput.chain(this.effect, this.pedalInsert);
        } else {
            this.fxInput.connect(this.pedalInsert);
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

        // WHAT: On the last step of the pattern, advance the sequence position if
        //       sequence mode is active and there is more than one entry to cycle through.
        // WHY:  We advance here — at the END of the current pattern — rather than the
        //       start, so the pattern change takes effect on the very next step-0 tick.
        //       Critically, we do NOT restart Tone.Sequence; we only swap which data
        //       this.patterns[this.patternIndex] points at, giving gapless transitions.
        if (this.sequenceModeActive && this.sequence.length > 0 && current_step_index === 15) {
            // WHAT: Wrap sequencePosition back to 0 when we reach the end of the list.
            // WHY:  Modulo arithmetic is the simplest correct looping mechanism.
            this.sequencePosition = (this.sequencePosition + 1) % this.sequence.length;

            // WHAT: Read the pattern number (1-indexed in JSON) and convert to 0-indexed.
            // WHY:  Users write pattern numbers like "1", "2" to match the UI dropdown labels,
            //       but internally patterns are stored in a 0-indexed array.
            const next_entry_object = this.sequence[this.sequencePosition];
            this.patternIndex = Math.max(0, Math.min(15, (next_entry_object.pattern ?? 1) - 1));

            // WHAT: Notify the UI that the sequence position changed so it can re-highlight the active pill.
            // WHY:  The engine should not touch the DOM directly; instead it fires a callback that the UI controller
            //       subscribed to — keeping the audio thread and DOM thread cleanly separated.
            if (this.onSequenceAdvance) this.onSequenceAdvance(this.sequencePosition, this.patternIndex);
        }

        // WHAT: Schedule the playhead visual update to sync with audio time, not wall time.
        // WHY: Tone.Draw defers DOM updates until the animation frame closest to the scheduled audio event,
        //      giving sample-accurate visual feedback without blocking the audio thread.
        Tone.Draw.schedule(() => {
            this.clearPlayhead();
            document.querySelector(`[data-step="${current_step_index}"]`)?.classList.add('playhead');
        }, scheduled_audio_time);
    }

    // WHAT: Parses and validates a JSON string into a sequence entry array.
    // WHY:  Centralising parse logic in the engine means the UI just calls this and
    //       checks the returned {ok, entries, error} shape — no JSON.parse scatter.
    parseSequence(json_string) {
        try {
            const parsed_value = JSON.parse(json_string.trim());

            // WHAT: The top-level value must be an array.
            // WHY:  A sequence is inherently ordered, so only JSON arrays are valid.
            if (!Array.isArray(parsed_value)) {
                return { ok: false, entries: [], error: 'Expected a JSON array [ ... ]' };
            }

            // WHAT: Every entry must be an object with a numeric "pattern" key in range 1-16.
            // WHY:  Catching bad entries immediately gives the user precise error feedback
            //       before they try to play, not a silent mis-fire at runtime.
            for (let entry_index = 0; entry_index < parsed_value.length; entry_index++) {
                const sequence_entry_object = parsed_value[entry_index];
                if (typeof sequence_entry_object !== 'object' || sequence_entry_object === null) {
                    return { ok: false, entries: [], error: `Entry ${entry_index + 1}: must be an object` };
                }
                const pattern_number = sequence_entry_object.pattern;
                if (!Number.isInteger(pattern_number) || pattern_number < 1 || pattern_number > 16) {
                    return { ok: false, entries: [], error: `Entry ${entry_index + 1}: "pattern" must be an integer 1–16` };
                }
            }

            return { ok: true, entries: parsed_value, error: '' };
        } catch (json_parse_error) {
            return { ok: false, entries: [], error: json_parse_error.message };
        }
    }

    // WHAT: Activates sequence mode and starts playback from the first sequence entry.
    // WHY:  A dedicated method keeps the call site in sampler-ui.js readable and
    //       ensures sequencePosition always resets cleanly on each new SEQ PLAY press.
    startSequenceMode() {
        if (this.sequence.length === 0) return;

        // WHAT: Always restart from entry 0 when SEQ PLAY is pressed.
        // WHY:  Resuming mid-sequence would be confusing; a fresh press should always
        //       give predictable behaviour — start at the top of the list.
        this.sequencePosition = 0;
        this.sequenceModeActive = true;

        // WHAT: Load the first entry's pattern before starting the sequencer.
        // WHY:  Without this, the first bar would play whatever patternIndex happened
        //       to be selected in the dropdown — not the sequence's first entry.
        this.patternIndex = Math.max(0, Math.min(15, (this.sequence[0].pattern ?? 1) - 1));

        this.startSequence(true);
    }

    // WHAT: Deactivates sequence mode and stops playback.
    // WHY:  Resets sequenceModeActive so normal single-pattern play is restored,
    //       and resets sequencePosition so next SEQ PLAY starts from entry 0.
    stopSequenceMode() {
        this.sequenceModeActive = false;
        this.sequencePosition = 0;
        this.stopSequence();
    }

    // WHAT: Removes the playhead highlight from all step buttons.
    // WHY: Called before moving the indicator to the next step to avoid multiple highlights at once.
    clearPlayhead() {
        document.querySelectorAll('.sampler-step').forEach(step_element => step_element.classList.remove('playhead'));
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
}

// WHAT: Instantiates the sampler on DOM ready and exposes it globally.
// WHY: Other modules (app.js) may reference window.SamplerEngine to coordinate transport events.
document.addEventListener('DOMContentLoaded', () => window.SamplerEngine = new KO40SamplerEngine());