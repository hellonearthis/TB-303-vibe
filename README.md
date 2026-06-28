# TB-303 Web Emulator

A fully functional, web-based software clone of the legendary Roland TB-303 synthesizer, built using Vanilla JavaScript and Tone.js. This emulator captures the unique subtractive synthesis architecture, the characteristic diode ladder filter "squelch", and the expressive sequencer logic that defined acid house.

## Features

- **Authentic Signal Flow**: Sawtooth/Square oscillator running through a heavily resonant lowpass filter with custom envelope modulation and decay controls.
- **Tone.js Audio Engine**: Utilizes Tone.js for high-precision scheduling, DSP effects (distortion/saturation), and perfect sync.
- **Grid-Style Sequencer**: An intuitive, modern piano-roll grid replacing the archaic original input method while retaining the strict 16-step monophonic behavior.
- **Pattern Memory**: Save and recall up to 9 patterns on the fly using your keyboard (`1-9`).
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
An accented step on the 303 does much more than simply increase the volume. It triggers a hardware macro that pushes several parameters into overdrive simultaneously:
1. **Gain Boost**: The final output volume is multiplied for a harder punch.
2. **Filter Cutoff Shift**: The baseline cutoff frequency of the filter is pushed significantly higher.
3. **Resonance Drive**: The filter feedback loop is driven harder, making the "squelch" more aggressive.
4. **Decay Snapping**: The envelope decay time is shortened, making the note sound incredibly snappy, aggressive, and percussive.

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
- **Slide & Accent**: Click the cells in the bottom two rows to toggle Slide and Accent for that specific step.
- **Tempo**: Adjust the BPM input box to change the speed of the sequence.

### Sculpting the Sound
Use the top panel knobs to sculpt the synth patch:
- **Wave**: Toggle between the classic rounded Sawtooth and the hollow Square wave.
- **Cutoff**: Sets the baseline frequency of the lowpass filter.
- **Resonance**: Increases the feedback of the filter, giving it that classic whistle/squelch.
- **Env Mod**: Controls how intensely the filter envelope sweeps the cutoff frequency.
- **Decay**: Sets how quickly the envelope falls from its peak down to silence.

### Pattern Memory (1-9)
The emulator features 9 slots for pattern memory.
- **To Save**: Select the "Save" radio button. Click a slot number (1-9) or press the corresponding number key on your keyboard. The current grid will be saved to that slot.
- **To Recall**: Select the "Recall" radio button. Click a slot number (1-9) or press the corresponding number key. The grid will instantly update to the saved pattern, staying perfectly in time with the music.
