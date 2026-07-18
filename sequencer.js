class Sequencer {
    // WHAT: Initializes the Sequencer engine, setting up the 16-step grid, the default patterns, and the Tone.js playback loop.
    // WHY: The sequencer needs to hold the state of every musical step in memory so it can schedule them precisely with the Web Audio API transport.
    constructor() {
        this.steps = 16;
        this.scale = ['C4', 'B3', 'A#3', 'A3', 'G#3', 'G3', 'F#3', 'F3', 'E3', 'D#3', 'D3', 'C#3', 'C3'];
        
        // Internal state of the grid
        this.grid = Array(this.steps).fill(null).map(() => ({
            note: null, // string e.g. 'C3', or null for rest
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
        
        this.loop = new Tone.Sequence(
            (scheduled_audio_time, current_step_index) => this.tick(scheduled_audio_time, current_step_index),
            Array.from({ length: this.steps }, (_, loop_index) => loop_index),
            "16n"
        );
        
        this.uiCallback = null;
        this.patternChangeCallback = null;
        this.queuedPattern = null;
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
        
        const previous_step_index = current_step_index === 0 ? this.steps - 1 : current_step_index - 1;
        const previous_step_object = this.grid[previous_step_index];
        const is_previous_step_sliding = previous_step_object.note !== null && previous_step_object.slide;
        
        // Calculate 16th note duration for portamento/release timing
        const step_duration_in_seconds = Tone.Time("16n").toSeconds();

        window.AudioEngine.playStep(
            step_data_object.note, 
            scheduled_audio_time, 
            step_data_object.slide, 
            step_data_object.accent, 
            step_data_object.ghost,
            step_duration_in_seconds,
            is_previous_step_sliding
        );

        // Trigger UI update using Tone.Draw to sync visually with audio time
        if (this.uiCallback) {
            Tone.Draw.schedule(() => {
                this.uiCallback(current_step_index);
            }, scheduled_audio_time);
        }
    }

    // WHAT: Starts the global Tone.js transport and the local sequence loop.
    // WHY: Tone.js requires the master transport to be running before any sequences will actually emit ticks.
    start() {
        Tone.Transport.start();
        this.loop.start(0);
        this.isPlaying = true;
    }

    // WHAT: Stops the global transport, resets the step counter, and clears the UI playhead.
    // WHY: When the user presses stop, the music should halt immediately, and the visual indicator should be removed so it doesn't confusingly stay highlighted.
    stop() {
        Tone.Transport.stop();
        this.loop.stop();
        this.isPlaying = false;
        this.currentStep = 0;
        if (this.uiCallback) this.uiCallback(-1); // Clear playhead
    }

    // WHAT: Sets the master tempo for the Tone.js transport.
    // WHY: Changing the BPM scales all timing universally, speeding up or slowing down the sequencer playback perfectly in sync.
    setBpm(beats_per_minute) {
        Tone.Transport.bpm.value = beats_per_minute;
    }

    // WHAT: Toggles a specific musical note on or off for a given step.
    // WHY: If the user clicks an empty cell, it adds the note. If they click an already active note, it removes it, acting like a toggle switch for programming.
    toggleNote(step_index_number, musical_note_string) {
        if (this.grid[step_index_number].note === musical_note_string) {
            this.grid[step_index_number].note = null; // Remove note
        } else {
            this.grid[step_index_number].note = musical_note_string; // Add/Change note
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
            this.grid = JSON.parse(JSON.stringify(this.patterns[memory_slot_index]));
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
