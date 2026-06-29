document.addEventListener('DOMContentLoaded', () => {
    const seq = window.SequencerEngine;
    const audio = window.AudioEngine;

    // --- UI Elements ---
    const gridContainer = document.getElementById('grid-container');
    const playBtn = document.getElementById('btn-play');
    const stopBtn = document.getElementById('btn-stop');
    const clearBtn = document.getElementById('btn-clear');
    const tempoInput = document.getElementById('tempo');
    
    // Synth Controls
    const waveSelect = document.getElementById('wave-type');
    const cutoffInput = document.getElementById('cutoff');
    const resInput = document.getElementById('resonance');
    const envModInput = document.getElementById('env-mod');
    const decayInput = document.getElementById('decay');



    // --- Build Grid UI ---
    function renderGrid() {
        gridContainer.innerHTML = '';
        
        // Notes rows
        seq.scale.forEach(note => {
            const row = document.createElement('div');
            row.className = 'grid-row';
            
            const label = document.createElement('div');
            label.className = 'grid-label';
            label.textContent = note;
            row.appendChild(label);

            for (let i = 0; i < seq.steps; i++) {
                const cell = document.createElement('div');
                cell.className = 'grid-cell note-cell';
                cell.dataset.step = i;
                cell.dataset.note = note;
                
                if (seq.grid[i].note === note) {
                    cell.classList.add('active-note');
                }

                cell.addEventListener('click', () => {
                    seq.toggleNote(i, note);
                    renderGrid(); // Re-render to clear other notes in column
                });

                row.appendChild(cell);
            }
            gridContainer.appendChild(row);
        });

        // Slide Row
        const slideRow = document.createElement('div');
        slideRow.className = 'grid-row';
        const slideLabel = document.createElement('div');
        slideLabel.className = 'grid-label';
        slideLabel.textContent = 'SLIDE';
        slideRow.appendChild(slideLabel);
        
        for (let i = 0; i < seq.steps; i++) {
            const cell = document.createElement('div');
            cell.className = 'grid-cell slide-cell';
            if (seq.grid[i].slide) cell.classList.add('active-slide');
            
            cell.addEventListener('click', () => {
                seq.toggleSlide(i);
                cell.classList.toggle('active-slide');
            });
            slideRow.appendChild(cell);
        }
        gridContainer.appendChild(slideRow);

        // Accent Row
        const accRow = document.createElement('div');
        accRow.className = 'grid-row';
        const accLabel = document.createElement('div');
        accLabel.className = 'grid-label';
        accLabel.textContent = 'ACCENT';
        accRow.appendChild(accLabel);
        
        for (let i = 0; i < seq.steps; i++) {
            const cell = document.createElement('div');
            cell.className = 'grid-cell accent-cell';
            if (seq.grid[i].accent) cell.classList.add('active-accent');
            
            cell.addEventListener('click', () => {
                seq.toggleAccent(i);
                renderGrid(); // Re-render to clear mutually exclusive ghost
            });
            accRow.appendChild(cell);
        }
        gridContainer.appendChild(accRow);

        // Ghost Row
        const ghostRow = document.createElement('div');
        ghostRow.className = 'grid-row';
        const ghostLabel = document.createElement('div');
        ghostLabel.className = 'grid-label';
        ghostLabel.textContent = 'GHOST';
        ghostRow.appendChild(ghostLabel);
        
        for (let i = 0; i < seq.steps; i++) {
            const cell = document.createElement('div');
            cell.className = 'grid-cell ghost-cell';
            if (seq.grid[i].ghost) cell.classList.add('active-ghost');
            
            cell.addEventListener('click', () => {
                seq.toggleGhost(i);
                renderGrid(); // Re-render to clear mutually exclusive accent
            });
            ghostRow.appendChild(cell);
        }
        gridContainer.appendChild(ghostRow);
    }

    // --- Keyboard Shortcuts (1-9) ---
    window.addEventListener('keydown', (e) => {
        // Ignore if user is typing in a text/number input (but allow if they are on a range slider)
        if (e.target.tagName === 'INPUT' && e.target.type !== 'range') return;

        if (e.code && e.code.startsWith('Digit')) {
            // e.key might be '!' if shift is pressed, so extract number from e.code
            const key = parseInt(e.code.replace('Digit', ''));
            if (key >= 1 && key <= 9) {
                if (e.shiftKey) {
                    // Save pattern
                    seq.savePattern(key);
                } else {
                    // Recall pattern
                    if (seq.recallPattern(key)) {
                        renderGrid();
                    }
                }
            }
        }
    });

    // --- Sequencer UI Sync ---
    seq.setUICallback((stepIndex) => {
        // Remove playhead from all cells
        document.querySelectorAll('.grid-cell').forEach(c => c.classList.remove('playhead'));
        
        if (stepIndex >= 0) {
            // Add playhead to current column
            // We have 15 rows total (13 notes + slide + accent)
            // Selecting via nth-child logic can be tricky with grid, so we filter by dataset or index
            
            // Note cells
            const noteCells = document.querySelectorAll(`.note-cell:nth-child(${stepIndex + 2})`);
            noteCells.forEach(c => c.classList.add('playhead'));
            
            // Slide cell
            const slideCells = document.querySelectorAll(`.slide-cell:nth-child(${stepIndex + 2})`);
            slideCells.forEach(c => c.classList.add('playhead'));
            
            // Accent cell
            const accCells = document.querySelectorAll(`.accent-cell:nth-child(${stepIndex + 2})`);
            accCells.forEach(c => c.classList.add('playhead'));
            
            // Ghost cell
            const ghostCells = document.querySelectorAll(`.ghost-cell:nth-child(${stepIndex + 2})`);
            ghostCells.forEach(c => c.classList.add('playhead'));
        }
    });

    // --- Event Listeners ---
    playBtn.addEventListener('click', async () => {
        await Tone.start(); // Required by browsers
        seq.start();
    });

    stopBtn.addEventListener('click', () => {
        seq.stop();
    });

    clearBtn.addEventListener('click', () => {
        seq.clearGrid();
        renderGrid();
    });

    tempoInput.addEventListener('change', (e) => {
        seq.setBpm(parseFloat(e.target.value));
    });

    // Synth control listeners
    waveSelect.addEventListener('change', (e) => audio.setParam('wave', e.target.value));
    cutoffInput.addEventListener('input', (e) => audio.setParam('cutoff', parseFloat(e.target.value)));
    resInput.addEventListener('input', (e) => audio.setParam('resonance', parseFloat(e.target.value)));
    envModInput.addEventListener('input', (e) => audio.setParam('envMod', parseFloat(e.target.value)));
    decayInput.addEventListener('input', (e) => audio.setParam('decay', parseFloat(e.target.value)));

    // Init
    renderGrid();
});
