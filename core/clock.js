/**
 * TransportManager — centralized wrapper around Tone.Transport.
 *
 * WHAT: Provides a reference-counted start/stop interface so multiple
 *       instruments can independently claim and release the global transport.
 *
 * WHY:  Without this, sequencer.js's stop() calls Tone.Transport.stop()
 *       unconditionally, which kills the Sampler's independently-running
 *       pattern even though sampler.js was written to run decoupled from
 *       the 303. The TransportManager tracks which "clients" (instruments)
 *       need the transport alive and only halts it when the last client
 *       unregisters.
 */
class TransportManager {
    constructor() {
        // WHAT: A Set of string identifiers for every instrument currently
        //       requiring the Tone.Transport to be running.
        // WHY:  We use a Set (not an array) so duplicate registrations are
        //       harmless and lookups are O(1).
        this.active_clients_set = new Set();
    }

    // WHAT: Registers a client as needing the transport and starts it if
    //       it isn't already running.
    // WHY:  Any instrument that begins playback must call this so the
    //       transport stays alive as long as at least one client needs it.
    start(client_id_string) {
        this.active_clients_set.add(client_id_string);
        if (Tone.Transport.state !== 'started') {
            Tone.Transport.start();
        }
    }

    // WHAT: Unregisters a client and stops the transport only when no
    //       clients remain.
    // WHY:  This is the core fix — stopping the 303 no longer kills the
    //       Sampler (or vice-versa), because the transport survives as
    //       long as any instrument still needs it.
    stop(client_id_string) {
        this.active_clients_set.delete(client_id_string);
        if (this.active_clients_set.size === 0) {
            Tone.Transport.stop();
        }
    }

    // WHAT: Sets the master BPM for the entire transport.
    // WHY:  Centralizes tempo control so every instrument sharing the
    //       transport hears the same BPM change simultaneously.
    setBpm(beats_per_minute_number) {
        Tone.Transport.bpm.value = beats_per_minute_number;
    }

    // WHAT: Sets the swing amount and subdivision for the entire transport.
    // WHY:  Allows for dynamic rhythmic feel changes across all connected instruments.
    setSwing(swing_amount_float, swing_subdivision_string = '16n') {
        Tone.Transport.swing = swing_amount_float;
        Tone.Transport.swingSubdivision = swing_subdivision_string;
    }

    // WHAT: Returns true if the Tone.Transport is currently running.
    // WHY:  Allows instruments and UI code to check transport state
    //       without importing Tone directly.
    get isRunning() {
        return Tone.Transport.state === 'started';
    }

    // WHAT: Returns the current BPM value from the transport.
    // WHY:  Read-only accessor for UI displays and sync calculations.
    get bpm() {
        return Tone.Transport.bpm.value;
    }

    // WHAT: Returns how many clients are currently registered.
    // WHY:  Useful for debugging and for the future Rack to know how
    //       many instruments are actively sequencing.
    get activeClientCount() {
        return this.active_clients_set.size;
    }
}

// WHAT: Expose the TransportManager as a global singleton.
// WHY:  All instrument scripts (sequencer.js, sampler.js, grandmother-audio.js)
//       reference window.Clock to start/stop/setBpm without touching
//       Tone.Transport directly.
window.Clock = new TransportManager();
