import { CROWD_N, MAX_ENEMIES, MAX_HELPERS, ACTIVE_R, MAX_BLOCKERS, MAX_SLOWERS } from './config.js';
import { CROWD, PLAYER, INVERSION } from './config.js';  // Import for encirclement & inversion mechanics
import { createView } from './memory-layout.js';
import { composeMatrix } from './math.js';

let sharedBuffer = null;
let views = {};

    // Physics constants
    let px = 0, pz = 0;
    let vx = 0, vz = 0;
let alive = true;
let invTimer = 0;
let armPhase = 0;
let leanX = 0, leanZ = 0;
let squish = 1;

// Spring state for richer procedural animation
let headY = 0;
let headVy = 0;
let lArmY = 0;
let lArmVy = 0;
let rArmY = 0;
let rArmVy = 0;
let dashVx = 0, dashVz = 0;
let dashTimer = 0;
let lastWorkerT = 0;
let workerTime = 0;

// Encirclement tracking (crowd magnetism mechanic)
let encircledTime = 0;  // Accumulates when player is surrounded 360°

// ═══════════════════════════════════════════════════════════════════════════
// FSM STATE MACHINE (Inversion Concept)
// ═══════════════════════════════════════════════════════════════════════════
// GAME_STATE: 0=NORMAL, 1=ENCIRCLING, 2=TRANSITIONING, 3=INVERTED, 4=RETURNING
let gameMode = 0;              // Current FSM state
let stateModeTime = 0;         // Elapsed time in current state
let ringsFormed = 0;           // 0-3: how many concentric rings formed
let ringsReady = false;        // true when 3 rings completely formed
let ringFormationStartTime = 0; // When current ring formation started

// Hermit system (відщепенець - enemies in inverted mode)
let hermitActive = false;      // Is there an active hermit spawned?
let hermitX = 0, hermitZ = 0;  // Hermit position
let hermitLifetime = 0;        // Time until hermit disappears
let hermitSpeed = 0;           // Current hermit velocity
let hermitAngle = 0;           // Direction hermit is moving
let hermitsCollected = 0;      // 0-3: how many caught in current inversion
let distanceSinceLastHermit = 0; // Track distance for spawn intervals
let hermitWavePending = 0;     // How many hermits left in current spawn wave
let hermitWaveCooldown = 0;    // Delay before next hermit in wave

// Ring membership tracking (members moving to form circles)
let ringMembers = [];          // Array of {idx, ringIndex, targetAngle, hasReached}

    let maxDist = 0;
let spawnCd = 5.0;
let spawnT = 4.0;
// We only want ONE white crowd active at a time
let isEnemyActive = false;

// ═══════════════════════════════════════════════════════════════════════════
// DIAGNOSTIC & LOGGING SYSTEM
// ═══════════════════════════════════════════════════════════════════════════
let diagnosticMode = false;  // Enable/disable detailed logging
let lastLogFrame = 0;        // Throttle logging (only log every N frames)
const LOG_THROTTLE_FRAMES = 30;  // Log every 30 frames (~0.5 sec at 60 FPS)

// Optimized logger with throttling (doesn't spam CPU)
function logDiag(label, value, severity = 'INFO') {
    if (!diagnosticMode) return;
    
    // Throttle: only log on specific frames
    if (workerTime - lastLogFrame < (LOG_THROTTLE_FRAMES / 60)) return;
    lastLogFrame = workerTime;
    
    const timestamp = Math.round(workerTime * 1000) / 1000;
    const msg = `[${timestamp}s] ${severity} ${label}: ${typeof value === 'object' ? JSON.stringify(value) : value}`;
    
    // Post to main thread for console output
    self.postMessage({ type: 'LOG', severity, msg });
}

// Performance monitoring (track frame times)
let frameTimings = { minMs: Infinity, maxMs: 0, avgMs: 0, frameCount: 0 };

// Stagnation timer (for magnetism trigger)
let stagnationTime = 0;  // How long player has been idle without input

// ═══════════════════════════════════════════════════════════════════════════
// SELF-TESTING SYSTEM (включает мониторинг performance-related freezes)
// ═══════════════════════════════════════════════════════════════════════════
function runSelfTests() {
    if (!diagnosticMode) return;
    
    const tests = [];
    
    // Test 1: Spatial Grid initialization & performance
    try {
        const testStartMs = performance.now();
        clearSpatialGrid();
        
        // Simulate population
        for (let i = 0; i < 100; i++) {
            addToSpatialGrid(i, 5.0 + Math.random() * 2, 3.0 + Math.random() * 2);
        }
        
        const neighbors = getSpatialNeighbors(5.0, 3.0, 3.5);
        const gridMs = performance.now() - testStartMs;
        
        tests.push({ 
            name: 'Spatial Grid', 
            passed: neighbors.length > 0 && gridMs < 2.0, 
            msg: `Grid test: found ${neighbors.length} neighbors in ${gridMs.toFixed(2)}ms (should be <2ms)` 
        });
        
        // 🔴 FREEZE DETECTOR: If grid query takes >2ms, it's a sign of problems
        if (gridMs > 2.0) {
            tests[tests.length - 1].msg += ' ⚠️ SLOW!';
        }
    } catch (e) {
        tests.push({ name: 'Spatial Grid', passed: false, msg: `ERROR: ${e.message}` });
    }
    
    // Test 2: Crowd data integrity
    try {
        const testCrowd = crowdData[0];
        const hasAllProps = testCrowd.x !== undefined && testCrowd.z !== undefined && 
                           testCrowd.spd !== undefined && testCrowd.active !== undefined;
        tests.push({ name: 'Crowd Data', passed: hasAllProps, msg: 'Crowd properties verified' });
    } catch (e) {
        tests.push({ name: 'Crowd Data', passed: false, msg: `ERROR: ${e.message}` });
    }
    
    // Test 3: Shared Buffer access  
    try {
        const canWrite = views.state !== undefined && views.state.length > 0;
        tests.push({ name: 'SharedArrayBuffer', passed: canWrite, msg: 'SAB accessible' });
    } catch (e) {
        tests.push({ name: 'SharedArrayBuffer', passed: false, msg: `ERROR: ${e.message}` });
    }
    
    // Test 4: Magnetism system initialization
    try {
        const hasStagnationVar = stagnationTime !== undefined;
        const hasMagnetismCheck = typeof checkEncirclement === 'function';
        tests.push({ 
            name: 'Magnetism System', 
            passed: hasStagnationVar && hasMagnetismCheck, 
            msg: 'Stagnation timer + magnetism logic initialized' 
        });
    } catch (e) {
        tests.push({ name: 'Magnetism System', passed: false, msg: `ERROR: ${e.message}` });
    }
    
    // Test 5: Frame timing performance
    try {
        const avgFrameMs = frameTimings.frameCount > 0 ? frameTimings.avgMs : 0;
        const isPerformanceGood = avgFrameMs < 16.0;  // Should be <16ms for 60 FPS
        tests.push({ 
            name: 'Frame Performance', 
            passed: isPerformanceGood, 
            msg: `Avg frame: ${avgFrameMs.toFixed(2)}ms (target: <16ms, 60 FPS)` 
        });
        
        if (!isPerformanceGood) {
            tests[tests.length - 1].msg += ' 🔴 POTENTIAL FREEZE RISK';
        }
    } catch (e) {
        tests.push({ name: 'Frame Performance', passed: false, msg: `ERROR: ${e.message}` });
    }
    
    // Log results
    const allPassed = tests.every(t => t.passed);
    const status = allPassed ? '✓ ALL TESTS PASSED' : '✗ SOME TESTS FAILED';
    
    let summarySuffix = '';
    const failedTests = tests.filter(t => !t.passed);
    if (failedTests.length > 0) {
        summarySuffix = `\n⚠️  FAILED: ${failedTests.map(t => t.name).join(', ')}`;
    }
    
    self.postMessage({ 
        type: 'LOG', 
        severity: allPassed ? 'INFO' : 'ERROR',
        msg: `[SELF-TEST] ${status} - Spatial: ${tests[0].passed ? '✓' : '✗'} | Crowd: ${tests[1].passed ? '✓' : '✗'} | SAB: ${tests[2].passed ? '✓' : '✗'} | Magnetism: ${tests[3].passed ? '✓' : '✗'} | Perf: ${tests[4].passed ? '✓' : '✗'}${summarySuffix}`
    });
    
    // Also log detailed test info
    for (const test of tests) {
        if (!test.passed) {
            self.postMessage({
                type: 'LOG',
                severity: 'WARN',
                msg: `  └─ ${test.name}: ${test.msg}`
            });
        }
    }
}

const crowdData = [];
const enemies = [];
const helpers = [];
const blockers = [];
const slowers = [];

// Initialize data
for (let i = 0; i < CROWD_N; i++) {
    crowdData.push({
        x: (Math.random() - 0.5) * 500, // wider span
        z: (Math.random() - 0.5) * 14,  // Narrowed Z bounds for a diagonal corridor
        spd: 0.012 + Math.random() * 0.020,
        phase: Math.random() * Math.PI * 2,
        rot: Math.random() * Math.PI * 2,
        active: false,
        // Ring formation fields (for inversion mode)
        isRingMember: false,    // Currently assigned to a ring
        ringIndex: -1,          // Which ring (0=1st, 1=2nd, 2=3rd)
        ringTargetX: 0,         // Target X position in ring
        ringTargetZ: 0,         // Target Z position in ring
        ringReached: false,     // Has this member reached target
    });
}
for (let i = 0; i < MAX_ENEMIES; i++) enemies.push({ active: false, cx: 0, cz: 0, spd: 0, phase: 0, meshes: [] });
for (let i = 0; i < MAX_HELPERS; i++) helpers.push({ active: false, x: 0, z: 0, phase: 0 });
for (let i = 0; i < MAX_BLOCKERS; i++) blockers.push({ active: false, x: 0, z: 0, rot: 0, colIdx: 0 });
for (let i = 0; i < MAX_SLOWERS; i++) slowers.push({ active: false, x: 0, z: 0, phase: 0, colIdx: 0 });

// ═══════════════════════════════════════════════════════════════════════════
// SPATIAL HASHING GRID: Оптимизация магнитизма O(N) → O(M log M) где M << N
// ═══════════════════════════════════════════════════════════════════════════
// Разделяет пространство на ячейки для быстрого поиска соседей толпы
const GRID_CELL_SIZE = 3.5;  // Размер ячейки (охватывает MAGNETIC_RADIUS = 7.0)
const spatialGrid = new Map();  // Map: key (cellX,cellZ) -> array of crowd indices

// Хешировать позицию в ключ ячейки
function hashGridPos(x, z) {
    const gx = Math.floor(x / GRID_CELL_SIZE);
    const gz = Math.floor(z / GRID_CELL_SIZE);
    return `${gx},${gz}`;
}

// Очистить grid перед каждым frame
function clearSpatialGrid() {
    spatialGrid.clear();
}

// Добавить индекс толпы в grid
function addToSpatialGrid(index, x, z) {
    const key = hashGridPos(x, z);
    if (!spatialGrid.has(key)) {
        spatialGrid.set(key, []);
    }
    spatialGrid.get(key).push(index);
}

// Получить индексы толпы в радиусе (ОПТИМИЗИРОВАННЫЙ быстрый spatial query)
// ❌ OLD: Возвращал ВСЮ толпу из 5×5 сетки = 1000 элементов в худшем случае
// ✓ NEW: Возвращает только соседей в точном радиусе + отфильтрованные по расстоянию
function getSpatialNeighbors(cx, cz, radius) {
    const result = [];
    const radius2 = radius * radius;  // Avoid repeated sqrt
    const radiusCells = Math.ceil(radius / GRID_CELL_SIZE) + 0.5;  // Conservative cells to check
    const centerCellX = Math.floor(cx / GRID_CELL_SIZE);
    const centerCellZ = Math.floor(cz / GRID_CELL_SIZE);
    
    // Проверяем только ближайшие ячейки (1×1 для начала, затем расширяем)
    let cellRadius = 1;
    let candidatesChecked = 0;
    const checkLimit = 150;  // SAFETY: не проверяем более 150 кандидатов
    
    while (cellRadius <= radiusCells && candidatesChecked < checkLimit) {
        for (let dx = -cellRadius; dx <= cellRadius; dx++) {
            for (let dz = -cellRadius; dz <= cellRadius; dz++) {
                // Skip cells we already checked
                if (cellRadius > 1 && Math.abs(dx) < cellRadius && Math.abs(dz) < cellRadius) continue;
                
                const key = `${centerCellX + dx},${centerCellZ + dz}`;
                const cell = spatialGrid.get(key);
                if (cell) {
                    for (const idx of cell) {
                        const c = crowdData[idx];
                        const dx_actual = c.x - cx;
                        const dz_actual = c.z - cz;
                        const dist2 = dx_actual * dx_actual + dz_actual * dz_actual;
                        
                        // Only include if truly within radius
                        if (dist2 < radius2 && dist2 > 0.01) {
                            result.push({ idx, dist2 });
                            candidatesChecked++;
                        }
                        
                        // Emergency exit if too many candidates
                        if (candidatesChecked >= checkLimit) {
                            return result;
                        }
                    }
                }
            }
        }
        cellRadius++;
    }
    
    return result;
}

// ═══════════════════════════════════════════════════════════════════════════
// FSM HELPER FUNCTIONS (Inversion System)
// ═══════════════════════════════════════════════════════════════════════════

// Initialize ring members for encircling phase
function initializeRingFormation() {
    ringMembers = [];
    ringsFormed = 0;
    ringsReady = false;
    ringFormationStartTime = workerTime;
    
    // Find available crowd members for rings
    const ringCounts = [
        Math.floor(INVERSION.RING_MIN_COUNT + Math.random() * (INVERSION.RING_MAX_COUNT - INVERSION.RING_MIN_COUNT)),
        Math.floor(INVERSION.RING_MIN_COUNT + Math.random() * (INVERSION.RING_MAX_COUNT - INVERSION.RING_MIN_COUNT)),
        Math.floor(INVERSION.RING_MIN_COUNT + Math.random() * (INVERSION.RING_MAX_COUNT - INVERSION.RING_MIN_COUNT)),
    ];
    
    let memberIdx = 0;
    for (let ringIdx = 0; ringIdx < 3; ringIdx++) {
        const count = ringCounts[ringIdx];
        for (let i = 0; i < count && memberIdx < CROWD_N; i++) {
            const c = crowdData[memberIdx];
            const angle = (i / count) * Math.PI * 2;
            const radius = [INVERSION.RING_1_RADIUS, INVERSION.RING_2_RADIUS, INVERSION.RING_3_RADIUS][ringIdx];
            
            c.isRingMember = true;
            c.ringIndex = ringIdx;
            c.ringTargetX = px + Math.cos(angle) * radius;
            c.ringTargetZ = pz + Math.sin(angle) * radius;
            c.ringReached = false;
            
            ringMembers.push(memberIdx);
            memberIdx++;
        }
    }
    
    logDiag('Ring Formation Initialized', { memberCount: ringMembers.length, rings: ringsFormed }, 'INFO');
}

// Check if ring formation is complete
function checkRingFormationComplete() {
    if (ringsReady) return true;
    
    // Count rings that have formed
    let formedRings = 0;
    for (let ringIdx = 0; ringIdx < 3; ringIdx++) {
        let allReached = true;
        for (const memberIdx of ringMembers) {
            const c = crowdData[memberIdx];
            if (c.ringIndex === ringIdx) {
                const dx = c.ringTargetX - c.x;
                const dz = c.ringTargetZ - c.z;
                const dist2 = dx * dx + dz * dz;
                if (dist2 > 0.25) {  // If any member hasn't reached target
                    allReached = false;
                    break;
                }
            }
        }
        if (allReached) formedRings++;
    }
    
    ringsFormed = formedRings;
    // Trigger transition when FIRST ring is complete (достаточно одного кольца!)
    if (ringsFormed >= 1) {
        ringsReady = true;
        logDiag('First Ring Formed', { time: stateModeTime.toFixed(2), readyForTransition: true }, 'INFO');
        return true;
    }
    return false;
}

// Spawn a hermit (отщепенец) in random position
function spawnHermit() {
    if (hermitActive) return;  // Only one at a time
    
    // Spawn at distance from player
    const angle = Math.random() * Math.PI * 2;
    const dist = INVERSION.HERMIT_SPAWN_MIN_DIST + Math.random() * (INVERSION.HERMIT_SPAWN_MAX_DIST - INVERSION.HERMIT_SPAWN_MIN_DIST);
    
    hermitX = px + Math.cos(angle) * dist;
    hermitZ = pz + Math.sin(angle) * dist;
    hermitLifetime = INVERSION.HERMIT_LIFETIME;
    hermitActive = true;
    hermitAngle = Math.random() * Math.PI * 2;
    hermitSpeed = INVERSION.HERMIT_SPEED_MULT;
    
    logDiag('Hermit Spawned', { x: hermitX.toFixed(1), z: hermitZ.toFixed(1), pending: hermitWavePending - 1 }, 'INFO');
}

// Tick functions for different FSM states
function tickNormal(dt) {
    // Все обычно, как было. encircledTime уже отслеживается в основном tick.
    // Если магнетизм → смена в ENCIRCLING происходит в основном физ-tick.
}

function tickEncircling(dt) {
    // Формировать кольца
    if (ringMembers.length === 0) {
        initializeRingFormation();
    }
    
    // Move ring members towards their target positions
    for (const memberIdx of ringMembers) {
        const c = crowdData[memberIdx];
        const dx = c.ringTargetX - c.x;
        const dz = c.ringTargetZ - c.z;
        const dist2 = dx * dx + dz * dz;
        
        if (dist2 > 0.01) {
            const dist = Math.sqrt(dist2);
            const moveSpeed = 2.5 * dt;  // Ring members move faster to form ring
            const moveX = (dx / dist) * moveSpeed;
            const moveZ = (dz / dist) * moveSpeed;
            
            c.x += moveX;
            c.z += moveZ;
        } else {
            c.ringReached = true;
        }
    }
    
    // Check if all rings formed
    if (checkRingFormationComplete()) {
        // Trigger transition to TRANSITIONING state
        gameMode = 2;  // TRANSITIONING
        stateModeTime = 0;
        logDiag('FSM Transition', { from: 1, to: 2, event: 'ringsComplete' }, 'INFO');
    }
}

function tickTransitioning(dt) {
    stateModeTime += dt;
    
    // Screen shake + color fade (linear progress 0→1)
    const transitionValue = Math.min(1.0, stateModeTime / INVERSION.TRANSITION_DURATION);
    views.state[24] = transitionValue * INVERSION.SHAKE_AMPLITUDE;  // shake intensity
    views.state[25] = transitionValue;  // color blend to inverted
    
    if (transitionValue >= 1.0) {
        // Enter INVERTED mode
        gameMode = 3;  // INVERTED
        stateModeTime = 0;
        hermitsCollected = 0;
        distanceSinceLastHermit = 0;
        hermitWavePending = INVERSION.HERMIT_PER_WAVE;
        hermitWaveCooldown = 0;
        
        // Change crowd behavior to move WITH player instead of against
        // This will be handled in the main physics loop based on gameMode
        
        logDiag('FSM Transition', { from: 2, to: 3, event: 'transitionComplete' }, 'INFO');
    }
}

function tickInverted(dt) {
    stateModeTime += dt;
    
    // In inverted mode, crowd moves WITH player (same direction)
    // This is handled in main physics loop based on gameMode
    
    // Update distance tracking for hermit spawning
    const playerSpeed = Math.sqrt(vx * vx + vz * vz);
    distanceSinceLastHermit += playerSpeed * dt;
    
    // Spawn hermits at intervals
    hermitWaveCooldown -= dt;
    if (distanceSinceLastHermit >= INVERSION.HERMIT_SPAWN_INTERVAL_M && hermitWavePending > 0 && hermitWaveCooldown <= 0) {
        spawnHermit();
        hermitWavePending--;
        hermitWaveCooldown = 0.5;  // Delay before next hermit in wave
        distanceSinceLastHermit = 0;
    }
    
    // Update active hermit
    if (hermitActive) {
        hermitLifetime -= dt;
        
        // Hermit AI: random wandering / fleeing from player
        const dpx = px - hermitX;
        const dpz = pz - hermitZ;
        const playerDist2 = dpx * dpx + dpz * dpz;
        
        // Move away from player if close
        if (playerDist2 < 36) {  // 6 units
            hermitAngle += (Math.random() - 0.5) * 0.5;  // Jitter angle
        } else {
            hermitAngle += (Math.random() - 0.5) * 0.1;  // Slow wander
        }
        
        hermitX += Math.cos(hermitAngle) * hermitSpeed * dt;
        hermitZ += Math.sin(hermitAngle) * hermitSpeed * dt;
        
        // Check collection (catch radius)
        const catchDx = hermitX - px;
        const catchDz = hermitZ - pz;
        const catchDist2 = catchDx * catchDx + catchDz * catchDz;
        
        if (catchDist2 < INVERSION.HERMIT_CATCH_RADIUS * INVERSION.HERMIT_CATCH_RADIUS) {
            hermitsCollected++;
            hermitActive = false;
            views.state[20] = hermitsCollected;  // Update counter in SAB
            
            logDiag('Hermit Caught', { count: hermitsCollected, needed: INVERSION.HERMITS_TO_RETURN }, 'INFO');
            
            // Check if we've caught enough to return
            if (hermitsCollected >= INVERSION.HERMITS_TO_RETURN) {
                gameMode = 4;  // RETURNING
                stateModeTime = 0;
                logDiag('FSM Transition', { from: 3, to: 4, event: 'hermitsCollected' }, 'INFO');
            }
        }
        
        // Despawn if lifetime exceeded
        if (hermitLifetime <= 0) {
            hermitActive = false;
        }
    }
    
    // Keep shake active in inverted mode  (subtle vibration)
    views.state[24] = 0.05;  // Subtle shake
    views.state[25] = 1.0;   // Full inverted colors
}

function tickReturning(dt) {
    stateModeTime += dt;
    
    // Reverse transition: fade back from inverted to normal
    const returnProgress = Math.min(1.0, stateModeTime / INVERSION.TRANSITION_DURATION);
    const returnValue = 1.0 - returnProgress;  // Fade out inverted effect
    
    views.state[24] = returnValue * INVERSION.SHAKE_AMPLITUDE;  // Fade shake
    views.state[25] = returnValue;  // Fade color blend
    
    if (returnProgress >= 1.0) {
        // Return to NORMAL mode
        gameMode = 0;  // NORMAL
        stateModeTime = 0;
        encircledTime = 0;  // Reset encirclement timer
        
        // Clear ring members
        for (const memberIdx of ringMembers) {
            const c = crowdData[memberIdx];
            c.isRingMember = false;
            c.ringIndex = -1;
            c.ringReached = false;
        }
        ringMembers = [];
        ringsFormed = 0;
        ringsReady = false;
        
        // Clear any active hermit
        hermitActive = false;
        hermitsCollected = 0;
        
        // Reset SAB state
        views.state[20] = 0;  // hermitsCollected
        views.state[24] = 0;  // shake
        views.state[25] = 0;  // color blend
        
        logDiag('FSM Transition', { from: 4, to: 0, event: 'returningComplete' }, 'INFO');
    }
}

function resetGame() {
    px = 0; pz = 0;
    vx = 0; vz = 0;
    alive = true;
    invTimer = 0; armPhase = 0; leanX = 0; leanZ = 0; squish = 1;
    headY = 0.83 * (2 - squish);
    headVy = 0;
    lArmY = 0.58 * squish;
    lArmVy = 0;
    rArmY = 0.58 * squish;
    rArmVy = 0;
    dashVx = 0; dashVz = 0; dashTimer = 0;
    encircledTime = 0;  // Reset encirclement timer on game restart
    stagnationTime = 0;  // Reset stagnation timer (FIX #3)
    maxDist = 0; spawnCd = 5.0; spawnT = 4.0;
    
    // Reset FSM state
    gameMode = 0;
    stateModeTime = 0;
    ringsFormed = 0;
    ringsReady = false;
    ringMembers = [];
    hermitActive = false;
    hermitsCollected = 0;
    distanceSinceLastHermit = 0;

    crowdData.forEach(c => {
        c.x = (Math.random() - 0.5) * 400;
        c.z = (Math.random() - 0.5) * 14;
        // Reset ring fields
        c.isRingMember = false;
        c.ringIndex = -1;
        c.ringTargetX = 0;
        c.ringTargetZ = 0;
        c.ringReached = false;
    });
    enemies.forEach(e => e.active = false);
    helpers.forEach(h => h.active = false);
    blockers.forEach(b => b.active = false);
    slowers.forEach(s => s.active = false);
    isEnemyActive = false;

    // Clear buffer outputs initially
    if (views.enemyVars) views.enemyVars.fill(0);
    if (views.helperVars) views.helperVars.fill(0);
    if (views.blockerVars) views.blockerVars.fill(0);
    if (views.slowerVars) views.slowerVars.fill(0);
    
    // Clear FSM SAB state
    views.state[17] = 0;  // gameMode
    views.state[18] = 0;  // transitionProgress
    views.state[19] = 0;  // ringsFormed
    views.state[20] = 0;  // hermitsCollected
    views.state[21] = 0;  // hermitActive
    views.state[22] = 0;  // hermitX
    views.state[23] = 0;  // hermitZ
    views.state[24] = 0;  // shakeIntensity
    views.state[25] = 0;  // colorBlend
}

// Spawners using objects arrays to avoid GC
function spawnEnemy(ex, ez, sz) {
    if (isEnemyActive) return; // Only one white crowd at a time
    const e = enemies.find(en => !en.active); // We technically use enemies[0] functionally but pool helps
    if (!e) return;
    isEnemyActive = true;
    e.active = true; e.cx = ex; e.cz = ez; e.spd = 3.5 + sz * 1.5; e.phase = 0; // Slightly faster
    e.meshes = [];
    const n = Math.max(8, Math.round(sz * 40)); // Make them significantly denser/longer
    for (let i = 0; i < n && i < MAX_ENEMIES; i++) {
        e.meshes.push({
            ox: (Math.random() - 0.5) * 4.8, // Make them wider
            oz: (Math.random() - 0.5) * 4.8,
        });
    }
}
function spawnHelper(hx, hz) {
    const h = helpers.find(he => !he.active);
    if (!h) return;
    // Check if another helper is too close
    for (let i = 0; i < MAX_HELPERS; i++) {
        const oh = helpers[i];
        if (oh.active) {
            const dx = oh.x - hx; const dz = oh.z - hz;
            if (dx * dx + dz * dz < 64) return; // Don't spawn if within 8 units of another
        }
    }
    h.active = true; h.x = hx; h.z = hz; h.phase = 0; h.state = 1; // 1 = idle
    // Keep helper on ground plane
    h.yOffset = 0;
}
function spawnBlockerPair(bx, bz) {
    let b1 = blockers.find(b => !b.active);
    if (!b1) return;
    b1.active = true;
    let b2 = blockers.find(b => !b.active && b !== b1);
    // Even if b2 doesn't exist, we just spawn 1, but we prefer pairs
    b1.x = bx; b1.z = bz - 0.45; b1.rot = Math.random() * Math.PI; b1.colIdx = Math.floor(Math.random() * 2);
    if (b2) {
        b2.active = true;
        b2.x = bx; b2.z = bz + 0.45; b2.rot = Math.random() * Math.PI; b2.colIdx = Math.floor(Math.random() * 2);
    }
}

function spawnSlowersGroup(sx, sz) {
    const count = Math.random() < 0.33 ? 1 : (Math.random() < 0.5 ? 3 : 4);
    for (let i = 0; i < count; i++) {
        let s = slowers.find(sl => !sl.active);
        if (!s) break;
        s.active = true;
        s.x = sx + (Math.random() - 0.5) * 2.5;
        s.z = sz + (Math.random() - 0.5) * 2.5;
        s.phase = Math.random() * 10;
        s.colIdx = Math.floor(Math.random() * 2);
    }
}

// OPTIMIZED: Sector Bitmasking for 360° encirclement detection
// Uses bit manipulation instead of array allocation: surroundMask & (1 << sectorIndex)
// Returns { surrounded: boolean, encircleLevel: 0-8 (sectors filled) }
function checkEncirclement() {
    const sectorCount = CROWD.ENCIRCLE_SECTOR_COUNT;  // 8 sectors = 45° each
    const detectionRadius = CROWD.ENCIRCLE_DETECTION_RADIUS;  // 2.5 units
    const detectionRadius2 = detectionRadius * detectionRadius;
    
    let surroundMask = 0;  // 8-bit bitmask: each bit = one sector
    
    // Check only crowd members in detection radius (O(N) but filtered)
    for (let i = 0; i < CROWD_N; i++) {
        const c = crowdData[i];
        const dx = c.x - px;
        const dz = c.z - pz;
        const dist2 = dx * dx + dz * dz;
        
        // Only check if within detection radius and not overlapping player
        if (dist2 < detectionRadius2 && dist2 > 0.01) {
            // Calculate angle in radians: atan2(dz, dx) returns -π to π
            const angle = Math.atan2(dz, dx);
            // Normalize to 0-1 range
            const normalizedAngle = (angle + Math.PI) / (2 * Math.PI);
            // Map to sector index 0-7
            const sectorIndex = Math.floor(normalizedAngle * sectorCount) % sectorCount;
            // Set bit for this sector
            surroundMask |= (1 << sectorIndex);
        }
    }
    
    // Count how many sectors are filled (popcount)
    let filledSectors = 0;
    for (let i = 0; i < sectorCount; i++) {
        if (surroundMask & (1 << i)) filledSectors++;
    }
    
    // Check if enough sectors are filled (default 6 out of 8 = 75% threshold)
    const requiredSectors = CROWD.ENCIRCLE_SECTOR_THRESHOLD;  // 6
    const surrounded = filledSectors >= requiredSectors;
    
    return { surrounded, encircleLevel: filledSectors, mask: surroundMask };
}

self.onmessage = function (e) {
    if (e.data.type === 'init') {
        sharedBuffer = e.data.sab;
        diagnosticMode = e.data.enableDiagnostics || false;  // Enable diagnostics if passed
        
        const floatArray = new Float32Array(sharedBuffer);
        views = {
            state: createView(floatArray, 'STATE'),
            playerVars: createView(floatArray, 'PLAYER_VARS'),
            playerMats: createView(floatArray, 'PLAYER_MATS'),
            crowdBody: createView(floatArray, 'CROWD_BODY'),
            crowdHead: createView(floatArray, 'CROWD_HEAD'),
            enemyBody: createView(floatArray, 'ENEMY_BODY'),
            enemyHead: createView(floatArray, 'ENEMY_HEAD'),
            helperBody: createView(floatArray, 'HELPER_BODY'),
            helperHead: createView(floatArray, 'HELPER_HEAD'),
            helperLArm: createView(floatArray, 'HELPER_LARM'),
            helperRArm: createView(floatArray, 'HELPER_RARM'),
            helperVars: createView(floatArray, 'HELPER_VARS'),
            blockerBody: createView(floatArray, 'BLOCKER_BODY'),
            blockerHead: createView(floatArray, 'BLOCKER_HEAD'),
            blockerVars: createView(floatArray, 'BLOCKER_VARS'),
            slowerBody: createView(floatArray, 'SLOWER_BODY'),
            slowerHead: createView(floatArray, 'SLOWER_HEAD'),
            slowerVars: createView(floatArray, 'SLOWER_VARS'),
        };
        resetGame();
        lastWorkerT = performance.now();
        workerTime = 0;
        
        // Log initialization
        logDiag('Worker Init', 'Spatial Grid + Magnetism System Ready');
        runSelfTests();  // Run diagnostics on startup
    } 
    
    // TEST COMMANDS (for debugging)
    else if (e.data.type === 'testSetStagnation') {
        stagnationTime = e.data.value;
        logDiag('TEST: Stagnation Set', { value: e.data.value });
    } 
    else if (e.data.type === 'testMagnetism') {
        logDiag('TEST: Magnetism', 'Testing magnetism mechanics');
        // Trigger stagnation for test
        stagnationTime = 1.0;
    }
};

function tick(dt, time, ix, iz, dashX, dashZ, comboFired) {
    if (!alive) return;

    // ── MAGNETISM: Track player stagnation (idle without input) ──
    // KEY FIX: Check INPUT, not just velocity!
    const hasInput = (Math.abs(ix) > 0.1 || Math.abs(iz) > 0.1 || Math.abs(dashX) > 0 || Math.abs(dashZ) > 0);
    
    if (!hasInput) {
        stagnationTime += dt;  // Accumulate idle time
    } else {
        stagnationTime = 0;    // Reset when input detected
    }
    
    // Player is "stagnant" if idle for > 3.0 seconds (per design spec)
    // Phase 1 (0-3s): Charging (magnetism preparing)
    // Phase 2 (3-6s): Full power magnetism activation
    const stagnationPhase1Threshold = 3.0;
    const stagnationPhase2Threshold = 6.0;
    const isStagnant = stagnationTime >= stagnationPhase1Threshold;
    
    // Log stagnation phase transitions
    const wasPhase1 = (stagnationTime - dt < stagnationPhase1Threshold) && (stagnationTime >= stagnationPhase1Threshold);
    const wasPhase2 = (stagnationTime - dt < stagnationPhase2Threshold) && (stagnationTime >= stagnationPhase2Threshold);
    
    if (wasPhase1) {
        logDiag('Magnetism PHASE 1', { time: stagnationTime.toFixed(2), status: 'Charging...' });
    }
    if (wasPhase2) {
        logDiag('Magnetism PHASE 2', { time: stagnationTime.toFixed(2), status: 'FULL PULL ACTIVE' });
    }

    // ── ENCIRCLEMENT CHECK: Stagnation Gravity mechanic ──
    const encirclement = checkEncirclement();
    
    if (encirclement.surrounded) {
        encircledTime += dt;
        
        // FSM: Trigger ENCIRCLING mode if stagnant long enough
        if (gameMode === 0 && encircledTime >= CROWD.ENCIRCLE_TIMEOUT && isStagnant) {
            gameMode = 1;  // ENCIRCLING
            stateModeTime = 0;
            logDiag('FSM Transition', { from: 0, to: 1, event: 'encircledTooLong' }, 'INFO');
        }
    } else {
        // Decay timer when player breaks the ring (soft so brief gaps don't fully reset)
        encircledTime = Math.max(0, encircledTime - dt * 0.5);
    }
    
    // Store encirclement level for renderer UI (0-8 sectors)
    views.state[15] = encirclement.encircleLevel / 8.0;  // Normalized 0-1
    views.state[16] = encircledTime / CROWD.ENCIRCLE_TIMEOUT;  // Timer 0-1

    invTimer = Math.max(0, invTimer - dt);
    dashTimer = Math.max(0, dashTimer - dt);

    if (dashX !== 0 || dashZ !== 0) {
        dashVx = dashX * 9; dashVz = dashZ * 9;
        dashTimer = 0.22;
    }

    // ════════════════════════════════════════════════════════════════════════
    // FSM STATE MACHINE: Update game mode and dispatch to appropriate handler
    // ════════════════════════════════════════════════════════════════════════
    stateModeTime += dt;
    
    // Dispatch to appropriate FSM tick function
    if (gameMode === 1) {
        tickEncircling(dt);
    } else if (gameMode === 2) {
        tickTransitioning(dt);
    } else if (gameMode === 3) {
        tickInverted(dt);
    } else if (gameMode === 4) {
        tickReturning(dt);
    }
    
    // Update SAB with current FSM state
    views.state[17] = gameMode;
    views.state[18] = stateModeTime;  // transitional progress (used by renderer)
    views.state[19] = ringsFormed;
    views.state[20] = hermitsCollected;
    views.state[21] = hermitActive ? 1 : 0;
    views.state[22] = hermitX;
    views.state[23] = hermitZ;
    // states[24] & [25] already set by FSM functions (shake, colorBlend)

    let nearActive = 0;
    for (let i = 0; i < CROWD_N; i++) if (crowdData[i].active) nearActive++;
    
    // Base crowd resistance (depends on how many are near)
    const baseResist = nearActive > 15 ? 0.78 : nearActive > 5 ? 0.9 : 1.0;
    
    // Crowd Pressure: when standing still or moving slowly, the crowd surrounds and squeezes harder
    // If player was recently moving fast but now slows down, they get "caught" in the crowd
    const prevSpeed = Math.sqrt(vx * vx + vz * vz);
    const crowdPressure = prevSpeed < 2.0 ? 0.75 : prevSpeed < 4.0 ? 0.85 : 1.0;
    // This pressure multiplier makes it harder to leave the crowd when stationary
    
    let spd = 7.6 * baseResist * crowdPressure;
    
    // In INVERTED mode, player is significantly faster (part of the flow)
    if (gameMode === 3) {
        spd *= INVERSION.INVERTED_PLAYER_SPEED_MULT;  // 1.8× multiplier
    }

    // Check collisions with SLOWERs
    for (let i = 0; i < MAX_SLOWERS; i++) {
        const s = slowers[i];
        if (s.active) {
            const dx = s.x - px; const dz = s.z - pz;
            const dist2 = dx * dx + dz * dz;
            if (dist2 < 4.0) {
                spd *= 0.35; // Drop speed dramatically if near slower
            }
        }
    }

    const dvx = ix * spd + (dashTimer > 0 ? dashVx : 0);
    const dvz = iz * spd + (dashTimer > 0 ? dashVz : 0);

    vx += (dvx - vx) * 0.13;
    vz += (dvz - vz) * 0.13;

    px += vx * dt;
    pz = Math.max(-7.0, Math.min(7.0, pz + vz * dt)); // Hard Z-bounds to create diagonal path constraints

    leanZ += (vx * 0.10 - leanZ) * 0.10;
    leanX += (-vz * 0.12 - leanX) * 0.10;

    // Squash & Stretch driven by vertical motion (screen up/down)
    const targetSq = vz < -0.5
        ? 1 - Math.abs(vz) / spd * 0.18
        : vz > 0.5
            ? 1 + Math.abs(vz) / spd * 0.18
            : 1;
    squish += (targetSq - squish) * 0.10;

    const moving = Math.abs(vx) + Math.abs(vz) > 0.3;
    armPhase += dt * (moving ? 3.8 : 0.9);
    const swing = Math.sin(armPhase) * (moving ? 0.13 : 0.03);
    const tiltBack = vx * 0.07;
    const spread = Math.abs(vx) * 0.04;

    // --- Spring-based offsets (Hooke's law) for head and arms ---
    const bodyCenterY = 0.35 * squish;

    const headTargetY = 0.83; // keep head mostly round, independent of squish
    const kHead = 16.0;
    const dHead = 4.2;
    const headAy = kHead * (headTargetY - headY) - dHead * headVy;
    headVy += headAy * dt;
    headY += headVy * dt;

    // Prevent head intersecting body: simple separation constraint
    const bodyHalfH = 0.80 * squish * 0.5;
    const bodyTop = bodyCenterY + bodyHalfH;
    const headScaleY = 1.0;
    const headRadius = 0.23;
    const minHeadY = bodyTop + headRadius + 0.02;
    if (headY < minHeadY) {
        headY = minHeadY;
        if (headVy < 0) headVy *= -0.25; // soft bounce
    }

    const baseArmY = 0.58 * squish;
    const lArmTargetY = baseArmY + swing;
    const rArmTargetY = baseArmY - swing;
    const kArm = 18.0;
    const dArm = 5.0;

    const lAy = kArm * (lArmTargetY - lArmY) - dArm * lArmVy;
    lArmVy += lAy * dt;
    lArmY += lArmVy * dt;

    const rAy = kArm * (rArmTargetY - rArmY) - dArm * rArmVy;
    rArmVy += rAy * dt;
    rArmY += rArmVy * dt;

    // Compose Player Matrices with volume-preserving squash & stretch
    const bodySy = squish;
    const bodySxz = Math.sqrt(1 / Math.max(bodySy, 0.35));
    composeMatrix(views.playerMats, 0, px, bodyCenterY, pz, leanX, 0, -leanZ, bodySxz, bodySy, bodySxz);

    const headSx = 1.0;
    const headSz = 1.0;
    composeMatrix(views.playerMats, 16, px, headY, pz, leanX * 0.55, 0, -leanZ * 0.55, headSx, headScaleY, headSz);

    const armS = 1;
    composeMatrix(views.playerMats, 32, px - 0.40 - spread, lArmY, pz + tiltBack, 0, 0, 0, armS, armS, armS);
    composeMatrix(views.playerMats, 48, px + 0.40 + spread, rArmY, pz + tiltBack, 0, 0, 0, armS, armS, armS);

    views.playerVars[0] = px; 
    views.playerVars[1] = pz; 
    views.playerVars[2] = invTimer;
    views.playerVars[3] = vx;  // Velocity X for fog/crowd pressure calculations
    views.playerVars[4] = vz;  // Velocity Z for fog/crowd pressure calculations

    maxDist = Math.max(maxDist, px * 2.5);
    views.state[3] = maxDist;

    // Determine if player is in "magnetic" state (Stagnation Gravity)
    const playerSpeed = Math.sqrt(vx * vx + vz * vz);
    const isMagneticState = playerSpeed < CROWD.MAGNETIC_THRESHOLD_SPEED;
    
    // ════════════════════════════════════════════════════════════════════════
    // PASS 1: Base movement + collision + spatial grid build
    // ════════════════════════════════════════════════════════════════════════
    // Clear spatial grid for this frame and rebuild
    clearSpatialGrid();
    
    for (let i = 0; i < CROWD_N; i++) {
        const c = crowdData[i];
        
        // Base movement depends on game mode
        // SKIP base movement for ring members (they move toward their targets instead)
        if (!c.isRingMember) {
            if (gameMode === 3 || gameMode === 4) {
                // INVERTED or RETURNING: crowd moves WITH player (they flow together)
                // Use speed multiplier from INVERSION config
                const speedMult = INVERSION.INVERTED_CROWD_SPEED_MULT;
                c.x += c.spd * speedMult;  // Move rightward with the player
                if (c.x > px + 100) {
                    c.x = px - 150 - Math.random() * 50;  // Respawn behind
                    c.z = (Math.random() - 0.5) * 14;
                }
            } else {
                // NORMAL, ENCIRCLING, TRANSITIONING: crowd drifts leftward (against player)
                c.x -= c.spd;
                if (c.x < px - 100) {
                    c.x = px + 150 + Math.random() * 50;
                    c.z = (Math.random() - 0.5) * 14;
                }
            }
        }

        const dx = c.x - px;
        const dz = c.z - pz;
        const dist2 = dx * dx + dz * dz;
        
        // Mark as active if in render range
        c.active = Math.abs(dx) < ACTIVE_R && Math.abs(dz) < ACTIVE_R;

        // Collision with player (always check active crowd)
        if (c.active && dist2 < 1.44) {  // 1.2 radius collision
            const dist = Math.sqrt(dist2) + 0.001;
            const overlap = 1.2 - dist;
            if (overlap > 0) {
                const nx = dx / dist;
                const nz = dz / dist;
                // Push crowd out
                c.x += nx * overlap * 0.45;
                c.z += nz * overlap * 0.45;
                // Push player back weakly
                vx -= nx * overlap * 0.6;
                vz -= nz * overlap * 0.6;
            }
        }
        
        // OPTIMIZED: Add active crowd to spatial grid (O(1) per member)
        if (c.active) {
            addToSpatialGrid(i, c.x, c.z);
        }

        // Render
        const bob = c.active ? Math.sin(time * 2.8 + c.phase) * 0.055 : 0;
        composeMatrix(views.crowdBody, i * 16, c.x, 0.30, c.z, 0, c.rot, 0, 1, 1, 1);
        composeMatrix(views.crowdHead, i * 16, c.x, 0.80 + bob, c.z, 0, c.rot + Math.sin(time * 0.3 + c.phase) * 0.2, 0, 0.9, 0.78, 0.94);
    }
    
    // ════════════════════════════════════════════════════════════════════════
    // PASS 2: MAGNETIC ATTRACTION - Apply when STAGNANT (idle + no input)
    // ════════════════════════════════════════════════════════════════════════
    // Only trigger magnetism when player is stagnant (Phase 1+)
    // SKIP in INVERTED mode (player is part of the collective, no magnetism)
    if (isStagnant && gameMode !== 3 && gameMode !== 4) {
        const magneticRadius = CROWD.MAGNETIC_RADIUS;  // 7.0
        const comfortRadius = CROWD.MAGNETIC_COMFORT_RADIUS;  // 2.1
        
        // FIX #2: Scale force based on magnetism phase
        // Phase 1 (3-6s): Linear ramp from 0 → 100%
        // Phase 2 (6s+): Full power (1.0)
        let forceMultiplier = 0;
        if (stagnationTime >= stagnationPhase2Threshold) {
            forceMultiplier = 1.0;  // Full power
        } else if (stagnationTime >= stagnationPhase1Threshold) {
            // Linear ramp: (3s-6s) → (0 to 1)
            forceMultiplier = (stagnationTime - stagnationPhase1Threshold) / (stagnationPhase2Threshold - stagnationPhase1Threshold);
        }
        
        // FIX #2: Increase base force from 0.28 → 2.24 (8× multiplier to overcome drift)
        const baseMagneticForce = CROWD.MAGNETIC_ATTRACTION_STRENGTH * 8.0;
        const attractionForce = baseMagneticForce * forceMultiplier;
        const maxAttracted = CROWD.MAGNETIC_MAX_CROWD_ATTRACTED;
        
        const neighborsWithDist = getSpatialNeighbors(px, pz, magneticRadius);
        
        if (neighborsWithDist.length > 0) {
            neighborsWithDist.sort((a, b) => a.dist2 - b.dist2);
            
            const applyCount = Math.min(maxAttracted, neighborsWithDist.length);
            let attractedCount = 0;
            const magnetStartMs = performance.now();
            
            for (let j = 0; j < applyCount; j++) {
                const { idx, dist2 } = neighborsWithDist[j];
                const c = crowdData[idx];
                const dx = c.x - px;
                const dz = c.z - pz;
                const dist = Math.sqrt(dist2) + 0.001;
                
                const toPx = -dx;  // Points toward player
                const toPz = -dz;
                
                if (dist > comfortRadius) {
                    // FIX #2: Apply strong pull + compensate drift loss from PASS 1
                    const pullMagnitude = Math.max(0, Math.min(1.0, (magneticRadius - dist) / (magneticRadius - comfortRadius)));
                    const force = attractionForce * pullMagnitude;
                    
                    if (force > 0) {
                        // Strong magnetic pull toward player
                        c.x += (toPx / dist) * force * dt;
                        c.z += (toPz / dist) * force * dt;
                        
                        // Compensate: return 85% of drift lost in PASS 1 (c.x -= c.spd)
                        c.x += c.spd * 0.85;
                        
                        attractedCount++;
                    }
                } else if (dist < comfortRadius * 0.5) {
                    // Push outward if too close (maintain comfort ring)
                    const pushForce = 0.15;
                    c.x -= (toPx / dist) * pushForce * dt;
                    c.z -= (toPz / dist) * pushForce * dt;
                    attractedCount++;
                }
            }
            
            const magnetMs = performance.now() - magnetStartMs;
            if (magnetMs > 5.0) {
                logDiag('Magnetism SLOW', { ms: magnetMs.toFixed(1), force: attractionForce.toFixed(2), attracted: attractedCount }, 'WARN');
            } else if (forceMultiplier > 0) {
                logDiag('Magnetism Active', { phase: stagnationTime < stagnationPhase2Threshold ? 1 : 2, force: attractionForce.toFixed(2), attracted: attractedCount });
            }
        }
    }

    // Wave Spawners
    spawnT -= dt;
    if (spawnT <= 0) {
        const ex = px + 25 + Math.random() * 10;
        const ez = (Math.random() - 0.5) * 12;

        const roll = Math.random();
        if (roll < 0.25) {
            // Spawn Slowers
            spawnSlowersGroup(ex, ez);
        } else if (roll < 0.50) {
            // Spawn Blockers
            spawnBlockerPair(ex, ez);
        } else {
            // Spawn Enemy (White crowd)
            const sz = 0.5 + Math.random() * 0.8;
            spawnEnemy(ex, ez, sz);

            // Helpers only spawn in relation to white crowd now
            if (Math.random() < 0.35) { // reduced from 0.44
                // Spawn strictly in front of them
                let hx = ex - 6 - Math.random() * 4;
                let hz = ez + (Math.random() < 0.5 ? 5 : -5); // Parallel offset
                spawnHelper(hx, hz);
            }
        }

        spawnT = spawnCd * (0.6 + Math.random() * 0.5);
        spawnCd = Math.max(1.8, spawnCd * 0.96); // Gradually faster spawns
    }

    let flatEnemyCount = 0;
    isEnemyActive = false; // recount

    enemies.forEach((e) => {
        if (!e.active) return;
        e.phase += dt;
        e.cx -= e.spd * dt;

        // Despawn
        if (e.cx < px - 40) {
            e.active = false;
            if (!e.dodged) { // Award dodge stat if passed purely
                views.state[13] += 1;
                e.dodged = true;
            }
            return;
        }
        isEnemyActive = true;

        const dx = e.cx - px, dz = e.cz - pz;
        if (dx * dx + dz * dz < 4.0 && invTimer <= 0) {
            views.state[9] = 1; // player hit!
        }

        for (const m of e.meshes) {
            const mx = e.cx + m.ox; // cx is moving, ox constant locally
            const mz = e.cz + m.oz + Math.sin(e.phase * 1.4 + m.ox) * 0.12;
            composeMatrix(views.enemyBody, flatEnemyCount * 16, mx, 0.30, mz, 0, e.phase * 0.5, 0, 1, 1, 1);
            composeMatrix(views.enemyHead, flatEnemyCount * 16, mx, 0.82, mz, 0, e.phase * 0.5, 0, 0.90, 0.78, 0.94);
            flatEnemyCount++;
            if (flatEnemyCount >= MAX_ENEMIES) break;
        }
    });

    // Zero out unused Enemy matrices directly (hide them by scaling to 0)
    for (let i = flatEnemyCount; i < MAX_ENEMIES; i++) {
        composeMatrix(views.enemyBody, i * 16, 0, 0, 0, 0, 0, 0, 0, 0, 0);
        composeMatrix(views.enemyHead, i * 16, 0, 0, 0, 0, 0, 0, 0, 0, 0);
    }

    // Process Blockers
    blockers.forEach((b, i) => {
        if (!b.active) {
            views.blockerVars[i * 4 + 1] = 0; // inactive
            composeMatrix(views.blockerBody, i * 16, 0, 0, 0, 0, 0, 0, 0, 0, 0);
            composeMatrix(views.blockerHead, i * 16, 0, 0, 0, 0, 0, 0, 0, 0, 0);
            return;
        }
        if (b.x < px - 20) { b.active = false; return; }

        // Immovable collision with player
        const dx = b.x - px, dz = b.z - pz;
        const dist2 = dx * dx + dz * dz;
        if (dist2 < 1.44) {
            const dist = Math.sqrt(dist2) + 0.001;
            const overlap = 1.2 - dist;
            if (overlap > 0) {
                const nx = dx / dist; const nz = dz / dist;
                // Push player violently away
                vx -= nx * overlap * 15.0;
                vz -= nz * overlap * 15.0;
            }
        }

        composeMatrix(views.blockerBody, i * 16, b.x, 0.30, b.z, 0, b.rot, 0, 1, 1, 1);
        composeMatrix(views.blockerHead, i * 16, b.x, 0.80, b.z, 0, b.rot, 0, 0.9, 0.78, 0.94);
        views.blockerVars[i * 4 + 0] = b.colIdx;
        views.blockerVars[i * 4 + 1] = 1; // active
    });

    // Process Slowers
    slowers.forEach((s, i) => {
        if (!s.active) {
            views.slowerVars[i * 4 + 1] = 0; // inactive
            composeMatrix(views.slowerBody, i * 16, 0, 0, 0, 0, 0, 0, 0, 0, 0);
            composeMatrix(views.slowerHead, i * 16, 0, 0, 0, 0, 0, 0, 0, 0, 0);
            return;
        }
        if (s.x < px - 20) { s.active = false; return; }

        s.phase += dt;
        s.x -= dt * 0.5; // Drift slow

        composeMatrix(views.slowerBody, i * 16, s.x, 0.30, s.z, 0, s.phase * 0.2, 0, 1, 1, 1);
        composeMatrix(views.slowerHead, i * 16, s.x, 0.80 + Math.sin(s.phase * 2) * 0.05, s.z, 0, s.phase * 0.3, 0, 0.9, 0.78, 0.94);
        views.slowerVars[i * 4 + 0] = s.colIdx;
        views.slowerVars[i * 4 + 1] = 1; // active       
    });

    let hitRescue = false;
    helpers.forEach((h, i) => {
        if (!h.active) {
            views.helperVars[i * 4 + 2] = 0;
            composeMatrix(views.helperBody, i * 16, 0, 0, 0, 0, 0, 0, 0, 0, 0);
            composeMatrix(views.helperHead, i * 16, 0, 0, 0, 0, 0, 0, 0, 0, 0);
            composeMatrix(views.helperLArm, i * 16, 0, 0, 0, 0, 0, 0, 0, 0, 0);
            composeMatrix(views.helperRArm, i * 16, 0, 0, 0, 0, 0, 0, 0, 0, 0);
            return;
        }

        if (h.x < px - 40) { h.active = false; return; }

        h.phase += dt * 2.0;

        // Ensure floating Y height
        const hY = h.yOffset + Math.sin(h.phase) * 0.15;
        const sw = Math.sin(h.phase * 1.5) * 0.18;

        if (h.state === 1) { // Idle pulsing
            // Check combo trigger anywhere on screen
            const pulseIntensity = Math.abs(Math.sin(h.phase * 1.6));
            if (comboFired && pulseIntensity > 0.85) { // Peak timing
                h.state = 2; // Rescuing
                comboFired = 0; // Consume the trigger
            }
        }

        if (h.state === 2) { // Tether Rescuing
            const dx = h.x - px;
            const dz = h.z - pz;
            const dist2 = dx * dx + dz * dz;

            if (dist2 < 4.0) { // Reached helper
                px = h.x; pz = h.z;
                hitRescue = true;
                h.active = false; // consume helper
                vx = 0; vz = 0;
                invTimer = 2.5; // Invulnerable after drop
            } else {
                // Pull player powerfully
                const dist = Math.sqrt(dist2);
                vx += (dx / dist) * 45.0 * dt;
                vz += (dz / dist) * 45.0 * dt;
                invTimer = 0.5; // Invulnerable during pull
            }
        }

        composeMatrix(views.helperBody, i * 16, h.x, hY + 0.35, h.z, 0, 0, 0, 1.05, 1.05, 1.05);
        composeMatrix(views.helperHead, i * 16, h.x, hY + 0.83 * 1.05, h.z, 0, 0, 0, 0.9 * 1.05, 0.78 * 1.05, 0.94 * 1.05);
        composeMatrix(views.helperLArm, i * 16, h.x - 0.40, hY + 0.58 + sw, h.z, 0, 0, 0, 1.05, 1.05, 1.05);
        composeMatrix(views.helperRArm, i * 16, h.x + 0.40, hY + 0.58 - sw, h.z, 0, 0, 0, 1.05, 1.05, 1.05);

        views.helperVars[i * 4 + 0] = h.x;
        views.helperVars[i * 4 + 1] = h.z;
        views.helperVars[i * 4 + 2] = h.state; // active & state info (1=idle, 2=rescuing)
        views.helperVars[i * 4 + 3] = h.phase;
    });

    if (hitRescue) {
        views.state[12] += 1; // track rescues
        views.state[10] = 1; // rescued trigger for UI
    }
}


function gameLoop() {
    if (!sharedBuffer || !views.state || views.state[0] !== 1) {
        setTimeout(gameLoop, 16);
        return;
    }

    const frameStartMs = performance.now();
    const t = frameStartMs;
    let dt = (t - lastWorkerT) / 1000;
    lastWorkerT = t;
    if (dt > 0.1) dt = 0.1; // Cap delta time
    workerTime += dt;

    // Read Inputs
    const ix = views.state[4];
    const iz = views.state[5];
    const dashX = views.state[6];
    const dashZ = views.state[7];
    const comboFired = views.state[8];

    // Clear trigger flags immediately so we don't double fire
    views.state[6] = 0;
    views.state[7] = 0;
    views.state[8] = 0;

    tick(dt, workerTime, ix, iz, dashX, dashZ, comboFired);
    
    // 🔴 EARLY FREEZE DETECTOR: Measure frame time immediately after tick
    const frameMs = performance.now() - frameStartMs;
    
    // Update frame timings running average
    const newAvg = frameMs > 0 ? (frameTimings.avgMs * frameTimings.frameCount + frameMs) / (frameTimings.frameCount + 1) : frameTimings.avgMs;
    frameTimings.minMs = Math.min(frameTimings.minMs, frameMs);
    frameTimings.maxMs = Math.max(frameTimings.maxMs, frameMs);
    frameTimings.avgMs = newAvg;
    frameTimings.frameCount++;
    
    // CRITICAL: Detect if frame is taking too long (>20ms = potential freeze)
    if (frameMs > 20) {
        self.postMessage({
            type: 'LOG',
            severity: 'ERROR',
            msg: `🔴 FRAME FREEZE DETECTED: ${frameMs.toFixed(1)}ms (target: 16ms for 60 FPS). This will cause stutter.`
        });
    }
    
    // Log performance every 60 frames (non-spam)
    if (diagnosticMode && frameTimings.frameCount % 60 === 0) {
        const perfColor = frameTimings.avgMs > 16 ? 'ERROR' : 'INFO';
        self.postMessage({
            type: 'LOG',
            severity: perfColor,
            msg: `Frame Time: ${frameMs.toFixed(2)}ms (avg: ${frameTimings.avgMs.toFixed(2)}ms, min: ${frameTimings.minMs.toFixed(2)}ms, max: ${frameTimings.maxMs.toFixed(2)}ms)`
        });
    }

    setTimeout(gameLoop, 16);
}

// Start simulation pump
setTimeout(gameLoop, 16);
