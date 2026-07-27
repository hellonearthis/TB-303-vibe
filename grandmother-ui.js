class GrandmotherInstrument extends window.Instrument {
    constructor() {
        super('grandmother', document.getElementById('grandmother-section'));
        this.engine = window.GrandmotherEngine;
    }

    mount() {
        super.mount();
        this.setupUI();
    }

    setupUI() {
        const grandmother_engine_instance = this.engine;
        const grandmother_section_element = this.container_element_node;
        const drone_indicator_element = document.getElementById('drone-indicator');
        const button_drone_toggle_element = document.getElementById('btn-drone-toggle');
        const tempo_input_element = document.getElementById('tempo');
        const sequencer_engine_instance = window.SequencerEngine;

        // Drone Toggle
        // WHAT: Turns the Moog Grandmother synthesizer on or off and updates the UI styling.
        // WHY: Since it's a drone synth, it doesn't wait for sequencer notes. The user manually powers it on, so we need a dedicated button and visual state changes.
        button_drone_toggle_element.addEventListener('click', async () => {
            await Tone.start();
            if (!grandmother_engine_instance.isPlaying) {
                if (grandmother_engine_instance.timing.clockMode === '303' && !sequencer_engine_instance.isPlaying) {
                    sequencer_engine_instance.start();
                    window.SamplerEngine?.startSequence();
                }
                grandmother_engine_instance.startDrone();
                grandmother_section_element.classList.add('drone-active');
                drone_indicator_element.classList.add('active');
                button_drone_toggle_element.classList.remove('btn-drone-off');
                button_drone_toggle_element.textContent = 'DRONE: ON';
            } else {
                grandmother_engine_instance.stopDrone();
                grandmother_section_element.classList.remove('drone-active');
                drone_indicator_element.classList.remove('active');
                button_drone_toggle_element.classList.add('btn-drone-off');
                button_drone_toggle_element.textContent = 'DRONE: OFF';
            }
        });

        // Grandmother knob controls — map element IDs to engine param keys
        const grandmother_controls_array = [
            { id: 'gm-osc1-level', param: 'osc1Level', valId: 'gm-osc1-level-val' },
            { id: 'gm-osc2-level', param: 'osc2Level', valId: 'gm-osc2-level-val' },
            { id: 'gm-detune',     param: 'detune',    valId: 'gm-detune-val' },
            { id: 'gm-noise',      param: 'noiseLevel', valId: 'gm-noise-val' },
            { id: 'gm-cutoff',     param: 'cutoff',    valId: 'gm-cutoff-val' },
            { id: 'gm-resonance',  param: 'resonance', valId: 'gm-resonance-val' },
            { id: 'gm-attack',     param: 'attack',    valId: 'gm-attack-val' },
            { id: 'gm-decay',      param: 'decay',     valId: 'gm-decay-val' },
            { id: 'gm-sustain',    param: 'sustain',   valId: 'gm-sustain-val' },
            { id: 'gm-release',    param: 'release',   valId: 'gm-release-val' },
            { id: 'gm-mod-wheel',  param: 'modWheel',  valId: 'gm-mod-wheel-val' },
            { id: 'gm-mod-rate',   param: 'modRate',   valId: 'gm-mod-rate-val' },
            { id: 'gm-sh-rate',    param: 'shRate',    valId: 'gm-sh-rate-val' },
            { id: 'gm-sh-depth',   param: 'shDepth',   valId: 'gm-sh-depth-val' },
            { id: 'gm-volume',     param: 'volume',    valId: 'gm-volume-val' },
            { id: 'gm-reverb',     param: 'reverb',    valId: 'gm-reverb-val' }
        ];

        grandmother_controls_array.forEach(({ id, param, valId }) => {
            const input_element_node = document.getElementById(id);
            const value_display_element_node = document.getElementById(valId);

            if (input_element_node) {
                input_element_node.addEventListener('input', (event_object) => {
                    const slider_value_float = parseFloat(event_object.target.value);
                    grandmother_engine_instance.setParam(param, slider_value_float);
                    value_display_element_node.textContent = Math.round(slider_value_float * 100) + '%';
                });
            }
        });


        const grandmother_select_parameters = [
            { id: 'gm-osc1-wave', param: 'osc1Wave' },
            { id: 'gm-osc2-wave', param: 'osc2Wave' },
            { id: 'gm-mod-wave', param: 'modWave' },
            { id: 'gm-mod-target', param: 'modTarget' }
        ];
        grandmother_select_parameters.forEach(({ id, param }) => {
            const select_element = document.getElementById(id);
            select_element?.addEventListener('change', event => grandmother_engine_instance.setParam(param, event.target.value));
        });

        const timing_control_map = {
            'gm-clock-mode': 'clockMode',
            'gm-start-mode': 'startMode',
            'gm-cycle-bars': 'cycleBars',
            'gm-envelope-mode': 'envelopeMode',
            'gm-sh-division': 'shDivision'
        };
        const clock_mode_element = document.getElementById('gm-clock-mode');
        const clock_status_element = document.getElementById('gm-clock-status');
        const sh_rate_element = document.getElementById('gm-sh-rate');

        function updateGrandmotherClockUI() {
            const clocked = clock_mode_element.value === '303';
            grandmother_section_element.classList.toggle('clock-synced', clocked);
            sh_rate_element.disabled = clocked;
            if (clocked) {
                const bars_label = document.getElementById('gm-cycle-bars').selectedOptions[0].text;
                const division_label = document.getElementById('gm-sh-division').selectedOptions[0].text;
                clock_status_element.textContent = `303 LOCK · ${bars_label.toUpperCase()} · S&H ${division_label.toUpperCase()}`;
            } else {
                clock_status_element.textContent = 'FREE CLOCK · S&H RUNS IN SECONDS';
            }
        }

        Object.entries(timing_control_map).forEach(([element_id, timing_parameter]) => {
            document.getElementById(element_id).addEventListener('change', event => {
                grandmother_engine_instance.setTimingParam(timing_parameter, event.target.value);
                if (timing_parameter === 'clockMode' && event.target.value === '303' && grandmother_engine_instance.isPlaying && !sequencer_engine_instance.isPlaying) {
                    sequencer_engine_instance.start();
                    window.SamplerEngine?.startSequence();
                }
                if (timing_parameter === 'clockMode' && event.target.value === '303') {
                    const lfo_sync = document.getElementById('gm-mod-sync');
                    if (!lfo_sync.checked) {
                        lfo_sync.checked = true;
                        lfo_sync.dispatchEvent(new Event('change'));
                    }
                }
                updateGrandmotherClockUI();
            });
        });
        document.getElementById('gm-follow-gate').addEventListener('change', event => grandmother_engine_instance.setTimingParam('followGate', event.target.checked));
        document.getElementById('gm-stop-with-303').addEventListener('change', event => grandmother_engine_instance.setTimingParam('stopWith303', event.target.checked));

        sequencer_engine_instance.addStepCallback((step_index, scheduled_time, step_data, step_duration, previous_step, next_step) => {
            grandmother_engine_instance.handle303Step(step_index, scheduled_time, step_data, step_duration, previous_step, next_step);
        });
        updateGrandmotherClockUI();    // --- LFO BPM Sync ---
        const grandmother_mod_sync_checkbox_element = document.getElementById('gm-mod-sync');
        const grandmother_mod_rate_slider_element = document.getElementById('gm-mod-rate');
        const grandmother_sync_rate_slider_element = document.getElementById('gm-sync-rate');
        const grandmother_mod_rate_value_element = document.getElementById('gm-mod-rate-val');

        const grandmother_sync_rates_array = [
            { label: '4 Bars', beats: 16 },
            { label: '2 Bars', beats: 8 },
            { label: '1 Bar', beats: 4 },
            { label: '1/2 Note', beats: 2 },
            { label: 'Dotted 1/4', beats: 1.5 },
            { label: '1/4 Note', beats: 1 },
            { label: 'Dotted 1/8', beats: 0.75 },
            { label: '1/8 Note', beats: 0.5 },
            { label: '1/16 Note', beats: 0.25 },
            { label: '1/32 Note', beats: 0.125 }
        ];

        // WHAT: Recalculates the LFO frequency based on the master sequencer tempo and the chosen musical subdivision.
        // WHY: When BPM sync is enabled, the LFO needs to wobble perfectly in time with the drums/bassline instead of running freely.
        window.updateGmSyncRate = function() {
            if (!grandmother_mod_sync_checkbox_element || !grandmother_mod_sync_checkbox_element.checked) return;
            const current_beats_per_minute = parseFloat(tempo_input_element.value) || 120;
            const selected_sync_index = parseInt(grandmother_sync_rate_slider_element.value);
            const sync_rate_object = grandmother_sync_rates_array[selected_sync_index];
            const calculated_frequency_hertz = (current_beats_per_minute / 60) / sync_rate_object.beats;
            grandmother_engine_instance.setModRateHz(calculated_frequency_hertz);
            if (grandmother_mod_rate_value_element) grandmother_mod_rate_value_element.textContent = sync_rate_object.label;
        };

        if (grandmother_mod_sync_checkbox_element) {
            grandmother_mod_sync_checkbox_element.addEventListener('change', (event_object) => {
                grandmother_engine_instance.setTimingParam('lfoSync', event_object.target.checked);
                if (event_object.target.checked) {
                    grandmother_mod_rate_slider_element.style.display = 'none';
                    grandmother_sync_rate_slider_element.style.display = 'block';
                    window.updateGmSyncRate();
                } else {
                    grandmother_mod_rate_slider_element.style.display = 'block';
                    grandmother_sync_rate_slider_element.style.display = 'none';
                    const slider_value_float = parseFloat(grandmother_mod_rate_slider_element.value);
                    grandmother_engine_instance.setParam('modRate', slider_value_float);
                    if (grandmother_mod_rate_value_element) grandmother_mod_rate_value_element.textContent = Math.round(slider_value_float * 100) + '%';
                }
            });
            grandmother_sync_rate_slider_element.addEventListener('input', window.updateGmSyncRate);
            grandmother_mod_sync_checkbox_element.dispatchEvent(new Event('change')); // Sync initial state
        }

        const grandmother_aux_switch_element = document.getElementById('gm-aux');
        if (grandmother_aux_switch_element) {
            // WHAT: Routes the main TB-303 output into the Grandmother mixer.
            // WHY: Acts like plugging a patch cable between the two synths, allowing the 303 to be processed by the Grandmother's filter and reverb.
            grandmother_aux_switch_element.addEventListener('change', (event_object) => {
                if (window.AudioEngine) {
                    if (event_object.target.checked) {
                        window.Bus.routeAudio(window.AudioEngine.volume, 'grandmother_ext_in', true);
                    } else {
                        window.Bus.routeAudio(window.AudioEngine.volume, 'grandmother_ext_in', false);
                    }
                }
            });
            grandmother_aux_switch_element.dispatchEvent(new Event('change')); // Sync initial state
        }

        // --- MIDI Registration & CC Mapping ---
        if (window.MIDIRegistry) {
            grandmother_controls_array.forEach(({ id, param }) => {
                const element_node = document.getElementById(id)?.closest('.gm-knob-group');
                if (element_node) {
                    window.MIDIRegistry.register(`gm-${param}`, element_node);
                }
            });
        }

        window.addEventListener('midiCCChange', (event_object) => {
            const { parameter, scaledValue } = event_object.detail;
            if (parameter.startsWith('gm-')) {
                const grandmother_parameter_name_string = parameter.replace('gm-', '');
                
                // Override modRate if BPM SYNC is enabled
                if (grandmother_parameter_name_string === 'modRate' && grandmother_mod_sync_checkbox_element && grandmother_mod_sync_checkbox_element.checked) {
                    const synchronized_index_integer = Math.round(scaledValue * 9); // Map 0-1 to 0-9
                    if (grandmother_sync_rate_slider_element) {
                        grandmother_sync_rate_slider_element.value = synchronized_index_integer;
                        window.updateGmSyncRate();
                    }
                    return;
                }

                const grandmother_control_object = grandmother_controls_array.find(obj => obj.param === grandmother_parameter_name_string);
                if (grandmother_control_object) {
                    const hardware_input_element_node = document.getElementById(grandmother_control_object.id);
                    if (hardware_input_element_node) {
                        hardware_input_element_node.value = scaledValue;
                        // Dispatch input event to sync display and audio engine
                        hardware_input_element_node.dispatchEvent(new Event('input'));
                    }
                }
            }
        });
    }
}

document.addEventListener('DOMContentLoaded', () => {
    window.Rack.register(new GrandmotherInstrument());
});
