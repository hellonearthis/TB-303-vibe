class Sequencer {
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
        
        this.isPlaying = false;
        this.currentStep = 0;
        
        this.loop = new Tone.Sequence(
            (time, stepIndex) => this.tick(time, stepIndex),
            Array.from({ length: this.steps }, (_, i) => i),
            "16n"
        );
        
        this.uiCallback = null;
    }

    setUICallback(cb) {
        this.uiCallback = cb;
    }

    tick(time, stepIndex) {
        this.currentStep = stepIndex;
        
        const stepData = this.grid[stepIndex];
        
        // Calculate 16th note duration for portamento/release timing
        const stepDuration = Tone.Time("16n").toSeconds();

        if (stepData.note) {
            window.AudioEngine.playStep(
                stepData.note, 
                time, 
                stepData.slide, 
                stepData.accent, 
                stepData.ghost,
                stepDuration
            );
        }

        // Trigger UI update using Tone.Draw to sync visually with audio time
        if (this.uiCallback) {
            Tone.Draw.schedule(() => {
                this.uiCallback(stepIndex);
            }, time);
        }
    }

    start() {
        Tone.Transport.start();
        this.loop.start(0);
        this.isPlaying = true;
    }

    stop() {
        Tone.Transport.stop();
        this.loop.stop();
        this.isPlaying = false;
        this.currentStep = 0;
        if (this.uiCallback) this.uiCallback(-1); // Clear playhead
    }

    setBpm(bpm) {
        Tone.Transport.bpm.value = bpm;
    }

    toggleNote(step, note) {
        if (this.grid[step].note === note) {
            this.grid[step].note = null; // Remove note
        } else {
            this.grid[step].note = note; // Add/Change note
        }
    }

    toggleSlide(step) {
        this.grid[step].slide = !this.grid[step].slide;
    }

    toggleAccent(step) {
        this.grid[step].accent = !this.grid[step].accent;
        if (this.grid[step].accent) this.grid[step].ghost = false; // Mutually exclusive
    }

    toggleGhost(step) {
        this.grid[step].ghost = !this.grid[step].ghost;
        if (this.grid[step].ghost) this.grid[step].accent = false; // Mutually exclusive
    }

    clearGrid() {
        this.grid.forEach(step => {
            step.note = null;
            step.slide = false;
            step.accent = false;
            step.ghost = false;
        });
    }

    savePattern(slot) {
        // Deep copy
        this.patterns[slot] = JSON.parse(JSON.stringify(this.grid));
    }

    recallPattern(slot) {
        if (this.patterns[slot]) {
            this.grid = JSON.parse(JSON.stringify(this.patterns[slot]));
            return true;
        }
        return false;
    }
}

window.SequencerEngine = new Sequencer();
