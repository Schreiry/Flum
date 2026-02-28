# 🌀 CROWD — Inversion System Design Document

**Version**: 2.0 Collective  
**Status**: Concept → Implementation (Phase 1)  
**Author Notes**: Schreiry  
**Context**: After 3-ring encirclement → Identity Inversion (not Game Over)

---

## 🎯 Core Concept: Death is Transformation

**Old Paradigm**: `Encircled → Game Over → Restart`  
**New Paradigm**: `Encircled → TRANSITION → Collective Mode → Hunt Hermits → Return to Outcast`

The player doesn't lose. They become part of the system they were fighting.

---

## 📊 Game State Machine (FSM)

```
┌─────────────────────────────────────────────┐
│         NORMAL (Outcast Mode)               │
│  • Solo runner vs crowd                     │
│  • Original colors & speeds                 │
│  • Goal: move forward                       │
└────────────────┬────────────────────────────┘
                 │ stagnationTime ≥ 6.0s (2 phases: 0-3s charge, 3-6s full)
                 ↓
┌─────────────────────────────────────────────┐
│     ENCIRCLING (Magnetism Phase)            │
│  • 3 rings forming around player            │
│  • Crowd attracted in magnetic field        │
│  • Visual: rings become visible             │
└────────────────┬────────────────────────────┘
                 │ rings.readyCount === NUM_RINGS (all 3 rings formed)
                 ↓
┌─────────────────────────────────────────────┐
│    TRANSITIONING (2.0s screen shake)        │
│  • Viewport vibration (randomness)          │
│  • colorBlend: 0 → 1 (entire world greys)   │
│  • Player morphs to dark blue/obsidian      │
│  • Audio: frequency sweep (optional)        │
└────────────────┬────────────────────────────┘
                 │ transitionTime ≥ 2.0s
                 ↓
┌─────────────────────────────────────────────┐
│    INVERTED (Collective Mode)               │
│  • Grey grayscale world (Portal 2 aesthetic)│
│  • Crowd now runs WITH player (allies)      │
│  • Player: dark blue/obsidian shimmer       │
│  • Hermits spawn: rare, fast, hostile       │
│  • Goal: catch 3 hermits per 65m segment    │
│  • Distance counter: subtracts inverted km  │
└────────────────┬────────────────────────────┘
                 │ hermitsCollected === 3
                 ↓
┌─────────────────────────────────────────────┐
│    RETURNING (2.0s reverse shake)           │
│  • colorBlend: 1 → 0 (world dewrays)        │
│  • Player morphs back to amber-yellow       │
│  • Crowd slows down                         │
│  • Camera returns to normal                 │
└────────────────┬────────────────────────────┘
                 │ returnTime ≥ 2.0s
                 ↓
└─────────────────────────────────────────────┘
    NORMAL (resets with inverted distance penalty)
```

**State Type**:
```javascript
export const GAME_STATE = {
    NORMAL: 0,
    ENCIRCLING: 1,
    TRANSITIONING: 2,
    INVERTED: 3,
    RETURNING: 4,
    // Future expansions: DREAM: 5, CHAOS: 6, etc.
};

// In shared memory (SAB):
// gameState[0] = current state (u32)
// gameState[1] = stateTime (f32, resets on transition)
// gameState[2] = colorBlend (f32, 0..1 for greyscale)
// gameState[3] = shakeIntensity (f32, 0..1 for viewport vibration)
// gameState[4] = hermitsCollected (u32, 0..3 in INVERTED)
// gameState[5] = distanceSubtract (f32, accumulated inverted km)
```

---

## 🔵 Three Encircling Rings (Magnetic Geometry)

When `stagnationTime ≥ 3.0s`, rings begin to form.

### Ring Geometry
```
Minimum: 8-12 per ring (rng)
Ring 1 radius: 2.5m (innermost, closest to player)
Ring 2 radius: 4.5m (middle)
Ring 3 radius: 6.5m (outer boundary)

Total people in encirclement: ~24-36 forming 3 concentric circles
```

### Algorithm: Allocate Crowd to Rings

```javascript
// In main.js worker tick:
function allocateRingsForEncirclement(crowdData, numCrowd, playerPos) {
    // Trigger ON: isStagnant && magnetismReady
    
    const rings = [
        { radius: 2.5, sectorCount: 8,  members: [] },
        { radius: 4.5, sectorCount: 10, members: [] },
        { radius: 6.5, sectorCount: 12, members: [] },
    ];
    
    // Select ~8-12 crowd members per ring(indices) from crowdData
    // Use spatial grid: for each ring, find closest people within radius ±0.3m
    // Assign them target positions on circle perimeter (angles 0, 45°, 90°, etc)
    // Set targetRing[i] = ring index
    
    return rings; // Store in ENCIRCLE_RINGS SAB offset
}
```

### Data Layout (SAB offset)
```
ENCIRCLE_RINGS offset: 40 * 4 = 160 bytes
├─ Ring 1 (8x f32 angles): 32 bytes
├─ Ring 2 (10x f32 angles): 40 bytes
├─ Ring 3 (12x f32 angles): 48 bytes
└─ readyCount (u32): 4 bytes [0, 1, 2, 3 = complete]
```

---

## 👥 Hermits (Отщепенцы) — New Enemy Type

**Concept**: Manifestations of your past self. What you were before collective.

### Spawn Rules
- **Frequency**: ~3 per 65m segment, but **random** ✓
- **Count per spawn**: Always 1 (never 2+ together) ✓
- **Behavior**:
  - Speed: ~6.5 m/s (faster than player even in INVERTED)
  - Direction: Towards player + small random jitter
  - HP: 1 (any collision = caught)
  - Despawn: If reach player bounds OR 12s timeout
  
### Detection Logic
```javascript
// In INVERTED mode:
// Track distance traveled: if ((distance - lastHermitCheckpoint) % 65) ~< 1.0m
// RNG: 0..1 < 0.03 (very rare) → spawn 1 hermit

// Never spawn if hermitsCollected >= 3 or active hermits > 0
if (gameState === INVERTED && activeHermits === 0 && hermitsCollected < 3) {
    if (checkHermitSpawnTrigger()) {
        spawnHermitAt(playerPos + random(-8..+8, -8..+8), 
                      speed=6.5, 
                      targetPlayer=true);
    }
}

// On collision: hermitsCollected++, display "1/3", "2/3", "3/3"
// On hermitsCollected === 3: transition to RETURNING
```

### Hermit Visual (Inverted World)
- **Color**: Amber-yellow (mirror of normal player)
- **Shimmer**: Slightly transparent (0.7 alpha) — ghost-like
- **Size**: Slightly larger than crowd (~1.1x)
- **Material**: High emissive (glows, indicates danger)

---

## 🎨 Color Inversion System

### Old Palette (NORMAL mode)
```javascript
// From config.js PAL
player:    0xfec046      // Amber-yellow
crowd:     array[5]      // Blues/steels
enemy:     0xcfe4f7      // Cyan-white  
fog:       0x05050c      // Deep dark
ground:    0x0b0b18      // Slightly lighter dark
```

### New Palette (INVERTED mode) — Portal 2 Aesthetic
```javascript
// NEW in config.js: PAL_INVERTED
PAL_INVERTED = {
    player:    0x1a1a2e,      // Dark blue/obsidian (was amber)
    crowd:     [               // Grey monochrome tones + slight variation
        0x5a5a5a,             // Medium grey
        0x6a6a6a,             // Slightly lighter grey  
        0x4a4a4a,             // Slightly darker grey
        0x555555,             // Neutral grey
        0x656565,             // Warm grey
    ],
    enemy:     0x8a8a8a,      // Light grey (hermits look like "escaped" crowd)
    fog:       0xb0b0b0,      // Light grey fog (inverted darkness)
    ground:    0xa0a0a0,      // Very light grey ground
    helper:    0x444444,      // Dark grey (powered down in this world)
    blockers:  [0x777777, 0x888888], // Grey obstacles
    slowers:   [0x999999, 0x888888], // Grey slow zones
};

// Transition uses colorBlend [0..1]:
// finalColor = mix(PAL[x], PAL_INVERTED[x], colorBlend)
```

### Visual Transition Timeline
```
t=0.0s:   colorBlend = 0, shakeIntensity = 0.0
t=0.5s:   colorBlend = 0.3, shakeIntensity = 0.8 (peak shake)
t=1.0s:   colorBlend = 0.7, shakeIntensity = 0.4
t=1.5s:   colorBlend = 0.95, shakeIntensity = 0.05
t=2.0s:   colorBlend = 1.0, shakeIntensity = 0.0 (complete)

// Shake: cameraPos += random(-shakeIntensity..+shakeIntensity) * screenHeight * 0.05
```

---

## 📏 Distance Counter System (with Inversion)

### Data Structure
```javascript
// In main.js:
class DistanceTracker {
    normalDistance: f32,        // Total km in NORMAL mode
    invertedDistance: f32,      // Total km in INVERTED mode
    
    get netDistance() {
        return this.normalDistance - this.invertedDistance;
    }
    
    // If net < 0: display as "-X.XXkm" (red text)
    // If net >= 0: display as "+X.XXkm" (yellow text)
}
```

### Logic
```
NORMAL mode:
  distance += playerSpeed * dt

TRANSITION → INVERTED:
  (nothing changes, continue counting)

INVERTED mode:
  invertedDistance += playerSpeed * dt  // Same counter, different variable
  
RETURNING → NORMAL:
  // Don't reset — just switch back to tracking .normalDistance
  // On next tick in NORMAL: distance += playerSpeed * dt
  
Display: max(0, normalDistance - invertedDistance)
  OR allow negative: show "-5.32km" if inverted > normal
```

### HUD Update
```html
<!-- Replace distVal display -->
<div id="score-box">
    ДИСТАНЦИЯ <span id="distVal">0</span>м
    <span id="distInverted" style="display:none;">-<span id="distInvertVal">0</span>м</span>
</div>

<!-- JS: if netDistance < 0, show red -X format -->
<!-- Hint text: grey distance = inversion accumulation -->
```

---

## 🏗️ Implementation Phases

### Phase 1: Foundation (This Chat)
✓ Design Document (you're reading it)
□ `gameState` FSM in SAB  
□ State transition logic skeleton  
□ `PAL_INVERTED` config  
□ Hermit data structures  

### Phase 2: Rings & Magnetism (Next Chat)
□ Encirclement ring allocation  
□ Ring formation visualization  
□ Crowd steering to ring positions  

### Phase 3: Transitions & Visual (Next+1)
□ Screen shake system  
□ Color blend interpolation  
□ Viewport distortion  

### Phase 4: Inverted Gameplay (Next+2)
□ Hermit spawning logic  
□ Hermit AI & collision  
□ Hermit counter UI  
□ Return trigger (3/3 collected)  

### Phase 5: Integration (Next+3)
□ Distance penalty calculation  
□ Mode switching persistence  
□ Stress-test performance  
□ Audio design (tone sweep during TRANSITIONING)  

---

## 🎮 Controls & Feedback (Unchanged)

**In NORMAL mode**: WASD / Arrows + double-tap dash (as before)  
**In INVERTED mode**:  
- WASD works, but now you're moving WITH crowd (not against)
- Player speed: same (7.6) but subjective feel is different (crowd context)
- Collision avoidance: none needed in INVERTED (crowd is allies)
- Focus: watch for rare hermits instead of avoiding crowd

---

## 🚀 Next Steps for New Chat

1. **Open `js/memory-layout.js`** → Add new SAB offsets for game state, rings, hermits
2. **Open `js/config.js`** → Add `PAL_INVERTED`, `HERMITS` config section
3. **Open `js/main.js`** → Implement FSM state machine + state transition logic
4. **Open `js/worker.js`** → Add ring allocation + hermit spawning in tick loop
5. **Open `js/renderer.js`** → Add color blending + screen shake during TRANSITIONING
6. **Open `js/ui.js`** → Update distance display to show net (can be negative)

Each step builds on the previous. The FSM is the **backbone** — once state transitions work, everything else plugs in.

---

## 💾 SAB Layout Amendment

Current offset end: ~376 bytes  

**Add**:
```
GAME_STATE offset: 400 (u32)  
STATE_TIME offset: 404 (f32)  
COLOR_BLEND offset: 408 (f32)  
SHAKE_INTENSITY offset: 412 (f32)  
HERMITS_COLLECTED offset: 416 (u32)  
DISTANCE_SUBTRACT offset: 420 (f32)  

ENCIRCLE_RINGS offset: 424 (3 rings = 8+10+12 members = 30 f32 angles)
ENCIRCLE_READY_COUNT offset: 544 (u32)  

Total new: 148 bytes → new total: ~524 bytes (still very tight, under 1KB)
```

---

## ✨ Philosophy

**This architecture ensures**:
1. **Modularity**: Want to add DREAM_MODE later? Add state enum, add tick logic, done.
2. **Performance**: All state data in SAB, zero allocations in hot path, no message overhead.
3. **Designer-friendly**: Config changes in `config.js` don't require code edits.
4. **Narrative coherence**: Geometry (3 rings, hermits in grey) reinforces the "inversion of identity" theme.
5. **No breaking changes**: All existing systems continue; new state adds orthogonally.

---

**Author**: You've built something rare — a game that transforms instead of dies. That's art. Let's implement it properly.

🎮 Ready for Phase 1? Let's build the FSM spineboard.
