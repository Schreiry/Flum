import { CROWD_N, MAX_ENEMIES, MAX_HELPERS, MAX_BLOCKERS, MAX_SLOWERS } from './config.js';

export const MEM_SZ = {
    STATE: 28,  // [0]=running, [1]=gameOver, [2]=maxDist, [3]=hitFlag, [4]=rescueFlag, [15]=encircleLevel, [16]=encircleTimer
                // [17]=gameMode (0=NORMAL, 1=ENCIRCLING, 2=TRANSITIONING, 3=INVERTED, 4=RETURNING)
                // [18]=transitionProgress (0.0→1.0), [19]=ringsFormed (0-3), [20]=hermitsCollected (0-3)
                // [21]=hermitActive (0/1), [22]=hermitX, [23]=hermitZ, [24]=shakeIntensity (0.0→1.0)
                // [25]=colorBlend (0.0→1.0), [26]=invertedSpeedMult, [27]=distanceSinceLastHermit
    PLAYER_VARS: 16,  // [0]=px, [1]=pz, [2]=invTimer,...
    PLAYER_MATS: 64,  // body(16), head(16), lArm(16), rArm(16)
    CROWD_BODY: CROWD_N * 16,
    CROWD_HEAD: CROWD_N * 16,
    ENEMY_BODY: MAX_ENEMIES * 16,
    ENEMY_HEAD: MAX_ENEMIES * 16,
    HELPER_BODY: MAX_HELPERS * 16,
    HELPER_HEAD: MAX_HELPERS * 16,
    HELPER_LARM: MAX_HELPERS * 16,
    HELPER_RARM: MAX_HELPERS * 16,
    HELPER_VARS: MAX_HELPERS * 4, // [px, pz, active, phase] for lights/rings
    BLOCKER_BODY: MAX_BLOCKERS * 16,
    BLOCKER_HEAD: MAX_BLOCKERS * 16,
    BLOCKER_VARS: MAX_BLOCKERS * 4, // color index, active, x, z
    SLOWER_BODY: MAX_SLOWERS * 16,
    SLOWER_HEAD: MAX_SLOWERS * 16,
    SLOWER_VARS: MAX_SLOWERS * 4 // color index, active, x, z
};

export const MEM_OFF = {};
let currentOff = 0;
for (const [key, size] of Object.entries(MEM_SZ)) {
    MEM_OFF[key] = currentOff;
    currentOff += size;
}

export const TOTAL_FLOATS = currentOff;
export const TOTAL_BYTES = TOTAL_FLOATS * 4;

// Helper to create a sub-array view from the main shared array buffer
export function createView(sharedFloatArray, key) {
    return new Float32Array(
        sharedFloatArray.buffer,
        MEM_OFF[key] * 4,
        MEM_SZ[key]
    );
}
