# Model Context Protocol (MCP) Integration for TB-303-vibe

This document explains the Model Context Protocol (MCP) architecture implemented in **TB-303-vibe**, allowing AI agents (Claude, Antigravity, GPT, Cursor, etc.) to program acid patterns, sculpt synthesizer parameters, arrange sampler sequences, and perform live jams directly through structured tool calls.

---

## 1. Architecture Overview

Tone.js and the Web Audio API require a web browser environment to synthesize and output audio. However, MCP clients (like Claude Desktop or Antigravity IDE) communicate with MCP servers running in a Node.js process over standard input/output (`stdio`).

To bridge this gap cleanly, TB-303-vibe uses a lightweight **stdio-to-WebSocket bridge**:

```
┌───────────────────────────────┐
│         AI Assistant          │
│ (Claude / Antigravity / LLM)  │
└──────────────┬────────────────┘
               │  stdio (JSON-RPC)
               ▼
┌───────────────────────────────┐
│         mcp-server.js         │  <-- Node.js process
│ (Model Context Protocol Host) │
└──────────────┬────────────────┘
               │  ws://localhost:8787
               ▼
┌───────────────────────────────┐
│         mcp-client.js         │  <-- Browser client script
│    (index.html in Firefox)    │
│  Tone.js / AudioEngines / DOM │
└───────────────────────────────┘
```

1. **Node Server ([`mcp-server.js`](file:///c:/Users/Desktop-Dev/Desktop/303/mcp-server.js))**:
   * Communicates with the AI agent over `stdio` using `@modelcontextprotocol/sdk`.
   * Listens for browser WebSocket connections on `ws://localhost:8787`.
   * Correlates incoming tool requests and outgoing browser responses using unique `request_id` values with a 5-second timeout safety mechanism.
2. **Browser Client ([`mcp-client.js`](file:///c:/Users/Desktop-Dev/Desktop/303/mcp-client.js))**:
   * Automatically connects to `ws://localhost:8787` on page load.
   * Dispatches incoming commands to live singleton engines: [`window.SequencerEngine`](file:///c:/Users/Desktop-Dev/Desktop/303/sequencer.js#L329), [`window.AudioEngine`](file:///c:/Users/Desktop-Dev/Desktop/303/audio.js#L177), [`window.GrandmotherEngine`](file:///c:/Users/Desktop-Dev/Desktop/303/grandmother-audio.js#L344), [`window.MonotronAudio`](file:///c:/Users/Desktop-Dev/Desktop/303/monotron-audio.js#L249), [`window.SamplerEngine`](file:///c:/Users/Desktop-Dev/Desktop/303/sampler.js#L488), [`window.PedalBoard`](file:///c:/Users/Desktop-Dev/Desktop/303/core/pedalboard.js), [`window.Mode`](file:///c:/Users/Desktop-Dev/Desktop/303/core/mode.js#L95), and [`window.Clock`](file:///c:/Users/Desktop-Dev/Desktop/303/core/clock.js#L95).
   * Animates DOM controls (piano-roll grid cells, sliders, checkboxes, and the ribbon indicator) in real time.
3. **GitHub Pages Safety**:
   * The client bridge handles failed connection attempts silently.
   * If the project is visited on GitHub Pages without a local MCP server running, the script sits dormant without console spam, popups, or audio interruptions.

---

## 2. Available MCP Tools

| Tool Name | Parameters | Description |
| :--- | :--- | :--- |
| **`set_303_pattern`** | `pattern: string` or `steps: Array` | Writes 16 steps into the 303 grid. Supports ultra-compact tracker strings (e.g. `"C3:a - G3:s C4:as+"`) or legacy step objects. |
| **`batch_set_params`** | `parameters: Object` | Atomically sets multiple parameters across instruments and pedals in a single turn. |
| **`save_pattern_to_slot`** | `slot_number: 1–9` | Saves active 303 pattern into memory slot 1–9. |
| **`recall_pattern_from_slot`**| `slot_number: 1–9` | Loads saved pattern from memory slots 1–9 (queues on barline if playing). |
| **`set_instrument_param`** | `instrument_name`, `param_name`, `param_value` | Sets a single parameter on `'303'`, `'moog'`, `'monotron'`, `'sampler'`, or `'pedals'`. |
| **`set_mode`** | `mode_name: 'acid' \| 'dnb'` | Switches workstation between **ACID** (16 steps, 120 BPM) and **DRUM & BASS** (32 steps, 172 BPM). |
| **`set_pattern_sequence`** | `sequence_entries: Array` | Arranges saved patterns into a song sequence in the KO-40 sampler editor. |
| **`transport_control`** | `action: 'play' \| 'stop' \| 'toggle'`, `bpm` (optional) | Controls playback transport and sets master tempo in BPM (60–200). |
| **`run_pedal_jam`** | `duration_seconds: 10–120` | Launches a live automated performance across all 6 pedal modules. |
| **`play_monotron`** | `duration_seconds`, `model: 'duo' \| 'delay'` | Performs an expressive analog synth solo on the Korg Monotron. |
| **`get_current_state`** | `scope: 'summary' \| '303' \| 'transport' \| 'moog' \| 'sampler' \| 'all'` | Inspects rack state. Defaults to a concise 1-line text summary (~25 tokens). |

---

### Compact Tracker Notation (Token Optimizer)
Instead of 16 verbose JSON objects (~600 tokens), `set_303_pattern` accepts a single high-density string (~35 tokens, **94% savings**):
```
"C3:a - G3:s C4:as+ - F3 F#3:s G3:as - A#3:a G3:g C4:as+ C3 - D#3:s F3:a"
```
* Note names: `C3`, `D#3`, `G3`, `C4`, etc.
* Rests: `-` or `.`
* Modifiers:
  * `:a` Accent
  * `:s` Slide
  * `:t` Tie
  * `:g` Ghost
  * `:+` / `:-` Octave Shift (+1 / -1)

---

### Atomic Batch Patching (`batch_set_params`)
Instead of 6 individual sequential tool calls, configure an entire sound patch in 1 turn:
```json
{
  "parameters": {
    "303": { "cutoff": 0.45, "resonance": 0.82, "envMod": 0.7, "wave": "sawtooth" },
    "pedals": { "overdrive:enabled": true, "overdrive:gain": 0.65, "delay:mix": 0.3 }
  }
}
```


---

## 3. Configuration & Setup

### Quick Start
1. Install dependencies (Node.js 18+ required):
   ```bash
   npm install
   ```
2. Start the MCP server:
   ```bash
   node mcp-server.js
   ```
3. Open [`index.html`](file:///c:/Users/Desktop-Dev/Desktop/303/index.html) in your browser (Chrome, Firefox, Edge, or Brave). Click anywhere on the page to initialize the browser's Web Audio context.

---

### Configuring Your AI Client

#### Option 1: Antigravity IDE
Add the server definition to `~/.gemini/config/mcp_config.json`:
```json
{
  "mcpServers": {
    "tb303": {
      "command": "node",
      "args": ["c:/Users/Desktop-Dev/Desktop/303/mcp-server.js"]
    }
  }
}
```

#### Option 2: Claude Desktop
Open `%APPDATA%\Claude\claude_desktop_config.json` (Windows) or `~/Library/Application Support/Claude/claude_desktop_config.json` (macOS):
```json
{
  "mcpServers": {
    "tb303": {
      "command": "node",
      "args": ["c:/path/to/303/mcp-server.js"]
    }
  }
}
```

#### Option 3: Cursor / Windsurf / Cline
Add a new MCP server in settings with:
* **Name**: `tb303`
* **Transport**: `stdio`
* **Command**: `node`
* **Arguments**: `["c:/path/to/303/mcp-server.js"]`

---

## 4. Example AI Prompts

Once configured, you can talk to your AI assistant using natural language:

* **Compose Basslines**:
  > *"Program a classic Phuture-style 303 acid pattern in C minor. Add rolling slides on steps 3, 7, and 11, heavy accents on the downbeats, and save it to pattern slot 2."*

* **Tweak Synth Hardware**:
  > *"Switch the 303 to a square wave, push resonance to 85%, and set cutoff to 35%."*

* **Perform a Live Solo**:
  > *"Play a 30-second Monotron DUO solo with heavy X-MOD modulation over the current beat."*

* **Automate the Pedalboard**:
  > *"Run a 60-second live pedal jam sweeping through overdrive, phaser, tape echo, and distortion."*

* **Switch Genres**:
  > *"Switch the rack to Drum & Bass mode at 174 BPM and arrange a 4-bar sequence on the sampler."*

---

## 5. Process Lifecycle & Port Management

The MCP server runs as a background child process spawned by your AI client over `stdio`. To prevent orphaned background processes and `EADDRINUSE` port conflicts on port 8787:

1. **Automatic Parent Stream Teardown**: When the AI client (Antigravity IDE, Claude Desktop, Cursor) exits, its `stdio` stream closes. The server detects `stdin` EOF (`end` and `close`) and initiates immediate graceful shutdown.
2. **Heartbeat Watchdog**: On Windows, child processes can occasionally be orphaned if a parent process terminates abruptly. A heartbeat watchdog continuously checks parent process liveness (`process.kill(ppid, 0)`), automatically exiting if the parent IDE terminates.
3. **Graceful Socket Teardown**: On shutdown, all connected browser WebSocket clients are terminated and the TCP server on port 8787 is closed within 1000ms.
4. **Port Conflict (`EADDRINUSE`) Guard**: If port 8787 is occupied by a previously lingering process, the server catches the network error cleanly, displays diagnostic PowerShell recovery commands, and exits without an unhandled crash.

---

## 6. Troubleshooting

* **Sound doesn't play immediately**:
  Modern browsers block audio until the user interacts with the page. Click the **PLAY** button or click anywhere on the interface once to authorize Web Audio.
* **"Timed out waiting for browser response"**:
  Ensure that [`index.html`](file:///c:/Users/Desktop-Dev/Desktop/303/index.html) is currently open in an active browser tab on the same machine.
* **"Instrument 'X' not found"**:
  If you recently updated `mcp-client.js`, perform a hard refresh in your browser (`Ctrl + F5` or `Cmd + Shift + R`) to ensure the latest client code is loaded.
* **"Port 8787 already in use (EADDRINUSE)"**:
  If a previous process is holding port 8787 open, check the occupying PID with:
  ```powershell
  Get-NetTCPConnection -LocalPort 8787 | Select-Object OwningProcess, State
  ```
  Terminate the lingering PID:
  ```powershell
  Stop-Process -Id <PID>
  ```
