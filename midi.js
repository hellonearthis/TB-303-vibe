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
    constructor() {
        this.midiAccess = null;
        this.activeInputs = new Map();
        this.isLearnMode = false;
        this.learnTarget = null; // { parameter, sourceType }

        // Internal state for relative encoders (Mackie V-Pots)
        // Tracks accumulated value (0-127) per CC number
        this.encoderState = {};
        for (let cc = 16; cc <= 23; cc++) {
            this.encoderState[cc] = 64; // Start at midpoint
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
            this.midiAccess.inputs.forEach((input) => this._attachInput(input));

            // Hot-plug support
            this.midiAccess.onstatechange = (e) => this._onStateChange(e);

            if (this.midiAccess.inputs.size === 0) {
                this._dispatchDeviceChange('disconnected', null);
            }
        } catch (err) {
            console.error('[MIDI] Access denied:', err);
            this._dispatchDeviceChange('denied', null);
        }
    }

    _attachInput(input) {
        if (this.activeInputs.has(input.id)) return;

        input.onmidimessage = (e) => this._onMessage(e);
        this.activeInputs.set(input.id, input);
        console.log(`[MIDI] Connected: ${input.name} (${input.id})`);
        this._dispatchDeviceChange('connected', { name: input.name, id: input.id });
    }

    _detachInput(input) {
        this.activeInputs.delete(input.id);
        console.log(`[MIDI] Disconnected: ${input.name} (${input.id})`);
        this._dispatchDeviceChange('disconnected', { name: input.name, id: input.id });
    }

    _onStateChange(e) {
        const port = e.port;
        if (port.type !== 'input') return;

        if (port.state === 'connected') {
            this._attachInput(port);
        } else if (port.state === 'disconnected') {
            this._detachInput(port);
        }
    }

    // ---- Message Parsing ----

    _onMessage(e) {
        const [status, data1, data2] = e.data;
        const messageType = status & 0xF0;
        const channel = status & 0x0F;

        switch (messageType) {
            case 0xB0: // Control Change
                this._handleCC(channel, data1, data2);
                break;
            case 0xE0: // Pitch Bend (Mackie faders)
                this._handlePitchBend(channel, data1, data2);
                break;
            case 0x90: // Note On
                if (data2 > 0) {
                    this._handleNoteOn(channel, data1, data2);
                } else {
                    this._handleNoteOff(channel, data1);
                }
                break;
            case 0x80: // Note Off
                this._handleNoteOff(channel, data1);
                break;
            case 0xC0: // Program Change
                this._handleProgramChange(channel, data1);
                break;
        }
    }

    _handleCC(channel, cc, value) {
        const sourceId = `cc_${cc}`;

        // ---- MIDI Learn ----
        if (this.isLearnMode && this.learnTarget) {
            this._completeLearning(sourceId, { min: 0, max: 1, log: false });
            return;
        }

        // Check if this is a Mackie relative encoder (CC 16-23)
        const isRelativeEncoder = cc >= 16 && cc <= 23;

        let rawValue;
        if (isRelativeEncoder) {
            // Mackie Control V-Pots: bit 6 (value 64) is the direction flag
            // 1-63 = Clockwise (CW), 65-127 = Counter-Clockwise (CCW)
            const direction = (value & 0x40) ? -1 : 1; // If 64 bit is set, it's negative
            const ticks = value & 0x3F; // Mask out the direction bit to get the number of ticks
            const delta = direction * ticks;
            
            // Sensitivity multiplier
            const sensitivity = 2;
            this.encoderState[cc] = Math.max(0, Math.min(127, this.encoderState[cc] + (delta * sensitivity)));
            rawValue = this.encoderState[cc];
        } else {
            // Absolute CC
            rawValue = value;
        }

        const mapping = this.map[sourceId];
        if (!mapping) return;

        const scaledValue = this._scale(rawValue, mapping.min, mapping.max, mapping.log);

        window.dispatchEvent(new CustomEvent('midiCCChange', {
            detail: {
                parameter: mapping.parameter,
                scaledValue,
                rawValue,
                sourceId
            }
        }));
    }

    _handlePitchBend(channel, lsb, msb) {
        const sourceId = `pb_${channel}`;

        // ---- MIDI Learn ----
        if (this.isLearnMode && this.learnTarget) {
            this._completeLearning(sourceId, { min: 0, max: 1, log: false });
            return;
        }

        const mapping = this.map[sourceId];
        if (!mapping) return;

        // 14-bit value: 0-16383
        const raw14 = (msb << 7) | lsb;
        const rawValue = Math.round((raw14 / 16383) * 127); // Normalize to 0-127 for consistency
        const scaledValue = this._scale(rawValue, mapping.min, mapping.max, mapping.log);

        window.dispatchEvent(new CustomEvent('midiCCChange', {
            detail: {
                parameter: mapping.parameter,
                scaledValue,
                rawValue,
                sourceId
            }
        }));
    }

    _handleNoteOn(channel, note, velocity) {
        const sourceId = `note_${note}`;

        // ---- MIDI Learn ----
        if (this.isLearnMode && this.learnTarget) {
            this._completeLearning(sourceId, { type: 'toggle' });
            return;
        }

        const mapping = this.map[sourceId];

        if (mapping) {
            if (mapping.type === 'transport') {
                const action = mapping.parameter === 'transport-play' ? 'play' : 'stop';
                window.dispatchEvent(new CustomEvent('midiTransport', {
                    detail: { action }
                }));
                return;
            }

            if (mapping.type === 'toggle') {
                // Toggle state on note-on
                this.toggleState[sourceId] = !this.toggleState[sourceId];
                window.dispatchEvent(new CustomEvent('midiToggle', {
                    detail: {
                        parameter: mapping.parameter,
                        state: this.toggleState[sourceId]
                    }
                }));
                return;
            }
        }

        // Generic note on (for Monotron / sequencer integration)
        window.dispatchEvent(new CustomEvent('midiNoteOn', {
            detail: {
                note,
                velocity,
                channel,
                frequency: this._midiToFreq(note)
            }
        }));
    }

    _handleNoteOff(channel, note) {
        window.dispatchEvent(new CustomEvent('midiNoteOff', {
            detail: { note, channel }
        }));
    }

    _handleProgramChange(channel, program) {
        // Map to pattern slots 1-9 (program 0-8 → slot 1-9)
        const slot = program + 1;
        if (slot >= 1 && slot <= 9) {
            window.dispatchEvent(new CustomEvent('midiProgramChange', {
                detail: { program: slot }
            }));
        }
    }

    // ---- Value Scaling ----

    _scale(raw, min, max, isLog) {
        const normalized = raw / 127;
        if (isLog) {
            // Logarithmic: for frequency-type parameters
            return min * Math.pow(max / min, normalized);
        }
        // Linear
        return min + (normalized * (max - min));
    }

    _midiToFreq(noteNumber) {
        // Standard MIDI note to frequency: A4 (note 69) = 440 Hz
        return 440 * Math.pow(2, (noteNumber - 69) / 12);
    }

    // ---- MIDI Learn ----

    enterLearnMode(parameter) {
        this.isLearnMode = true;
        this.learnTarget = { parameter };
        console.log(`[MIDI Learn] Listening for input → "${parameter}"`);

        window.dispatchEvent(new CustomEvent('midiLearnStart', {
            detail: { parameter }
        }));
    }

    exitLearnMode() {
        this.isLearnMode = false;
        this.learnTarget = null;

        window.dispatchEvent(new CustomEvent('midiLearnCancel', {}));
    }

    _completeLearning(sourceId, defaults) {
        const parameter = this.learnTarget.parameter;

        // Check if this parameter already exists elsewhere in the map — remove old binding
        for (const key of Object.keys(this.map)) {
            if (this.map[key].parameter === parameter) {
                delete this.map[key];
            }
        }

        // Assign new mapping
        this.map[sourceId] = {
            parameter,
            min: defaults.min !== undefined ? defaults.min : 0,
            max: defaults.max !== undefined ? defaults.max : 1,
            log: defaults.log || false,
            type: defaults.type || 'cc',
        };

        console.log(`[MIDI Learn] Mapped ${sourceId} → "${parameter}"`);

        this.isLearnMode = false;
        this.learnTarget = null;

        // Persist
        this._saveMap();

        window.dispatchEvent(new CustomEvent('midiLearnComplete', {
            detail: { parameter, sourceId }
        }));
    }

    // Reset all learned mappings to defaults
    resetMap() {
        this.map = JSON.parse(JSON.stringify(this.defaultMap));
        this._saveMap();
        console.log('[MIDI] Mappings reset to defaults.');
    }

    // ---- Persistence ----

    _saveMap() {
        try {
            localStorage.setItem('tb303_midiMap', JSON.stringify(this.map));
        } catch (e) {
            console.warn('[MIDI] Could not save mappings to localStorage:', e);
        }
    }

    _loadMap() {
        try {
            const saved = localStorage.getItem('tb303_midiMap');
            if (saved) {
                const parsed = JSON.parse(saved);
                console.log('[MIDI] Loaded saved mappings from localStorage.');
                return parsed;
            }
        } catch (e) {
            console.warn('[MIDI] Could not load saved mappings:', e);
        }
        // Return a deep copy of defaults
        return JSON.parse(JSON.stringify(this.defaultMap));
    }

    // ---- Helpers ----

    // Get the source ID currently mapped to a parameter (for UI display)
    getSourceForParameter(parameter) {
        for (const [sourceId, mapping] of Object.entries(this.map)) {
            if (mapping.parameter === parameter) {
                return sourceId;
            }
        }
        return null;
    }

    // Get human-readable label for a source ID
    getSourceLabel(sourceId) {
        if (!sourceId) return '';
        if (sourceId.startsWith('pb_')) {
            return `Fader ${parseInt(sourceId.split('_')[1]) + 1}`;
        }
        if (sourceId.startsWith('cc_')) {
            const cc = parseInt(sourceId.split('_')[1]);
            if (cc >= 16 && cc <= 23) return `V-Pot ${cc - 15}`;
            return `CC ${cc}`;
        }
        if (sourceId.startsWith('note_')) {
            const note = parseInt(sourceId.split('_')[1]);
            if (note === 93) return 'Stop Btn';
            if (note === 94) return 'Play Btn';
            if (note >= 16 && note <= 23) return `Mute ${note - 15}`;
            return `Note ${note}`;
        }
        return sourceId;
    }

    _dispatchDeviceChange(type, device) {
        window.dispatchEvent(new CustomEvent('midiDeviceChange', {
            detail: { type, device }
        }));
    }

    // Check if any MIDI devices are currently connected
    get isConnected() {
        return this.activeInputs.size > 0;
    }

    // Get list of connected device names
    get deviceNames() {
        return Array.from(this.activeInputs.values()).map(i => i.name);
    }
}

// Expose globally
window.MIDIController = new MIDIController();
