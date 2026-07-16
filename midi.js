/**
 * Web MIDI Controller Module
 * 
 * Supports dual-mode operation:
 *   - Mackie Control protocol (M-Wave SMC-Mixer DAW mode)
 *     • Faders: 14-bit Pitch Bend on channels 1-8
 *     • V-Pots: Relative CC 16-23 (1=CW, 65=CCW)
 *     • Transport: Note On 93=Stop, 94=Play
 *     • Mute buttons: Note On 16-23
 *   - Standard CC mode (SMC-Mixer User mode / any MIDI controller)
 *     • Absolute CC 0-127
 * 
 * Dispatches CustomEvents on `window` for decoupled audio/UI integration.
 * Includes MIDI Learn with localStorage persistence.
 */
class MIDIController {
    // WHAT: Initializes the MIDI controller mapping logic, state trackers, and defaults.
    // WHY: We need a central class to handle Web MIDI API connections, maintain device states, and parse incoming byte messages into human-readable events.
    constructor() {
        this.midiAccess = null;
        this.activeInputs = new Map();
        this.isLearnMode = false;
        this.learnTarget = null; // { parameter, sourceType }

        // Internal state for relative encoders (Mackie V-Pots)
        // Tracks accumulated value (0-127) per CC number
        this.encoderState = {};
        for (let control_change_number = 16; control_change_number <= 23; control_change_number++) {
            this.encoderState[control_change_number] = 64; // Start at midpoint
        }

        // Internal state for toggle tracking (pedals via Mute buttons)
        this.toggleState = {};

        // ---- Default Mapping (SMC-Mixer Mackie Mode) ----
        this.defaultMap = {
            // Faders (Pitch Bend) — keyed as 'pb_<channel>' (0-indexed)
            'pb_0': { parameter: 'cutoff',        min: 0, max: 1, log: false },
            'pb_1': { parameter: 'resonance',     min: 0, max: 1, log: false },
            'pb_2': { parameter: 'envMod',        min: 0, max: 1, log: false },
            'pb_3': { parameter: 'decay',         min: 0, max: 1, log: false },
            'pb_4': { parameter: 'accentAmount',  min: 0, max: 1, log: false },
            'pb_5': { parameter: 'gm-cutoff',     min: 0, max: 1, log: false },
            'pb_6': { parameter: 'gm-volume',     min: 0, max: 1, log: false },
            'pb_7': { parameter: 'monotron-cutoff', min: 0, max: 1, log: false },

            // V-Pots (Relative CC 16-23) — keyed as 'cc_<number>'
            'cc_16': { parameter: 'gm-resonance',  min: 0, max: 1, log: false },
            'cc_17': { parameter: 'gm-detune',     min: 0, max: 1, log: false },
            'cc_18': { parameter: 'gm-modWheel',   min: 0, max: 1, log: false },
            'cc_19': { parameter: 'gm-modRate',    min: 0, max: 1, log: false },
            'cc_20': { parameter: 'gm-reverb',     min: 0, max: 1, log: false },
            'cc_21': { parameter: 'monotron-peak',  min: 0, max: 1, log: false },
            'cc_22': { parameter: 'monotron-xmod',  min: 0, max: 1, log: false },
            'cc_23': { parameter: 'monotron-volume', min: 0, max: 1, log: false },

            // Mute buttons (Note On toggle) — keyed as 'note_<number>'
            'note_16': { parameter: 'pedal-overdrive', type: 'toggle' },
            'note_17': { parameter: 'pedal-delay',     type: 'toggle' },
            'note_18': { parameter: 'pedal-phaser',    type: 'toggle' },

            // Transport (Note On) — keyed as 'note_<number>'
            'note_94': { parameter: 'transport-play', type: 'transport' },
            'note_93': { parameter: 'transport-stop', type: 'transport' },
        };

        // Load saved map or use defaults
        this.map = this._loadMap();

        // Initialize MIDI
        this._init();
    }

    // ---- Lifecycle ----

    // WHAT: Requests access to the browser's MIDI hardware interfaces and registers input listeners.
    // WHY: Browsers gate MIDI access behind a promise for security reasons. We must request it, handle hot-plugging, and gracefully fall back if the user denies it or the browser lacks support.
    async _init() {
        if (!navigator.requestMIDIAccess) {
            console.warn('[MIDI] Web MIDI API not supported in this browser.');
            this._dispatchDeviceChange('unsupported', null);
            return;
        }

        try {
            this.midiAccess = await navigator.requestMIDIAccess({ sysex: false });
            console.log('[MIDI] Access granted.');

            // Attach to all current inputs
            this.midiAccess.inputs.forEach((midi_input_device) => this._attachInput(midi_input_device));

            // Hot-plug support
            this.midiAccess.onstatechange = (midi_state_change_event_object) => this._onStateChange(midi_state_change_event_object);

            if (this.midiAccess.inputs.size === 0) {
                this._dispatchDeviceChange('disconnected', null);
            }
        } catch (midi_access_error_object) {
            console.error('[MIDI] Access denied:', midi_access_error_object);
            this._dispatchDeviceChange('denied', null);
        }
    }

    // WHAT: Binds our message parsing function to a specific MIDI input device.
    // WHY: We need to listen to incoming bytes from the hardware so we can convert physical knob turns into software events.
    _attachInput(midi_input_device) {
        if (this.activeInputs.has(midi_input_device.id)) return;

        midi_input_device.onmidimessage = (midi_message_event_object) => this._onMessage(midi_message_event_object);
        this.activeInputs.set(midi_input_device.id, midi_input_device);
        console.log(`[MIDI] Connected: ${midi_input_device.name} (${midi_input_device.id})`);
        this._dispatchDeviceChange('connected', { name: midi_input_device.name, id: midi_input_device.id });
    }

    // WHAT: Unbinds and removes a disconnected MIDI input device from our active list.
    // WHY: Prevents memory leaks and allows the UI to update to show that the device is no longer available.
    _detachInput(midi_input_device) {
        this.activeInputs.delete(midi_input_device.id);
        console.log(`[MIDI] Disconnected: ${midi_input_device.name} (${midi_input_device.id})`);
        this._dispatchDeviceChange('disconnected', { name: midi_input_device.name, id: midi_input_device.id });
    }

    // WHAT: Handles USB hot-plugging events (plugging in or unplugging a MIDI keyboard).
    // WHY: Hardware can be connected or disconnected at any time while the web app is running. This dynamically catches those events to route them properly.
    _onStateChange(midi_state_change_event_object) {
        const midi_port_object = midi_state_change_event_object.port;
        if (midi_port_object.type !== 'input') return;

        if (midi_port_object.state === 'connected') {
            this._attachInput(midi_port_object);
        } else if (midi_port_object.state === 'disconnected') {
            this._detachInput(midi_port_object);
        }
    }

    // ---- Message Parsing ----

    // WHAT: Intercepts raw MIDI byte arrays and dispatches them to specific handler functions (Control Change, Pitch Bend, Note On/Off).
    // WHY: MIDI is a highly compressed byte protocol. The first byte determines the message type and channel, while the subsequent bytes hold the data (like velocity or pitch).
    _onMessage(midi_message_event_object) {
        const [status_byte, data_byte_1, data_byte_2] = midi_message_event_object.data;
        const message_type_nibble = status_byte & 0xF0;
        const midi_channel_nibble = status_byte & 0x0F;

        switch (message_type_nibble) {
            case 0xB0: // Control Change
                this._handleCC(midi_channel_nibble, data_byte_1, data_byte_2);
                break;
            case 0xE0: // Pitch Bend (Mackie faders)
                this._handlePitchBend(midi_channel_nibble, data_byte_1, data_byte_2);
                break;
            case 0x90: // Note On
                if (data_byte_2 > 0) {
                    this._handleNoteOn(midi_channel_nibble, data_byte_1, data_byte_2);
                } else {
                    this._handleNoteOff(midi_channel_nibble, data_byte_1);
                }
                break;
            case 0x80: // Note Off
                this._handleNoteOff(midi_channel_nibble, data_byte_1);
                break;
            case 0xC0: // Program Change
                this._handleProgramChange(midi_channel_nibble, data_byte_1);
                break;
        }
    }

    // WHAT: Processes MIDI Control Change (CC) messages, handling both absolute 0-127 values and relative endless encoders (Mackie V-Pots).
    // WHY: Standard knobs send absolute values, but some pro gear (like the SMC-Mixer) sends relative delta ticks (e.g. "moved left 2 ticks"). We must parse both and scale them for the UI.
    _handleCC(midi_channel_nibble, control_change_number, control_value) {
        const mapping_source_id_string = `cc_${control_change_number}`;

        // ---- MIDI Learn ----
        if (this.isLearnMode && this.learnTarget) {
            this._completeLearning(mapping_source_id_string, { min: 0, max: 1, log: false });
            return;
        }

        // Check if this is a Mackie relative encoder (CC 16-23)
        const is_relative_encoder_boolean = control_change_number >= 16 && control_change_number <= 23;

        let processed_raw_value;
        if (is_relative_encoder_boolean) {
            // Mackie Control V-Pots: bit 6 (value 64) is the direction flag
            // 1-63 = Clockwise (CW), 65-127 = Counter-Clockwise (CCW)
            const direction_multiplier = (control_value & 0x40) ? -1 : 1; // If 64 bit is set, it's negative
            const encoder_ticks_integer = control_value & 0x3F; // Mask out the direction bit to get the number of ticks
            const delta_change_integer = direction_multiplier * encoder_ticks_integer;
            
            // Sensitivity multiplier
            const sensitivity_multiplier_integer = 2;
            this.encoderState[control_change_number] = Math.max(0, Math.min(127, this.encoderState[control_change_number] + (delta_change_integer * sensitivity_multiplier_integer)));
            processed_raw_value = this.encoderState[control_change_number];
        } else {
            // Absolute CC
            processed_raw_value = control_value;
        }

        const configuration_mapping_object = this.map[mapping_source_id_string];
        if (!configuration_mapping_object) return;

        const normalized_scaled_value = this._scale(processed_raw_value, configuration_mapping_object.min, configuration_mapping_object.max, configuration_mapping_object.log);

        window.dispatchEvent(new CustomEvent('midiCCChange', {
            detail: {
                parameter: configuration_mapping_object.parameter,
                scaledValue: normalized_scaled_value,
                rawValue: processed_raw_value,
                sourceId: mapping_source_id_string
            }
        }));
    }

    // WHAT: Parses 14-bit high-resolution Pitch Bend messages often sent by motorized faders.
    // WHY: Faders require higher resolution than standard CC knobs to avoid "zipper" noise when sweeping parameters. This combines two 7-bit bytes into a single 14-bit value.
    _handlePitchBend(midi_channel_nibble, least_significant_byte, most_significant_byte) {
        const mapping_source_id_string = `pb_${midi_channel_nibble}`;

        // ---- MIDI Learn ----
        if (this.isLearnMode && this.learnTarget) {
            this._completeLearning(mapping_source_id_string, { min: 0, max: 1, log: false });
            return;
        }

        const configuration_mapping_object = this.map[mapping_source_id_string];
        if (!configuration_mapping_object) return;

        // 14-bit value: 0-16383
        const combined_14_bit_value = (most_significant_byte << 7) | least_significant_byte;
        const normalized_7_bit_value = Math.round((combined_14_bit_value / 16383) * 127); // Normalize to 0-127 for consistency
        const normalized_scaled_value = this._scale(normalized_7_bit_value, configuration_mapping_object.min, configuration_mapping_object.max, configuration_mapping_object.log);

        window.dispatchEvent(new CustomEvent('midiCCChange', {
            detail: {
                parameter: configuration_mapping_object.parameter,
                scaledValue: normalized_scaled_value,
                rawValue: normalized_7_bit_value,
                sourceId: mapping_source_id_string
            }
        }));
    }

    // WHAT: Processes MIDI Note On messages for triggering synth notes or pressing transport/mute buttons on a DAW controller.
    // WHY: Keyboards send notes to play music, but DAW controllers often hijack Note On events to act as button presses (e.g. Play, Stop, Mute). We must distinguish between the two based on our mapping.
    _handleNoteOn(midi_channel_nibble, midi_note_number, note_velocity_value) {
        const mapping_source_id_string = `note_${midi_note_number}`;

        // ---- MIDI Learn ----
        if (this.isLearnMode && this.learnTarget) {
            this._completeLearning(mapping_source_id_string, { type: 'toggle' });
            return;
        }

        const configuration_mapping_object = this.map[mapping_source_id_string];

        if (configuration_mapping_object) {
            if (configuration_mapping_object.type === 'transport') {
                const transport_action_string = configuration_mapping_object.parameter === 'transport-play' ? 'play' : 'stop';
                window.dispatchEvent(new CustomEvent('midiTransport', {
                    detail: { action: transport_action_string }
                }));
                return;
            }

            if (configuration_mapping_object.type === 'toggle') {
                // Toggle state on note-on
                this.toggleState[mapping_source_id_string] = !this.toggleState[mapping_source_id_string];
                window.dispatchEvent(new CustomEvent('midiToggle', {
                    detail: {
                        parameter: configuration_mapping_object.parameter,
                        state: this.toggleState[mapping_source_id_string]
                    }
                }));
                return;
            }
        }

        // Generic note on (for Monotron / sequencer integration)
        window.dispatchEvent(new CustomEvent('midiNoteOn', {
            detail: {
                note: midi_note_number,
                velocity: note_velocity_value,
                channel: midi_channel_nibble,
                frequency: this._midiToFreq(midi_note_number)
            }
        }));
    }

    // WHAT: Dispatches a note off event when a key is released.
    // WHY: We tell the application to close the amplifier envelope for the specific note that was just released.
    _handleNoteOff(midi_channel_nibble, midi_note_number) {
        window.dispatchEvent(new CustomEvent('midiNoteOff', {
            detail: { note: midi_note_number, channel: midi_channel_nibble }
        }));
    }

    // WHAT: Intercepts MIDI Program Change messages and maps them to sequence memory slots (1-9).
    // WHY: Allows the user to switch active sequencer patterns directly from a hardware MIDI controller without touching the computer keyboard.
    _handleProgramChange(midi_channel_nibble, program_number_integer) {
        // Map to pattern slots 1-9 (program 0-8 → slot 1-9)
        const memory_slot_integer = program_number_integer + 1;
        if (memory_slot_integer >= 1 && memory_slot_integer <= 9) {
            window.dispatchEvent(new CustomEvent('midiProgramChange', {
                detail: { program: memory_slot_integer }
            }));
        }
    }

    // ---- Value Scaling ----

    // WHAT: Converts a raw 0-127 MIDI value into the desired output range, supporting optional logarithmic scaling.
    // WHY: UI sliders expect 0-1, but frequencies often need logarithmic curves to sound natural (e.g. sweeping a filter). This normalizes the hardware input for the software.
    _scale(raw_midi_value, minimum_bound, maximum_bound, is_logarithmic_boolean) {
        const normalized_float = raw_midi_value / 127;
        if (is_logarithmic_boolean) {
            // Logarithmic: for frequency-type parameters
            return minimum_bound * Math.pow(maximum_bound / minimum_bound, normalized_float);
        }
        // Linear
        return minimum_bound + (normalized_float * (maximum_bound - minimum_bound));
    }

    // WHAT: Converts a standard MIDI note number (0-127) into a physical frequency in Hertz.
    // WHY: Tone.js oscillators require frequencies in Hertz to play pitches accurately. We use A4 = 440Hz as the tuning reference.
    _midiToFreq(midi_note_number_integer) {
        // Standard MIDI note to frequency: A4 (note 69) = 440 Hz
        return 440 * Math.pow(2, (midi_note_number_integer - 69) / 12);
    }

    // ---- MIDI Learn ----

    // WHAT: Activates MIDI Learn mode for a specific UI parameter.
    // WHY: Allows the user to dynamically map any physical knob on their controller to any software knob in the app by simply wiggling it.
    enterLearnMode(software_parameter_name_string) {
        this.isLearnMode = true;
        this.learnTarget = { parameter: software_parameter_name_string };
        console.log(`[MIDI Learn] Listening for input → "${software_parameter_name_string}"`);

        window.dispatchEvent(new CustomEvent('midiLearnStart', {
            detail: { parameter: software_parameter_name_string }
        }));
    }

    // WHAT: Cancels an active MIDI Learn session without saving.
    // WHY: If the user changes their mind or clicks away, we need to exit the listening state to prevent accidental mappings.
    exitLearnMode() {
        this.isLearnMode = false;
        this.learnTarget = null;

        window.dispatchEvent(new CustomEvent('midiLearnCancel', {}));
    }

    // WHAT: Finalizes the mapping once a hardware input is detected during Learn mode.
    // WHY: Connects the physical input to the software parameter, cleans up old conflicting mappings, and persists the new configuration to local storage so it survives page reloads.
    _completeLearning(mapping_source_id_string, default_configuration_object) {
        const software_parameter_name_string = this.learnTarget.parameter;

        // Check if this parameter already exists elsewhere in the map — remove old binding
        for (const mapping_key_string of Object.keys(this.map)) {
            if (this.map[mapping_key_string].parameter === software_parameter_name_string) {
                delete this.map[mapping_key_string];
            }
        }

        // Assign new mapping
        this.map[mapping_source_id_string] = {
            parameter: software_parameter_name_string,
            min: default_configuration_object.min !== undefined ? default_configuration_object.min : 0,
            max: default_configuration_object.max !== undefined ? default_configuration_object.max : 1,
            log: default_configuration_object.log || false,
            type: default_configuration_object.type || 'cc',
        };

        console.log(`[MIDI Learn] Mapped ${mapping_source_id_string} → "${software_parameter_name_string}"`);

        this.isLearnMode = false;
        this.learnTarget = null;

        // Persist
        this._saveMap();

        window.dispatchEvent(new CustomEvent('midiLearnComplete', {
            detail: { parameter: software_parameter_name_string, sourceId: mapping_source_id_string }
        }));
    }

    // WHAT: Erases all custom user mappings and restores the default Mackie Control mapping template.
    // WHY: Gives the user a panic button to reset their controller if they've completely messed up their MIDI mappings.
    resetMap() {
        this.map = JSON.parse(JSON.stringify(this.defaultMap));
        this._saveMap();
        console.log('[MIDI] Mappings reset to defaults.');
    }

    // ---- Persistence ----

    // WHAT: Serializes the current MIDI map to the browser's Local Storage.
    // WHY: We want the user's custom MIDI mappings to persist across browser sessions so they don't have to remap their controller every time they open the app.
    _saveMap() {
        try {
            localStorage.setItem('tb303_midiMap', JSON.stringify(this.map));
        } catch (local_storage_error_object) {
            console.warn('[MIDI] Could not save mappings to localStorage:', local_storage_error_object);
        }
    }

    // WHAT: Retrieves the saved MIDI map from Local Storage upon initialization.
    // WHY: This restores the user's custom mappings seamlessly. If none exist, it falls back to the default map.
    _loadMap() {
        try {
            const saved_json_string = localStorage.getItem('tb303_midiMap');
            if (saved_json_string) {
                const parsed_mapping_object = JSON.parse(saved_json_string);
                console.log('[MIDI] Loaded saved mappings from localStorage.');
                return parsed_mapping_object;
            }
        } catch (local_storage_load_error_object) {
            console.warn('[MIDI] Could not load saved mappings:', local_storage_load_error_object);
        }
        // Return a deep copy of defaults
        return JSON.parse(JSON.stringify(this.defaultMap));
    }

    // ---- Helpers ----

    // WHAT: Reverse-lookups a parameter name to find which hardware ID is currently controlling it.
    // WHY: Used by the UI to display the current mapped controller (e.g. "CC 7") underneath a software knob.
    getSourceForParameter(software_parameter_name_string) {
        for (const [mapping_source_id_string, configuration_mapping_object] of Object.entries(this.map)) {
            if (configuration_mapping_object.parameter === software_parameter_name_string) {
                return mapping_source_id_string;
            }
        }
        return null;
    }

    // WHAT: Translates a raw hardware source ID string into a human-readable label.
    // WHY: Users don't want to see "pb_0" or "note_94" in the UI. They want to see "Fader 1" or "Play Btn" to easily understand their mappings.
    getSourceLabel(mapping_source_id_string) {
        if (!mapping_source_id_string) return '';
        if (mapping_source_id_string.startsWith('pb_')) {
            return `Fader ${parseInt(mapping_source_id_string.split('_')[1]) + 1}`;
        }
        if (mapping_source_id_string.startsWith('cc_')) {
            const control_change_number = parseInt(mapping_source_id_string.split('_')[1]);
            if (control_change_number >= 16 && control_change_number <= 23) return `V-Pot ${control_change_number - 15}`;
            return `CC ${control_change_number}`;
        }
        if (mapping_source_id_string.startsWith('note_')) {
            const midi_note_number = parseInt(mapping_source_id_string.split('_')[1]);
            if (midi_note_number === 93) return 'Stop Btn';
            if (midi_note_number === 94) return 'Play Btn';
            if (midi_note_number >= 16 && midi_note_number <= 23) return `Mute ${midi_note_number - 15}`;
            return `Note ${midi_note_number}`;
        }
        return mapping_source_id_string;
    }

    // WHAT: Dispatches an event when the connection status of a MIDI device changes.
    // WHY: Decouples the hardware polling from the UI, allowing the UI to listen for these events and display a "Connected" or "Disconnected" badge gracefully.
    _dispatchDeviceChange(connection_status_type_string, device_info_object) {
        window.dispatchEvent(new CustomEvent('midiDeviceChange', {
            detail: { type: connection_status_type_string, device: device_info_object }
        }));
    }

    // WHAT: Checks if any MIDI interfaces are currently connected.
    // WHY: A simple helper getter for the UI to query the active hardware state.
    get isConnected() {
        return this.activeInputs.size > 0;
    }

    // WHAT: Returns an array of human-readable names of all currently connected MIDI devices.
    // WHY: Used by the UI to list available hardware devices in a dropdown or status tooltip.
    get deviceNames() {
        return Array.from(this.activeInputs.values()).map(midi_input_device => midi_input_device.name);
    }
}

// Expose globally
window.MIDIController = new MIDIController();
