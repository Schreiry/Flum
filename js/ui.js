export function refreshPeri(gpadConnected) {
    const el = document.getElementById('pdGP');
    if (el) el.className = 'peri-dot ' + (gpadConnected ? 'on' : 'off');
}

let _hintTimer = null;
export function hint(text, dur = 1500) {
    const el = document.getElementById('action-hint');
    if (!el) return;
    el.textContent = text;
    el.classList.add('show');
    clearTimeout(_hintTimer);
    _hintTimer = setTimeout(() => el.classList.remove('show'), dur);
}

export function comboProgress(n) {
    for (let i = 0; i < 3; i++) {
        const el = document.getElementById('ck' + i);
        if (!el) continue;
        el.classList.toggle('lit', i < n);
        el.classList.remove('flash');
    }
}

export function comboFlash() {
    for (let i = 0; i < 3; i++) {
        const el = document.getElementById('ck' + i);
        if (!el) continue;
        el.classList.remove('lit');
        el.classList.add('flash');
    }
    setTimeout(() => comboProgress(0), 600);
}

let _dangerTimer = null;
export function dangerFlash() {
    const el = document.getElementById('danger-flash');
    if (!el) return;
    el.classList.add('show');
    clearTimeout(_dangerTimer);
    _dangerTimer = setTimeout(() => el.classList.remove('show'), 200);
}

export function showGameOver(stats, callback) {
    const { dist, combos, rescues, wavesDodged, gpa } = stats;

    // Retrieve/Ask Name
    let pName = localStorage.getItem('crowd_nickname');
    let bestDist = parseInt(localStorage.getItem('crowd_best_dist')) || 0;

    let isNewRecord = false;
    if (dist > bestDist) {
        bestDist = dist;
        localStorage.setItem('crowd_best_dist', bestDist);
        isNewRecord = true;
    }

    const go = document.getElementById('gameover');
    if (!go) return;

    // Fill Stats
    document.getElementById('goDistVal').textContent = dist + 'М';
    document.getElementById('goBestVal').textContent = bestDist + 'М';
    document.getElementById('goEffVal').textContent = gpa;
    document.getElementById('goName').textContent = pName ? pName.toUpperCase() : 'ИГРОК';

    // Toggle Record Label
    const recLabel = document.getElementById('goRecordLabel');
    if (recLabel) recLabel.style.display = isNewRecord ? 'block' : 'none';

    // Detailed Breakdown List
    const breakdown = document.getElementById('goBreakdown');
    if (breakdown) {
        breakdown.innerHTML = `
            <div>ПРОЙДЕНО МЕТРОВ: ${dist}</div>
            <div>УСПЕШНЫЕ КОМБО: ${combos}</div>
            <div>ИСПОЛЬЗОВАНО ПОМОЩИ: ${rescues}</div>
            <div>ВОЛН ПЕРЕЖИТО: ${wavesDodged}</div>
        `;
    }

    go.style.display = 'flex';
    requestAnimationFrame(() => {
        go.classList.add('show', 'split-active'); // CSS will handle split animation
    });

    if (callback) {
        const btn = document.getElementById('btnRestart');
        const newBtn = btn.cloneNode(true);
        btn.parentNode.replaceChild(newBtn, btn);
        newBtn.addEventListener('click', () => {
            // "Dive" animation class
            go.classList.add('dive');
            setTimeout(() => {
                go.classList.remove('show', 'split-active', 'dive');
                go.style.display = 'none';
                callback();
            }, 800); // match dive duration
        });
    }
}

export function showMenu(onPlay) {
    const menu = document.getElementById('menu');

    // Check for nickname first, show modal if missing
    let pName = localStorage.getItem('crowd_nickname');
    if (!pName) {
        const modal = document.getElementById('name-modal');
        const input = document.getElementById('name-input');
        const btnSave = document.getElementById('btnSaveName');
        if (modal) {
            modal.style.display = 'flex';
            btnSave.onclick = () => {
                const val = input.value.trim();
                if (val) {
                    localStorage.setItem('crowd_nickname', val);
                    modal.style.display = 'none';
                    _initMenu(menu, onPlay);
                }
            }
            return; // pause menu init until name saved
        }
    }

    _initMenu(menu, onPlay);
}

function _initMenu(menu, onPlay) {
    menu.style.display = 'flex';
    document.getElementById('dL').classList.remove('open');
    document.getElementById('dR').classList.remove('open');
    document.getElementById('hud').classList.remove('show');

    document.getElementById('btnPlay').onclick = () => {
        document.getElementById('dL').classList.add('open');
        document.getElementById('dR').classList.add('open');
        setTimeout(() => {
            menu.style.display = 'none';
            document.getElementById('hud').classList.add('show');
            if (onPlay) onPlay();
        }, 970);
    };

    document.getElementById('btnExit').onclick = () => {
        document.body.innerHTML = '<div style="color:rgba(255,255,255,0.1);display:flex;align-items:center;justify-content:center;height:100vh;font:11px/1 \'Share Tech Mono\',monospace;letter-spacing:6px;">CROWD</div>';
    };
}
