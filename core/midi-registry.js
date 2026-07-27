/**
 * MIDILearnRegistry — Centralized UI manager for MIDI mapping.
 *
 * WHAT: Handles the "Learn Mode" UI state, intercepts clicks on registered UI elements,
 *       and communicates with the underlying MIDIController.
 * WHY:  Previously, app.js, monotron-ui.js, and sampler-ui.js each had to implement
 *       their own duplicate MIDI learn UI logic. This registry unifies it so any instrument
 *       can simply call window.MIDIRegistry.register() to make a knob learnable.
 */

class MIDILearnRegistry {
    constructor() {
        this.learnableParameters = new Map();
        this.isLearnActive = false;
        this.listeningElement = null;
        this.tooltip = null;

        // Button bindings
        const btnLearn = document.getElementById('btn-midi-learn');
        if (btnLearn) btnLearn.addEventListener('click', () => this.toggleLearnMode());

        const btnReset = document.getElementById('btn-midi-reset');
        if (btnReset) {
            btnReset.addEventListener('click', () => {
                if (window.MIDIController) window.MIDIController.resetMap();
                if (this.isLearnActive) this.toggleLearnMode();
                this.updateMappedIndicators();
            });
        }

        window.addEventListener('keydown', (e) => {
            if (e.key === 'Escape' && this.isLearnActive) {
                this.toggleLearnMode();
            }
        });

        // Listen for successful mapping to update UI
        window.addEventListener('midiLearnComplete', (e) => {
            const { parameter, sourceId } = e.detail;
            
            if (this.listeningElement) {
                this.listeningElement.classList.remove('midi-listening');
                this.listeningElement = null;
            }

            const sourceLabel = window.MIDIController ? window.MIDIController.getSourceLabel(sourceId) : sourceId;
            this.showTooltip(`✓ Mapped ${sourceLabel} → ${parameter.toUpperCase()}`);

            // Auto-exit learn mode after successful map
            setTimeout(() => {
                if (this.isLearnActive) this.toggleLearnMode();
            }, 1500);

            this.updateMappedIndicators();
        });
    }

    // WHAT: Registers a DOM element to be interceptable during Learn Mode.
    register(paramName, domElement) {
        if (!domElement) return;
        this.learnableParameters.set(paramName, { element: domElement });

        // Intercept clicks during learn mode
        domElement.addEventListener('click', (e) => {
            if (this.isLearnActive) {
                e.preventDefault();
                e.stopPropagation();
                this.handleLearnClick(paramName, domElement);
            }
        }, true);

        // Update its indicator immediately
        this.updateMappedIndicator(paramName, domElement);
    }

    handleLearnClick(paramName, domElement) {
        // Clear previous listening
        if (this.listeningElement) {
            this.listeningElement.classList.remove('midi-listening');
        }

        this.listeningElement = domElement;
        this.listeningElement.classList.add('midi-listening');

        if (window.MIDIController) {
            window.MIDIController.enterLearnMode(paramName);
        }

        this.showTooltip(`Move a MIDI control for: ${paramName.toUpperCase()}`);
    }

    toggleLearnMode() {
        this.isLearnActive = !this.isLearnActive;
        document.body.classList.toggle('midi-learn-active', this.isLearnActive);
        
        const btnLearn = document.getElementById('btn-midi-learn');
        if (btnLearn) btnLearn.classList.toggle('active', this.isLearnActive);

        if (this.isLearnActive) {
            this.showTooltip('MIDI LEARN: Click a control to assign...');
        } else {
            if (this.listeningElement) {
                this.listeningElement.classList.remove('midi-listening');
                this.listeningElement = null;
            }
            if (window.MIDIController) window.MIDIController.exitLearnMode();
            this.removeTooltip();
        }
    }

    showTooltip(text) {
        this.removeTooltip();
        this.tooltip = document.createElement('div');
        this.tooltip.className = 'midi-learn-tooltip';
        this.tooltip.textContent = text;
        document.body.appendChild(this.tooltip);
    }

    removeTooltip() {
        if (this.tooltip) {
            this.tooltip.remove();
            this.tooltip = null;
        }
    }

    updateMappedIndicators() {
        this.learnableParameters.forEach((data, paramName) => {
            this.updateMappedIndicator(paramName, data.element);
        });
    }

    updateMappedIndicator(paramName, domElement) {
        if (!window.MIDIController || !domElement) return;
        const mappedSource = window.MIDIController.getSourceForParameter(paramName);
        domElement.classList.toggle('midi-mapped', !!mappedSource);
        domElement.style.position = mappedSource ? 'relative' : '';
    }
}

window.MIDIRegistry = new MIDILearnRegistry();
