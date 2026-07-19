# KORG monotron (Original / Duo / Delay) — Usage

This panel is a playable emulation inspired by the **KORG monotron** family: a small analog ribbon synth with a distinctive MS‑20/MS‑10‑style filter vibe. In this project it’s presented as a “rack module” with a ribbon controller, model switch, and (optionally) a 303 external input route.

## Quick start

1. Click `PLAY` (required to unlock audio in most browsers).
2. Press/drag on the ribbon to play.
3. Choose `Model: Original | Duo | Delay`.
4. For Duo, optionally choose a `Scale` to quantize the ribbon.

## Core interaction: ribbon controller

- Click/touch the ribbon to start a note.
- Drag left/right to glide pitch continuously (or snapped when quantized).
- Release to stop.

There’s a visible touch indicator that tracks your finger.

## Model selector

Use `Model:` to switch layouts and behavior.

### Original

The “classic” monotron‑style layout:

- `VCO Pitch`: sets the base pitch range/tuning feel.
- `LFO Target`: routes LFO to `Pitch`, `Cutoff`, or `Standby`.
- `LFO Rate` / `LFO Int`: LFO speed and depth.
- `VCF Cutoff`: filter cutoff frequency.
- `VCF Peak`: resonance.

Best for: classic ribbon squeals, filter chirps, wobbling pitch, and MS‑style sweeps.

### Duo

Adds a second oscillator and cross‑modulation style behavior:

- `VCO1 Pitch`: base pitch for the ribbon voice.
- `VCO2 Pitch`: tuning for the second oscillator.
- `X‑MOD Int`: cross‑mod amount (more = harsher/metallic).
- `VCF Cutoff` / `VCF Peak`: filter controls.
- `Scale`: `Chromatic`, `Major`, `Minor`, or `Off` (continuous).

Note: `Scale` only affects the ribbon pitch (it quantizes the slide position to musical steps).

### Delay

Designed for sound‑effect style playing:

- `VCO Pitch`: base pitch for the ribbon voice.
- `LFO Wave`: triangle or square.
- `LFO Rate` / `LFO Int`: LFO speed and depth (pitch‑modulated).
- `VCF Cutoff`: filter cutoff.
- `Delay Time`: echo time.
- `Feedback`: echo repeats (higher = wilder).

The Delay model uses a wider ribbon range (intended to feel “bigger” for FX).

## Output + 303 external input (integration)

The panel includes a small utility block:

- `Output`: Monotron output volume.
- `303 AUX`: routes the TB‑303 into the monotron’s filter input.
- `Input`: external input level (when `303 AUX` is enabled).

When `303 AUX` is enabled, the 303 is routed into the monotron’s filter path so you can “process” the 303 through the monotron character. Turn up `Input`, then sweep `VCF Cutoff` / `VCF Peak`.

Tip: If the 303 seems to disappear when routing is enabled, lower `Input` and re-balance `Output` to avoid overload.

## Practical recipes

- Acid wash: enable `303 AUX`, set `VCF Peak` high, and sweep `VCF Cutoff` slowly.
- Horror wobble (Original): set `LFO Target` to `Cutoff`, medium `Rate`, low‑mid `Int`.
- Metallic Duo: raise `X‑MOD Int`, detune `VCO2 Pitch`, keep `VCF Cutoff` low.
- Dub smear (Delay): set `Delay Time` medium, `Feedback` high‑ish, modulate pitch with LFO.


## MIDI controller

Choose **MONOTRON** in the top-bar **NOTES** selector to play its ribbon voice from a MIDI keyboard. Note On controls pitch and gate; Note Off closes the gate.

Click **MIDI LEARN**, click a Monotron knob, then move a hardware knob to map VCO pitch, either LFO rate/intensity pair, cutoff, peak, VCO2 pitch, X-MOD, delay time, feedback, output level, or aux input level. The mapping follows the control even when switching between Original, Duo, and Delay models.