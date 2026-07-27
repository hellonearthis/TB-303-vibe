/**
 * RackManager — centralized registry for all instruments.
 *
 * WHAT: Provides a base Instrument class that all synths/samplers extend,
 *       and a Rack singleton that manages their lifecycle and visibility.
 *
 * WHY:  Previously, each instrument was an ad-hoc singleton injected directly
 *       into window (e.g., window.MonotronAudio, window.SamplerEngine). This made
 *       it impossible to cleanly loop over all instruments to change layouts
 *       or mode settings. The Rack normalizes them into a collection.
 */

// WHAT: Base class defining the contract every instrument must fulfill.
// WHY:  Ensures the Rack can safely call show(), hide(), or apply layout changes
//       without needing to know the specific type of the instrument.
class Instrument {
    constructor(id_string, container_element_node) {
        this.id_string = id_string;
        this.container_element_node = container_element_node;
    }

    // WHAT: Displays the instrument's UI panel.
    show() {
        if (this.container_element_node) {
            this.container_element_node.style.display = 'block';
        }
    }

    // WHAT: Hides the instrument's UI panel.
    hide() {
        if (this.container_element_node) {
            this.container_element_node.style.display = 'none';
        }
    }

    // WHAT: Lifecycle hook called when the instrument is added to the Rack.
    // WHY:  Provides a place for the instrument to perform one-time setup
    //       (like binding DOM events) when it is officially initialized.
    mount() {
        console.log(`Instrument ${this.id_string} mounted.`);
    }
}

// WHAT: Singleton manager that holds all registered Instruments.
// WHY:  Replaces the scattered window global variables with a single source of truth.
//       The ModeManager will use this to show/hide specific instruments when changing layouts.
class RackManager {
    constructor() {
        this.instruments_map = new Map();
    }

    // WHAT: Registers an Instrument instance.
    register(instrument_instance) {
        if (!(instrument_instance instanceof Instrument)) {
            console.error('RackManager: Object is not an instance of Instrument.');
            return;
        }
        this.instruments_map.set(instrument_instance.id_string, instrument_instance);
        instrument_instance.mount();
    }

    // WHAT: Retrieves a specific instrument by ID.
    get(id_string) {
        return this.instruments_map.get(id_string);
    }

    // WHAT: Hides all instruments in the rack.
    // WHY:  Used when tearing down a layout before building a new one.
    hideAll() {
        this.instruments_map.forEach(instrument_instance => instrument_instance.hide());
    }

    // WHAT: Reorders the DOM elements of the instruments to match the provided layout array.
    // WHY:  Uses CSS flexbox 'order' property to visually reorder without disrupting the DOM hierarchy or state.
    reorder(layout_ids_array) {
        layout_ids_array.forEach((id_string, index) => {
            const instrument_instance = this.get(id_string);
            if (instrument_instance && instrument_instance.container_element_node) {
                // Set flex order to match array index (1-based because 0 is default)
                instrument_instance.container_element_node.style.order = index + 1;
                instrument_instance.show();
            }
        });
        
        // Hide instruments not in layout
        this.instruments_map.forEach((instrument_instance, id_string) => {
            if (!layout_ids_array.includes(id_string)) {
                instrument_instance.hide();
                instrument_instance.container_element_node.style.order = 99; // Push to bottom just in case
            }
        });
    }
}

// WHAT: Expose globally so instruments can register themselves.
window.Instrument = Instrument;
window.Rack = new RackManager();
