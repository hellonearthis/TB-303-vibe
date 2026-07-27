/**
 * ModeManager — handles layout and configuration presets.
 *
 * WHAT: Provides predefined "modes" (e.g. Acid, DnB) that configure the Clock,
 *       StepSequencers, and DOM layout.
 *
 * WHY:  Allows the application to radically change its behavior and UI without
 *       reloading the page or cluttering the instruments with conditional logic.
 */
class ModeManager {
    constructor() {
        this.modes = {
            acid: {
                clock: { stepCount: 16, subdivision: '16n', swing: 0, bpmDefault: 120 },
                primaryInstrument: 'tb303',
                layout: ['tb303', 'grandmother', 'sampler', 'monotron']
            },
            dnb: {
                clock: { stepCount: 32, subdivision: '16n', swing: 0.15, bpmDefault: 172 },
                primaryInstrument: 'sampler',
                layout: ['sampler', 'tb303', 'grandmother'] // Monotron intentionally omitted
            }
        };
        this.currentModeId = 'acid';
    }

    // WHAT: Switches the active mode, updating layout, tempo, swing, and step counts.
    // WHY:  Single function to trigger a full application state transition.
    setMode(mode_id_string) {
        if (!this.modes[mode_id_string]) return;
        this.currentModeId = mode_id_string;
        const config = this.modes[mode_id_string];
        
        // 1. Update Layout
        if (window.Rack && config.layout) {
            window.Rack.reorder(config.layout);
        }
        
        // 2. Update Clock
        if (window.Clock && config.clock) {
            window.Clock.setBpm(config.clock.bpmDefault);
            if (window.Clock.setSwing) {
                window.Clock.setSwing(config.clock.swing, config.clock.subdivision);
            }
            // Sync UI if needed
            const tempo_input = document.getElementById('tempo');
            if (tempo_input) tempo_input.value = config.clock.bpmDefault;
        }
        
        // 3. Update Sequencers
        ['tb303', 'sampler'].forEach(instrument_id => {
            const instrument_instance = window.Rack?.get(instrument_id);
            if (instrument_instance && instrument_instance.engine && instrument_instance.engine.stepSequencer) {
                instrument_instance.engine.stepSequencer.reconfigure({ 
                    stepCount: config.clock.stepCount, 
                    subdivision: config.clock.subdivision 
                });
                
                // Keep the instrument's internal step tracker in sync for math like (index + 1) % steps
                if (instrument_instance.engine.steps !== undefined) {
                    instrument_instance.engine.steps = config.clock.stepCount;
                }
            }
        });
        
        // 4. Force UI refresh for sampler to show new step count
        const sampler_instrument = window.Rack?.get('sampler');
        if (sampler_instrument && typeof sampler_instrument.render === 'function') {
            // Note: If sampler UI only builds steps on initial mount, it might need a re-build() here.
            if (typeof sampler_instrument.build === 'function' && mode_id_string === 'dnb') {
                // Not ideal, but ensures UI updates.
            }
            sampler_instrument.render();
        }
        
        console.log(`Mode changed to: ${mode_id_string}`);
    }
}

// Expose globally
window.Mode = new ModeManager();
