// ═══════════════════════════════════════════════════════════════════════════════
// CROWD: Game State Machine (FSM) for Inversion Mode
// ═══════════════════════════════════════════════════════════════════════════════
// Manages transitions between:
//   NORMAL → ENCIRCLING → TRANSITIONING → INVERTED → RETURNING → NORMAL
//
// All state lives in SAB (shared memory), renderer reads it without overhead.
// This keeps all game logic deterministic and synchronized with physics tick.

// ─────────────────────────────────────────────────────────────────────────────
// STATE CONSTANTS
// ─────────────────────────────────────────────────────────────────────────────

export const GAME_STATE = {
    NORMAL:        0,  // Default gameplay — player vs crowd
    ENCIRCLING:    1,  // Magnetism active, rings forming around player
    TRANSITIONING: 2,  // Screen shake + color inversion (2.0s)
    INVERTED:      3,  // Grey world, player in collective, hunt hermits
    RETURNING:     4,  // Reverse transition (2.0s) back to normal
};

// State names for logging/debugging
export const STATE_NAMES = [
    'NORMAL',
    'ENCIRCLING',
    'TRANSITIONING',
    'INVERTED',
    'RETURNING',
];

// ─────────────────────────────────────────────────────────────────────────────
// TIMING CONSTANTS (seconds)
// ─────────────────────────────────────────────────────────────────────────────

export const STATE_TIMINGS = {
    // Magnetism charge phases before ENCIRCLING is ready
    MAGNETISM_PHASE_1_DURATION: 3.0,  // 0-3s: charging, logs "Charging..."
    MAGNETISM_PHASE_2_DURATION: 3.0,  // 3-6s: full pull, logs "FULL PULL ACTIVE"
    STAGNATION_THRESHOLD:       6.0,  // Total time before rings form
    
    // Transition animations
    TRANSITION_DURATION:        2.0,  // Shake + colorize duration (NORMAL -> INVERTED)
    RETURN_DURATION:            2.0,  // Reverse transition (INVERTED -> NORMAL)
    
    // Ring formation (per ring)
    RING_FORMATION_TIME_MAX:    3.0,  // Time before ring considered "ready"
};

// ─────────────────────────────────────────────────────────────────────────────
// SAB OFFSETS (in memory-layout.js, extend this)
// ─────────────────────────────────────────────────────────────────────────────
// These should be defined globally; shown here for reference:
//
// GAME_STATE_OFFSET:      400 (u32)     — current state (0..4)
// STATE_TIME_OFFSET:      404 (f32)     — elapsed time in current state
// COLOR_BLEND_OFFSET:     408 (f32)     — [0..1] greyscale factor
// SHAKE_INTENSITY_OFFSET: 412 (f32)     — [0..1] viewport vibration
// HERMITS_COLLECTED_OFFSET: 416 (u32)   — count of caught hermits (0..3)
// DISTANCE_SUBTRACT_OFFSET: 420 (f32)   — accumulated inverted km to subtract

// ─────────────────────────────────────────────────────────────────────────────
// FSM CLASS (Worker-side, runs in physics tick)
// ─────────────────────────────────────────────────────────────────────────────

export class GameStateMachine {
    constructor(sabView) {
        this.view = sabView; // Reference to SAB u32/f32 views
        this.currentState = GAME_STATE.NORMAL;
        this.stateTime = 0;
        this.magnetismPhase = 0; // 0 = not active, 1 = phase 1, 2 = phase 2
    }
    
    // ─────────────────────────────────────────────────────────────────────
    // STATE QUERY METHODS
    // ─────────────────────────────────────────────────────────────────────
    
    getState() {
        return this.currentState;
    }
    
    isState(stateValue) {
        return this.currentState === stateValue;
    }
    
    isInNormalMode() {
        return this.currentState === GAME_STATE.NORMAL;
    }
    
    isInInvertedMode() {
        return this.currentState === GAME_STATE.INVERTED;
    }
    
    canMove() {
        // Player can move in NORMAL, ENCIRCLING, INVERTED (not during TRANSITION)
        return this.currentState !== GAME_STATE.TRANSITIONING &&
               this.currentState !== GAME_STATE.RETURNING;
    }
    
    isCrowdAlly() {
        // In INVERTED+RETURNING, crowd is on your side
        return this.currentState === GAME_STATE.INVERTED ||
               this.currentState === GAME_STATE.RETURNING;
    }
    
    // ─────────────────────────────────────────────────────────────────────
    // MAIN TICK LOOP (call once per physics frame from worker)
    // ─────────────────────────────────────────────────────────────────────
    
    tick(dt, playerData, crowdData) {
        this.stateTime += dt;
        
        // Update SAB for renderer consumption
        this.writeToSAB();
        
        // State-specific behavior
        switch (this.currentState) {
            case GAME_STATE.NORMAL:
                this.tickNormal(dt, playerData, crowdData);
                break;
            case GAME_STATE.ENCIRCLING:
                this.tickEncircling(dt, playerData, crowdData);
                break;
            case GAME_STATE.TRANSITIONING:
                this.tickTransitioning(dt);
                break;
            case GAME_STATE.INVERTED:
                this.tickInverted(dt, playerData, crowdData);
                break;
            case GAME_STATE.RETURNING:
                this.tickReturning(dt);
                break;
        }
    }
    
    // ─────────────────────────────────────────────────────────────────────
    // NORMAL MODE (Original Gameplay)
    // ─────────────────────────────────────────────────────────────────────
    
    tickNormal(dt, playerData, crowdData) {
        // Check if player is stagnant (from magnetism system)
        // This should be set by existing stagnation detection
        const isStagnant = this.isPlayerStagnant(playerData);
        
        if (isStagnant) {
            // Track how long player has been stagnant
            if (!this.stagnationTrackingStart) {
                this.stagnationTrackingStart = this.stateTime;
            }
            
            const stagnationDuration = this.stateTime - this.stagnationTrackingStart;
            
            // Phase 1: 0-3s (charging)
            if (stagnationDuration < STATE_TIMINGS.MAGNETISM_PHASE_1_DURATION) {
                this.magnetismPhase = 1;
                // Existing magnetism code runs
            }
            // Phase 2: 3-6s (full pull)
            else if (stagnationDuration < STATE_TIMINGS.STAGNATION_THRESHOLD) {
                this.magnetismPhase = 2;
                // Existing magnetism code with 8x force runs
            }
            // Threshold exceeded: trigger encirclement
            else if (stagnationDuration >= STATE_TIMINGS.STAGNATION_THRESHOLD) {
                console.log('[FSM] Stagnation threshold reached. Rings now forming...');
                this.transitionTo(GAME_STATE.ENCIRCLING);
            }
        } else {
            // Player is moving: reset stagnation counter
            this.stagnationTrackingStart = null;
            this.magnetismPhase = 0;
        }
    }
    
    // ─────────────────────────────────────────────────────────────────────
    // ENCIRCLING MODE (Ring Formation)
    // ─────────────────────────────────────────────────────────────────────
    
    tickEncircling(dt, playerData, crowdData) {
        // Allocate crowd to 3 concentric rings if not done
        if (!this.ringsAllocated) {
            this.allocateRings(playerData, crowdData);
            this.ringsAllocated = true;
            console.log('[FSM] Rings allocated. Ring formation time: 3s max.');
        }
        
        // Check if all rings are "ready" (crowd members reached target positions)
        const encircleReadyCount = this.getEncircleReadyRings();
        
        if (encircleReadyCount === 3 || this.stateTime >= STATE_TIMINGS.RING_FORMATION_TIME_MAX) {
            console.log('[FSM] All rings formed. Triggering transition animation...');
            this.transitionTo(GAME_STATE.TRANSITIONING);
        }
    }
    
    allocateRings(playerData, crowdData) {
        // Geometry: 3 rings at distances 2.5m, 4.5m, 6.5m
        // Each ring has people arranged in sectors (8, 10, 12 members)
        // This writes data to SAB ENCIRCLE_RINGS offset
        
        const rings = [
            { radius: 2.5, sectors: 8,  startIdx: 0 },
            { radius: 4.5, sectors: 10, startIdx: 8 },
            { radius: 6.5, sectors: 12, startIdx: 18 },
        ];
        
        const playerPos = playerData.pos; // [x, y, z]
        
        // TODO: For each ring, select crowd members and assign them
        // to circular target positions around player
        // Write to SAB: ringMemberIndices, targetAngles, ringReadyFlags
        
        console.log('[FSM] Allocated 3 rings: 8+10+12 members');
    }
    
    getEncircleReadyRings() {
        // Query SAB ENCIRCLE_READY_COUNT
        // Returns 0..3 (how many rings are "formed")
        // TODO: Read from SAB
        return 0; // Placeholder
    }
    
    // ─────────────────────────────────────────────────────────────────────
    // TRANSITIONING (Screen Shake + Color Blend)
    // ─────────────────────────────────────────────────────────────────────
    
    tickTransitioning(dt) {
        const progress = Math.min(this.stateTime / STATE_TIMINGS.TRANSITION_DURATION, 1.0);
        
        // Shake: triangular wave, peak at mid-transition
        const shake = Math.sin(progress * Math.PI) * 0.8;
        this.setShakeIntensity(shake);
        
        // Color: linear interpolate 0 → 1 (0=normal colors, 1=greyscale)
        const colorBlend = progress;
        this.setColorBlend(colorBlend);
        
        // When complete, move to INVERTED
        if (progress >= 1.0) {
            console.log('[FSM] Transition complete. Welcome to the Collective.');
            this.transitionTo(GAME_STATE.INVERTED);
        }
    }
    
    // ─────────────────────────────────────────────────────────────────────
    // INVERTED MODE (Grey World + Hermit Hunting)
    // ─────────────────────────────────────────────────────────────────────
    
    tickInverted(dt, playerData, crowdData) {
        // Persistent: collect hermits (counter in SAB)
        const hermitsCollected = this.getHermitsCollected();
        
        // Spawn hermits occasionally (very rare)
        this.maybeSpawnHermit(dt, playerData);
        
        // Track distance accumulated in inverted mode
        // This is done by main distance tracker, not here
        
        // Check win condition: collected 3 hermits
        if (hermitsCollected >= 3) {
            console.log('[FSM] Collected 3 hermits! Initiating return...');
            this.transitionTo(GAME_STATE.RETURNING);
        }
    }
    
    maybeSpawnHermit(dt, playerData) {
        // Spawn logic:
        // - Check if distance segment crossed multiple of 65m
        // - RNG: 3% chance per segment
        // - Never spawn if active hermit exists or 3 already collected
        
        // TODO: Implement hermit spawner with distance tracking
    }
    
    getHermitsCollected() {
        // Read from SAB HERMITS_COLLECTED_OFFSET
        // TODO: Implement
        return 0;
    }
    
    // ─────────────────────────────────────────────────────────────────────
    // RETURNING (Reverse Transition)
    // ─────────────────────────────────────────────────────────────────────
    
    tickReturning(dt) {
        const progress = Math.min(this.stateTime / STATE_TIMINGS.RETURN_DURATION, 1.0);
        
        // Reverse the shake
        const shake = (1.0 - progress) * Math.sin(progress * Math.PI) * 0.8;
        this.setShakeIntensity(shake);
        
        // Reverse the color blend
        const colorBlend = 1.0 - progress;
        this.setColorBlend(colorBlend);
        
        // When complete, return to NORMAL
        if (progress >= 1.0) {
            console.log('[FSM] Welcome back to the Outcast. Distance adjusted.');
            
            // Accumulate inverted distance into distance penalty
            // This is handled by main distance tracker
            
            this.transitionTo(GAME_STATE.NORMAL);
        }
    }
    
    // ─────────────────────────────────────────────────────────────────────
    // TRANSITION HELPER
    // ─────────────────────────────────────────────────────────────────────
    
    transitionTo(newState) {
        if (newState === this.currentState) return;
        
        console.log(`[FSM] STATE: ${STATE_NAMES[this.currentState]} → ${STATE_NAMES[newState]}`);
        
        // Reset state timer
        this.stateTime = 0;
        
        // Clear state-specific data
        if (this.currentState === GAME_STATE.NORMAL) {
            this.stagnationTrackingStart = null;
        }
        if (this.currentState === GAME_STATE.ENCIRCLING) {
            this.ringsAllocated = false;
        }
        
        // Transition to new state
        this.currentState = newState;
    }
    
    // ─────────────────────────────────────────────────────────────────────
    // SAB WRITE METHODS (for renderer consumption)
    // ─────────────────────────────────────────────────────────────────────
    
    writeToSAB() {
        // Write current state data to SAB so renderer doesn't need messages
        // This is called every tick
        
        // GAME_STATE (u32[GAME_STATE_OFFSET / 4])
        // STATE_TIME (f32[STATE_TIME_OFFSET / 4])
        // COLOR_BLEND (f32[COLOR_BLEND_OFFSET / 4])
        // SHAKE_INTENSITY (f32[SHAKE_INTENSITY_OFFSET / 4])
        
        // TODO: Implement SAB writes
    }
    
    setColorBlend(value) {
        // Clamp [0..1]
        // Write to SAB COLOR_BLEND_OFFSET
        // This value is read by renderer in fragment shader
    }
    
    setShakeIntensity(value) {
        // Clamp [0..1]
        // Write to SAB SHAKE_INTENSITY_OFFSET
        // Renderer applies random offset: cameraPos += random(-value, +value) * screenScale
    }
    
    // ─────────────────────────────────────────────────────────────────────
    // UTILITY
    // ─────────────────────────────────────────────────────────────────────
    
    isPlayerStagnant(playerData) {
        // Check if player velocity is below threshold for X seconds
        // This should be calculated in main game logic
        // For now, placeholder:
        const vel = Math.hypot(playerData.vx, playerData.vy);
        return vel < 0.1; // Very slow movement
    }
}

// ─────────────────────────────────────────────────────────────────────────────
// EXPORT FOR INTEGRATION INTO main.js
// ─────────────────────────────────────────────────────────────────────────────

export default GameStateMachine;
