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

});
