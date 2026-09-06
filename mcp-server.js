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

// WHAT: Tracks whether the process has already initiated shutdown.
// WHY:  Prevents race conditions or multiple shutdown sequences from colliding when multiple exit events fire simultaneously.
let is_graceful_shutdown_already_in_progress = false;

// WHAT: Gracefully shuts down all network listeners, client connections, and terminates the Node process.
// WHY:  When the parent MCP client (Antigravity IDE, Claude Desktop, etc.) exits or closes its stdio stream,
//       this function guarantees that port 8787 is immediately released and no orphaned background process is left running.
function initiateGracefulServerShutdown(shutdown_trigger_reason_description) {
    if (is_graceful_shutdown_already_in_progress) {
        return;
    }
    is_graceful_shutdown_already_in_progress = true;

    console.error(`Initiating graceful TB-303-vibe MCP server shutdown. Reason: ${shutdown_trigger_reason_description}`);

    // WHAT: Establish a forced termination safety timeout of 1000 milliseconds.
    // WHY:  If any socket handle hangs or fails to close promptly during teardown, this guarantees
    //       that the Node.js operating system process definitely exits and does not linger as a zombie.
    const forced_termination_safety_timeout_milliseconds = 1000;
    const forced_termination_safety_timeout_handle = setTimeout(() => {
        console.error("Forced termination safety timeout reached; exiting Node.js process immediately.");
        process.exit(0);
    }, forced_termination_safety_timeout_milliseconds);

    if (typeof forced_termination_safety_timeout_handle.unref === "function") {
        forced_termination_safety_timeout_handle.unref();
    }

    // WHAT: Terminate all active browser WebSocket client connections.
    // WHY:  Informs any connected browser tabs that the bridge is closing so their sockets reset cleanly.
    if (browser_bridge_websocket_server && browser_bridge_websocket_server.clients) {
        for (const active_connected_client_websocket of browser_bridge_websocket_server.clients) {
            try {
                active_connected_client_websocket.terminate();
            } catch (socket_termination_error) {
                console.error("Error terminating active browser client socket during shutdown:", socket_termination_error);
            }
        }
    }

    // WHAT: Closes the WebSocket server listening socket.
    // WHY:  Immediately unbinds port 8787 so the operating system can reassign it without conflict.
    if (browser_bridge_websocket_server) {
        browser_bridge_websocket_server.close(() => {
            console.error("WebSocket server listener on port 8787 successfully closed.");
            process.exit(0);
        });
    } else {
        process.exit(0);
    }
}

// WHAT: Handles network listener errors on the WebSocket server itself (e.g. port already bound).
// WHY:  If another process is already listening on port 8787, this prevents an unhandled exception crash
//       and provides clear, actionable diagnostic guidance to the developer.
browser_bridge_websocket_server.on("error", (websocket_server_network_error) => {
    if (websocket_server_network_error.code === "EADDRINUSE") {
        console.error(
            `\n[PORT CONFLICT ERROR] Port ${browser_bridge_network_port_number} is already in use by another running process.\n` +
            `This usually occurs if an earlier instance of 'mcp-server.js' was not closed cleanly.\n` +
            `To resolve this, find the process holding port ${browser_bridge_network_port_number} ` +
            `(e.g. run 'Get-NetTCPConnection -LocalPort ${browser_bridge_network_port_number}' in PowerShell) ` +
            `and terminate it before restarting.\n`
        );
    } else {
        console.error("WebSocket server encountered an unhandled network error:", websocket_server_network_error);
    }
    process.exit(1);
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
            "Program the 16-step pattern. Accepts compact tracker string ('C3:a - G3:s C4:as+') or 16 step objects/strings. Modifiers: :a (accent), :s (slide), :t (tie), :g (ghost), :+ / :- (octave). '-' or '.' is rest.",
        inputSchema: {
            type: "object",
            properties: {
                pattern: {
                    type: "string",
                    description: "Compact tracker string of 16 steps (e.g. 'C3:a - G3:s C4:as+ - F3 F#3:s G3:as - A#3:a G3:g C4:as+ C3 - D#3:s F3:a').",
                },
                steps: {
                    type: "array",
                    description: "Array of 16 step objects (with note, octave, slide, accent, tie, ghost) or token strings.",
                    items: {
                        type: ["object", "string"],
                    },
                },
            },
        },
    },
    {
        name: "batch_set_params",
        description:
            "Atomically set multiple synth and pedal parameters in one request. Example: {'303': {'cutoff': 0.6, 'resonance': 0.8}, 'pedals': {'overdrive:enabled': true, 'overdrive:gain': 0.7}}.",
        inputSchema: {
            type: "object",
            properties: {
                parameters: {
                    type: "object",
                    description: "Map of instrument/pedal names ('303', 'moog', 'monotron', 'sampler', 'pedals') to parameter objects.",
                },
            },
            required: ["parameters"],
        },
    },
    {
        name: "save_pattern_to_slot",
        description: "Save active grid to memory slot (1-9).",
        inputSchema: {
            type: "object",
            properties: {
                slot_number: {
                    type: "integer",
                    minimum: 1,
                    maximum: 9,
                    description: "Memory slot number 1-9.",
                },
            },
            required: ["slot_number"],
        },
    },
    {
        name: "recall_pattern_from_slot",
        description: "Recall pattern from memory slot (1-9). Queues on next bar if playing.",
        inputSchema: {
            type: "object",
            properties: {
                slot_number: {
                    type: "integer",
                    minimum: 1,
                    maximum: 9,
                    description: "Memory slot number 1-9.",
                },
            },
            required: ["slot_number"],
        },
    },
    {
        name: "set_instrument_param",
        description: "Set a single synth or effect parameter across '303', 'moog', 'monotron', 'sampler', or 'pedals'. For multiple params, use batch_set_params instead.",
        inputSchema: {
            type: "object",
            properties: {
                instrument_name: {
                    type: "string",
                    enum: ["303", "moog", "monotron", "sampler", "pedals", "pedal"],
                    description: "Target instrument or effect pedals.",
                },
                param_name: {
                    type: "string",
                    description: "Parameter name (e.g. 'cutoff', 'resonance', 'wave', 'overdrive:gain').",
                },
                param_value: {
                    type: ["number", "string", "boolean"],
                    description: "Target value (normalized 0.0-1.0, string, or boolean).",
                },
            },
            required: ["instrument_name", "param_name", "param_value"],
        },
    },
    {
        name: "set_mode",
        description: "Switch workstation mode between 'acid' (16 steps, 120 BPM) and 'dnb' (32 steps, 172 BPM).",
        inputSchema: {
            type: "object",
            properties: {
                mode_name: {
                    type: "string",
                    enum: ["acid", "dnb", "drum_and_bass"],
                    description: "Mode identifier ('acid' or 'dnb').",
                },
            },
            required: ["mode_name"],
        },
    },
    {
        name: "set_pattern_sequence",
        description: "Program KO-40 sampler pattern arrangement with pattern index, repeat, transpose, mute, and bpm overrides.",
        inputSchema: {
            type: "object",
            properties: {
                sequence_entries: {
                    type: "array",
                    description: "Array of sequence objects: [{ pattern: 1, repeat: 2, transpose: 0, mute: false, bpm: 120 }].",
                    items: {
                        type: "object",
                        properties: {
                            pattern: { type: "integer", minimum: 1, maximum: 16 },
                            repeat: { type: "integer", minimum: 1, default: 1 },
                            transpose: { type: "integer", default: 0 },
                            mute: { type: "boolean", default: false },
                            bpm: { type: "integer", minimum: 60, maximum: 200 },
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
        description: "Control playback transport ('play', 'stop', 'toggle') and optional BPM tempo.",
        inputSchema: {
            type: "object",
            properties: {
                action: {
                    type: "string",
                    enum: ["play", "stop", "toggle"],
                    description: "Playback transport command.",
                },
                bpm: {
                    type: "number",
                    minimum: 60,
                    maximum: 200,
                    description: "Master tempo in BPM (60-200).",
                },
            },
        },
    },
    {
        name: "run_pedal_jam",
        description: "Launch automated 60s live jam sweeping pedals (overdrive, phaser, delay, chorus, reverb, distortion) and synth filters.",
        inputSchema: {
            type: "object",
            properties: {
                duration_seconds: {
                    type: "integer",
                    minimum: 10,
                    maximum: 120,
                    default: 60,
                    description: "Duration in seconds.",
                },
            },
        },
    },
    {
        name: "play_monotron",
        description: "Perform live solo on Korg Monotron analog ribbon synth with filter sweeps and ribbon slides.",
        inputSchema: {
            type: "object",
            properties: {
                duration_seconds: {
                    type: "integer",
                    minimum: 5,
                    maximum: 60,
                    default: 20,
                    description: "Duration in seconds.",
                },
                model: {
                    type: "string",
                    enum: ["duo", "delay", "classic"],
                    default: "duo",
                    description: "Monotron model ('duo' or 'delay').",
                },
            },
        },
    },
    {
        name: "get_current_state",
        description: "Read operational state. Defaults to a token-efficient 1-line summary (~25 tokens). Use scope for targeted data or 'all' for raw JSON.",
        inputSchema: {
            type: "object",
            properties: {
                scope: {
                    type: "string",
                    enum: ["summary", "303", "transport", "moog", "sampler", "all"],
                    default: "summary",
                    description: "Detail level: 'summary' (default, 1-line text status), '303', 'transport', 'moog', 'sampler', or 'all'.",
                },
            },
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

        // WHAT: Formats tool response concisely, avoiding multi-line whitespace token bloat.
        // WHY:  Returning raw strings or minified JSON prevents re-sending thousands of useless newline and indent tokens on every turn.
        let formatted_response_text_content = "";
        if (typeof browser_execution_response_payload === "string") {
            formatted_response_text_content = browser_execution_response_payload;
        } else if (browser_execution_response_payload && typeof browser_execution_response_payload.summary === "string") {
            formatted_response_text_content = browser_execution_response_payload.summary;
        } else {
            formatted_response_text_content = JSON.stringify(browser_execution_response_payload);
        }

        return {
            content: [
                {
                    type: "text",
                    text: formatted_response_text_content,
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

// WHAT: Attaches closure callback to the stdio transport and server instance.
// WHY:  If the MCP client protocol layer closes gracefully, we trigger full server teardown.
standard_input_output_server_transport.onclose = () => {
    initiateGracefulServerShutdown("MCP StdioServerTransport reported connection closed");
};

model_context_protocol_server_instance.onclose = () => {
    initiateGracefulServerShutdown("MCP Server instance reported connection closed");
};

// WHAT: Monitors standard input stream closure and end-of-file (EOF) events.
// WHY:  When the parent application (IDE or desktop client) exits, the operating system closes the stdio pipe.
//       By detecting the end of the standard input stream, we trigger a clean shutdown immediately.
process.stdin.on("end", () => {
    initiateGracefulServerShutdown("Parent process closed standard input stream (EOF encountered)");
});

process.stdin.on("close", () => {
    initiateGracefulServerShutdown("Standard input stream closed by parent process");
});

// WHAT: Resumes standard input stream data flow.
// WHY:  Ensures that EOF events ('end' and 'close') are properly emitted even if the MCP transport finishes reading.
process.stdin.resume();

// WHAT: Listens for operating system process termination signals.
// WHY:  Ensures that when a user presses Ctrl+C, closes the terminal window, or sends a termination request,
//       the server performs an orderly cleanup rather than leaving port 8787 bound.
const operating_system_termination_signals_list = ["SIGINT", "SIGTERM", "SIGBREAK", "SIGHUP"];

for (const operating_system_signal_name of operating_system_termination_signals_list) {
    process.on(operating_system_signal_name, () => {
        initiateGracefulServerShutdown(`Received operating system signal: ${operating_system_signal_name}`);
    });
}

// WHAT: Establishes a parent process liveness watchdog.
// WHY:  On Windows, if a parent IDE process is forcibly terminated or crashes unexpectedly without closing stdio pipes,
//       the child process could theoretically be orphaned. This heartbeat periodically verifies that the parent PID is alive.
const parent_process_identification_number = process.ppid;

if (parent_process_identification_number && parent_process_identification_number > 1) {
    const parent_process_liveness_check_interval_milliseconds = 2500;
    const parent_process_watchdog_interval_handle = setInterval(() => {
        try {
            // WHAT: Sending signal 0 performs an existence check without actually killing the target process.
            // WHY:  Allows us to confirm the parent IDE is still running in the operating system task list.
            process.kill(parent_process_identification_number, 0);
        } catch (parent_process_lookup_error) {
            // WHAT: Detects if the error code indicates the process no longer exists.
            // WHY:  If the parent PID vanished, we must shut down to avoid remaining as a zombie process.
            if (parent_process_lookup_error.code === "ESRCH") {
                initiateGracefulServerShutdown(
                    `Parent process (PID ${parent_process_identification_number}) has terminated or exited`
                );
            }
        }
    }, parent_process_liveness_check_interval_milliseconds);

    if (typeof parent_process_watchdog_interval_handle.unref === "function") {
        parent_process_watchdog_interval_handle.unref();
    }
}
