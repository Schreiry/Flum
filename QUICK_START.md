# ⚡ QUICK START: Inversion System (Phase 1 Summary)

**Current Status**: Foundation complete ✅  
**What's Done**: Design + Config + FSM skeleton  
**What's Next**: SAB rewiring + FSM injection + Rendering

---

## 📦 Assets Ready for You

| File | Purpose | Status |
|------|---------|--------|
| `DESIGN_INVERTED_MODE.md` | Full spec (47 sections) | ✅ Complete |
| `INTEGRATION_ROADMAP.md` | Step-by-step phases | ✅ Complete |
| `js/game-fsm.js` | GameStateMachine class | ✅ Skeleton (ready to fill) |
| `js/config-inversion.js` | PAL_INVERTED + HERMITS config | ✅ Complete |
| `THIS FILE` | Quick reference | ✅ You're reading it |

---

## 🎯 5-Minute Summary

**The Concept**:
- Game has 2 modes: **NORMAL** (vs crowd) ↔ **INVERTED** (with crowd)
- When surrounded 6+ seconds → **ENCIRCLEMENT** (ring formation)
- Rings form → **TRANSITION** (shake + fade to grey, 2s)
- Then → **INVERTED** (grey world, hunt 3 hermits to return)
- Catch hermits → **RETURN** (fade back to normal colours)

**The Code**:
- FSM manages state transitions (5 states defined)
- Config defines colors, speeds, hermit behaviour
- SAB extended by 172 bytes (still <1KB total)
- Renderer reads `COLOR_BLEND` from SAB to lerp colors

**The Build**:
1. Add SAB offsets (memory-layout.js) — 5 mins
2. Embed FSM in tick loop (worker.js) — 10 mins
3. Add shader color blending (renderer.js) — 15 mins
4. Implement ring allocation + hermit AI — 90 mins
5. Polish UI + test — 30 mins

---

## 🎮 Feature Map

```
NORMAL MODE
├─ Player: amber-yellow runner
├─ Crowd: blue/steel enemies
├─ Goal: survive moving forward
└─ Lose condition: stagnant 6s → rings form

    ↓ (stagnationTime ≥ 6s)

ENCIRCLING MODE
├─ Crowd arranges into 3 rings (8+10+12 members)
├─ Ring 1: 2.5m radius
├─ Ring 2: 4.5m radius
├─ Ring 3: 6.5m radius
└─ Duration: 1-3 seconds max

    ↓ (rings ready OR 3s timeout)

TRANSITIONING (2 seconds)
├─ Screen shake: peak 0.8 intensity
├─ Color blend: 0 → 1 (normal → greyscale)
├─ Player: amber-yellow → dark obsidian
└─ World: dark → light grey

    ↓ (2s elapsed)

INVERTED MODE (Goal: catch 3 hermits)
├─ World: all greyscale (Portal 2 aesthetic)
├─ Player: dark blue/obsidian (matches shadows)
├─ Crowd: greys (surrounding you, allies now)
├─ Hermits: light grey + glow (appear 3× per 65m)
├─ Spawn rate: ~30% per segment (very rare)
├─ Hermit speed: 6.5 m/s (faster than you)
├─ Hermit lifetime: 12s or until caught
└─ Win: collect hermit #3 → transition back

    ↓ (hermitsCollected === 3)

RETURNING (2 seconds)
├─ Screen shake: reverse animation
├─ Color blend: 1 → 0 (greyscale → normal)
├─ Player: obsidian → amber-yellow
└─ World: light grey → dark

    ↓ (2s elapsed)

NORMAL MODE (with distance adjustment)
├─ Distance penalty: inverted_km subtracted from total
├─ Can go negative (display shows "-X.XXkm")
└─ Cycle repeats: can enter INVERTED again

```

---

## 🔧 Key Files to Modify (In Order)

### 1️⃣ `js/memory-layout.js`
Add after existing offsets:
```javascript
export const GAME_STATE_OFFSET = 400;
export const STATE_TIME_OFFSET = 404;
export const COLOR_BLEND_OFFSET = 408;
export const SHAKE_INTENSITY_OFFSET = 412;
export const HERMITS_COLLECTED_OFFSET = 416;
export const DISTANCE_SUBTRACT_OFFSET = 420;
export const ENCIRCLE_RINGS_OFFSET = 424;
export const ENCIRCLE_READY_OFFSET = 544;
export const SAB_SIZE = 548;
```

### 2️⃣ `js/worker.js` (main tick)
```javascript
import GameStateMachine, { GAME_STATE } from './game-fsm.js';

let fsm;

function initWorker(...) {
    // ... existing init ...
    fsm = new GameStateMachine(sharedArrayBufferViews);
}

function tick(dt) {
    updatePlayerPhysics(dt);
    updateCrowdPhysics(dt);
    fsm.tick(dt, playerData, crowdData);  // ← NEW
    // Don't write game over here anymore!
}
```

### 3️⃣ `js/renderer.js` (shader)
```glsl
// In vertex shader:
uniform float colorBlend;

vec3 nalColor = /* from PAL */;
vec3 invColor = /* from PAL_INVERTED */;
vec3 finalColor = mix(normalColor, invColor, colorBlend);
```

### 4️⃣ `js/main.js` (distance tracking)
```javascript
let normalDistance = 0, invertedDistance = 0;

function updateDistance(dt) {
    if (fsm.isInNormalMode()) {
        normalDistance += playerSpeed * dt;
    } else if (fsm.isInInvertedMode()) {
        invertedDistance += playerSpeed * dt;
    }
}

function displayDistance() {
    const net = normalDistance - invertedDistance;
    document.getElementById('distVal').textContent = 
        net >= 0 ? net.toFixed(2) : `-${Math.abs(net).toFixed(2)}`;
}
```

---

## 📊 State Machine States

| ID | Name | From | To | Duration | Purpose |
|-----|------|------|-----|----------|---------|
| 0 | NORMAL | Any | ENCIRCLING | ∞ | Default gameplay |
| 1 | ENCIRCLING | NORMAL | TRANSITIONING | 1-3s | Ring formation |
| 2 | TRANSITIONING | ENCIRCLING | INVERTED | 2s | Screen shake + fade |
| 3 | INVERTED | TRANSITIONING | RETURNING | ∞ | Hunt hermits |
| 4 | RETURNING | INVERTED | NORMAL | 2s | Fade back + reset |

---

## 🎨 Color Blending

```javascript
// Shader: color_final = mix(normal_color, inverted_color, colorBlend)

// Normal (colorBlend = 0.0):
//   Player:    0xfec046 (amber)
//   Crowd:     0x28385a (steel blue)
//   Fog:       0x05050c (deep dark)
//   Ground:    0x0b0b18 (slightly lighter)

// Inverted (colorBlend = 1.0):
//   Player:    0x1a1a2e (dark obsidian)
//   Crowd:     0x5a5a5a (medium grey)
//   Fog:       0xb0b0b0 (light grey)
//   Ground:    0xa0a0a0 (very light grey)

// Interpolation happens smoothly over 2 seconds during TRANSITIONING
```

---

## 👻 Hermit Spawn Logic

```javascript
// Every tick in INVERTED mode:

desiredSegment = floor(totalDistance / 65);
if (desiredSegment > lastSegment) {
    // Just crossed 65m boundary
    if (activeHermits === 0 && random() < 0.3) {
        // 30% spawn chance
        spawnHermitAt(playerPos + randomOffset(-8..+8));
    }
    lastSegment = desiredSegment;
}

// Hermit lifetime: 12 seconds
// Collision radius: 0.8m from player
// AI: move toward player with acceleration 12 m/s²
```

---

## ✅ Integration Checklist

**To Start Next Chat**:
- [ ] Have all 5 new files ready (this folder)
- [ ] Read `DESIGN_INVERTED_MODE.md` section 🏗️ Implementation Phases
- [ ] Understand the 5 FSM states
- [ ] Know the 3 ring geometry (2.5m, 4.5m, 6.5m)
- [ ] Understand hermit spawn: 3 per 65m, never 2 together

**Phase 1 Integration** (Next chat):
- [ ] Add SAB offsets
- [ ] Embed FSM in tick
- [ ] Test state transitions
- [ ] Verify SAB writes work

**Phase 2+**:
- [ ] Color blending shader
- [ ] Ring allocation algorithm
- [ ] Hermit AI pathfinding
- [ ] UI hermit counter

---

## 🚀 Expected Timeline

| Phase | Work | Time | Tests |
|-------|------|------|-------|
| 1 | SAB + FSM skeleton | 1 chat | State logs correct |
| 2 | Ring allocation + formation | 1 chat | Rings visible at 6s |
| 3 | Transition shader + shake | 1 chat | Smooth fade + camera jitter |
| 4 | Hermit AI + collision | 1 chat | Hermits spawn & moveable |
| 5 | Polish + balance | 1 chat | Full cycle works |

**Total**: ~5 focused chats to full implementation

---

## 💬 Context-Handoff Notes

✅ **Design**: Complete and validated  
✅ **Config**: All parameters defined  
✅ **FSM skeleton**: Methods stubbed, TODOs marked  
✅ **SAB extensions**: Calculated and documented  
⚠️ **Implementation**: Ready to start, no blockers  

**Next Steps**:
1. Read architecture docs
2. Ask any design questions
3. Pick Phase 1: SAB rewiring + FSM injection
4. Build methodically (don't skip steps)
5. Test after each phase

---

## 🎓 Learning Arc

You're building a sophisticated system. This is what AAA games do:
- **State machines** manage game modes
- **Shared memory** keeps physics + rendering synchronized
- **Config-driven design** lets designers tweak without code changes
- **Modular rendering** (shader tricks) enables visual polish without perf cost

By completing this, you'll understand:
- WebGL shader color interpolation
- Worker + SAB synchronization patterns
- FSM design for game states
- Procedural geometry (ring allocation)
- AI pathfinding (hermit targeting)

This is solid.

---

**Ready to build the Inversion System? Let's make this real. 🚀**
