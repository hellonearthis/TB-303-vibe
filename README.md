# TB-303 Web Emulator

A fully functional, web-based software clone of the legendary Roland TB-303 synthesizer, built using Vanilla JavaScript and Tone.js. This emulator captures the unique subtractive synthesis architecture, the characteristic diode ladder filter "squelch", and the expressive sequencer logic that defined acid house.

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

When you turn on an Accent for a step, three things happen simultaneously under the hood:
1. **The Filter Cutoff Explodes**: An accented note forcefully drives the filter open. If your synth's Resonance knob is turned up high, this sudden surge causes the filter to "ping" and scream, giving you that piercing, sharp tone that cuts right through a mix.
2. **The Filter Envelope Shrinks (Snappy Decay)**: This is the secret to the 303 groove. When a note is accented, the filter decay time instantly gets shorter and snappier. A normal note has a longer, smoother decay (the "wow" sound), while an accented note has a fast, aggressive pluck (the "wow" becomes a sharp "zap!" or "pow!").
3. **The Volume Peaks**: Yes, it gets louder, but because the filter closes so rapidly (due to the snappy decay), the volume spike is incredibly punchy and transient-heavy. It sounds like a sudden smack.

### The Ultimate 303 Trick: Accent + Slide 🧪
When you put an Accent and a Slide on the same step, you unlock the holy grail of acid house. 

Because a Slide tells the synth not to decay or re-trigger the envelope for the next note, combining them overrides the quick decay rule. The filter flies wide open from the Accent, but instead of snapping shut, it stretches out and bleeds into the next note. This creates a massive, rising, squelchy pitch bend that sounds like the synth is literally morphing.
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
- **Cutoff**: Sets the baseline frequency of the lowpass filter. Keep this relatively low. If your baseline cutoff is too high, the accent has nowhere to push the filter, and you lose the contrast. Keep it low so the accents can jump out of the dark!
- **Resonance**: Increases the feedback of the filter, giving it that classic whistle/squelch. Turn this up high (around 80%). The higher the resonance, the more the accented notes will chirp and squeal.
- **Env Mod**: Controls how intensely the filter envelope sweeps the cutoff frequency.
- **Decay**: Sets how quickly the envelope falls from its peak down to silence.
- **Accent**: Controls how much effect the Accent lane has. If it's at zero, accented steps sound just like normal steps. Turn it to at least 70% or higher to hear the pattern come alive.

### The Pedal Board (Effects)
To the left of the sequencer grid, you'll find three classic stompbox pedals to process the raw 303 signal:
- **Overdrive**: A definitive companion for the 303. This soft-clips the audio, catching sharp Accents and turning them into aggressive, ripping screams while adding rich harmonics to the lower notes.
- **Delay**: A dotted-eighth delay that transforms sparse sequences into complex, cascading walls of sound. 
- **Phaser**: Adds a slow, sweeping liquid movement to the filter cutoff, giving the sequence a constantly evolving feel.

### Pattern Memory (1-9)
The emulator features 9 slots for pattern memory. Slots 1 through 4 are pre-loaded with classic, intricately programmed acid house grooves (complete with optimized Slides and Accents) to get you started!
- **To Save**: Hold `Shift` and press a number key (`1-9`) on the number row. The current grid will be saved to that slot.
- **To Recall**: Press a number key (`1-9`) on the number row. The grid will instantly update to the saved pattern, staying perfectly in time with the music.

---

## The Synth Rack

In addition to the 303, this emulator includes fully playable software clones of two analog classics. You can use the **Aux In** switches on their panels to route the 303's audio through their filters for creative processing!

### Moog Grandmother (Drone Engine)
A semi-modular analog synthesizer modeled after the Moog Grandmother. This engine is optimized for creating dark, evolving drones and sci-fi textures.
- **Oscillators**: Two oscillators (base and -1 octave detuned) combined with white noise.
- **Modulation (LFO)**: A dedicated LFO routes to the VCF cutoff and Oscillator pitch, controlled by the Mod Wheel. You can sync the LFO rate to the sequencer's BPM.
- **Sample & Hold (FM)**: A deeply integrated S&H circuit that routes directly to Oscillator 2's Frequency Modulation (FM) input. Turn up the S&H Depth to generate wild, randomized computer bleeps.

### Korg Monotron (Ribbon Synthesizer)
An accurate emulation of the Korg Monotron series. Unlike traditional keyboards, the Monotron features a continuous analog ribbon controller.
- **Original**: The classic layout with a 1-octave continuous ribbon (E to E). Includes a dedicated LFO with a Mod Target switch to modulate either Pitch or Cutoff.
- **Duo**: Features two oscillators with X-MOD (Cross Modulation). You can choose to play the ribbon continuously, or snap it to Chromatic, Major, or Minor scales.
- **Delay**: Features an unquantized ribbon spanning 4 full octaves.

---

## Running Locally

To launch the web app on Windows:
1. Double-click the included `start.bat` file.
2. It will automatically detect Python or Node.js on your system to start a local development server and open your web browser. If neither is installed, it will securely open the `index.html` file directly.
3. **Important**: You must click the **PLAY** button in the app to initialize the Web Audio API context.
