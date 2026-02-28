# 🔧 INTEGRATION ROADMAP: Inversion Mode

> **Status**: Phase 1 Complete (Design + Foundation)  
> **For**: Next Chat Session  
> **Complexity**: High — requires SAB rewiring, FSM integration, renderer modifications

---

## 📋 Files Created (Foundation Layer)

1. **`DESIGN_INVERTED_MODE.md`** — Full architectural spec (47 sections)
2. **`js/game-fsm.js`** — GameStateMachine class (skeleton with TODO placeholders)
3. **`js/config-inversion.js`** — PAL_INVERTED + HERMITS + TRANSITIONS config

These three files form the **non-breaking foundation**. Existing code continues unchanged until you explicitly integrate.

---

## 🏗️ Integration Phases (Sequential)

### Phase 1: Memory Layout Extension
**File**: `js/memory-layout.js`  
**Complexity**: Low (just add offsets)

Currently ends at ~376 bytes. Add:
```javascript
// After existing offsets:
const GAME_STATE_OFFSET = 400;      // u32
const STATE_TIME_OFFSET = 404;      // f32
const COLOR_BLEND_OFFSET = 408;     // f32
const SHAKE_INTENSITY_OFFSET = 412; // f32
const HERMITS_COLLECTED_OFFSET = 416; // u32
const DISTANCE_SUBTRACT_OFFSET = 420; // f32
const ENCIRCLE_RINGS_OFFSET = 424;  // 120 bytes (30 angles × f32)
const ENCIRCLE_READY_OFFSET = 544;  // u32

// Validate new total
const TOTAL_SAB_SIZE = 548; // was ~376
```

**No breaking changes** — just extends the buffer by ~172 bytes (still <1KB).

---

### Phase 2: FSM Integration into Worker
**File**: `js/worker.js` (or `js/main.js` if worker logic there)  
**Complexity**: Medium (restructure tick loop)

Currently your physics tick is:
```javascript
function tick(dt) {
    // Update player physics
    // Update crowd physics
    // Check game over condition (write to views[9])
}
```

Add FSM:
```javascript
import GameStateMachine from './game-fsm.js';

let gameStateMachine;

function initWorker() {
    // ... existing init ...
    gameStateMachine = new GameStateMachine(sharedArrayBufferViews);
}

function tick(dt) {
    // BEFORE: Update player/crowd
    updatePlayerPhysics(dt);
    updateCrowdPhysics(dt);
    
    // NEW: FSM controls everything now
    gameStateMachine.tick(dt, playerData, crowdData);
    
    // AFTER: FSM decides if we're writing game-over
    // (Don't write views[9]=1 here anymore — FSM does it when transitioning)
}
```

**Key change**: Replace hardcoded `if (stagnant) { views[9] = 1 }` with FSM state management.

---

### Phase 3: Renderer Color Blending
**File**: `js/renderer.js`  
**Complexity**: High (shader modifications)

The renderer currently uses `PAL` colors directly:
```glsl
vec3 fragColor = color * lighting;
```

Instead, read `COLOR_BLEND` from SAB and lerp:
```glsl
uniform float colorBlend; // 0..1 from SAB

vec3 normalColor = /* computed from PAL */;
vec3 invertedColor = /* computed from PAL_INVERTED */;
vec3 fragColor = mix(normalColor, invertedColor, colorBlend);
```

**In JS (`renderer.js`)**:
```javascript
// Before rendering:
const colorBlend = sharedView[COLOR_BLEND_OFFSET / 4];
program.uniform1f(uColorBlend, colorBlend);
```

**Renderer must now**:
- Read `COLOR_BLEND` from SAB every frame
- Read `SHAKE_INTENSITY` and apply to camera position
- Bind both PAL and PAL_INVERTED to shader

---

### Phase 4: Distance Calculation
**File**: `js/main.js` (distance tracking)  
**Complexity**: Medium (state-aware accumulation)

Currently:
```javascript
distance += playerSpeed * dt;
```

Change to:
```javascript
if (gameStateMachine.isInNormalMode()) {
    normalDistance += playerSpeed * dt;
} else if (gameStateMachine.isInInvertedMode()) {
    invertedDistance += playerSpeed * dt;
}

visibleDistance = normalDistance - invertedDistance;
```

**UI updates**:
```javascript
// In ui.js:
const netDistance = normalDistance - invertedDistance;
document.getElementById('distVal').textContent = Math.max(0, netDistance);

if (netDistance < 0) {
    document.getElementById('distVal').style.color = 'red';
    document.getElementById('distVal').textContent = `${netDistance.toFixed(2)}`;
}
```

---

### Phase 5: Ring Allocation & Hermit Spawning
**File**: `js/worker.js` → `GameStateMachine.allocateRings()`  
**Complexity**: Very High (spatial geometry)

Currently a TODO. Needs:
1. **Ring member selection**: Find 8+10+12 closest crowd members
2. **Angle assignment**: Place them at 0°, 45°, 90°, ... around player
3. **Target position write**: Store in SAB ENCIRCLE_RINGS offset
4. **Ready detection**: Count how many have reached target positions

Pseudocode:
```javascript
allocateRings(playerPos, crowdData) {
    const rings = [
        { radius: 2.5, count: 8 },
        { radius: 4.5, count: 10 },
        { radius: 6.5, count: 12 },
    ];
    
    for (let r = 0; r < rings.length; r++) {
        const ring = rings[r];
        
        // Find closest 'count' crowd members
        const members = crowdData
            .sort((a, b) => 
                dist(a, playerPos) - dist(b, playerPos))
            .slice(0, ring.count);
        
        // Assign angles: 360 / count
        for (let i = 0; i < members.length; i++) {
            const angle = (i / ring.count) * Math.PI * 2;
            const targetX = playerPos.x + Math.cos(angle) * ring.radius;
            const targetY = playerPos.y + Math.sin(angle) * ring.radius;
            
            // Write to SAB
            crowdData[members[i]].targetRing = r;
            crowdData[members[i]].targetX = targetX;
            crowdData[members[i]].targetY = targetY;
        }
    }
}
```

---

### Phase 6: Hermit AI & Collision
**File**: `js/worker.js` (new hermit update loop)  
**Complexity**: Very High (pathfinding + collision)

Hermits need:
- **Spawn logic**: Check distance segments, RNG spawn chance
- **AI update**: Move toward player with acceleration
- **Collision detection**: Check proximity to player (distance < 0.8m?)
- **Despawn logic**: After 12s timeout or if collected

Pseudocode:
```javascript
function checkHermitSpawn(playerPos, currentDistance, lastCheckDistance) {
    const segment = Math.floor(currentDistance / 65);
    const lastSegment = Math.floor(lastCheckDistance / 65);
    
    if (segment > lastSegment) {
        // New segment crossed
        if (Math.random() < 0.3) { // 30% spawn chance
            spawnHermitAt(playerPos + random offset);
        }
    }
}

function updateHermits(hermits, playerPos, dt) {
    for (let h of hermits) {
        // Direction to player
        const dx = playerPos.x - h.x;
        const dy = playerPos.y - h.y;
        const dist = Math.hypot(dx, dy);
        
        // Accelerate toward player
        h.vx += (dx / dist) * h.accel * dt;
        h.vy += (dy / dist) * h.accel * dt;
        
        // Cap speed
        const speed = Math.hypot(h.vx, h.vy);
        if (speed > h.maxSpeed) {
            h.vx = (h.vx / speed) * h.maxSpeed;
            h.vy = (h.vy / speed) * h.maxSpeed;
        }
        
        // Move
        h.x += h.vx * dt;
        h.y += h.vy * dt;
        
        // Check if caught
        if (dist < 0.8) {
            hermitsCollected++;
            hermits.remove(h);
            console.log(`Hermit caught! ${hermitsCollected}/3`);
        }
        
        // Check despawn timeout
        h.lifespan -= dt;
        if (h.lifespan <= 0) {
            hermits.remove(h);
            console.log('Hermit escaped timeout');
        }
    }
}
```

---

### Phase 7: UI Integration
**File**: `js/ui.js`  
**Complexity**: Medium (new displays)

Add to HUD:
```html
<!-- During INVERTED mode, show hermit progress -->
<div id="hermit-counter" style="display: none;">
    <span id="hermitLabel">ОТЩЕПЕНЦЫ</span>
    <span id="hermitProgress">0/3</span>
</div>

<!-- Show negative distance warning -->
<div id="distance-warning" style="display: none;">
    ⚠ ИНВЕРСИЯ АКТИВНА
</div>
```

JS:
```javascript
// In main game loop:
if (gameStateMachine.isInInvertedMode()) {
    document.getElementById('hermit-counter').style.display = 'block';
    document.getElementById('hermitProgress').textContent = 
        `${hermitsCollected}/3`;
}
```

---

### Phase 8: Testing & Balancing
**File**: `TEST_FIXES.html` (extend test suite)  
**Complexity**: Medium (verify state transitions)

Create test checkpoints:
```javascript
// Test 1: Can we transition to INVERTED?
// Start → wait 6.5s → check gameState === INVERTED

// Test 2: Can we catch hermits?
// Enter INVERTED → spawn hermit → move toward it → collision

// Test 3: Distance tracking accuracy
// Travel 100m NORMAL, 50m INVERTED → netDistance should be 50m

// Test 4: Render color blending
// Check: colors transition smoothly 0→grey→normal
```

---

## 🎯 Integration Dependencies

```
memory-layout.js (Phase 1)
    ↓
game-fsm.js (Phase 2: embed FSM in worker tick)
    ↓
config-inversion.js (Phase 3: import PAL_INVERTED in renderer)
    ↓
renderer.js (Phase 4: add color blending shader)
    ↓
main.js (Phase 5: distance tracking)
    ↓
worker.js (Phase 6: ring allocation)
    ↓
worker.js (Phase 7: hermit spawning)
    ↓
ui.js (Phase 8: hermit counter display)
```

**Each phase can be tested independently** before moving to the next.

---

## ⚡ Performance Tips

1. **Ring allocation**: Use spatial hashing (grid) to find nearby crowd members in O(n) not O(n²)
2. **Hermit pathfinding**: Simple "steer toward player" is enough — no A*
3. **Color blending**: Compute once per frame in shader (not per vertex)
4. **SAB writes**: Batch writes at end of tick (one `Atomics.store` per value)

---

## 🐛 Common Pitfalls

- **Forget to export GameStateMachine** → Import will fail
- **SAB offsets overlap** → Crash on data corruption (double-check memory-layout)
- **Hermit spawning in NORMAL mode** → Should only spawn in INVERTED
- **Ring members don't move to targets** → Need steering behavior, not just target assignment
- **Color blend doesn't animate** → Check that renderer reads from SAB every frame

---

## 📞 Questions for Next Chat

1. Do you want hermit particles/trail effect? (Visual polish)
2. Should hermits have sound effects? (Audio design)
3. Can you recollect the same hermits in different inverts? (Roguelike variation)
4. Do you want difficulty ramping per invert cycle? (Progression)

---

## ✨ Success Criteria

✓ Game transitions smoothly NORMAL → INVERTED (no crashes)  
✓ Color blends from amber to grey (visual feedback)  
✓ Hermits spawn randomly and move toward player  
✓ Catching 3 hermits returns you to NORMAL  
✓ Distance counter shows accurate net km (can go negative)  
✓ Performance stays 60fps during transitions  

---

**You've set up the foundation beautifully. The architecture is clean, modular, and ready for implementation. Next session, we go vertical: pick one phase and drill it complete.** 

🚀 Ready to build the Collective.
