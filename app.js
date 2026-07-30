document.addEventListener('DOMContentLoaded', () => {

    // ==========================================
    // MIDI CONTROLLER INTEGRATION
    // ==========================================
    const midi_controller_instance = window.MIDIController;
    const midi_status_indicator_dot_element = document.getElementById('midi-dot');
    const midi_status_label_element = document.getElementById('midi-label');
    const button_midi_learn_element = document.getElementById('btn-midi-learn');
    const button_midi_reset_element = document.getElementById('btn-midi-reset');
    const midi_note_target_element = document.getElementById('midi-note-target');
    const saved_midi_note_target = localStorage.getItem('tb303_midiNoteTarget');
    if (saved_midi_note_target && midi_note_target_element?.querySelector(`option[value="${saved_midi_note_target}"]`)) midi_note_target_element.value = saved_midi_note_target;
    midi_note_target_element?.addEventListener('change', event => localStorage.setItem('tb303_midiNoteTarget', event.target.value));

    // --- MIDI Status Indicator ---
    window.addEventListener('midiDeviceChange', (event_object) => {
        const { type, device } = event_object.detail;
        midi_status_indicator_dot_element.classList.remove('connected', 'unsupported');

        if (type === 'connected') {
            midi_status_indicator_dot_element.classList.add('connected');
            midi_status_label_element.textContent = device ? device.name : 'MIDI';
        } else if (type === 'disconnected') {
            // Check if any devices still connected
            if (midi_controller_instance.isConnected) {
                midi_status_indicator_dot_element.classList.add('connected');
                midi_status_label_element.textContent = midi_controller_instance.deviceNames[0] || 'MIDI';
            } else {
                midi_status_label_element.textContent = 'MIDI';
            }
        } else if (type === 'unsupported') {
            midi_status_indicator_dot_element.classList.add('unsupported');
            midi_status_label_element.textContent = 'NO MIDI';
        }
    });

    const mode_selector_element = document.getElementById('mode-selector');
    if (mode_selector_element) {
        mode_selector_element.addEventListener('change', (e) => {
            if (window.Mode) {
                window.Mode.setMode(e.target.value);
            }
        });
    }

    // ==========================================
    // PEDAL BOARD WIRING
    // ==========================================
    // WHAT: Wires up the shared PedalBoard UI to the global PedalBoard engine.
    // WHY:  Since the pedal board affects multiple modules, it's owned by the main app,
    //       not individual instruments like the TB-303.
    function bindPedalBoard() {
        if (!window.PedalBoard) return;
        
        // Master enable toggles
        document.querySelectorAll('.pedal-enable').forEach(checkbox_element => {
            checkbox_element.addEventListener('change', (event_object) => {
                const pedal_id_string = event_object.target.closest('.pedal-row').dataset.pedal;
                window.PedalBoard.setPedalEnabled(pedal_id_string, event_object.target.checked);
            });
        });

        // Module routing toggles
        document.querySelectorAll('.pedal-route').forEach(checkbox_element => {
            checkbox_element.addEventListener('change', (event_object) => {
                const pedal_id_string = event_object.target.closest('.pedal-row').dataset.pedal;
                const module_id_string = event_object.target.dataset.module;
                window.PedalBoard.setPedalRoute(pedal_id_string, module_id_string, event_object.target.checked);
            });
        });

        // Parameter sliders
        document.querySelectorAll('.pedal-param-slider').forEach(slider_element => {
            slider_element.addEventListener('input', (event_object) => {
                const pedal_id_string = event_object.target.closest('.pedal-row').dataset.pedal;
                const param_name_string = event_object.target.dataset.param;
                const value_float = parseFloat(event_object.target.value);
                window.PedalBoard.setPedalParam(pedal_id_string, param_name_string, value_float);
            });
        });

        // Register MIDI for pedals (only the master enable toggles are exposed via MIDI for now)
        if (window.MIDIRegistry) {
            document.querySelectorAll('.pedal-enable').forEach(checkbox_element => {
                const pedal_id_string = checkbox_element.closest('.pedal-row').dataset.pedal;
                window.MIDIRegistry.register(`pedal-${pedal_id_string}`, checkbox_element);
            });
        }
    }
    bindPedalBoard();

    // ==========================================

    // MASTER AUDIO RECORDER & WAV ENCODER
    // ==========================================
    let master_recorder_node = null;
    let master_audio_blob = null;
    let recording_start_timestamp = 0;
    let recording_timer_interval_id = null;

    const btn_master_rec_start_element = document.getElementById('btn-master-rec-start');
    const btn_master_rec_stop_element = document.getElementById('btn-master-rec-stop');
    const btn_master_rec_download_element = document.getElementById('btn-master-rec-download');
    const master_rec_status_element = document.getElementById('master-rec-status');
    const master_rec_format_element = document.getElementById('master-rec-format');

    // WHAT: Encodes an AudioBuffer into an uncompressed 16-bit PCM WAV Blob.
    // WHY: Standard browser Tone.Recorder output is WebM audio; encoding to WAV provides
    //      lossless quality for DAW importing without external backend services.
    function audioBufferToWavBlob(audio_buffer_object) {
        const number_of_channels = audio_buffer_object.numberOfChannels;
        const sample_rate_hz = audio_buffer_object.sampleRate;
        const total_samples = audio_buffer_object.length;
        const bytes_per_sample = 2; // 16-bit PCM
        const block_align = number_of_channels * bytes_per_sample;
        const wav_header_size_bytes = 44;
        const data_byte_length = total_samples * block_align;
        const array_buffer = new ArrayBuffer(wav_header_size_bytes + data_byte_length);
        const data_view = new DataView(array_buffer);

        const writeString = (offset_bytes, text_string) => {
            for (let char_index = 0; char_index < text_string.length; char_index++) {
                data_view.setUint8(offset_bytes + char_index, text_string.charCodeAt(char_index));
            }
        };

        /* RIFF identifier */
        writeString(0, 'RIFF');
        /* RIFF chunk length */
        data_view.setUint32(4, 36 + data_byte_length, true);
        /* RIFF type */
        writeString(8, 'WAVE');
        /* format chunk identifier */
        writeString(12, 'fmt ');
        /* format chunk length */
        data_view.setUint32(16, 16, true);
        /* sample format (1 = PCM) */
        data_view.setUint16(20, 1, true);
        /* channel count */
        data_view.setUint16(22, number_of_channels, true);
        /* sample rate */
        data_view.setUint32(24, sample_rate_hz, true);
        /* byte rate */
        data_view.setUint32(28, sample_rate_hz * block_align, true);
        /* block align */
        data_view.setUint16(32, block_align, true);
        /* bits per sample */
        data_view.setUint16(34, 16, true);
        /* data chunk identifier */
        writeString(36, 'data');
        /* data chunk length */
        data_view.setUint32(40, data_byte_length, true);

        // Interleave audio channel data into 16-bit PCM integers
        let data_offset_bytes = 44;
        const channel_data_arrays = [];
        for (let channel_index = 0; channel_index < number_of_channels; channel_index++) {
            channel_data_arrays.push(audio_buffer_object.getChannelData(channel_index));
        }

        for (let sample_index = 0; sample_index < total_samples; sample_index++) {
            for (let channel_index = 0; channel_index < number_of_channels; channel_index++) {
                const sample_float = Math.max(-1, Math.min(1, channel_data_arrays[channel_index][sample_index]));
                const pcm_16_bit_integer = sample_float < 0 ? sample_float * 0x8000 : sample_float * 0x7FFF;
                data_view.setInt16(data_offset_bytes, pcm_16_bit_integer, true);
                data_offset_bytes += 2;
            }
        }

        return new Blob([array_buffer], { type: 'audio/wav' });
    }

    btn_master_rec_start_element?.addEventListener('click', async () => {
        await Tone.start();

        if (!master_recorder_node) {
            master_recorder_node = new Tone.Recorder();
            Tone.Destination.connect(master_recorder_node);
        }

        await master_recorder_node.start();
        recording_start_timestamp = performance.now();

        btn_master_rec_start_element.disabled = true;
        btn_master_rec_start_element.style.opacity = '0.5';
        btn_master_rec_stop_element.disabled = false;
        btn_master_rec_stop_element.style.opacity = '1';
        btn_master_rec_download_element.disabled = true;
        btn_master_rec_download_element.style.opacity = '0.5';

        recording_timer_interval_id = setInterval(() => {
            const elapsed_seconds = ((performance.now() - recording_start_timestamp) / 1000).toFixed(1);
            if (master_rec_status_element) {
                master_rec_status_element.textContent = `🔴 ${elapsed_seconds}s`;
                master_rec_status_element.style.color = '#ff3366';
            }
        }, 100);
    });

    btn_master_rec_stop_element?.addEventListener('click', async () => {
        if (!master_recorder_node) return;
        clearInterval(recording_timer_interval_id);

        if (master_rec_status_element) {
            master_rec_status_element.textContent = 'SAVING...';
            master_rec_status_element.style.color = '#e9ff6a';
        }

        master_audio_blob = await master_recorder_node.stop();

        btn_master_rec_start_element.disabled = false;
        btn_master_rec_start_element.style.opacity = '1';
        btn_master_rec_stop_element.disabled = true;
        btn_master_rec_stop_element.style.opacity = '0.6';
        btn_master_rec_download_element.disabled = false;
        btn_master_rec_download_element.style.opacity = '1';

        if (master_rec_status_element) {
            master_rec_status_element.textContent = 'READY';
            master_rec_status_element.style.color = '#4fd1a1';
        }
    });

    btn_master_rec_download_element?.addEventListener('click', async () => {
        if (!master_audio_blob) return;

        const selected_format = master_rec_format_element ? master_rec_format_element.value : 'wav';
        const timestamp_string = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);

        let final_download_blob = master_audio_blob;
        let file_extension_string = 'webm';

        if (selected_format === 'wav') {
            if (master_rec_status_element) {
                master_rec_status_element.textContent = 'CONVERTING...';
            }
            try {
                const array_buffer = await master_audio_blob.arrayBuffer();
                const audio_context = Tone.getContext().rawContext;
                const audio_buffer = await audio_context.decodeAudioData(array_buffer);
                final_download_blob = audioBufferToWavBlob(audio_buffer);
                file_extension_string = 'wav';
            } catch (conversion_error) {
                console.error('WAV conversion failed, fallback to WebM', conversion_error);
                final_download_blob = master_audio_blob;
                file_extension_string = 'webm';
            }
        }

        const download_link_element = document.createElement('a');
        download_link_element.href = URL.createObjectURL(final_download_blob);
        download_link_element.download = `tb303_jam_${timestamp_string}.${file_extension_string}`;
        download_link_element.click();
        URL.revokeObjectURL(download_link_element.href);

        if (master_rec_status_element) {
            master_rec_status_element.textContent = 'DOWNLOADED';
            master_rec_status_element.style.color = '#4fd1a1';
        }
    });

});
