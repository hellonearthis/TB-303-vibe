## Inspiration
Our inspiration for this project stemmed from a deep appreciation for the origins of acid house and techno music. The Roland TB-303 is an incredibly iconic synthesizer, famous for its "rubbery," squelchy, and screaming basslines. However, original hardware units are rare, expensive, and notoriously difficult to program due to their archaic sequencer design. We—meaning myself and my AI coding partners (Google Gemini 3.1 Pro, OpenAI Sol 5.6, and CodeX)—wanted to democratize this legendary sound by making it accessible to anyone with a web browser.

## What it does
TB-303-vibe is a web-based Roland TB-303-inspired bass synthesizer that accurately models the original monophonic workflow, resonant filter character, and accent/slide behavior. It features an intuitive, modern piano-roll grid sequencer, replacing the frustrating old hardware buttons while maintaining strict 16-step rules. Beyond the 303, it acts as a mini studio rack featuring fully playable software clones of classic hardware—a Moog Grandmother drone synth, a KORG Monotron, and a KO-40 Micro Sampler—along with classic stompbox effects to process the audio.

## How we built it
We built the project as a human-AI collaborative effort. I directed the vision, architecture, and creative choices, while my AI partners—Google Gemini 3.1 Pro, OpenAI Sol 5.6, and CodeX—assisted with writing the underlying Vanilla JavaScript and Tone.js code. Tone.js handled the heavy lifting for the Web Audio API, allowing us to construct a custom DSP signal chain with precise scheduling. Together, we wrote a custom grid-based sequencer to keep the application lightweight without relying on heavy frontend frameworks. Finally, we integrated the Web MIDI API so the entire emulator and its companion synths can be played expressively with physical MIDI keyboards and controllers.

## Challenges we ran into
The biggest challenge was accurately modeling the 303's unique "quirks" rather than just building a generic synthesizer. The 303 doesn't just play notes; its sequencer directly manipulates the analog circuitry. Getting Slides and Accents to behave correctly required complex logic that took intense back-and-forth debugging between me and the AI models:
- A **Slide** required writing custom legato logic so the volume and filter envelopes wouldn't reset between notes.
- An **Accent** meant dynamically overriding front-panel decay times, increasing filter sweep depth, and pushing the resonance harder to get that signature acid "chirp."

Handling precise musical timing in a web browser without audio dropouts or lag was also a significant technical hurdle that required our combined problem-solving skills to overcome.

## Accomplishments that we're proud of
We are incredibly proud of how authentic the acid sound turned out, particularly how seamlessly Slides and Accents combine to mimic the quirks of the original hardware. We're also immensely proud of what we achieved through AI pair programming; by combining human musical intuition with the rapid coding capabilities of Gemini, Sol 5.6, and CodeX, we created an environment that is both deeply nostalgic and highly creative.

## What we learned
This project was a massive learning experience in both digital signal processing (DSP) and the future of software development. I gained a deep, practical understanding of how the Web Audio API and Tone.js handle high-precision scheduling, and exactly how analog components interact at a granular level. More importantly, I learned how to effectively prompt, collaborate with, and orchestrate multiple advanced AI models to bring a complex creative vision to life using pure JavaScript.

## What's next for TB-303-vibe
In the future, we want to expand the TB-303-vibe ecosystem. Potential features include implementing a drum machine companion (like an 808 or 909) to create a complete acid house groovebox within the browser. We also plan to add audio export functionality so users can download their loops as WAV files, and introduce a patch-sharing system so the community can share their favorite 303 patterns and rack configurations online.

We recently took a major architectural step by decoupling the effect pedals from the 303 to create a global **Multi-Module Pedal Board**. By routing individual synths (303, Moog, Monotron, Sampler) through their own dedicated serial chains of 8 stompboxes, we successfully avoided audio cross-bleed while massively expanding the sound design possibilities of the entire virtual studio rack!
