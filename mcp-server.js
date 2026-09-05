// WHAT: A Model Context Protocol (MCP) server that exposes TB-303-vibe's
//       pattern sequencer, synthesizer parameters, effects, and transport controls
//       to external artificial intelligence agents.
// WHY:  Enables an AI agent (Claude, Antigravity, GPT, etc.) to compose acid patterns,
//       shape analog synthesizer textures, arrange song sequences, and orchestrate live
//       performances by invoking structured tool calls instead of manually clicking DOM elements.
//
// ARCHITECTURE:
//   Tone.js and the Web Audio API require a browser environment to produce sound.
//   This server runs in Node.js and acts as an stdio-to-WebSocket bridge. It receives
//   tool invocations from an MCP client over standard input/output (stdio), correlates
//   them into JSON-RPC messages, and relays them over a local WebSocket (ws://localhost:8787)
//   to an active browser tab running the TB-303-vibe application.

import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
    CallToolRequestSchema,
    ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import { WebSocketServer } from "ws";

// WHAT: Defines the local network port where the browser tab connects.
// WHY:  A dedicated loopback port isolates the communication between Node and the browser.
const browser_bridge_network_port_number = 8787;

// WHAT: Instantiates the WebSocket server to accept incoming browser tab connections.
// WHY:  Enables two-way, asynchronous communication between the Node-based MCP server
//       and the client-side JavaScript audio runtime.
const browser_bridge_websocket_server = new WebSocketServer({
    port: browser_bridge_network_port_number,
});

// WHAT: Holds a reference to the single active browser WebSocket connection.
// WHY:  TB-303-vibe is designed as a single active studio workstation at a time.
let active_connected_browser_websocket = null;

// WHAT: Tracks pending asynchronous responses correlated by unique request identification numbers.
// WHY:  MCP tool executions are request-response promises, whereas WebSockets are duplex message streams.
//       This mapping ensures responses from the browser are routed back to the exact awaiting MCP tool call.
let next_request_identification_counter = 1;
const pending_response_resolvers_by_request_id_map = new Map();

// WHAT: Listens for incoming WebSocket connections from the TB-303-vibe browser application.
// WHY:  Captures the active socket handle so outgoing commands can be sent, and handles disconnection cleanly.
browser_bridge_websocket_server.on("connection", (incoming_browser_websocket_connection) => {
    active_connected_browser_websocket = incoming_browser_websocket_connection;
    console.error("TB-303-vibe browser tab successfully connected to the MCP bridge.");

    // WHAT: Listens for incoming message payloads sent back from the browser runtime.
    // WHY:  Resolves any pending tool call promises that match the incoming request identifier.
    incoming_browser_websocket_connection.on("message", (raw_message_buffer_data) => {
        try {
            const parsed_incoming_message = JSON.parse(raw_message_buffer_data.toString());
            const matching_response_resolver_function = pending_response_resolvers_by_request_id_map.get(
                parsed_incoming_message.request_id
            );

            if (matching_response_resolver_function) {
                pending_response_resolvers_by_request_id_map.delete(parsed_incoming_message.request_id);
                matching_response_resolver_function(parsed_incoming_message.payload);
            }
        } catch (message_parsing_error) {
            console.error("Failed to parse incoming WebSocket message from browser tab:", message_parsing_error);
        }
    });

    // WHAT: Handles browser tab disconnection and resets the active socket reference.
    // WHY:  Prevents sending messages to dead connections if the user closes or refreshes the page.
    incoming_browser_websocket_connection.on("close", () => {
        console.error("TB-303-vibe browser tab disconnected from the MCP bridge.");
        active_connected_browser_websocket = null;
    });

    incoming_browser_websocket_connection.on("error", (websocket_error) => {
        console.error("Browser bridge WebSocket encountered an error:", websocket_error);
    });
});

// WHAT: Sends a structured command message to the browser and waits for a corresponding response.
// WHY:  Wraps the asynchronous event-driven WebSocket transport into a Promise that the MCP tool handler can await.
function dispatchCommandToBrowserAndAwaitResponse(command_type_string, command_payload_object) {
    return new Promise((resolve_command_response, reject_command_response) => {
        if (!active_connected_browser_websocket) {
            reject_command_response(
                new Error("No active TB-303-vibe browser tab is currently connected to ws://localhost:8787.")
            );
            return;
        }

        const current_request_identification_number = next_request_identification_counter;
        next_request_identification_counter = next_request_identification_counter + 1;

        pending_response_resolvers_by_request_id_map.set(
            current_request_identification_number,
            resolve_command_response
        );

        const serialized_outgoing_message = JSON.stringify({
            request_id: current_request_identification_number,
            type: command_type_string,
            payload: command_payload_object,
        });

        active_connected_browser_websocket.send(serialized_outgoing_message);

        // WHAT: Establishes a five-second timeout safety mechanism.
        // WHY:  Prevents hanging tool calls in external AI agents if the browser crashes or fails to respond.
        const response_timeout_milliseconds = 5000;
        setTimeout(() => {
            if (pending_response_resolvers_by_request_id_map.has(current_request_identification_number)) {
                pending_response_resolvers_by_request_id_map.delete(current_request_identification_number);
                reject_command_response(
                    new Error(`Timed out after ${response_timeout_milliseconds}ms waiting for browser response to '${command_type_string}'.`)
                );
            }
        }, response_timeout_milliseconds);
    });
}

// WHAT: Declares the complete list of tools exposed to AI agents through the Model Context Protocol.
// WHY:  Provides explicit JSON schemas, descriptions, and valid ranges so agents know how to interact with the synth.
const model_context_protocol_tool_definitions_list = [
    {
        name: "set_303_pattern",
        description:
            "Write a full 16-step pattern to the TB-303 sequencer grid. Each step " +
            "may include a note (e.g. 'C3', 'D#3', 'G3', 'C4', or null for a rest), " +
            "an octave modifier (-1, 0, or 1), and booleans for tie, slide, accent, and ghost.",
        inputSchema: {
            type: "object",
            properties: {
                steps: {
                    type: "array",
                    minItems: 16,
                    maxItems: 16,
                    description: "An array containing exactly 16 step objects.",
                    items: {
                        type: "object",
                        properties: {
                            note: {
                                type: ["string", "null"],
                                description: "Note name between C3 and C4 (e.g. 'C3', 'D#3', 'G3', 'C4'), or null for rest.",
                            },
                            octave: {
                                type: "integer",
                                enum: [-1, 0, 1],
                                default: 0,
                                description: "Octave shift relative to scale pitch (-1 for down, 0 for neutral, 1 for up).",
                            },
                            octave_shift: {
                                type: "integer",
                                enum: [-1, 0, 1],
                                description: "Alias for octave.",
                            },
                            tie: {
                                type: "boolean",
                                default: false,
                                description: "True to sustain the previous step's note into this step without retriggering.",
                            },
                            slide: {
                                type: "boolean",
                                default: false,
                                description: "True to glide pitch into the following step (classic 303 portamento).",
                            },
                            accent: {
                                type: "boolean",
                                default: false,
                                description: "True to increase note volume and envelope attack intensity (mutually exclusive with ghost).",
                            },
                            ghost: {
                                type: "boolean",
                                default: false,
                                description: "True to attenuate note volume and cutoff depth (mutually exclusive with accent).",
                            },
                        },
                    },
                },
            },
            required: ["steps"],
        },
    },
    {
        name: "save_pattern_to_slot",
        description:
            "Save the current TB-303 sequencer grid into one of the 9 pattern memory slots (1 to 9).",
        inputSchema: {
            type: "object",
            properties: {
                slot_number: {
                    type: "integer",
                    minimum: 1,
                    maximum: 9,
                    description: "The memory slot number from 1 to 9.",
                },
            },
            required: ["slot_number"],
        },
    },
    {
        name: "recall_pattern_from_slot",
        description:
            "Load a saved pattern slot (1 to 9) into the active grid. When playing, the pattern changes at the start of the next 16-step cycle.",
        inputSchema: {
            type: "object",
            properties: {
                slot_number: {
                    type: "integer",
                    minimum: 1,
                    maximum: 9,
                    description: "The memory slot number to recall from (1 to 9).",
                },
            },
            required: ["slot_number"],
        },
    },
    {
        name: "set_instrument_param",
        description:
            "Set a synthesizer or effect parameter on one of the four instruments in the rack (303, moog, monotron, or sampler).",
        inputSchema: {
            type: "object",
            properties: {
                instrument_name: {
                    type: "string",
                    enum: ["303", "moog", "monotron", "sampler", "pedal"],
                    description: "Target instrument module or effect pedals.",
                },
                param_name: {
                    type: "string",
                    description:
                        "Parameter name. For 303: 'cutoff', 'resonance', 'envMod', 'decay', 'accentAmount', 'tuning', 'volume', 'wave' ('sawtooth'|'square'). " +
                        "For moog: 'cutoff', 'resonance', 'reverb', 'volume', 'detune', 'noiseLevel', 'attack', 'decay', 'sustain', 'release', 'modWheel', 'modRate', 'modWave', 'modTarget', 'shRate', 'shDepth', 'clockMode'. " +
                        "For monotron: 'cutoff', 'peak', 'volume', 'vco1', 'vco2', 'xmod', 'lforate', 'lfoint', 'modtarget', 'delaytime', 'feedback', 'model'. " +
                        "For sampler: 'selectedSlot', 'patternIndex'.",
                },
                param_value: {
                    type: ["number", "string", "boolean"],
                    description: "Normalized value (usually 0.0 to 1.0), enum string, or boolean.",
                },
            },
            required: ["instrument_name", "param_name", "param_value"],
        },
    },
    {
        name: "set_mode",
        description:
            "Switch the workstation configuration mode between ACID (16 steps, 120 BPM, 303 focus) and DRUM & BASS (32 steps, 172 BPM, sampler focus).",
        inputSchema: {
            type: "object",
            properties: {
                mode_name: {
                    type: "string",
                    enum: ["acid", "dnb", "drum_and_bass"],
                    description: "The mode identifier to activate ('acid' or 'dnb').",
                },
            },
            required: ["mode_name"],
        },
    },
    {
        name: "set_pattern_sequence",
        description:
            "Program an arrangement of saved patterns into the KO-40 sampler sequence editor. Each entry can define pattern number, repeat count, semitone transpose, mute, and BPM override.",
        inputSchema: {
            type: "object",
            properties: {
                sequence_entries: {
                    type: "array",
                    description: "Ordered array of sequence entry objects.",
                    items: {
                        type: "object",
                        properties: {
                            pattern: {
                                type: "integer",
                                minimum: 1,
                                maximum: 16,
                                description: "Pattern number (1 to 16).",
                            },
                            repeat: {
                                type: "integer",
                                minimum: 1,
                                default: 1,
                                description: "Number of times to loop this pattern before advancing.",
                            },
                            transpose: {
                                type: "integer",
                                default: 0,
                                description: "Semitone transposition offset.",
                            },
                            mute: {
                                type: "boolean",
                                default: false,
                                description: "Whether playback of this pattern entry is muted.",
                            },
                            bpm: {
                                type: "integer",
                                minimum: 60,
                                maximum: 200,
                                description: "Optional tempo override for this pattern entry.",
                            },
                        },
                        required: ["pattern"],
                    },
                },
            },
            required: ["sequence_entries"],
        },
    },
    {
        name: "transport_control",
        description:
            "Control playback transport (play, stop, or toggle) and optionally set the master tempo in BPM.",
        inputSchema: {
            type: "object",
            properties: {
                action: {
                    type: "string",
                    enum: ["play", "stop", "toggle"],
                    description: "Playback transport command to execute.",
                },
                bpm: {
                    type: "number",
                    minimum: 60,
                    maximum: 200,
                    description: "Master tempo in beats per minute.",
                },
            },
        },
    },
    {
        name: "get_current_state",
        description:
            "Read back the complete operational state of the rack: active transport status, tempo, mode, TB-303 grid and sound settings, Moog drone status, and sampler sequence information.",
        inputSchema: {
            type: "object",
            properties: {},
        },
    },
];

// WHAT: Instantiates the Model Context Protocol server instance.
// WHY:  Declares protocol capabilities and registers handlers for tool listing and execution.
const model_context_protocol_server_instance = new Server(
    {
        name: "tb-303-vibe",
        version: "0.2.0",
    },
    {
        capabilities: {
            tools: {},
        },
    }
);

// WHAT: Handles the ListTools request from the MCP client.
// WHY:  Provides the AI agent with the tool catalogue and parameter schemas.
model_context_protocol_server_instance.setRequestHandler(ListToolsRequestSchema, async () => {
    return {
        tools: model_context_protocol_tool_definitions_list,
    };
});

// WHAT: Handles CallTool requests by routing the tool invocation across the WebSocket bridge.
// WHY:  Executes the tool remotely in the browser audio engine and packages the response for the agent.
model_context_protocol_server_instance.setRequestHandler(CallToolRequestSchema, async (incoming_call_request_object) => {
    const requested_tool_name_string = incoming_call_request_object.params.name;
    const requested_tool_arguments_object = incoming_call_request_object.params.arguments || {};

    try {
        const browser_execution_response_payload = await dispatchCommandToBrowserAndAwaitResponse(
            requested_tool_name_string,
            requested_tool_arguments_object
        );

        return {
            content: [
                {
                    type: "text",
                    text: JSON.stringify(browser_execution_response_payload, null, 2),
                },
            ],
        };
    } catch (tool_execution_error) {
        return {
            isError: true,
            content: [
                {
                    type: "text",
                    text: `Error executing tool '${requested_tool_name_string}': ${tool_execution_error.message}`,
                },
            ],
        };
    }
});

// WHAT: Connects the MCP server to standard input and output streams.
// WHY:  Allows desktop AI tools like Claude Desktop, Antigravity IDE, and Cursor to launch and communicate with this process.
const standard_input_output_server_transport = new StdioServerTransport();
await model_context_protocol_server_instance.connect(standard_input_output_server_transport);

console.error(`TB-303-vibe MCP server operational on stdio. Browser WebSocket bridge listening on ws://localhost:${browser_bridge_network_port_number}`);
