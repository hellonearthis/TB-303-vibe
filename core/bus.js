/**
 * AudioBus — centralized routing matrix for the synthesizer application.
 *
 * WHAT: Manages all named audio routing points (buses) and provides a declarative
 *       API for connecting instruments together.
 *
 * WHY:  Previously, signal routing was hardcoded directly into click handlers across
 *       multiple files (e.g., app.js handling Grandmother's Aux In, monotron-ui.js
 *       handling its own Aux In). This creates a tangled web where UI code has to
 *       know about raw Tone.js AudioNodes of other instruments. The Bus extracts
 *       this logic so instruments just say "connect my output to the Monotron bus".
 */
class AudioBus {
    constructor() {
        // WHAT: A map of registered named destinations (Tone.js nodes).
        // WHY:  Allows instruments to route audio by name (e.g., 'grandmother_ext_in')
        //       instead of needing direct references to other engine instances.
        this.destinations_object = {
            'master': Tone.Destination
        };

        // WHAT: Tracks active connections so we can cleanly disconnect them later.
        //       Format: { "source_id_string": Set(["dest_id_1", "dest_id_2"]) }
        this.active_routes_object = {};
    }

    // WHAT: Registers a Tone.js AudioNode as a named destination on the bus.
    // WHY:  Instruments call this during initialization so other instruments
    //       can route audio to them.
    registerDestination(destination_id_string, audio_node) {
        this.destinations_object[destination_id_string] = audio_node;
    }

    // WHAT: Connects or disconnects a source AudioNode to a named destination.
    // WHY:  The single entry point for all patching. It handles the raw Tone.connect()
    //       calls and tracks state so a source doesn't get disconnected from the Master
    //       bus unless requested.
    routeAudio(source_node, destination_id_string, connect_boolean = true) {
        const destination_node = this.destinations_object[destination_id_string];
        
        if (!destination_node) {
            console.warn(`AudioBus: Destination '${destination_id_string}' not found.`);
            return;
        }

        // We use the node's unique ID to track its routes
        // For standard Web Audio nodes, this is slightly tricky, but Tone.js nodes
        // can be used as Map keys, or we can just manage the specific logic for
        // our exact use cases: the 303 switching between master, grandmother, and monotron.
        
        if (connect_boolean) {
            // Disconnect from master when routing to an aux (acting as an insert effect)
            if (destination_id_string !== 'master') {
                try {
                    source_node.disconnect(this.destinations_object['master']);
                } catch (e) { /* ignore if already disconnected */ }
            }
            // Use Tone.connect to safely bridge Tone nodes and native AudioNodes
            Tone.connect(source_node, destination_node);
        } else {
            try {
                source_node.disconnect(destination_node);
            } catch (e) { /* ignore if already disconnected */ }
            // Re-route back to master if we unplug from an aux
            if (destination_id_string !== 'master') {
                Tone.connect(source_node, this.destinations_object['master']);
            }
        }
    }
}

// WHAT: Expose the AudioBus globally.
// WHY:  Allows UI handlers in app.js and monotron-ui.js to trigger routing changes.
window.Bus = new AudioBus();
