/**
 * StepSequencer — generic step-sequencing engine shared by all instruments.
 *
 * WHAT: Wraps a Tone.Sequence with configurable step count and subdivision,
 *       and integrates with the shared TransportManager (Clock) so
 *       start/stop automatically register/unregister the owning instrument.
 *
 * WHY:  Both sequencer.js (303) and sampler.js (KO-40) previously
 *       hand-rolled nearly identical Tone.Sequence boilerplate. Extracting
 *       it into a shared class eliminates that duplication and makes
 *       step-count a parameter instead of hardcoded logic — the key
 *       enabler for future Mode configs like DnB (32 steps, different
 *       subdivision/swing).
 */
class StepSequencer {
    // WHAT: Creates the internal Tone.Sequence and stores configuration.
    // WHY:  The constructor is intentionally minimal — it builds the
    //       sequence array from stepCount and wires the tick callback,
    //       but does NOT start anything. The instrument calls start()
    //       when ready.
    constructor({ clientId, stepCount, subdivision, tickCallback }) {
        // WHAT: The Clock client identifier for this instrument (e.g. 'tb303', 'sampler').
        // WHY:  Passed to Clock.start/stop so the transport knows who needs it alive.
        this.client_id_string = clientId;

        // WHAT: Number of steps in the sequence (e.g. 16 for classic acid, 32 for DnB).
        // WHY:  Stored so we can rebuild the sequence when a Mode change requests
        //       a different step count.
        this.step_count_integer = stepCount;

        // WHAT: Tone.js subdivision string (e.g. '16n', '8n').
        // WHY:  Determines the rhythmic resolution of each step tick.
        this.subdivision_string = subdivision;

        // WHAT: The function called on every step tick with (scheduledTime, stepIndex).
        // WHY:  Each instrument provides its own tick logic — the 303 plays notes
        //       with slide/accent, the sampler triggers samples with pitch/velocity.
        this.tick_callback_function = tickCallback;

        // WHAT: Tracks whether this sequencer is currently playing.
        // WHY:  Used by instruments to check playback state without querying Tone directly.
        this.is_running_boolean = false;

        this._build_sequence();
    }

    // WHAT: Creates (or recreates) the internal Tone.Sequence from the current config.
    // WHY:  Separated from the constructor so it can be called again when step count
    //       or subdivision changes (e.g. switching from 16-step acid to 32-step DnB).
    _build_sequence() {
        if (this._sequence_instance) {
            this._sequence_instance.dispose();
        }

        const step_index_array = Array.from(
            { length: this.step_count_integer },
            (_, loop_index) => loop_index
        );

        this._sequence_instance = new Tone.Sequence(
            (scheduled_audio_time, current_step_index) => {
                this.tick_callback_function(scheduled_audio_time, current_step_index);
            },
            step_index_array,
            this.subdivision_string
        );
    }

    // WHAT: Registers with the Clock and starts the Tone.Sequence.
    // WHY:  Instruments call this instead of manually doing Clock.start + sequence.start,
    //       collapsing two operations into one and eliminating the chance of forgetting one.
    start() {
        window.Clock.start(this.client_id_string);
        this._sequence_instance.start(0);
        this.is_running_boolean = true;
    }

    // WHAT: Stops the Tone.Sequence and unregisters from the Clock.
    // WHY:  The Clock only halts the global transport when the last client unregisters,
    //       so stopping one instrument never kills another.
    stop() {
        this._sequence_instance.stop();
        window.Clock.stop(this.client_id_string);
        this.is_running_boolean = false;
    }

    // WHAT: Convenience getter for checking playback state.
    // WHY:  Instruments and UI code can check this without reaching into Tone internals.
    get isRunning() {
        return this.is_running_boolean;
    }

    // WHAT: Reconfigures step count and/or subdivision, then rebuilds the internal sequence.
    // WHY:  Used by the future ModeManager to switch between layouts (e.g. 16 → 32 steps)
    //       without the instrument needing to know the Tone.Sequence internals.
    reconfigure({ stepCount, subdivision }) {
        const was_running_boolean = this.is_running_boolean;
        if (was_running_boolean) {
            this.stop();
        }

        if (stepCount !== undefined) this.step_count_integer = stepCount;
        if (subdivision !== undefined) this.subdivision_string = subdivision;

        this._build_sequence();

        if (was_running_boolean) {
            this.start();
        }
    }
}

// WHAT: Expose StepSequencer globally so instrument scripts can use it.
// WHY:  We're using plain <script> tags (no bundler), so classes must be
//       on window to be accessible across files.
window.StepSequencer = StepSequencer;
