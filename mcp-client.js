// WHAT: Browser-side WebSocket client bridge for the Model Context Protocol (MCP).
// WHY:  Allows a local Node.js MCP server to control the in-browser Web Audio synthesizers,
//       sequencers, and effects in real-time, while gracefully degrading to silence when offline
//       so that public deployments (like GitHub Pages) function with zero console noise or disruption.

(() => {
    // WHAT: Defines the local loopback WebSocket server location.
    // WHY:  Connects to the local Node process running mcp-server.js.
    const local_bridge_websocket_uniform_resource_locator = "ws://localhost:8787";

    // WHAT: Holds the active browser WebSocket connection instance.
    // WHY:  Used to send responses back to awaiting MCP tool calls.
    let active_browser_bridge_websocket_connection = null;

    // WHAT: Tracks whether the user has been informed of a successful bridge connection.
    // WHY:  Avoids redundant console messaging during reconnection attempts.
    let has_logged_successful_connection_notice = false;

    // WHAT: Dispatches incoming MCP commands directly into the application's engine singletons.
    // WHY:  Translates external JSON-RPC tool calls into internal engine method invocations,
    //       mimicking the behavior of on-screen UI clicks and MIDI events.
    function executeIncomingModelContextProtocolCommand(command_type_string, command_payload_object) {
        let execution_result_payload = { success: true };

        switch (command_type_string) {
            case "set_303_pattern": {
                // WHAT: Writes an array of 16 step objects into the SequencerEngine grid.
                // WHY:  Replaces the active pattern with the notes and modifiers specified by the AI agent.
                if (!window.SequencerEngine) {
                    return { success: false, error: "SequencerEngine is not initialized." };
                }

                const incoming_steps_array = command_payload_object.steps;
                if (!Array.isArray(incoming_steps_array) || incoming_steps_array.length !== 16) {
                    return { success: false, error: "The 'steps' argument must be an array of exactly 16 step objects." };
                }

                incoming_steps_array.forEach((incoming_step_object, step_index_number) => {
                    const resolved_octave_modifier = incoming_step_object.octave !== undefined
                        ? incoming_step_object.octave
                        : (incoming_step_object.octave_shift !== undefined ? incoming_step_object.octave_shift : 0);

                    window.SequencerEngine.grid[step_index_number] = {
                        note: incoming_step_object.note || null,
                        octave: resolved_octave_modifier,
                        tie: Boolean(incoming_step_object.tie),
                        slide: Boolean(incoming_step_object.slide),
                        accent: Boolean(incoming_step_object.accent),
                        ghost: Boolean(incoming_step_object.ghost),
                    };
                });

                // WHAT: Triggers a UI redraw of the note cells and modifier rows.
                // WHY:  Ensures the on-screen piano roll immediately reflects the agent's changes.
                if (typeof window.SequencerEngine.patternChangeCallback === "function") {
                    window.SequencerEngine.patternChangeCallback();
                }

                execution_result_payload = {
                    success: true,
                    message: "Successfully programmed 16-step pattern into TB-303 grid.",
                    pattern_preview: window.SequencerEngine.grid.slice(0, 16).map(step => step.note ? `${step.note}${step.octave > 0 ? '+1' : step.octave < 0 ? '-1' : ''}` : '-').join(' ')
                };
                break;
            }

            case "save_pattern_to_slot": {
                // WHAT: Saves current grid into the designated memory slot (1 to 9).
                // WHY:  Allows persisting patterns into sequencer memory for later recall during performance.
                const target_memory_slot_number = parseInt(command_payload_object.slot_number, 10);
                if (target_memory_slot_number >= 1 && target_memory_slot_number <= 9 && window.SequencerEngine) {
                    window.SequencerEngine.savePattern(target_memory_slot_number);
                    execution_result_payload = { success: true, slot_number: target_memory_slot_number };
                } else {
                    execution_result_payload = { success: false, error: "Invalid slot number. Must be an integer between 1 and 9." };
                }
                break;
            }

            case "recall_pattern_from_slot": {
                // WHAT: Loads a previously saved pattern from memory into the active grid.
                // WHY:  Swaps active musical sequence seamlessly; queues on next cycle if playing.
                const target_memory_slot_number = parseInt(command_payload_object.slot_number, 10);
                if (target_memory_slot_number >= 1 && target_memory_slot_number <= 9 && window.SequencerEngine) {
                    const pattern_successfully_found = window.SequencerEngine.queuePattern(target_memory_slot_number);
                    if (!window.SequencerEngine.isPlaying && typeof window.SequencerEngine.patternChangeCallback === "function") {
                        window.SequencerEngine.patternChangeCallback();
                    }
                    execution_result_payload = {
                        success: pattern_successfully_found,
                        slot_number: target_memory_slot_number,
                        queued_for_next_bar: window.SequencerEngine.isPlaying
                    };
                } else {
                    execution_result_payload = { success: false, error: "Invalid slot number. Must be an integer between 1 and 9." };
                }
                break;
            }

            case "set_instrument_param": {
                // WHAT: Updates a single synthesizer parameter across one of the four instruments.
                // WHY:  Allows an AI agent to sculpt sound textures, filter cutoffs, envelopes, and modulation.
                const target_instrument_name = command_payload_object.instrument_name;
                const target_parameter_name = command_payload_object.param_name;
                const target_parameter_value = command_payload_object.param_value;

                if (target_instrument_name === "303" && window.AudioEngine) {
                    window.AudioEngine.setParam(target_parameter_name, target_parameter_value);

                    // Sync DOM slider / dropdown if present
                    const domestic_element_identifier_lookup = {
                        accentAmount: "accent-amount",
                        envMod: "env-mod",
                        wave: "wave-type",
                    };
                    const element_identifier_string = domestic_element_identifier_lookup[target_parameter_name] || target_parameter_name;
                    const corresponding_dom_element = document.getElementById(element_identifier_string);
                    if (corresponding_dom_element) {
                        corresponding_dom_element.value = target_parameter_value;
                    }
                    execution_result_payload = { success: true, instrument: "303", param: target_parameter_name, value: target_parameter_value };
                } else if (target_instrument_name === "moog" && window.GrandmotherEngine) {
                    if (target_parameter_name in window.GrandmotherEngine.timing) {
                        window.GrandmotherEngine.setTimingParam(target_parameter_name, target_parameter_value);
                    } else {
                        window.GrandmotherEngine.setParam(target_parameter_name, target_parameter_value);
                    }
                    execution_result_payload = { success: true, instrument: "moog", param: target_parameter_name, value: target_parameter_value };
                } else if (target_instrument_name === "monotron" && window.MonotronAudio) {
                    const monotron_method_lookup_dictionary = {
                        cutoff: "setCutoff",
                        resonance: "setPeak",
                        peak: "setPeak",
                        volume: "setVolume",
                        pitch: "setPitch",
                        vco1: "setVCO1Pitch",
                        vco2: "setVCO2Pitch",
                        xmod: "setXMod",
                        lforate: "setLFORate",
                        lfoint: "setLFOInt",
                        modtarget: "setModTarget",
                        lfowave: "setLFOWave",
                        delaytime: "setDelayTime",
                        feedback: "setDelayFeedback",
                        model: "setModel",
                    };
                    const normalized_key = target_parameter_name.toLowerCase();
                    const target_method_name = monotron_method_lookup_dictionary[normalized_key];
                    if (target_method_name && typeof window.MonotronAudio[target_method_name] === "function") {
                        window.MonotronAudio[target_method_name](target_parameter_value);
                        execution_result_payload = { success: true, instrument: "monotron", param: target_parameter_name, value: target_parameter_value };
                    } else {
                        execution_result_payload = { success: false, error: `Unrecognized Monotron parameter '${target_parameter_name}'.` };
                    }
                } else if (target_instrument_name === "sampler" && window.SamplerEngine) {
                    if (target_parameter_name === "selectedSlot") {
                        window.SamplerEngine.selectedSlot = parseInt(target_parameter_value, 10);
                    } else if (target_parameter_name === "patternIndex") {
                        window.SamplerEngine.patternIndex = parseInt(target_parameter_value, 10);
                    }
                    execution_result_payload = { success: true, instrument: "sampler", param: target_parameter_name, value: target_parameter_value };
                } else if ((target_instrument_name === "pedal" || target_instrument_name === "pedals") && window.PedalBoard) {
                    // WHAT: Handles pedal enable toggles and parameter adjustments.
                    // WHY:  Allows external agents to engage overdrive, delay, phaser, chorus, reverb, and tweak their parameters.
                    const parameter_tokens = target_parameter_name.split(":");
                    const pedal_identifier_string = parameter_tokens[0];
                    const specific_attribute_name = parameter_tokens[1] || "enabled";

                    if (specific_attribute_name === "enabled") {
                        const should_enable = Boolean(target_parameter_value);
                        window.PedalBoard.setPedalEnabled(pedal_identifier_string, should_enable);
                        const checkbox_element = document.getElementById(`pedal-${pedal_identifier_string}`);
                        if (checkbox_element) checkbox_element.checked = should_enable;
                    } else {
                        const numeric_parameter_value = parseFloat(target_parameter_value);
                        window.PedalBoard.setPedalParam(pedal_identifier_string, specific_attribute_name, numeric_parameter_value);
                        const pedal_row_element = document.querySelector(`.pedal-row[data-pedal="${pedal_identifier_string}"]`);
                        const slider_element = pedal_row_element?.querySelector(`.pedal-param-slider[data-param="${specific_attribute_name}"]`);
                        if (slider_element) slider_element.value = numeric_parameter_value;
                    }
                    execution_result_payload = { success: true, pedal: pedal_identifier_string, param: specific_attribute_name, value: target_parameter_value };
                } else {
                    execution_result_payload = { success: false, error: `Instrument '${target_instrument_name}' not found or not initialized.` };
                }
                break;
            }

            case "set_mode": {
                // WHAT: Switches layout and tempo between ACID mode and DRUM & BASS mode.
                // WHY:  Reconfigures sequencer step counts (16 vs 32) and layout arrangement.
                let normalized_mode_identifier = command_payload_object.mode_name;
                if (normalized_mode_identifier === "drum_and_bass") {
                    normalized_mode_identifier = "dnb";
                }

                if (window.Mode && typeof window.Mode.setMode === "function") {
                    window.Mode.setMode(normalized_mode_identifier);
                    const mode_dropdown_element = document.getElementById("mode-selector");
                    if (mode_dropdown_element) {
                        mode_dropdown_element.value = normalized_mode_identifier;
                    }
                    execution_result_payload = { success: true, mode: normalized_mode_identifier };
                } else {
                    execution_result_payload = { success: false, error: "Mode engine is not available." };
                }
                break;
            }

            case "set_pattern_sequence": {
                // WHAT: Arranges an ordered list of pattern entries in the KO-40 sampler sequence engine.
                // WHY:  Enables programmatic composition of full song arrangements.
                const sequence_entries_array = command_payload_object.sequence_entries;
                if (!Array.isArray(sequence_entries_array)) {
                    return { success: false, error: "sequence_entries must be an array." };
                }

                if (window.SamplerEngine) {
                    window.SamplerEngine.sequence = sequence_entries_array;

                    // Sync the textarea in the sampler UI and trigger live validation & pill rendering
                    const sequence_input_textarea_element = document.getElementById("sampler-seq-input");
                    if (sequence_input_textarea_element) {
                        sequence_input_textarea_element.value = JSON.stringify(sequence_entries_array, null, 2);
                        sequence_input_textarea_element.dispatchEvent(new Event("input"));
                    }
                    execution_result_payload = { success: true, entries_count: sequence_entries_array.length };
                } else {
                    execution_result_payload = { success: false, error: "SamplerEngine is not initialized." };
                }
                break;
            }

            case "transport_control": {
                // WHAT: Starts, stops, or toggles sequencer playback, and optionally adjusts the master tempo.
                // WHY:  Gives AI agents direct command over playback transport and timing.
                if (command_payload_object.bpm !== undefined && window.Clock) {
                    const sanitized_beats_per_minute = Math.max(60, Math.min(200, parseFloat(command_payload_object.bpm)));
                    window.Clock.setBpm(sanitized_beats_per_minute);
                    const tempo_input_element = document.getElementById("tempo");
                    if (tempo_input_element) {
                        tempo_input_element.value = sanitized_beats_per_minute;
                    }
                }

                if (command_payload_object.action && window.SequencerEngine) {
                    if (command_payload_object.action === "play") {
                        if (Tone && Tone.context.state !== "running") Tone.start();
                        window.SequencerEngine.start();
                    } else if (command_payload_object.action === "stop") {
                        window.SequencerEngine.stop();
                    } else if (command_payload_object.action === "toggle") {
                        if (Tone && Tone.context.state !== "running") Tone.start();
                        if (window.SequencerEngine.isPlaying) {
                            window.SequencerEngine.stop();
                        } else {
                            window.SequencerEngine.start();
                        }
                    }
                }

                execution_result_payload = {
                    success: true,
                    is_playing: window.SequencerEngine ? window.SequencerEngine.isPlaying : false,
                    bpm: window.Clock ? window.Clock.bpm : 120,
                };
                break;
            }

            case "get_current_state": {
                // WHAT: Returns a complete structural snapshot of the workstation's active state.
                // WHY:  Allows an AI agent to read context before calculating musical changes.
                execution_result_payload = {
                    transport: {
                        is_playing: window.SequencerEngine ? window.SequencerEngine.isPlaying : false,
                        bpm: window.Clock ? window.Clock.bpm : 120,
                        current_step: window.SequencerEngine ? window.SequencerEngine.currentStep : 0,
                    },
                    mode: window.Mode ? window.Mode.currentModeId : "acid",
                    tb303: {
                        parameters: window.AudioEngine ? window.AudioEngine.params : {},
                        active_grid_steps: window.SequencerEngine ? window.SequencerEngine.grid.slice(0, window.SequencerEngine.steps) : [],
                        saved_pattern_slots: window.SequencerEngine ? Object.keys(window.SequencerEngine.patterns) : [],
                    },
                    moog: {
                        is_drone_playing: window.GrandmotherEngine ? window.GrandmotherEngine.isPlaying : false,
                        parameters: window.GrandmotherEngine ? window.GrandmotherEngine.params : {},
                        timing_parameters: window.GrandmotherEngine ? window.GrandmotherEngine.timing : {},
                    },
                    monotron: {
                        base_frequency_hertz: window.MonotronAudio ? window.MonotronAudio.baseFreq : 440,
                    },
                    sampler: {
                        selected_slot_index: window.SamplerEngine ? window.SamplerEngine.selectedSlot : 0,
                        pattern_index: window.SamplerEngine ? window.SamplerEngine.patternIndex + 1 : 1,
                        is_sequencer_running: window.SamplerEngine ? window.SamplerEngine.isSequencerRunning : false,
                        sequence_mode_active: window.SamplerEngine ? window.SamplerEngine.sequenceModeActive : false,
                        sequence_entries: window.SamplerEngine ? window.SamplerEngine.sequence : [],
                    },
                };
                break;
            }

            default:
                execution_result_payload = { success: false, error: `Unrecognized command type: ${command_type_string}` };
                break;
        }

        return execution_result_payload;
    }

    // WHAT: Establishes a WebSocket connection to the local Node MCP server.
    // WHY:  Provides the communication pipe between the browser runtime and the MCP server.
    function initializeModelContextProtocolBrowserBridge() {
        try {
            active_browser_bridge_websocket_connection = new WebSocket(local_bridge_websocket_uniform_resource_locator);

            active_browser_bridge_websocket_connection.onopen = () => {
                if (!has_logged_successful_connection_notice) {
                    console.log("Connected to local TB-303-vibe MCP server bridge at " + local_bridge_websocket_uniform_resource_locator);
                    has_logged_successful_connection_notice = true;
                }
            };

            // WHAT: Processes incoming JSON tool commands and transmits responses back.
            // WHY:  Fulfills the request-response cycle required by the MCP protocol.
            active_browser_bridge_websocket_connection.onmessage = async (incoming_message_event) => {
                try {
                    const parsed_command_envelope = JSON.parse(incoming_message_event.data);
                    const execution_response_payload = executeIncomingModelContextProtocolCommand(
                        parsed_command_envelope.type,
                        parsed_command_envelope.payload
                    );

                    active_browser_bridge_websocket_connection.send(
                        JSON.stringify({
                            request_id: parsed_command_envelope.request_id,
                            payload: execution_response_payload,
                        })
                    );
                } catch (command_handling_error) {
                    console.error("Error executing MCP command:", command_handling_error);
                }
            };

            // WHAT: Gracefully handles socket closure without throwing uncaught errors.
            // WHY:  If the page is running on GitHub Pages or the local MCP server is stopped,
            //       this keeps the page running completely normally without spamming console errors.
            active_browser_bridge_websocket_connection.onclose = () => {
                active_browser_bridge_websocket_connection = null;
                // Retry quietly after 10 seconds in case the developer started node mcp-server.js after loading the page
                setTimeout(initializeModelContextProtocolBrowserBridge, 10000);
            };

            active_browser_bridge_websocket_connection.onerror = () => {
                // WHAT: Silent error handler.
                // WHY:  Prevents unhandled error alerts when running on GitHub Pages where no server is listening.
                if (active_browser_bridge_websocket_connection) {
                    active_browser_bridge_websocket_connection.close();
                }
            };
        } catch (connection_setup_error) {
            // Fails silently if WebSocket constructor throws (e.g. security restriction)
        }
    }

    // WHAT: Initializes the bridge once the DOM is fully constructed and instruments are mounted.
    // WHY:  Guarantees that global engines (AudioEngine, SequencerEngine, etc.) exist before accepting commands.
    if (document.readyState === "loading") {
        document.addEventListener("DOMContentLoaded", initializeModelContextProtocolBrowserBridge);
    } else {
        initializeModelContextProtocolBrowserBridge();
    }
})();
