// ═══════════════════════════════════════════════════════════════════════════════
// CONFIG: Inverted Mode Palette & Mechanics
// ═══════════════════════════════════════════════════════════════════════════════
// Defines colors, speeds, and parameters for Collective/Inverted mode.
// Add this to config.js as new export section.

// ─────────────────────────────────────────────────────────────────────────────
// 🌫️  INVERTED MODE COLOR PALETTE (Portal 2 / Half-Life 2 Aesthetic)
// ─────────────────────────────────────────────────────────────────────────────
// When colorBlend reaches 1.0, all colors fade to these greyscale tones.
// The palette is monochromatic but with enough variation to preserve visual hierarchy.

export const PAL_INVERTED = {
    // Player in collective: dark blue/obsidian with black shimmer
    // Represents: merged with shadow, no longer individual lightbearer
    player:    0x1a1a2e,      // Deep indigo-black
    playerEmissive: 0.15,      // Dimmer than normal (0.75 → 0.15)
    
    // Crowd in collective: various greys (still 5 tones for variation)
    // Represents: all equal in the grey mass, identity subsumed
    crowd: [
        0x5a5a5a,              // Base grey
        0x6a6a6a,              // Slightly lighter
        0x4a4a4a,              // Slightly darker
        0x555555,              // Neutral
        0x656565,              // Warmth grey
    ],
    crowdRoughness: 0.75,      // Slightly less reflective in grey
    
    // Hermits (escaped individuals): light grey with slight blue tint
    // Represents: they're like lost versions of old self, visible/dangerous
    hermit:    0x7a8a9a,      // Light grey-blue
    hermitEmissive: 0.5,       // Glowing danger indicator
    
    // Environment: light grey fog + pale ground (inverted from darkness)
    // Represents: inversion of space itself
    fog:       0xb0b0b0,      // Light grey (was 0x05050c)
    ground:    0xa0a0a0,      // Very light grey (was 0x0b0b18)
    grid:      0x8a8a8a,      // Grid lines still subtle but visible
    
    // Obstacles & hazards: remain grey but distinct
    blockers: [
        0x777777,              // Medium grey obstacle
        0x888888,              // Slightly lighter variant
    ],
    slowers: [
        0x999999,              // Light grey slow zone
        0x888888,              // Alternative
    ],
    
    // Helpers (if active): disable/darken in inverted
    helper:    0x444444,      // Disabled state (was bright green)
    
    // Lighting: invert the light colors
    sunCol:    0x606060,      // Dull grey sun (was 0x8fa5d0 - cool blue)
    ambient:   0x707070,      // Brighter ambient to match light fog (was 0x2a3a5a)
};

// ─────────────────────────────────────────────────────────────────────────────
// 🎮 COLLECTIVE MODE GAMEPLAY ADJUSTMENTS
// ─────────────────────────────────────────────────────────────────────────────

export const COLLECTIVE = {
    // Player behavior: normal speed, but subjective feel changes
    // (crowd around you moving at same speed makes it feel controlled)
    PLAYER_SPEED: 7.6,         // Same as normal — relativity is key
    
    // Crowd behavior: no longer enemies, now allies moving together
    CROWD_SPEED_MULTIPLIER: 1.0,  // Move with player (was scattered)
    
    // Magnetism is OFF in collective (no forces needed, they're with you)
    MAGNETISM_ACTIVE: false,
    
    // Collision detection: disabled with crowd members (they're allies)
    CROWD_COLLISION_ENABLED: false,
    
    // Encirclement comfort: crowd maintains formation
    FORMATION_RADIUS: 3.0,     // They stay ~3m radius around you
};

// ─────────────────────────────────────────────────────────────────────────────
// 👻 HERMITS (Отщепенцы) — Escaped Outcasts
// ─────────────────────────────────────────────────────────────────────────────
// Rare manifestations of your former self. Dangerous because they remind you
// of what you were: alone, fragile, hunted by a sea of faces.

export const HERMITS = {
    // Spawn frequency
    MAX_ACTIVE: 1,             // Never more than 1 at a time
    SPAWN_DISTANCE_SEGMENT: 65.0,  // 1 segment = 65 meters
    SPAWN_CHANCE_PER_SEGMENT: 0.3, // ~30% chance per segment = ~3 per 65m
    
    // Movement
    BASE_SPEED: 6.5,           // Faster than player (7.6) — you must be swift to catch
    DIRECTION_VARIANCE: 0.15,  // Small random jitter (±15°)
    ACCELERATION: 12.0,        // Quick to max speed
    
    // Physical properties
    RADIUS: 0.4,               // Slightly larger than crowd (0.35 → 0.4)
    COLLISION_DAMAGE: 1,       // 1 hit = caught (destroyed/absorbed)
    
    // Lifetime
    DESPAWN_TIME: 12.0,        // 12 seconds if not caught → despawn (you missed opportunity)
    RESPAWN_CHANCE: 0.0,       // Once despawned, doesn't respawn (until next segment)
    
    // AI Behavior
    TRACKING_MODE: 'player',   // Always target player
    PURSUIT_RADIUS: 50.0,      // Can see player within 50m
    PURSUIT_STRENGTH: 0.8,     // Strong targeting (0=ignore, 1=perfect tracking)
    
    // Visuals
    COLOR: 0x7a8a9a,           // Light grey-blue (from PAL_INVERTED.hermit)
    EMISSIVE: 0.5,             // Glows as danger indicator
    SHADER_EFFECT: 'shimmer',  // Slightly transparent/ghostly (optional)
    ALPHA: 0.85,               // Slightly transparent
    
    // Debug
    SPAWN_LOGGING: true,       // Log "Hermit #N spawned at time X"
};

// ─────────────────────────────────────────────────────────────────────────────
// 💫 TRANSITION EFFECTS (Screen Shake + Colorization)
// ─────────────────────────────────────────────────────────────────────────────

export const TRANSITIONS = {
    // Forward transition (NORMAL → INVERTED, 2 seconds)
    FORWARD_DURATION: 2.0,
    FORWARD_SHAKE_PEAK: 0.8,   // Max intensity at t=1.0s
    
    // Reverse transition (INVERTED → NORMAL, 2 seconds)
    RETURN_DURATION: 2.0,
    RETURN_SHAKE_PEAK: 0.6,    // Slightly milder on return
    
    // Color blending
    // colorBlend interpolation:
    //   0.0 = NORMAL (original colors)
    //   0.5 = 50% greyscale
    //   1.0 = INVERTED (all grey)
    COLOR_LERP_CURVE: 'linear', // 'linear', 'ease-in', 'ease-out'
    
    // Camera shake algorithm
    SHAKE_METHOD: 'perlin',     // 'perlin' (smooth) or 'random' (brutal)
    
    // Screen distortion (optional enhancement)
    DISTORTION_ENABLED: false, // Can add lens distortion if desired
};

// ─────────────────────────────────────────────────────────────────────────────
// 📊 ENCIRCLEMENT RING GEOMETRY
// ─────────────────────────────────────────────────────────────────────────────

export const ENCIRCLEMENT = {
    // Three concentric rings
    RINGS: [
        {
            radius: 2.5,    // Inner ring, closest to player
            members: 8,     // Minimum members (can randomize ±2)
            angle_start: 0, // Degrees
            angle_step: 45, // 360 / 8 = 45° per member
        },
        {
            radius: 4.5,    // Middle ring
            members: 10,
            angle_start: 22.5, // Stagger so they don't overlap visually
            angle_step: 36,
        },
        {
            radius: 6.5,    // Outer ring, max distance
            members: 12,
            angle_start: 15,
            angle_step: 30,
        },
    ],
    TOTAL_MEMBERS: 30,         // 8 + 10 + 12
    
    // Formation timing
    FORMATION_TIME_MAX: 3.0,   // Max 3 seconds to form before forcing transition
    MEMBER_POSITIONING_SPEED: 0.3, // How fast they move to ring positions (0..1 per sec)
    
    // Visual distinction
    RING_VISIBILITY: true,     // Show ring geometry (optional, for debug)
    RING_LINE_COLOR: 0x666666, // Grey ring guide lines
};

// ─────────────────────────────────────────────────────────────────────────────
// 📏 DISTANCE TRACKING IN INVERTED MODE
// ─────────────────────────────────────────────────────────────────────────────

export const INVERSION_DISTANCE = {
    // When you enter inverted mode, distance counter changes meaning
    // normalDistance - invertedDistance = visible score
    
    // Display format
    SHOW_NEGATIVE: true,       // Allow "-X.XXkm" display if accumulated < normal
    NEGATIVE_COLOR: 0xff4444,  // Red for negative scores
    POSITIVE_COLOR: 0xfec046,  // Yellow for positive scores
    
    // Each hermit caught is not distance bonus — it's progression marker
    HERMIT_UI_COUNTER: true,   // Show "1/3", "2/3", "3/3"
    HERMIT_COUNTER_COLOR: 0x2ef077, // Neon green for progress
};

// ─────────────────────────────────────────────────────────────────────────────
// EXPORT FOR USE IN main.js / renderer.js / worker.js
// ─────────────────────────────────────────────────────────────────────────────

export const INVERSION_CONFIG = {
    PAL_INVERTED,
    COLLECTIVE,
    HERMITS,
    TRANSITIONS,
    ENCIRCLEMENT,
    INVERSION_DISTANCE,
};

export default INVERSION_CONFIG;
