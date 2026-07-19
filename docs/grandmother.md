# Moog Grandmother-Inspired Panel — Usage

This panel combines a Grandmother-inspired monophonic sound engine with a drone workflow and optional synchronization to the TB-303 sequencer.

## Quick synchronized setup

1. Set `Clock` to `303`.
2. Set `Start` to `Next Bar`.
3. Choose a `Cycle` length, such as `1 Bar` or `4 Bars`.
4. Enable modulation `SYNC` and choose an LFO division.
5. Choose an `S&H Step` division.
6. Set `Envelope` to `Retrigger Cycle` or enable `Follow 303 Gate`.
7. Switch the drone on. The shared transport starts automatically if required.

## Clock modes

### Free

- The drone starts immediately.
- The LFO can run freely or use its BPM frequency selector.
- Sample & Hold uses the `S&H Rate` slider in seconds.

### 303

- Timing comes directly from sequencer step callbacks.
- BPM changes preserve the musical relationship.
- `S&H Rate` is disabled and `S&H Step` selects exact step divisions.
- `Stop with 303` closes the envelope when the shared transport stops.

## Start and cycle

- `Immediate`: open the drone immediately.
- `Next Step`: wait for the next 303 step.
- `Next Bar`: wait for step 1 of the next 16-step bar.
- `Cycle`: choose a repeating boundary from one quarter-bar to eight bars.

A cycle boundary resets synchronized modulation phase and can retrigger the envelope. It does not change oscillator pitch.

## Envelope modes

- `Hold`: open once and sustain the drone.
- `Retrigger Cycle`: retrigger at each cycle boundary.
- `Follow 303 Gate`: follow 303 notes, rests, ties, slides and accents instead of the cycle envelope.

## Sample & Hold timing

In 303 mode, `S&H Step` updates the random voltage every 1, 2, 4, 8 or 16 sequencer steps. Free mode uses the seconds-based `S&H Rate`.

## Sound controls

- Oscillator 1/2 waveform and individual mixer level.
- Oscillator 2 detune and white-noise level.
- VCF cutoff and resonance.
- Full attack, decay, sustain and release envelope.
- LFO waveform, destination, depth and free/BPM-synchronized rate.
- S&H Depth applies random linear FM to Oscillator 2.
- Spring-style reverb mix.
- `Inst In (303)` routes 303 audio through the mixer, filter and reverb.
## MIDI controller

Choose **MOOG** in the top-bar **NOTES** selector to play the Grandmother voice from a MIDI keyboard. Oscillator 1 follows the played note and oscillator 2 follows one octave below; velocity drives the envelope. This keyboard mode is separate from the Drone switch.

All continuous Grandmother controls can be assigned with **MIDI LEARN**. Main MIDI Play/Stop continues to control the shared 303 clock when clock sync is enabled.