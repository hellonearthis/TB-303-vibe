class Sequencer {
    // WHAT: Initializes the Sequencer engine, setting up the 16-step grid, the default patterns, and the Tone.js playback loop.
    // WHY: The sequencer needs to hold the state of every musical step in memory so it can schedule them precisely with the Web Audio API transport.
    constructor() {
        this.steps = 16;
        this.scale = ['C4', 'B3', 'A#3', 'A3', 'G#3', 'G3', 'F#3', 'F3', 'E3', 'D#3', 'D3', 'C#3', 'C3'];
        
        // Internal state of the grid (preallocate 64 steps to avoid bounds issues in DnB mode)
        this.grid = Array(64).fill(null).map(() => ({
            note: null, // string e.g. 'C3', or null for rest
            octave: 0, // original-style per-step octave down/normal/up
            tie: false, // timing tie sustains the previous note without a retrigger
            slide: false,
            accent: false,
            ghost: false
        }));

        this.patterns = {}; // Memory slots 1-9
        
        // Default Pattern 4
        this.patterns[4] = [
            { note: 'C3', slide: false, accent: true, ghost: false },
            { note: null, slide: false, accent: false, ghost: false },
            { note: 'G3', slide: false, accent: false, ghost: false },
            { note: 'C4', slide: true, accent: true, ghost: false },
            { note: null, slide: false, accent: false, ghost: false },
            { note: 'F3', slide: false, accent: false, ghost: false },
            { note: 'F#3', slide: true, accent: false, ghost: false },
            { note: 'G3', slide: true, accent: true, ghost: false },
            { note: null, slide: false, accent: false, ghost: false },
            { note: 'A#3', slide: false, accent: true, ghost: false },
            { note: 'G3', slide: false, accent: false, ghost: true },
            { note: 'C4', slide: true, accent: true, ghost: false },
            { note: 'C3', slide: false, accent: false, ghost: false },
            { note: null, slide: false, accent: false, ghost: false },
            { note: 'D#3', slide: true, accent: false, ghost: false },
            { note: 'F3', slide: false, accent: true, ghost: false }
        ];
        
        // Default Pattern 1
        this.patterns[1] = [
            { note: 'C3', slide: false, accent: true, ghost: false },
            { note: 'C3', slide: true, accent: false, ghost: false },
            { note: 'C4', slide: false, accent: true, ghost: false },
            { note: null, slide: false, accent: false, ghost: false },
            { note: 'D#3', slide: false, accent: false, ghost: true },
            { note: null, slide: false, accent: false, ghost: false },
            { note: 'G3', slide: true, accent: false, ghost: false },
            { note: 'A#3', slide: false, accent: true, ghost: false },
            { note: 'C4', slide: true, accent: true, ghost: false },
            { note: null, slide: false, accent: false, ghost: false },
            { note: 'G#3', slide: false, accent: false, ghost: false },
            { note: 'G3', slide: true, accent: false, ghost: false },
            { note: 'F3', slide: false, accent: true, ghost: false },
            { note: 'D#3', slide: false, accent: false, ghost: false },
            { note: 'D3', slide: false, accent: false, ghost: true },
            { note: null, slide: false, accent: false, ghost: false }
        ];
        
        // Default Pattern 2
        this.patterns[2] = [
            { note: 'C3', slide: true, accent: true, ghost: false },
            { note: 'C3', slide: false, accent: false, ghost: false },
            { note: null, slide: false, accent: false, ghost: true },
            { note: 'C4', slide: true, accent: true, ghost: false },
            { note: null, slide: false, accent: false, ghost: false },
            { note: 'C3', slide: false, accent: false, ghost: true },
            { note: 'D#3', slide: false, accent: false, ghost: false },
            { note: null, slide: false, accent: false, ghost: false },
            { note: 'C3', slide: true, accent: true, ghost: false },
            { note: 'C3', slide: false, accent: false, ghost: false },
            { note: 'F3', slide: true, accent: true, ghost: false },
            { note: null, slide: false, accent: false, ghost: false },
            { note: 'D3', slide: false, accent: false, ghost: false },
            { note: 'C3', slide: false, accent: false, ghost: true },
            { note: null, slide: false, accent: false, ghost: false },
            { note: 'G3', slide: false, accent: true, ghost: false }
        ];
        
        // Default Pattern 3
        this.patterns[3] = [
            { note: 'C3', slide: true, accent: true, ghost: false },
            { note: 'C#3', slide: false, accent: false, ghost: false },
            { note: null, slide: false, accent: false, ghost: true },
            { note: 'C3', slide: false, accent: false, ghost: false },
            { note: 'G3', slide: true, accent: true, ghost: false },
            { note: null, slide: false, accent: false, ghost: false },
            { note: 'C#3', slide: true, accent: false, ghost: false },
            { note: 'C3', slide: false, accent: false, ghost: false },
            { note: null, slide: false, accent: false, ghost: true },
            { note: 'A#3', slide: false, accent: true, ghost: false },
            { note: 'G#3', slide: true, accent: false, ghost: false },
            { note: 'G3', slide: false, accent: false, ghost: false },
            { note: 'C#3', slide: true, accent: false, ghost: false },
            { note: null, slide: false, accent: false, ghost: true },
            { note: 'C3', slide: false, accent: false, ghost: false },
            { note: 'C4', slide: false, accent: true, ghost: false }
        ];
        
        this.isPlaying = false;
        this.currentStep = 0;
        
        // WHAT: Creates a shared StepSequencer that wraps Tone.Sequence + Clock registration.
        // WHY:  Replaces hand-rolled Tone.Sequence boilerplate with the shared pattern engine,
        //       making step-count a parameter instead of hardcoded logic.
        this.stepSequencer = new StepSequencer({
            clientId: 'tb303',
            stepCount: this.steps,
            subdivision: '16n',
            tickCallback: (scheduled_audio_time, current_step_index) => this.tick(scheduled_audio_time, current_step_index)
        });
        
        this.stepCallbacks = [];
        this.uiCallback = null;
        this.patternChangeCallback = null;
        this.queuedPattern = null;
    }

    // WHAT: Registers a callback function to be executed on every sequencer tick.
    // WHY: Other instruments (like the Grandmother drone) need to hook into the 303's master clock to synchronize their own behavior (e.g. sample and hold).
    addStepCallback(step_callback_function) {
        if (typeof step_callback_function === 'function') this.stepCallbacks.push(step_callback_function);
    }
    // WHAT: Registers a callback function that the sequencer will call every time it advances a step.
    // WHY: We need to decouple the audio logic from the HTML UI. This allows the sequencer to tell the UI exactly when to highlight the current playing column.
    setUICallback(user_interface_callback_function) {
        this.uiCallback = user_interface_callback_function;
    }

    // WHAT: Registers a callback for when a pattern actually changes (e.g. at the start of a new cycle).
    // WHY: The UI needs to redraw the entire grid when a new pattern loads from memory.
    setPatternChangeCallback(pattern_change_callback_function) {
        this.patternChangeCallback = pattern_change_callback_function;
    }

    // WHAT: The core tick function that gets called 16 times per measure by the Tone.Sequence.
    // WHY: This function looks at the current step's data (note, slide, accent), checks what happened on the previous step (to handle slides correctly), and tells the Audio Engine to play it.
    tick(scheduled_audio_time, current_step_index) {
        if (current_step_index === 0 && this.queuedPattern !== null) {
            this.recallPattern(this.queuedPattern);
            this.queuedPattern = null;
            if (this.patternChangeCallback) {
                Tone.Draw.schedule(() => {
                    this.patternChangeCallback();
                }, scheduled_audio_time);
            }
        }
        
        this.currentStep = current_step_index;
        
        const step_data_object = this.grid[current_step_index];
        const next_step_object = this.grid[(current_step_index + 1) % this.steps];
        
        const previous_step_index = current_step_index === 0 ? this.steps - 1 : current_step_index - 1;
        const previous_step_object = this.grid[previous_step_index];
        const is_previous_step_sliding = previous_step_object.note !== null && previous_step_object.slide;
        
        // Calculate 16th note duration for portamento/release timing
        const step_duration_in_seconds = Tone.Time("16n").toSeconds();

        const octave_shift = step_data_object.octave || 0;
        const playable_note = step_data_object.note
            ? Tone.Frequency(step_data_object.note).transpose(octave_shift * 12).toNote()
            : null;

        if (step_data_object.tie) {
            window.AudioEngine.playTie(scheduled_audio_time, step_duration_in_seconds, next_step_object.tie);
        } else {
            window.AudioEngine.playStep(
                playable_note,
                scheduled_audio_time,
                step_data_object.slide,
                step_data_object.accent,
                step_data_object.ghost,
                step_duration_in_seconds,
                is_previous_step_sliding,
                next_step_object.tie
            );
        }


        this.stepCallbacks.forEach(step_callback => {
            step_callback(
                current_step_index,
                scheduled_audio_time,
                step_data_object,
                step_duration_in_seconds,
                previous_step_object,
                next_step_object
            );
        });        // Trigger UI update using Tone.Draw to sync visually with audio time
        if (this.uiCallback) {
            Tone.Draw.schedule(() => {
                this.uiCallback(current_step_index);
            }, scheduled_audio_time);
        }
    }

    // WHAT: Starts the 303 sequencer via the shared StepSequencer.
    // WHY: StepSequencer.start() handles both Clock registration and Tone.Sequence start
    //      in a single call, eliminating the manual two-step boilerplate.
    start() {
        this.stepSequencer.start();
        this.isPlaying = true;
    }

    // WHAT: Stops the 303 sequencer, cleans up audio state, and clears the UI playhead.
    // WHY: StepSequencer.stop() handles Clock unregistration and Tone.Sequence stop.
    //      The remaining lines handle 303-specific cleanup (releasing held notes, notifying
    //      step callbacks, resetting the current step counter).
    stop() {
        this.stepSequencer.stop();
        window.AudioEngine.stopAll();
        this.stepCallbacks.forEach(step_callback => step_callback(-1, Tone.now(), null, 0, null, null));
        this.isPlaying = false;
        this.currentStep = 0;
        if (this.uiCallback) this.uiCallback(-1); // Clear playhead
    }

    // WHAT: Sets the master tempo via the shared Clock.
    // WHY: Routing BPM changes through the Clock centralizes transport configuration
    //      and ensures every instrument sharing the transport hears the same tempo.
    setBpm(beats_per_minute) {
        window.Clock.setBpm(beats_per_minute);
    }

    // WHAT: Toggles a specific musical note on or off for a given step.
    // WHY: If the user clicks an empty cell, it adds the note. If they click an already active note, it removes it, acting like a toggle switch for programming.
    toggleNote(step_index_number, musical_note_string) {
        this.grid[step_index_number].tie = false;
        if (this.grid[step_index_number].note === musical_note_string) {
            this.grid[step_index_number].note = null; // Remove note
        } else {
            this.grid[step_index_number].note = musical_note_string; // Add/Change note
        }
    }

    // WHAT: Adjusts the octave modifier (-1, 0, or +1) for a specific step.
    // WHY: The original 303 relies heavily on rapid octave jumps to create its signature bouncy, rubbery sequences. Toggling the same octave again resets it to 0.
    toggleOctave(step_index_number, octave_value) {
        const current_octave = this.grid[step_index_number].octave || 0;
        this.grid[step_index_number].octave = current_octave === octave_value ? 0 : octave_value;
    }

    // WHAT: Toggles the tie parameter, sustaining the previous note into the current step.
    // WHY: Ties are crucial for creating long, continuous acid lines. If a tie is enabled, it inherently overrides any new note, slide, or accent on this step, so we clear them to prevent logical conflicts.
    toggleTie(step_index_number) {
        const tie_enabled = !this.grid[step_index_number].tie;
        this.grid[step_index_number].tie = tie_enabled;
        if (tie_enabled) {
            this.grid[step_index_number].note = null;
            this.grid[step_index_number].slide = false;
            this.grid[step_index_number].accent = false;
            this.grid[step_index_number].ghost = false;
        }
    }
    // WHAT: Toggles the slide parameter for a given step.
    // WHY: Slide tells the audio engine not to retrigger the envelope on the next step, creating the classic 303 portamento glide.
    toggleSlide(step_index_number) {
        this.grid[step_index_number].slide = !this.grid[step_index_number].slide;
    }

    // WHAT: Toggles the accent parameter for a given step and ensures it is mutually exclusive with ghost.
    // WHY: A step can be loud (accent) or quiet (ghost), but it physically cannot be both at the same time in the circuitry.
    toggleAccent(step_index_number) {
        this.grid[step_index_number].accent = !this.grid[step_index_number].accent;
        if (this.grid[step_index_number].accent) {
            this.grid[step_index_number].ghost = false; // Mutually exclusive
        }
    }

    // WHAT: Toggles the ghost parameter for a given step and ensures it is mutually exclusive with accent.
    // WHY: Ghost notes drop the volume and filter cutoff. Just like accents, they cannot exist simultaneously on the same step.
    toggleGhost(step_index_number) {
        this.grid[step_index_number].ghost = !this.grid[step_index_number].ghost;
        if (this.grid[step_index_number].ghost) {
            this.grid[step_index_number].accent = false; // Mutually exclusive
        }
    }

    // WHAT: Iterates through the entire 16-step grid and resets every parameter to its default empty state.
    // WHY: Provides a quick way for the user to erase their current pattern and start programming from scratch.
    clearGrid() {
        this.grid.forEach(sequencer_step_object => {
            sequencer_step_object.note = null;
            sequencer_step_object.octave = 0;
            sequencer_step_object.tie = false;
            sequencer_step_object.slide = false;
            sequencer_step_object.accent = false;
            sequencer_step_object.ghost = false;
        });
    }

    // WHAT: Saves a deep copy of the current grid state into a specific memory slot.
    // WHY: We must deep copy via JSON stringify/parse because otherwise we'd just store a reference, and future edits would overwrite the saved pattern!
    savePattern(memory_slot_index) {
        // Deep copy
        this.patterns[memory_slot_index] = JSON.parse(JSON.stringify(this.grid));
    }

    // WHAT: Loads a previously saved pattern from memory into the active grid.
    // WHY: Allows the user to instantly switch between programmed sequences while playing live. It returns a boolean so the UI knows if it successfully loaded a valid pattern.
    recallPattern(memory_slot_index) {
        if (this.patterns[memory_slot_index]) {
            this.grid = JSON.parse(JSON.stringify(this.patterns[memory_slot_index])).map(step => ({ octave: 0, tie: false, ...step }));
            return true;
        }
        return false;
    }

    // WHAT: Queues a pattern to be loaded at the start of the next cycle, or loads immediately if stopped.
    // WHY: Ensures pattern changes stay musically in time by waiting for the 16-step sequence to finish before swapping the active memory.
    queuePattern(memory_slot_index) {
        if (this.patterns[memory_slot_index]) {
            if (this.isPlaying) {
                this.queuedPattern = memory_slot_index;
            } else {
                this.recallPattern(memory_slot_index);
                if (this.patternChangeCallback) {
                    this.patternChangeCallback();
                }
            }
            return true;
        }
        return false;
    }
}

window.SequencerEngine = new Sequencer();
