# KO–40 Micro Sampler (Recording System) — Usage

The KO–40 is a pocket‑style sampler panel that sits to the right of the TB‑303. It can record from your microphone or directly resample the TB‑303 output, store samples in 16 slots, and sequence them in sync with the main transport.

## Quick start

1. Click `PLAY` (this starts audio and the global clock).
2. In the sampler, click a pad to select a slot.
3. Choose `SRC: MIC`, `303`, `MOOG`, or `MONOTRON`.
4. Click `● REC` to record, click again to stop.
5. Click step buttons to place the selected slot into the 16‑step pattern.

## Sample memory

The sampler tracks the total recorded sample time across all 16 slots as a visual reference. There is no artificial memory limit—you are constrained only by your computer's RAM.

- The display shows the total amount of recording time used.

Tip: If you want to re-record a slot, select it and record again — the old audio is replaced.

## Slots: 8 melodic + 8 drum

There are 16 pads:

- `M1..M8` (melodic slots): playable chromatically from the mini keyboard.
- `D1..D8` (drum slots): one‑shots meant for hits and textures.

Pads show `EMPTY` or the sample length in seconds once recorded.

## Recording sources

### `SRC: MIC` (microphone)

- Records from your device microphone.
- The browser will prompt for permission the first time.
- If permission is denied, the sampler display will show an error.

Good for: vocal chops, phone mic percussion, found sound.

### `SRC: 303` (resample)

- Records from the TB‑303 output node.
- Captures the 303 sound *after* its pedals and dynamics (i.e., what you’re hearing).

Good for: printing squelchy loops, stabs, and one‑shot bass hits you can rearrange.
### `SRC: MOOG` (resample)

- Records the Moog Grandmother panel's final output, including its spring-style reverb.
- Start the drone before or during recording to capture evolving textures.

Good for: drone beds, noise textures, and long atmospheric samples.

### `SRC: MONOTRON` (resample)

- Records the Monotron panel's final output.
- Captures the active Original, Duo, or Delay model, including the Delay model's echoes.

Good for: ribbon gestures, filter sweeps, X-MOD hits, and delay tails.

## Playback

- Click a pad to audition it immediately.
- In melodic slots (`M1..M8`), use the keyboard row (`C..C`) to transpose. Chromatic playback uses pitch shifting so notes retain approximately the original sample length.
- In drum slots (`D1..D8`), the keyboard is disabled (by design).

## Effects (FX)

`FX` applies to sampler playback. Some FX are real‑time processors, others change playback behavior.

Common uses:

- `02 LOW PASS` / `03 HIGH PASS`: carve space in the mix.
- `04 DRIVE` / `05 CRUSH`: add grit.
- `06 DELAY` / `07 SPACE`: turn one‑shots into ambience.
- `12 PITCH +7` / `13 PITCH −7`: quick harmonic variations.
- `14 REVERSE`: reverse the playback.
- `16 STUTTER`: short looping burst (auto‑stops).

## Patterns and step sequencer

The sampler has **16 patterns**, each with **16 steps**.

- Choose a pattern in `PATTERN`.
- Click an empty step to program it with the selected slot.
- **Step Editor**: Click an already programmed step to open the step editor panel.
  - **PITCH**: Transpose the sample per-step (melodic slots only). Moving the slider previews the pitch live.
  - **VELOCITY**: Adjust the volume per-step for accents and dynamics.
  - **FX OVERRIDE**: Apply a specific effect to just this step, bypassing the global FX chain.
- Click the same step again to close the step editor, or use `✕ CLEAR STEP` to remove it.
- **Independent Playback**: The sampler has its own `PLAY` and `STOP` buttons. 
  - Clicking the sampler's `PLAY` runs the pattern independently of the 303.
  - Clicking the sampler's `STOP` halts the sampler without stopping the 303.
  - The main 303 transport buttons will still start/stop the sampler alongside the 303.

`CLEAR` in the sequencer section clears the current sampler pattern (not the samples).

## Level

`LEVEL` controls sampler output volume only.

## Known behaviors and tips

- While the sampler can be started/stopped independently using its own buttons, the main 303 transport buttons (`PLAY` / `STOP`) will also start and stop the sampler to keep everything in sync.
- Instrument sources tap each panel's final output without muting its normal audio path.
- If you hear clipping with heavy FX + loud samples, reduce `LEVEL` or re-record at a lower source volume.


## MIDI controller

Choose **SAMPLER** in the top-bar **NOTES** selector before playing a MIDI keyboard.

- MIDI notes **36–43 (C2–G2)** trigger drum slots D1–D8.
- Other MIDI notes play the currently selected melodic slot, with MIDI note 60 (C4) as the sample's original pitch.
- The pitch shifter preserves sample duration when melodic samples are transposed.
- To map a hardware knob to sampler output, click **MIDI LEARN**, click **LEVEL**, then move the hardware control.
- Main MIDI Play/Stop mappings also start and stop the sampler pattern because it shares the main transport.

Microphone permission cannot be supplied by MIDI; the browser still asks for permission when microphone recording begins.