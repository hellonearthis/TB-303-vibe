document.addEventListener('DOMContentLoaded', () => {
    // WHAT: Delays the initialization of the Monotron UI by a small margin.
    // WHY: We need to ensure that audio.js and the monotronAudio backend are completely initialized and attached to the window object before we try binding UI events to them.
    setTimeout(() => {
        setupMonotronUI();
    }, 100);
});

// WHAT: Binds HTML DOM elements to the Monotron audio engine and handles the continuous ribbon logic.
// WHY: This completely separates the visual interaction (clicks, drags, CSS updates) from the raw Web Audio API math handled in monotron-audio.js.
function setupMonotronUI() {
    // 1. UI Elements
    const ribbon_container_element = document.getElementById('monotron-ribbon');
    const scale_select_element = document.getElementById('monotron-scale');
    const model_select_element = document.getElementById('monotron-model');
    const scale_container_element = document.getElementById('monotron-scale-container');
    const vco2_pitch_knob_element = document.getElementById('monotron-vco2-pitch');
    const xmod_knob_element = document.getElementById('monotron-xmod');
    const lfo_rate_knob_element = document.getElementById('monotron-lfo-rate');
    const lfo_int_knob_element = document.getElementById('monotron-lfo-int');
    const mod_target_select_element = document.getElementById('monotron-mod-target');
    const cutoff_knob_element = document.getElementById('monotron-cutoff');
    const peak_knob_element = document.getElementById('monotron-peak');
    const volume_knob_element = document.getElementById('monotron-volume');
    const aux_switch_element = document.getElementById('monotron-aux');
    const aux_vol_knob_element = document.getElementById('monotron-aux-vol');

    // 1.5 Render Keyboard pattern
    const keyboard_container_element = document.createElement('div');
    keyboard_container_element.className = 'monotron-keyboard';
    
    // Render 8 white keys (E to E) matching the Original Monotron
    const number_of_white_keys = 8;
    // Keys: E, F, G, A, B, C, D, E
    // has_black_key_array signifies if the white key has a black key to its right
    const has_black_key_array = [false, true, true, true, false, true, true, false]; 
    
    for (let loop_index = 0; loop_index < number_of_white_keys; loop_index++) {
        const white_key_element = document.createElement('div');
        white_key_element.className = 'ribbon-key-white';
        
        if (has_black_key_array[loop_index]) {
            const black_key_element = document.createElement('div');
            black_key_element.className = 'ribbon-key-black';
            white_key_element.appendChild(black_key_element);
        }
        keyboard_container_element.appendChild(white_key_element);
    }
    ribbon_container_element.appendChild(keyboard_container_element);

    // 2. Add visual indicator for ribbon touch
    const indicator_element = document.createElement('div');
    indicator_element.className = 'ribbon-touch-indicator';
    ribbon_container_element.appendChild(indicator_element);

    // 3. Ribbon state
    let is_currently_touching_boolean = false;

    // 4. Scales mapping (frequencies in Hz for up to 4 octaves)
    // Base C3 = 130.81 Hz (for Original/Duo)
    // Base C2 = 65.41 Hz (for Delay)
    // WHAT: Calculates the frequency in Hertz for a specific MIDI note index relative to a base frequency.
    // WHY: We use this to generate mathematical arrays of frequencies for musical scales so the ribbon can snap to quantized pitches.
    const getFrequency = (note_index_number, base_frequency_hertz = 130.81) => base_frequency_hertz * Math.pow(2, note_index_number / 12);
    
    // WHAT: Generates an array of frequencies spanning multiple octaves based on interval steps (e.g., [2,2,1,2,2,2,1] for Major).
    // WHY: When the user selects a specific musical scale on the Duo model, we need a lookup table to snap their continuous finger position to the nearest valid musical note.
    const generateScale = (intervals_array, number_of_octaves = 3) => {
        const frequencies_array = [];
        for (let octave_index = 0; octave_index < number_of_octaves; octave_index++) {
            let note_offset = octave_index * 12;
            frequencies_array.push(getFrequency(note_offset)); // Root
            for (let interval_step of intervals_array) {
                note_offset += interval_step;
                frequencies_array.push(getFrequency(note_offset));
            }
        }
        return frequencies_array;
    };

    const musical_scales_object = {
        major: generateScale([2, 2, 1, 2, 2, 2, 1]), // Whole, Whole, Half, Whole, Whole, Whole, Half
        minor: generateScale([2, 1, 2, 2, 1, 2, 2]), // Whole, Half, Whole, Whole, Half, Whole, Whole
        chromatic: Array.from({length: 36}, (_, loop_index) => getFrequency(loop_index)),
        off: null // Continuous
    };

    // WHAT: Translates an X pixel coordinate on the ribbon DOM element into a physical frequency in Hertz.
    // WHY: The ribbon is an analog continuous controller. We must map physical distance (0 to 100% width) exponentially to frequency, factoring in specific model limits and scale snapping.
    const calculateFrequency = (x_coordinate, ribbon_width_pixels, scale_type_string, monotron_model_string) => {
        const percentage_float = Math.max(0, Math.min(1, x_coordinate / ribbon_width_pixels));
        
        let minimum_frequency_hertz = 164.81; // E3
        let maximum_frequency_hertz = minimum_frequency_hertz * 2; // 1 octave exactly (E3 to E4)
        
        if (monotron_model_string === 'delay') {
            minimum_frequency_hertz = 82.41; // E2
            maximum_frequency_hertz = minimum_frequency_hertz * Math.pow(2, 4); // 4 octaves
        }

        if (monotron_model_string === 'duo' && scale_type_string !== 'off') {
            // Snapped pitch
            const scale_frequencies_array = musical_scales_object[scale_type_string];
            if (!scale_frequencies_array) return 440;
            
            // Limit scale to ~1.5 octaves (index max based on scale length)
            // A typical 1.5 octave has ~18 chromatic notes
            const maximum_notes_integer = scale_type_string === 'chromatic' ? 18 : 11; 
            const snapped_index = Math.floor(percentage_float * maximum_notes_integer);
            return scale_frequencies_array[Math.min(snapped_index, scale_frequencies_array.length - 1)];
        } else {
            // Continuous pitch
            return minimum_frequency_hertz * Math.pow(maximum_frequency_hertz / minimum_frequency_hertz, percentage_float);
        }
    };
    
    // WHAT: Updates the UI visibility of specific knobs and dropdowns depending on which Monotron model is selected.
    // WHY: The Original has an LFO, the Duo has dual oscillators and scales, and the Delay is stripped down. We hide what isn't relevant to prevent user confusion.
    model_select_element.addEventListener('change', (event_object) => {
        const selected_model_string = event_object.target.value;
        const original_knobs_node_list = document.querySelectorAll('.original-only');
        const duo_knobs_node_list = document.querySelectorAll('.duo-only');

        if (selected_model_string === 'original') {
            original_knobs_node_list.forEach(element_node => element_node.style.display = 'flex');
            duo_knobs_node_list.forEach(element_node => element_node.style.display = 'none');
            scale_container_element.style.display = 'none';
        } else if (selected_model_string === 'duo') {
            original_knobs_node_list.forEach(element_node => element_node.style.display = 'none');
            duo_knobs_node_list.forEach(element_node => element_node.style.display = 'flex');
            scale_container_element.style.display = 'block';
            scale_select_element.disabled = false;
        } else if (selected_model_string === 'delay') {
            original_knobs_node_list.forEach(element_node => element_node.style.display = 'none');
            duo_knobs_node_list.forEach(element_node => element_node.style.display = 'none');
            scale_container_element.style.display = 'none';
        }
    });
    // Trigger initial state
    model_select_element.dispatchEvent(new Event('change'));

    // 5. Ribbon Events
    // WHAT: Calculates and dispatches the new frequency to the audio engine based on the pointer's location.
    // WHY: Centralized logic for both clicking down and dragging across the ribbon to ensure pitch tracks the finger perfectly.
    const handleTouch = (event_object) => {
        const bounding_rectangle_object = ribbon_container_element.getBoundingClientRect();
        const client_x_coordinate = event_object.touches ? event_object.touches[0].clientX : event_object.clientX;
        const local_x_coordinate = client_x_coordinate - bounding_rectangle_object.left;
        
        // Update visual indicator
        indicator_element.style.left = `${Math.max(0, Math.min(100, (local_x_coordinate / bounding_rectangle_object.width) * 100))}%`;
        
        const scale_type_string = scale_select_element.value;
        const selected_model_string = model_select_element.value;
        const frequency_hertz = calculateFrequency(local_x_coordinate, bounding_rectangle_object.width, scale_type_string, selected_model_string);
        
        monotronAudio.setPitch(frequency_hertz);
    };

    // WHAT: Initiates the sound generation and pointer capture when the user clicks or taps the ribbon.
    // WHY: We must resume the audio context first (in case the browser suspended it), then we tell the envelope to open and begin tracking the mouse so it doesn't lose focus if they drag outside the element bounds.
    ribbon_container_element.addEventListener('pointerdown', async (event_object) => {
        if (Tone.context.state !== 'running') {
            await Tone.start();
        }
        
        is_currently_touching_boolean = true;
        ribbon_container_element.setPointerCapture(event_object.pointerId);
        indicator_element.classList.add('active');
        
        const bounding_rectangle_object = ribbon_container_element.getBoundingClientRect();
        const client_x_coordinate = event_object.clientX;
        const local_x_coordinate = client_x_coordinate - bounding_rectangle_object.left;
        const scale_type_string = scale_select_element.value;
        const selected_model_string = model_select_element.value;
        const frequency_hertz = calculateFrequency(local_x_coordinate, bounding_rectangle_object.width, scale_type_string, selected_model_string);
        
        monotronAudio.noteOn(frequency_hertz);
        handleTouch(event_object);
    });

    // WHAT: Updates the pitch continuously as the user drags their finger across the ribbon.
    // WHY: This is what makes the ribbon continuous. Every pixel of movement translates to a new frequency update sent to the audio engine.
    ribbon_container_element.addEventListener('pointermove', (event_object) => {
        if (is_currently_touching_boolean) {
            handleTouch(event_object);
        }
    });

    // WHAT: Silences the synthesizer and releases the mouse pointer when the user lifts their finger.
    // WHY: Stops the note from playing endlessly and resets the visual state of the ribbon touch indicator.
    const stopTouch = (event_object) => {
        if (is_currently_touching_boolean) {
            is_currently_touching_boolean = false;
            ribbon_container_element.releasePointerCapture(event_object.pointerId);
            indicator_element.classList.remove('active');
            monotronAudio.noteOff();
        }
    };

    ribbon_container_element.addEventListener('pointerup', stopTouch);
    ribbon_container_element.addEventListener('pointercancel', stopTouch);

    // 6. Knob Events
    vco2_pitch_knob_element.addEventListener('input', (event_object) => {
        monotronAudio.setVCO2Pitch(parseFloat(event_object.target.value));
    });

    xmod_knob_element.addEventListener('input', (event_object) => {
        monotronAudio.setXMod(parseFloat(event_object.target.value));
    });

    if (lfo_rate_knob_element) {
        lfo_rate_knob_element.addEventListener('input', (event_object) => {
            monotronAudio.setLFORate(parseFloat(event_object.target.value));
        });
        lfo_int_knob_element.addEventListener('input', (event_object) => {
            monotronAudio.setLFOInt(parseFloat(event_object.target.value));
        });
        mod_target_select_element.addEventListener('change', (event_object) => {
            monotronAudio.setModTarget(event_object.target.value);
        });
    }

    cutoff_knob_element.addEventListener('input', (event_object) => {
        monotronAudio.setCutoff(parseFloat(event_object.target.value));
    });

    peak_knob_element.addEventListener('input', (event_object) => {
        monotronAudio.setPeak(parseFloat(event_object.target.value));
    });

    volume_knob_element.addEventListener('input', (event_object) => {
        monotronAudio.setVolume(parseFloat(event_object.target.value));
    });

    aux_vol_knob_element.addEventListener('input', (event_object) => {
        monotronAudio.setAuxVolume(parseFloat(event_object.target.value));
    });

    // WHAT: Dynamically re-routes the TB-303 audio output directly into the Monotron's analog MS-20 filter.
    // WHY: Emulates plugging a real hardware patch cable from the 303's output jack into the Monotron's "Aux In" port.
    aux_switch_element.addEventListener('change', (event_object) => {
        const monotron_section_element = document.getElementById('monotron-section');
        if (window.AudioEngine) {
            if (event_object.target.checked) {
                // Route 303 to Monotron VCF
                window.AudioEngine.volume.disconnect(Tone.Destination);
                Tone.connect(window.AudioEngine.volume, monotronAudio.extInput);
                monotron_section_element.classList.add('aux-routed');
            } else {
                // Route 303 back to Destination
                window.AudioEngine.volume.disconnect(monotronAudio.extInput);
                window.AudioEngine.volume.connect(Tone.Destination);
                monotron_section_element.classList.remove('aux-routed');
            }
        }
    });
    // Init state
    aux_switch_element.dispatchEvent(new Event('change'));

    // Initialize values
    monotronAudio.setVCO2Pitch(parseFloat(vco2_pitch_knob_element.value));
    monotronAudio.setXMod(parseFloat(xmod_knob_element.value));
    if (lfo_rate_knob_element) {
        monotronAudio.setLFORate(parseFloat(lfo_rate_knob_element.value));
        monotronAudio.setLFOInt(parseFloat(lfo_int_knob_element.value));
        monotronAudio.setModTarget(mod_target_select_element.value);
    }
    monotronAudio.setCutoff(parseFloat(cutoff_knob_element.value));
    monotronAudio.setPeak(parseFloat(peak_knob_element.value));
    monotronAudio.setVolume(parseFloat(volume_knob_element.value));
    monotronAudio.setAuxVolume(parseFloat(aux_vol_knob_element.value));

    // --- MIDI CC → Monotron Slider Sync ---
    const monotron_input_mapping_object = {
        'monotron-cutoff':  cutoff_knob_element,
        'monotron-peak':    peak_knob_element,
        'monotron-xmod':    xmod_knob_element,
        'monotron-volume':  volume_knob_element,
        'monotron-vco2':    vco2_pitch_knob_element,
        'monotron-auxvol':  aux_vol_knob_element,
    };

    // WHAT: Intercepts custom MIDI control change events from the midi.js subsystem and updates the UI sliders to match.
    // WHY: If the user turns a physical knob on their hardware MIDI controller, the on-screen UI knob needs to move to reflect the change visually.
    window.addEventListener('midiCCChange', (midi_control_change_event_object) => {
        const { parameter, scaledValue } = midi_control_change_event_object.detail;
        if (monotron_input_mapping_object[parameter]) {
            monotron_input_mapping_object[parameter].value = scaledValue;
        }
    });

    // --- MIDI Learn: Register Monotron parameters ---
    // (The MIDI Learn click handlers in app.js cover TB-303 + Grandmother.
    //  Monotron knobs need their own registration here since they're set up in a separate module.)
    const midi_controller_instance = window.MIDIController;
    if (midi_controller_instance) {
        const monotron_learnable_parameters_array = [
            { param: 'monotron-cutoff',  element: cutoff_knob_element.closest('.monotron-knob-group') },
            { param: 'monotron-peak',    element: peak_knob_element.closest('.monotron-knob-group') },
            { param: 'monotron-xmod',    element: xmod_knob_element.closest('.monotron-knob-group') },
            { param: 'monotron-volume',  element: volume_knob_element.closest('.monotron-knob-group') },
            { param: 'monotron-vco2',    element: vco2_pitch_knob_element.closest('.monotron-knob-group') },
            { param: 'monotron-auxvol',  element: aux_vol_knob_element.closest('.monotron-knob-group') },
        ];

        monotron_learnable_parameters_array.forEach(({ param, element }) => {
            if (!element) return;

            // Show mapped indicator
            const mapped_source_id_string = midi_controller_instance.getSourceForParameter(param);
            element.classList.toggle('midi-mapped', !!mapped_source_id_string);
            if (mapped_source_id_string) element.style.position = 'relative';

            // Learn-mode click handler
            element.addEventListener('click', (event_object) => {
                if (document.body.classList.contains('midi-learn-active')) {
                    event_object.preventDefault();
                    event_object.stopPropagation();

                    // Clear previous listening
                    document.querySelectorAll('.midi-listening').forEach(element_node => element_node.classList.remove('midi-listening'));
                    element.classList.add('midi-listening');

                    midi_controller_instance.enterLearnMode(param);

                    // Update tooltip
                    const existing_tooltip_element = document.querySelector('.midi-learn-tooltip');
                    if (existing_tooltip_element) {
                        existing_tooltip_element.textContent = `Move a MIDI control for: ${param.toUpperCase()}`;
                    }
                }
            }, true);
        });

        // Update indicators when learn completes
        window.addEventListener('midiLearnComplete', (event_object) => {
            monotron_learnable_parameters_array.forEach(({ param, element }) => {
                if (!element) return;
                const updated_source_id_string = midi_controller_instance.getSourceForParameter(param);
                element.classList.toggle('midi-mapped', !!updated_source_id_string);
                if (updated_source_id_string) element.style.position = 'relative';
            });
        });
    }
}
