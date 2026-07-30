/**
 * PedalBoard — shared multi-module effects engine.
 *
 * WHAT: Manages a catalogue of 8 guitar-style effect pedals that can be
 *       independently enabled/disabled and routed to any combination of
 *       the four audio modules (303, Moog, Monotron, Sampler).
 *
 * WHY:  The old system hardcoded 3 effects inside the 303's audio chain.
 *       Extracting effects into a shared engine lets every module benefit
 *       from the full pedal board, with per-module serial chains and
 *       independent effect instances so there is no cross-bleed between
 *       modules sharing the same pedal type.
 *
 * ARCHITECTURE:
 *   - Each module registers a "pre-pedal" node and a "post-pedal" node.
 *   - For each registered module, PedalBoard creates a dedicated serial
 *     chain of all 8 effect instances (separate from every other module).
 *   - Chain order follows traditional guitar pedalboard convention:
 *     Gain → Modulation → Time-based (Overdrive → Distortion → Fuzz →
 *     Chorus → Phaser → Tremolo → Delay → Reverb).
 *   - An effect's wet value is non-zero ONLY when both the pedal's master
 *     enable is ON and the module is ticked in that pedal
 */

// WHAT: Custom composite effect for Delay.
// WHY: Native Tone.FeedbackDelay lacks filter (tone) in the feedback loop and modulation on the trails, which were specifically requested.
class CustomTapeDelay {
    constructor(options = {}) {
        this.input = new Tone.Gain();
        this.output = new Tone.Gain();
        this.wet = new Tone.Signal(options.mix || 0.5);

        this.crossFade = new Tone.CrossFade();
        this.wet.connect(this.crossFade.fade);

        this.delay = new Tone.Delay(options.time || 0.4, 2);
        this.feedback = new Tone.Gain(options.feedback || 0.4);
        this.filter = new Tone.Filter(options.tone || 2000, "lowpass");
        this.chorus = new Tone.Chorus(4, 2.5, options.mod || 0).start();
        
        this.input.connect(this.crossFade.a);
        this.input.connect(this.delay);
        this.delay.chain(this.filter, this.chorus, this.crossFade.b);
        this.chorus.chain(this.feedback, this.delay);
        this.crossFade.connect(this.output);
        
        this.delayTime = this.delay.delayTime;
        this.feedbackParam = this.feedback.gain;
        this.toneParam = this.filter.frequency;
        this.modParam = this.chorus.depth;
    }

    connect(destination) {
        this.output.connect(destination);
        return this;
    }
}

// WHAT: Custom composite effect for Reverb.
// WHY: Native Tone.Reverb lacks a tone (filter) control, which was specifically requested.
class CustomReverb {
    constructor(options = {}) {
        this.input = new Tone.Gain();
        this.output = new Tone.Gain();
        this.wet = new Tone.Signal(options.mix || 0.5);

        this.crossFade = new Tone.CrossFade();
        this.wet.connect(this.crossFade.fade);

        this.reverb = new Tone.Reverb({
            decay: options.decay || 3,
            preDelay: options.preDelay || 0.01
        });
        
        this.filter = new Tone.Filter(options.tone || 3000, "lowpass");

        this.input.connect(this.crossFade.a);
        this.input.chain(this.reverb, this.filter, this.crossFade.b);
        this.crossFade.connect(this.output);

        this.toneParam = this.filter.frequency;
    }

    set decay(value) { this.reverb.decay = value; }
    set preDelay(value) { this.reverb.preDelay = value; }

    connect(destination) {
        this.output.connect(destination);
        return this;
    }
}

class PedalBoard {
    // WHAT: Initializes the central pedal board, defining the effects and state.
    // WHY:  We need one unified manager to handle all effect chains for all modules.
    constructor() {
        this.module_chains_object = {};

        // Track global state for each pedal
        this.pedal_state_object = {
            'overdrive':  { enabled_boolean: false, routed_modules_set: new Set(['303']), params: {} },
            'distortion': { enabled_boolean: false, routed_modules_set: new Set(['303']), params: {} },
            'fuzz':       { enabled_boolean: false, routed_modules_set: new Set(['303']), params: {} },
            'chorus':     { enabled_boolean: false, routed_modules_set: new Set(['303']), params: {} },
            'phaser':     { enabled_boolean: false, routed_modules_set: new Set(['303']), params: {} },
            'tremolo':    { enabled_boolean: false, routed_modules_set: new Set(['303']), params: {} },
            'delay':      { enabled_boolean: false, routed_modules_set: new Set(['303']), params: { time: 0.4, feedback: 0.4, mix: 0.5, mod: 0.5, tone: 2000 } },
            'reverb':     { enabled_boolean: false, routed_modules_set: new Set(['303']), params: { decay: 3, mix: 0.6, preDelay: 0.05, tone: 3000 } },
        };

        // WHAT: Defines the available effects, their UI groupings, and Tone.js instantiators.
        // WHY:  Keeping definitions separate from instances lets us create independent 
        //       parallel effect chains for different modules (303, Moog, etc.) later.
        this.pedal_definitions_array = [
            {
                id: 'overdrive',
                label: 'Overdrive',
                category: 'gain',
                // WHAT: Simulates an amp working a bit too hard.
                // WHY:  Lower distortion value keeps things gritty but polite.
                createEffect: () => new Tone.Distortion({ distortion: 0.4, oversample: '2x' }),
                wet_level_float: 1.0
            },
            {
                id: 'distortion',
                label: 'Distortion',
                category: 'gain',
                // WHAT: Aggressive hard-clipping distortion.
                // WHY:  Higher distortion value gives the "tin shed" sound described in the spec.
                createEffect: () => new Tone.Distortion({ distortion: 0.8, oversample: '2x' }),
                wet_level_float: 1.0
            },
            {
                id: 'fuzz',
                label: 'Fuzz',
                category: 'gain',
                // WHAT: Turns the audio into a massive, squared-off wall of noise.
                // WHY:  BitCrusher perfectly emulates the "malfunctioning wet woolen blanket" vibe.
                createEffect: () => new Tone.BitCrusher({ bits: 3 }),
                wet_level_float: 1.0
            },
            {
                id: 'chorus',
                label: 'Chorus',
                category: 'modulation',
                // WHAT: Copies the signal, detunes it, and plays it back with the original.
                // WHY:  Adds lush width and movement.
                createEffect: () => new Tone.Chorus(3, 3.5, 0.6).start(),
                wet_level_float: 1.0
            },
            {
                id: 'phaser',
                label: 'Phaser',
                category: 'modulation',
                // WHAT: Sweeps notch filters through the frequency spectrum.
                // WHY:  Creates the classic swooshing, sci-fi sound.
                createEffect: () => new Tone.Phaser({ frequency: 0.5, octaves: 3, baseFrequency: 1000 }),
                wet_level_float: 1.0
            },
            {
                id: 'tremolo',
                label: 'Tremolo',
                category: 'modulation',
                // WHAT: Modulates the volume up and down at a chosen rate.
                // WHY:  Simple amplitude LFO as described in the spec.
                createEffect: () => new Tone.Tremolo(4, 0.7).start(),
                wet_level_float: 1.0
            },
            {
                id: 'delay',
                label: 'Delay',
                category: 'time',
                // WHAT: Repeats the signal with decreasing volume — the agreeable parrot.
                // WHY:  CustomTapeDelay adds modulation and tone control as requested.
                createEffect: () => new CustomTapeDelay({ time: 0.4, feedback: 0.4, mix: 0.5, mod: 0.5, tone: 2000 }),
                wet_level_float: 0.5 // This is overriden by the params.mix
            },
            {
                id: 'reverb',
                label: 'Reverb',
                category: 'time',
                // WHAT: Simulates the reflections of a physical space (bathroom, cave, cathedral).
                // WHY:  CustomReverb adds tone control as requested.
                createEffect: () => new CustomReverb({ decay: 3, mix: 0.6, preDelay: 0.05, tone: 3000 }),
                wet_level_float: 0.6 // This is overriden by the params.mix
            }
        ];

        // WHAT: The serial order effects are chained in — gain first, modulation second, time last.
        // WHY:  This matches traditional guitar pedalboard convention. Distorting a delayed
        //       signal sounds very different from delaying a distorted signal; the latter
        //       is almost always more musical.
        this.chain_order_array = [
            'overdrive', 'distortion', 'fuzz',
            'chorus', 'phaser', 'tremolo',
            'delay', 'reverb'
        ];
        // WHAT: Master state for each pedal — whether it is enabled and which modules it routes to.
        // WHY:  An effect's wet value is non-zero ONLY when both enabled AND routed to a module.
        //       The routes Set defaults to ['303'] so the pedals work on the 303 out of the box,
        //       matching the old hardcoded behaviour.
        this.pedal_state_object = {
            'overdrive':  { enabled_boolean: false, routed_modules_set: new Set(['303']), params: {} },
            'distortion': { enabled_boolean: false, routed_modules_set: new Set(['303']), params: {} },
            'fuzz':       { enabled_boolean: false, routed_modules_set: new Set(['303']), params: {} },
            'chorus':     { enabled_boolean: false, routed_modules_set: new Set(['303']), params: {} },
            'phaser':     { enabled_boolean: false, routed_modules_set: new Set(['303']), params: {} },
            'tremolo':    { enabled_boolean: false, routed_modules_set: new Set(['303']), params: {} },
            'delay':      { enabled_boolean: false, routed_modules_set: new Set(['303']), params: { time: 0.4, feedback: 0.4, mix: 0.5, mod: 0, tone: 2000 } },
            'reverb':     { enabled_boolean: false, routed_modules_set: new Set(['303']), params: { decay: 3, mix: 0.6, preDelay: 0.01, tone: 3000 } },
        };

        // WHAT: Per-module chains of Tone.js effect instances, keyed by module ID.
        // WHY:  Each module gets its own independent set of effect nodes so there is
        //       no audio cross-bleed between modules sharing the same pedal type.
        this.module_chains_object = {};
    }

    // WHAT: Creates a dedicated serial effect chain for the given module and wires it
    //       between the module's pre-pedal and post-pedal audio nodes.
    // WHY:  Called once per module during its constructor. After this call, the PedalBoard
    //       owns the routing between pre and post — the module itself must NOT connect them.
    registerModule(module_id_string, pre_pedal_audio_node, post_pedal_audio_node) {
        const effects_by_id_object = {};

        let previous_audio_node = null;

        // WHAT: Instantiate every effect in chain order, connect them in series,
        //       and set all wet values to 0 (bypassed).
        // WHY:  Creating all 8 effects upfront with wet=0 is simpler than dynamically
        //       inserting/removing nodes. Tone.js effects with wet=0 pass-through
        //       the dry signal with negligible CPU cost.
        this.chain_order_array.forEach((pedal_id_string, chain_position_index) => {
            const pedal_definition_object = this.pedal_definitions_array.find(
                definition => definition.id === pedal_id_string
            );

            const effect_audio_node = pedal_definition_object.createEffect();
            effect_audio_node.wet.value = 0;
            effects_by_id_object[pedal_id_string] = effect_audio_node;

            const target_node = effect_audio_node.input || effect_audio_node;

            if (chain_position_index === 0) {
                // WHAT: Connect the module's pre-pedal node to the first effect in the chain.
                // WHY:  Tone.connect() safely bridges both native Web Audio nodes and
                //       Tone.js nodes, which is needed for the Monotron (native) module.
                Tone.connect(pre_pedal_audio_node, target_node);
            } else {
                // WHAT: Chain this effect after the previous one.
                // WHY:  Serial chaining means each effect processes the output of the
                //       previous one — Overdrive → Distortion sounds different from
                //       Distortion → Overdrive, and this order is the standard convention.
                previous_audio_node.connect(target_node);
            }

            previous_audio_node = effect_audio_node;
        });

        const final_target = post_pedal_audio_node.input || post_pedal_audio_node;
        // WHAT: Connect the last effect in the chain to the module's post-pedal node.
        // WHY:  Completes the serial chain so audio flows: pre → effects → post.
        previous_audio_node.connect(final_target);

        this.module_chains_object[module_id_string] = {
            effects_by_id_object: effects_by_id_object
        };

        // WHAT: Apply current pedal state to the newly registered module's effects.
        // WHY:  If pedals were enabled before this module registered (e.g. module
        //       loads after the user already toggled a pedal), the wet values must
        //       be synced immediately.
        this.chain_order_array.forEach(pedal_id_string => {
            this._updateSingleModulePedalWet(pedal_id_string, module_id_string);
        });
    }

    // WHAT: Toggles a pedal's master enable state and updates all module wet values.
    // WHY:  The master toggle affects every module that has this pedal routed.
    //       A disabled pedal has wet=0 on ALL modules regardless of routing.
    setPedalEnabled(pedal_id_string, is_enabled_boolean) {
        this.pedal_state_object[pedal_id_string].enabled_boolean = is_enabled_boolean;
        this._updateAllModulesPedalWet(pedal_id_string);
    }

    // WHAT: Adds or removes a module from a pedal's routing set.
    // WHY:  The user ticks/unticks a module checkbox to control which modules
    //       hear a specific effect without affecting other modules.
    setPedalRoute(pedal_id_string, module_id_string, is_routed_boolean) {
        const pedal_routing_state = this.pedal_state_object[pedal_id_string];
        if (is_routed_boolean) {
            pedal_routing_state.routed_modules_set.add(module_id_string);
        } else {
            pedal_routing_state.routed_modules_set.delete(module_id_string);
        }
        this._updateSingleModulePedalWet(pedal_id_string, module_id_string);
    }

    // WHAT: Recalculates the wet value for a single pedal across all registered modules.
    // WHY:  Called when the master enable toggles — every module needs its wet value checked.
    _updateAllModulesPedalWet(pedal_id_string) {
        Object.keys(this.module_chains_object).forEach(module_id_string => {
            this._updateSingleModulePedalWet(pedal_id_string, module_id_string);
        });
    }

    // WHAT: Updates a specific parameter on a pedal (e.g. delay time, reverb decay).
    // WHY:  Allows the UI sliders to adjust custom composite effects dynamically.
    setPedalParam(pedal_id_string, param_name, value) {
        const pedal_state = this.pedal_state_object[pedal_id_string];
        if (pedal_state && pedal_state.params) {
            pedal_state.params[param_name] = value;
        }

        // Iterate over all active modules to update the instantiated nodes
        Object.keys(this.module_chains_object).forEach(module_id_string => {
            const module_chain_object = this.module_chains_object[module_id_string];
            const effect = module_chain_object.effects_by_id_object[pedal_id_string];
            if (!effect) return;

            if (pedal_id_string === 'delay') {
                if (param_name === 'time') effect.delayTime.value = value;
                if (param_name === 'feedback') effect.feedbackParam.value = value;
                if (param_name === 'mix') effect.wet.value = value * (pedal_state.enabled_boolean && pedal_state.routed_modules_set.has(module_id_string) ? 1 : 0);
                if (param_name === 'mod') effect.modParam.value = value;
                if (param_name === 'tone') effect.toneParam.value = value;
            } else if (pedal_id_string === 'reverb') {
                if (param_name === 'decay') effect.decay = value;
                if (param_name === 'preDelay') effect.preDelay = value;
                if (param_name === 'mix') effect.wet.value = value * (pedal_state.enabled_boolean && pedal_state.routed_modules_set.has(module_id_string) ? 1 : 0);
                if (param_name === 'tone') effect.toneParam.value = value;
            } else if (pedal_id_string === 'chorus') {
                if (param_name === 'rate') effect.frequency.value = value;
                if (param_name === 'depth') effect.depth = value;
            } else if (pedal_id_string === 'tremolo') {
                if (param_name === 'frequency') effect.frequency.value = value;
                if (param_name === 'depth') effect.depth.value = value;
            }
            this._updateSingleModulePedalWet(pedal_id_string, module_id_string);
        });
    }

    // WHAT: Sets the wet value for one pedal on one specific module.
    // WHY:  The wet value is non-zero ONLY when the pedal is both master-enabled
    //       AND routed to this module. Otherwise it stays at 0 (full bypass).
    _updateSingleModulePedalWet(pedal_id_string, module_id_string) {
        const module_chain_object = this.module_chains_object[module_id_string];
        if (!module_chain_object) return;

        const effect_audio_node = module_chain_object.effects_by_id_object[pedal_id_string];
        if (!effect_audio_node) return;

        const pedal_state = this.pedal_state_object[pedal_id_string];
        const pedal_definition_object = this.pedal_definitions_array.find(
            definition => definition.id === pedal_id_string
        );

        const should_be_active_boolean =
            pedal_state.enabled_boolean &&
            pedal_state.routed_modules_set.has(module_id_string);

        let active_wet_level = pedal_definition_object.wet_level_float;
        if (pedal_state.params && pedal_state.params.mix !== undefined) {
            active_wet_level = pedal_state.params.mix;
        }

        effect_audio_node.wet.value = should_be_active_boolean ? active_wet_level : 0;
    }
}

// WHAT: Expose the PedalBoard as a global singleton.
// WHY:  All audio engine scripts and the UI wiring code reference
//       window.PedalBoard to register modules and toggle effects.
window.PedalBoard = new PedalBoard();
