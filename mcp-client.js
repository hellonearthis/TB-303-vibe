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
                    if (target_parameter_name === "drone" || target_parameter_name === "power" || target_parameter_name === "playing") {
                        const should_enable_drone = Boolean(target_parameter_value);
                        const drone_button_element = document.getElementById("btn-drone-toggle");
                        if (drone_button_element) {
                            if ((should_enable_drone && !window.GrandmotherEngine.isPlaying) || (!should_enable_drone && window.GrandmotherEngine.isPlaying)) {
                                drone_button_element.click();
                            }
                        } else {
                            if (should_enable_drone) window.GrandmotherEngine.startDrone();
                            else window.GrandmotherEngine.stopDrone();
                        }
                        execution_result_payload = { success: true, instrument: "moog", drone: window.GrandmotherEngine.isPlaying };
                    } else if (target_parameter_name in window.GrandmotherEngine.timing) {
                        window.GrandmotherEngine.setTimingParam(target_parameter_name, target_parameter_value);
                        execution_result_payload = { success: true, instrument: "moog", param: target_parameter_name, value: target_parameter_value };
                    } else {
                        window.GrandmotherEngine.setParam(target_parameter_name, target_parameter_value);
                        execution_result_payload = { success: true, instrument: "moog", param: target_parameter_name, value: target_parameter_value };
                    }
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
                    if (normalized_key === "noteon" || normalized_key === "trigger") {
                        const target_frequency_hertz = typeof target_parameter_value === "number"
                            ? target_parameter_value
                            : (window.Tone ? window.Tone.Frequency(target_parameter_value).toFrequency() : 440);
                        window.MonotronAudio.noteOn(target_frequency_hertz);
                        execution_result_payload = { success: true, instrument: "monotron", action: "noteOn", frequency: target_frequency_hertz };
                    } else if (normalized_key === "noteoff") {
                        window.MonotronAudio.noteOff();
                        execution_result_payload = { success: true, instrument: "monotron", action: "noteOff" };
                    } else if (normalized_key === "gate") {
                        if (target_parameter_value) {
                            window.MonotronAudio.noteOn();
                        } else {
                            window.MonotronAudio.noteOff();
                        }
                        execution_result_payload = { success: true, instrument: "monotron", gate: Boolean(target_parameter_value) };
                    } else if (target_method_name && typeof window.MonotronAudio[target_method_name] === "function") {
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

            case "run_pedal_jam": {
                // WHAT: Orchestrates a multi-stage, dynamic 60-second live performance.
                // WHY:  Rhythmically activates effect pedals, sweeps filters, adjusts delays, and rotates pattern slots.
                const total_duration_seconds = Math.max(10, Math.min(120, command_payload_object.duration_seconds || 60));

                if (window.Tone && window.Tone.context && window.Tone.context.state !== "running") {
                    window.Tone.start();
                }
                if (window.SequencerEngine && !window.SequencerEngine.isPlaying) {
                    window.SequencerEngine.start();
                }

                const helper_set_pedal = (pedal_name_key, is_enabled_state, param_name_key, param_value_amount) => {
                    if (window.PedalBoard) {
                        window.PedalBoard.setPedalEnabled(pedal_name_key, is_enabled_state);
                        const checkbox_element = document.getElementById(`pedal-${pedal_name_key}`);
                        if (checkbox_element) checkbox_element.checked = is_enabled_state;
                        if (param_name_key !== undefined && param_value_amount !== undefined) {
                            window.PedalBoard.setPedalParam(pedal_name_key, param_name_key, param_value_amount);
                            const row_element = document.querySelector(`.pedal-row[data-pedal="${pedal_name_key}"]`);
                            const slider_element = row_element?.querySelector(`.pedal-param-slider[data-param="${param_name_key}"]`);
                            if (slider_element) slider_element.value = param_value_amount;
                        }
                    }
                };

                const helper_set_synth = (parameter_name_key, parameter_value_amount) => {
                    if (window.AudioEngine) {
                        window.AudioEngine.setParam(parameter_name_key, parameter_value_amount);
                        const dom_input_identifier = parameter_name_key === "accentAmount" ? "accent-amount" : parameter_name_key === "envMod" ? "env-mod" : parameter_name_key;
                        const input_element = document.getElementById(dom_input_identifier);
                        if (input_element) input_element.value = parameter_value_amount;
                    }
                };

                let elapsed_seconds_counter = 0;
                const jam_interval_identifier = setInterval(() => {
                    elapsed_seconds_counter += 1;

                    // Continuous filter sweeps across the entire performance
                    const sweep_oscillation_factor = (Math.sin(elapsed_seconds_counter * 0.7) + 1) / 2;
                    helper_set_synth("cutoff", 0.15 + sweep_oscillation_factor * 0.65);

                    // Stage 1 (0-12s): Overdrive drive & Pattern 2
                    if (elapsed_seconds_counter === 1) {
                        window.SequencerEngine?.queuePattern(2);
                        helper_set_pedal("overdrive", true, "gain", 0.55);
                        helper_set_pedal("overdrive", true, "tone", 4000);
                        helper_set_synth("resonance", 0.65);
                    }

                    // Stage 2 (12-24s): Swirling Phaser & Pattern 4
                    if (elapsed_seconds_counter === 12) {
                        window.SequencerEngine?.queuePattern(4);
                        helper_set_pedal("phaser", true, "rate", 1.2);
                        helper_set_pedal("phaser", true, "depth", 0.8);
                        helper_set_synth("envMod", 0.8);
                    }

                    // Stage 3 (24-36s): Tape Delay Space Echo & Pattern 6
                    if (elapsed_seconds_counter === 24) {
                        window.SequencerEngine?.queuePattern(6);
                        helper_set_pedal("delay", true, "time", 0.32);
                        helper_set_pedal("delay", true, "feedback", 0.68);
                        helper_set_pedal("delay", true, "mix", 0.55);
                        helper_set_pedal("overdrive", false);
                    }

                    // Stage 4 (36-48s): Lush Stereo Chorus + Spring Reverb & Pattern 8
                    if (elapsed_seconds_counter === 36) {
                        window.SequencerEngine?.queuePattern(8);
                        helper_set_pedal("phaser", false);
                        helper_set_pedal("chorus", true, "rate", 2.0);
                        helper_set_pedal("chorus", true, "depth", 0.7);
                        helper_set_pedal("reverb", true, "decay", 3.5);
                        helper_set_pedal("reverb", true, "mix", 0.65);
                        helper_set_synth("resonance", 0.82);
                    }

                    // Stage 5 (48-56s): Peak Distortion Climax & Pattern 9
                    if (elapsed_seconds_counter === 48) {
                        window.SequencerEngine?.queuePattern(9);
                        helper_set_pedal("distortion", true, "gain", 0.78);
                        helper_set_pedal("distortion", true, "tone", 5500);
                        helper_set_pedal("delay", true, "feedback", 0.45);
                        helper_set_synth("cutoff", 0.9);
                    }

                    // Stage 6 (56-60s): Cooldown & Return to Pattern 1
                    if (elapsed_seconds_counter === 56) {
                        window.SequencerEngine?.queuePattern(1);
                        helper_set_pedal("distortion", false);
                        helper_set_pedal("chorus", false);
                        helper_set_pedal("overdrive", false);
                        helper_set_pedal("phaser", false);
                        helper_set_pedal("delay", true, "mix", 0.25);
                        helper_set_pedal("reverb", true, "mix", 0.35);
                        helper_set_synth("cutoff", 0.35);
                        helper_set_synth("resonance", 0.5);
                    }

                    if (elapsed_seconds_counter >= total_duration_seconds) {
                        clearInterval(jam_interval_identifier);
                    }
                }, 1000);

                execution_result_payload = {
                    success: true,
                    message: `Started 60-second automated pedalboard jam! Watch the pedalboard and synth knobs live in Firefox.`,
                    duration_seconds: total_duration_seconds
                };
                break;
            }

            case "play_monotron": {
                // WHAT: Performs an expressive, live synth lead on the Korg Monotron ribbon synth.
                // WHY:  Animates the visual ribbon touch indicator, automates MS-20 filter sweeps, and plays musical notes over the active beat.
                if (!window.MonotronAudio) {
                    return { success: false, error: "MonotronAudio engine is not initialized." };
                }

                if (window.Tone && window.Tone.context && window.Tone.context.state !== "running") {
                    window.Tone.start();
                }

                const total_solo_duration_seconds = Math.max(5, Math.min(60, command_payload_object.duration_seconds || 20));
                const chosen_model_name = command_payload_object.model || "duo";

                // Setup Monotron settings
                window.MonotronAudio.setModel(chosen_model_name);
                const model_select_element = document.getElementById("monotron-model");
                if (model_select_element) {
                    model_select_element.value = chosen_model_name;
                    model_select_element.dispatchEvent(new Event("change"));
                }

                window.MonotronAudio.setVolume(0.85);
                window.MonotronAudio.setCutoff(0.55);
                window.MonotronAudio.setPeak(0.65);
                if (chosen_model_name === "duo") {
                    window.MonotronAudio.setXMod(0.35);
                    window.MonotronAudio.setVCO2Pitch(0.4);
                } else if (chosen_model_name === "delay") {
                    window.MonotronAudio.setDelayTime(0.35);
                    window.MonotronAudio.setDelayFeedback(0.65);
                }

                // C minor pentatonic lead scale frequencies in Hz (C4, D#4, F4, G4, A#4, C5, D#5, F5)
                const lead_frequencies_array = [261.63, 311.13, 349.23, 392.00, 466.16, 523.25, 622.25, 698.46];
                const ribbon_touch_indicator_element = document.querySelector(".ribbon-touch-indicator");

                let solo_step_counter = 0;
                const solo_interval_milliseconds = 200; // 5 notes per second
                const total_number_of_ticks = (total_solo_duration_seconds * 1000) / solo_interval_milliseconds;

                // Start initial note
                window.MonotronAudio.noteOn(lead_frequencies_array[0]);

                const solo_interval_identifier = setInterval(() => {
                    solo_step_counter += 1;

                    // Play a new note or slide
                    if (Math.random() > 0.12) {
                        const random_note_index = Math.floor(Math.random() * lead_frequencies_array.length);
                        const target_frequency_hertz = lead_frequencies_array[random_note_index];
                        window.MonotronAudio.setPitch(target_frequency_hertz);

                        // Move visual ribbon touch indicator
                        if (ribbon_touch_indicator_element) {
                            const ribbon_percentage = (random_note_index / (lead_frequencies_array.length - 1)) * 90 + 5;
                            ribbon_touch_indicator_element.style.left = `${ribbon_percentage}%`;
                        }

                        // Re-trigger envelope rhythmically
                        if (solo_step_counter % 2 === 0) {
                            window.MonotronAudio.noteOn(target_frequency_hertz);
                        }
                    } else {
                        // Occasional staccato rest
                        window.MonotronAudio.noteOff();
                    }

                    // Dynamically sweep cutoff & X-mod
                    const cutoff_sweep_factor = (Math.sin(solo_step_counter * 0.25) + 1) / 2;
                    window.MonotronAudio.setCutoff(0.25 + cutoff_sweep_factor * 0.65);
                    if (chosen_model_name === "duo") {
                        window.MonotronAudio.setXMod(0.15 + (1 - cutoff_sweep_factor) * 0.5);
                    }

                    if (solo_step_counter >= total_number_of_ticks) {
                        clearInterval(solo_interval_identifier);
                        window.MonotronAudio.noteOff();
                        if (ribbon_touch_indicator_element) {
                            ribbon_touch_indicator_element.style.left = "50%";
                        }
                    }
                }, solo_interval_milliseconds);

                execution_result_payload = {
                    success: true,
                    message: `Playing Monotron ${chosen_model_name.toUpperCase()} lead solo for ${total_solo_duration_seconds} seconds!`,
                    duration_seconds: total_solo_duration_seconds,
                    model: chosen_model_name
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
