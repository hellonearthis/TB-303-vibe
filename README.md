# TB-303 Web Emulator

A web-based Roland TB-303-inspired bass synthesizer built with Vanilla JavaScript and Tone.js. It models the original monophonic workflow, intermediate-slope resonant filter character, accent response, slides, and 16-step sequencing while retaining several clearly marked modern extensions.

This project also includes a small rack of extra panels that integrate with the 303:

- KO–40 Micro Sampler (records from mic or resamples the 303)
- KORG monotron (Original / Duo / Delay models, plus optional 303 external input routing)
- Moog Grandmother drone synth (plus optional 303 input routing)

## AI Collaboration & GPT-5.6

This project was built with the assistance of advanced AI pair programming. Utilizing **GPT-5.6** made it incredibly easy to rapidly prototype and add new features to the virtual rack. Furthermore, GPT-5.6 significantly improved the underlying DSP and Vanilla JS code, refining the complex analog filter models and envelope interactions to make the instruments sound far more authentic and true to the quirky original hardware.

## Codebase Guidelines (Agent Rules)

This project enforces strict coding rules for all contributors, especially AI assistants:
1. **The "can_be_long" Protocol:** Variables must use highly descriptive, unabbreviated names (e.g., no `i` or `tmp`), often including their structural type (e.g., `event_object`, `element_node`).
2. **The Tutorial Protocol:** Every function and logic branch must have a `// WHAT:` and `// WHY:` comment written in a friendly, instructional tone.

## Features

- **Authentic Signal Flow**: Sawtooth/Square oscillator running through a heavily resonant lowpass filter with custom envelope modulation and decay controls.
- **Tone.js Audio Engine**: Utilizes Tone.js for high-precision scheduling, DSP effects (distortion/saturation), and perfect sync.
- **Grid-Style Sequencer**: An intuitive, modern piano-roll grid replacing the archaic original input method while retaining the strict 16-step monophonic behavior.
- **Pattern Memory**: Save and recall up to 9 patterns on the fly using the number row on your keyboard (`1-9`).
- **Expressive Step Controls**: Dedicated programming rows for the legendary 303 Slide and Accent mechanics.

---

## The 303 Magic: Slides and Accents

What makes a 303 sound like a 303 isn't just the raw oscillator—it's how the sequencer interacts directly with the analog circuitry through Slides and Accents.

### Slide (Portamento)
On a standard synthesizer, playing a new note instantly resets the pitch and triggers the volume/filter envelopes again. When a step has **Slide** enabled on the 303:
1. **Envelope Legato**: The volume and filter envelopes *do not* reset. They continue decaying from their current position.
2. **Pitch Glide**: The pitch smoothly glides from the previous note to the new note over a set duration.

This creates the iconic "rubbery" transition between notes that defines the acid bassline.

### Accent
On a 303 synth, the Accent is where the magic happens. It doesn't just make the note louder; it completely alters the synth's behavior to create that iconic, rubbery, "screaming" acid sound.

When you turn on an Accent for a step, the voice gets louder and the filter-envelope sweep becomes deeper. The front-panel **Decay** value remains authoritative instead of being replaced by a different per-step decay. High resonance makes the increased envelope depth chirp and squelch more dramatically.

### Accent + Slide
Accent and Slide can be combined. Accent raises the level and filter movement while Slide keeps the voice legato into the following note, producing the familiar connected acid phrase without inventing a separate decay rule.

### Ghost (De-Accent)
While the 303 is famous for its accents, sequences also rely heavily on "Ghost" or de-accented notes. Toggling **Ghost** for a step does the reverse of an Accent:
1. **Gain Reduction**: The final output volume is significantly lowered.
2. **Filter Cutoff Drop**: The baseline cutoff frequency of the filter is pulled down.
3. **Softer Decay**: The envelope decay time is slightly softened, making the note sit back in the mix and feel less percussive.

*Note: A single step cannot be both Accented and Ghosted simultaneously. Selecting one will disable the other.*

Combining Slides, Accents, and Ghost notes on adjacent steps is the secret to programming authentic acid sequences.

---

## How to Use

### Getting Started
1. Run a local development server in the root directory (e.g., `python -m http.server 3000` or `npx serve`).
2. Open `http://localhost:3000` in your web browser.
3. **Important**: You must click the **PLAY** button to initialize the Web Audio API context.

### Programming the Sequencer
- **Notes**: Click any cell in the main grid to place a note. Only one note can exist per column (monophonic).
- **Octave, Tie, Slide & Accent**: Use `OCT +` / `OCT -` for per-step octave modifiers. `TIE` sustains the previous note, while Slide glides its pitch into the next note.
- **Tempo**: Adjust the BPM input box to change the speed of the sequence.

### Sculpting the Sound
Use the top panel knobs to sculpt the synth patch:
- **Wave**: Toggle between the classic rounded Sawtooth and the hollow Square wave.
- **Tune**: Adjusts the whole 303 voice by one semitone either side of concert pitch.
- **Cutoff**: Sets the baseline frequency of the lowpass filter. Keep this relatively low. If your baseline cutoff is too high, the accent has nowhere to push the filter, and you lose the contrast. Keep it low so the accents can jump out of the dark!
- **Resonance**: Increases the feedback of the filter, giving it that classic whistle/squelch. Turn this up high (around 80%). The higher the resonance, the more the accented notes will chirp and squeal.
- **Env Mod**: Controls how intensely the filter envelope sweeps the cutoff frequency.
- **Decay**: Sets how quickly the envelope falls from its peak down to silence.
- **Accent**: Controls how much effect the Accent lane has. If it's at zero, accented steps sound just like normal steps. Turn it to at least 70% or higher to hear the pattern come alive.

### Multi-Module Pedal Board (Effects)
To the left of the sequencer grid, you'll find a versatile Pedal Board boasting 8 classic stompbox effects categorized into Gain, Time, and Modulation. What makes this pedal board special is its **Multi-Module Routing**:
- **Gain**: Overdrive (amp saturation), Distortion (hard clipping), Fuzz (bit-crusher destruction).
- **Time**: Delay (cascading repeats) and Reverb (spatial reflections).
- **Modulation**: Chorus (thickening detune), Phaser (liquid sweeping), Tremolo (rhythmic volume).

You can enable each pedal independently and use the routing checkboxes to send the **303**, **Moog**, **Monotron**, or **Sampler** through them. The system creates a dedicated serial effect chain for each instrument, preventing cross-bleed while letting every module benefit from the full pedal catalogue.

### Pattern Memory (1-9)
The emulator features 9 slots for pattern memory. Slots 1 through 4 are pre-loaded with classic, intricately programmed acid house grooves (complete with optimized Slides and Accents) to get you started!
- **To Save**: Hold `Shift` and press a number key (`1-9`) on the number row. The current grid will be saved to that slot.
- **To Recall**: Press a number key (`1-9`) on the number row. The grid will instantly update to the saved pattern, staying perfectly in time with the music.

---

## The Synth Rack

In addition to the 303, this emulator includes fully playable software clones of two analog classics. You can use the **Aux In** switches on their panels to route the 303's audio through their filters for creative processing!

For detailed panel docs:

- `docs/micro-sampler.md`
- `docs/monotron.md`
- `docs/grandmother.md`

### Moog Grandmother (Drone Engine)
A semi-modular analog synthesizer modeled after the Moog Grandmother. This engine is optimized for creating dark, evolving drones and sci-fi textures.
- **Oscillators / Mixer**: Two selectable-waveform oscillators with individual levels, Oscillator 2 detune, and white noise.
- **Modulation (LFO)**: Selectable waveform and pitch/filter routing, with free or BPM-synchronized rate.
- **303 Clock**: Quantized start, bar-based cycles, step-locked Sample & Hold, cycle envelope retriggering, and optional 303 gate following.
- **Envelope**: Full attack, decay, sustain, and release controls.
- **Sample & Hold (FM)**: A deeply integrated S&H circuit that routes directly to Oscillator 2's Frequency Modulation (FM) input. Turn up the S&H Depth to generate wild, randomized computer bleeps.

### Korg Monotron (Ribbon Synthesizer)
An accurate emulation of the Korg Monotron series. Unlike traditional keyboards, the Monotron features a continuous analog ribbon controller.
- **Original**: The classic layout with a 1-octave continuous ribbon (E to E). Includes a dedicated LFO with a Mod Target switch to modulate either Pitch or Cutoff.
- **Duo**: Features two oscillators with X-MOD (Cross Modulation). You can choose to play the ribbon continuously, or snap it to Chromatic, Major, or Minor scales.
- **Delay**: Features an unquantized ribbon spanning 4 full octaves.

### KO–40 Micro Sampler (Recording System)
A pocket-style sampler that sits to the right of the 303.
- **Unlimited sample time** (limited only by computer RAM) across 16 slots.
- **Slots**: 8 melodic + 8 drum.
- **Recording**: microphone input or direct resampling from the 303, Moog, or Monotron outputs.
- **Sequencing**: 16-step sequencer with 16 patterns, synced to the main transport.
- **FX**: 16 performance-style effects for playback.

---

## Running Locally

To launch the web app on Windows:
1. Double-click the included `start.bat` file.
2. It will automatically detect Python or Node.js on your system to start a local development server and open your web browser. If neither is installed, it will securely open the `index.html` file directly.
3. **Important**: You must click the **PLAY** button in the app to initialize the Web Audio API context.

## MIDI hardware

Use a Web MIDI-capable desktop browser, allow MIDI access, and connect a class-compliant MIDI input. Choose **303**, **MOOG**, **MONOTRON**, or **SAMPLER** from the top-bar **NOTES** selector to decide which sound engine receives keyboard notes. The choice is remembered locally.

**MIDI LEARN** maps hardware CCs, pitch-bend faders, or buttons to on-screen controls. The 303 and Grandmother continuous controls, Monotron synthesis/effect controls, sampler level, pedals, and shared transport are supported. Program Change 1–9 recalls 303 pattern slots 1–9. See the panel documents for instrument-specific playing details.