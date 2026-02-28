import { comboProgress, comboFlash, dangerFlash, hint, showGameOver, showMenu, refreshPeri } from './ui.js';
import { GamepadManager, KeyboardManager } from './input.js';
import { ComboSystem } from './combo-fsm.js';
import { Renderer } from './renderer.js';
import { TOTAL_BYTES, MEM_SZ, createView } from './memory-layout.js';

let sab, floatArray, views, worker, combo, gpad, kb, renderer, playerDashFn;

// ═══════════════════════════════════════════════════════════════════════════
// DIAGNOSTIC CONSOLE LOGGER (optimized, throttled output + FREEZE DETECTOR)
// ═══════════════════════════════════════════════════════════════════════════
const ENABLE_DIAGNOSTICS = true;  // Set to false to disable all logging

let freezeHistory = [];  // Track freeze events
const FREEZE_THRESHOLD_MS = 20;  // Frame taking >20ms = FREEZE
const FREEZE_DETECTION_WINDOW = 5000;  // Window in ms to detect freeze patterns

function setupDiagnostics() {
    if (!ENABLE_DIAGNOSTICS) return;
    
    console.log('%c[CROWD] Diagnostics Enabled', 'color: #0f0; font-weight: bold;');
    console.log('%c[CROWD] Type CrowdGameTest.help() for testing commands', 'color: #0ff; font-size: 12px;');
    
    // Listen for diagnostic messages from worker
    worker.addEventListener('message', (e) => {
        if (e.data.type === 'LOG') {
            const { severity, msg } = e.data;
            const colors = {
                'INFO': 'color: #0ff;',
                'WARN': 'color: #fa0;',
                'ERROR': 'color: #f00; font-weight: bold;'
            };
            console.log(`%c${msg}`, colors[severity] || 'color: #fff;');
            
            // 🔴 FREEZE DETECTION: Track ERROR messages about frame time
            if (severity === 'ERROR' && msg.includes('FRAME FREEZE')) {
                freezeHistory.push({
                    timestamp: performance.now(),
                    msg: msg
                });
                
                // Cleanup old entries
                const now = performance.now();
                freezeHistory = freezeHistory.filter(e => now - e.timestamp < FREEZE_DETECTION_WINDOW);
                
                // Alert if freezes are recurring
                if (freezeHistory.length >= 3) {
                    console.error(`%c🔴 CRITICAL: ${freezeHistory.length} frame freezes detected in last 5s! Game may become unplayable.`, 'color: #f00; font-size: 14px; font-weight: bold;');
                }
            }
        }
    });
}

// Wait for DOM to be ready
document.addEventListener('DOMContentLoaded', () => {
    // 1. Initialize Shared Memory
    sab = new SharedArrayBuffer(TOTAL_BYTES);
    floatArray = new Float32Array(sab);

    views = {
        state: createView(floatArray, 'STATE')
    };

    // 2. Start Worker Process
    worker = new Worker('js/worker.js', { type: 'module' });
    
    // 2a. Setup diagnostics BEFORE init
    setupDiagnostics();
    
    // 2b. Send init with diagnostics enabled
    worker.postMessage({ type: 'init', sab: sab, enableDiagnostics: ENABLE_DIAGNOSTICS });

    // 3. Setup Input Systems
    combo = new ComboSystem();
    gpad = new GamepadManager();
    kb = new KeyboardManager(combo);

    gpad.onConnect = () => refreshPeri(true);
    gpad.onDisconnect = () => refreshPeri(false);

    playerDashFn = (dx, dz) => {
        views.state[6] = dx;
        views.state[7] = dz;
    };
    kb.playerDashFn = playerDashFn;

    // 4. Initialize Renderer
    const canvas = document.getElementById('c');
    renderer = new Renderer(canvas, floatArray);

    // 5. Connect UI
    showMenu(() => {
        startSimulation();
    });
    
    // 6. Expose testing interface (CrowdGameTest.help() for commands)
    window.CrowdGameTest = {
        help() {
            console.log('%c=== CROWD Game Testing Interface ===', 'color: #0f0; font-weight: bold; font-size: 14px;');
            console.log('%cAvailable Commands:', 'color: #0ff; font-weight: bold;');
            console.log('  CrowdGameTest.forceFreezeTest()  - Simulate freeze scenario');
            console.log('  CrowdGameTest.setStagnation(s)  - Force stagnation (0-5 seconds)');
            console.log('  CrowdGameTest.testMagnetism()    - Test magnetism mechanics');
            console.log('  CrowdGameTest.freezeHistory()    - Show recent freezes');
        },
        forceFreezeTest() {
            console.warn('%c🔴 Starting freeze test scenario...', 'color: #f00; font-weight: bold;');
            if (views.state && views.state[0] === 1) {
                // Zero out inputs to trigger stagnation
                views.state[4] = 0;
                views.state[5] = 0;
                console.warn('✓ Input zeroed. Freeze test running. Monitor console for FREEZE DETECTED.');
                setTimeout(() => {
                    console.log('%c✓ Freeze test completed.', 'color: #0f0;');
                }, 10000);
            } else {
                console.error('Game not running. Start game first.');
            }
        },
        setStagnation(seconds) {
            if (seconds < 0 || seconds > 5) {
                console.error('Stagnation must be 0-5 seconds');
                return;
            }
            worker.postMessage({ type: 'testSetStagnation', value: seconds });
            console.log(`✓ Stagnation set to ${seconds}s (worker-side)`);
        },
        testMagnetism() {
            console.log('%c📊 Testing Magnetism System...', 'color: #0ff; font-weight: bold;');
            if (views.state && views.state[0] === 1) {
                // Send test command to worker
                worker.postMessage({ type: 'testMagnetism' });
                console.log('✓ Magnetism test initiated (check worker logs)');
            } else {
                console.error('Game not running. Start game first.');
            }
        },
        freezeHistory() {
            if (freezeHistory.length === 0) {
                console.log('%c✓ No freezes detected!', 'color: #0f0;');
            } else {
                console.log(`%c🔴 Freeze history (last 5 seconds):`, 'color: #f00; font-weight: bold;');
                freezeHistory.forEach((event, idx) => {
                    console.log(`  ${idx + 1}. ${event.timestamp.toFixed(0)}ms ago: ${event.msg}`);
                });
            }
        }
    };

    requestAnimationFrame(loop);
});

let lastT = performance.now();

function loop(ts) {
    requestAnimationFrame(loop);

    const dt = Math.min((ts - lastT) / 1000, 0.05);
    lastT = ts;

    if (views.state[0] !== 1) {
        if (views.state[0] === 0) renderer.render(dt);
        return;
    }

    // Sync external time to internal worker
    views.state[1] = ts / 1000;
    views.state[2] = dt;

    // Inputs -> Shared State
    const padDir = gpad.poll(combo, playerDashFn);
    const kbDir = kb.dir();

    views.state[4] = gpad.connected ? padDir.x : kbDir.x;
    views.state[5] = gpad.connected ? padDir.z : kbDir.z;
    if (combo.consume()) {
        views.state[8] = 1;
    }

    // Async Triggers from Worker
    if (views.state[9] === 1) {
        views.state[9] = 0;
        dangerFlash();

        const dist = Math.max(0, Math.floor(views.state[3]));
        const combos = Math.floor(views.state[11]);
        const rescues = Math.floor(views.state[12]);
        const wavesDodged = Math.floor(views.state[13]);

        // GPA Efficiency Calculation Based on Credits
        // Distance (4 credits): 4.0 * (dist / 67m * 3.5 pts) = 4.0 * dist/19.14 pts
        // Combos (1.5 credits): 1.5 * (combos * 1.5 pts) 
        // Rescues (3 credits): 3.0 * (rescues * 2.0 pts)
        // Waves (1.5 credits): 1.5 * (waves * 1.5 pts)
        // Note: The user mentioned "amount of points for each action" vs "credits weight".
        // A simple weighted sum works well:
        let totalPoints = (dist / 67) * 3.5 + combos * 1.5 + rescues * 2.0 + wavesDodged * 1.5;
        let totalCredits = 4.0 + 1.5 + 3.0 + 1.5; // Always divide by base credits to get a ratio

        // GPA formula (Points / TotalCredits) scale roughly 0.0 to 4.0 or 5.0
        let gpa = (totalPoints / totalCredits).toFixed(2);

        showGameOver({ dist, combos, rescues, wavesDodged, gpa }, () => {
            startSimulation();
        });

        views.state[0] = 0; // stop
    }

    if (views.state[10] === 1) {
        views.state[10] = 0; // Rescue flag
        hint('✓  СПАСЁН!', 2000);
    }

    renderer.render(dt);

    const scoreVal = document.getElementById('distVal');
    if (scoreVal) scoreVal.textContent = Math.max(0, Math.floor(views.state[3]));
}

function startSimulation() {
    worker.postMessage({ type: 'init', sab: sab, enableDiagnostics: ENABLE_DIAGNOSTICS });
    views.state[0] = 1;
    lastT = performance.now();
    combo.reset(comboProgress);
    refreshPeri(gpad.connected);
}

// ═══════════════════════════════════════════════════════════════════════════
// TESTING API (exposed to console for manual testing)
// ═══════════════════════════════════════════════════════════════════════════
window.CrowdGameTest = {
    enableDiagnostics: () => {
        window.location.reload();
    },
    disableDiagnostics: () => {
        ENABLE_DIAGNOSTICS = false;
        window.location.reload();
    },
    testMagnetism: () => {
        // Simulate 1 second of no input to trigger magnetism
        console.log('%cTesting Magnetism: Injecting idle state for 1 second...', 'color: #0f0; font-weight: bold;');
        for (let i = 0; i < 60; i++) {
            views.state[4] = 0;  // No X input
            views.state[5] = 0;  // No Z input
        }
        console.log('%cMagnetism test injected. Check console logs for stagnation timer.', 'color: #0ff;');
    },
    getGameState: () => ({
        running: views.state[0],
        distance: Math.floor(views.state[3] || 0),
        combos: Math.floor(views.state[11] || 0),
        encircleLevel: Math.round((views.state[15] || 0) * 100),
        encircleTimer: Math.round((views.state[16] || 0) * 100)
    }),
    help: () => {
        console.log(`
Usage:
  CrowdGameTest.enableDiagnostics()  - Enable detailed logging
  CrowdGameTest.disableDiagnostics() - Disable logging
  CrowdGameTest.testMagnetism()      - Simulate idle state
  CrowdGameTest.getGameState()       - Get current game values
  CrowdGameTest.help()               - Show this help
        `);
    }
};

console.log('%c[CROWD] Type CrowdGameTest.help() for testing commands', 'color: #0ff; font-weight: bold;');
