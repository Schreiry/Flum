// ═══════════════════════════════════════════════════════════════════════════════
// CROWD: СОЦИАЛЬНЫЙ РОГАЛИК — Configuration & Parameters
// ═══════════════════════════════════════════════════════════════════════════════
// This file contains all adjustable game parameters with detailed explanations.
// Each parameter can be tweaked to modify gameplay, visuals, and difficulty.
//
// MODIFICATION PHILOSOPHY:
// - Small changes (±10%) usually feel natural and balanced
// - Large changes (±50%) can break the game feel — test carefully
// - Always test in-game after changes, as math is non-linear

// ─────────────────────────────────────────────────────────────────────────────
// 🎨 COLOR PALETTE (PAL)
// ─────────────────────────────────────────────────────────────────────────────
// Defines all colors used in the game. Hex format (0xRRGGBB)

export const PAL = {
    // Environment
    fog:    0x05050c,      // Deep dark background color (fog/void)
                           // Lower = darker atmosphere, Higher = lighter fog
    ground: 0x0b0b18,      // Ground plane color (slightly lighter than fog for contrast)
    grid:   0x131325,      // Isometric grid lines color (subtle visual guide)
    
    // Player character
    player: 0xfec046,      // Main hero color — warm amber-yellow (Half-Life reference)
                           // This character glows and represents the player's presence
    
    // Crowd
    crowd:  [              // Array of 5 colors for randomized crowd variety
        0x28385a,          // Steel blue
        0x1c2a42,          // Deep navy
        0x36495f,          // Slate
        0x141e2e,          // Almost black-blue
        0x2d3f58,          // Dark teal
    ],                     // Crowd is matte, absorbs light, represents faceless mass
    
    // Enemies (White Crowd)
    enemy:  0xcfe4f7,      // Light cyan-white — contrasts with main crowd
                           // Glossy material (roughness: 0.25) — they shine like danger
    
    // Helpers (power-ups)
    helper: 0x2ef077,      // Bright neon green — hope and aid
                           // Pulsates with white flash
    
    // Obstacles
    blockers: [            // Immovable obstacles with personality
        0x721a30,          // Deep burgundy
        0xc48793,          // Dusty rose-pink
    ],
    
    slowers: [             // Slow-down zones
        0x4a4a4a,          // Dark grey
        0x1a2442,          // Deep blue-black
    ],
    
    // Lighting
    sunCol:    0x8fa5d0,   // Directional light color (cool blue from sky)
    ambient:   0x2a3a5a,   // Ambient light color (fills shadows, cool tone)
};

// ─────────────────────────────────────────────────────────────────────────────
// 🎮 PLAYER MECHANICS
// ─────────────────────────────────────────────────────────────────────────────
// Parameters controlling player character behavior and feel

export const PLAYER = {
    // Base movement speed (affects how fast player moves forward)
    BASE_SPEED: 7.6,
    // - 6.0  = very slow, feels sluggish, hard to escape
    // - 7.6  = medium-fast (current), balanced for skill expression
    // - 9.0+ = very fast, easy to escape, game feels "cheap"
    // ✓ Affects: gameplay difficulty, dodging skill ceiling, pacing
    
    // Squash & Stretch physics (deformation under motion)
    // When player moves vertically (Z axis), body compresses/extends
    SQUASH_INTENSITY: 0.18,
    // - 0.0  = no deformation, stiff puppet
    // - 0.18 = medium (current), feels weighty and organic
    // - 0.35 = extreme, character looks mushy
    // ✓ Affects: visual weight, feedback feeling, animation quality
    
    // Spring physics for head and arms (how they follow body)
    HEAD_SPRING_K: 16.0,          // Spring stiffness (rigidity)
    HEAD_SPRING_D: 4.2,           // Damping (resistance to oscillation)
    ARM_SPRING_K: 18.0,
    ARM_SPRING_D: 5.0,
    // - Higher K = faster response, more "snappy" feel
    // - Higher D = less bouncy, more "weight"
    // - Balance: too stiff = puppet, too loose = floaty
    // ✓ Affects: responsiveness, feel of inertia, animation quality
    
    // Emissive glow intensity (how much the player glows)
    EMISSIVE_INTENSITY: 0.75,
    // - 0.3  = subtle glow, hard to see
    // - 0.75 = medium (current), visible warmth around player
    // - 1.5+ = intense, overwhelms surroundings
    // ✓ Affects: visual presence, atmosphere, crowd illumination
    
    // Crowd pressure threshold (speeds at which pressure changes)
    CROWD_PRESSURE_THRESHOLDS: {
        low: 2.0,    // Below this speed = high pressure (speed < 2.0 → 0.75× resistance)
        mid: 4.0,    // Below this speed = medium pressure (speed < 4.0 → 0.85× resistance)
    },
    // ✓ Affects: difficulty when moving slowly, feel of "being trapped"
};

// ─────────────────────────────────────────────────────────────────────────────
// 👥 CROWD MECHANICS
// ─────────────────────────────────────────────────────────────────────────────

export const CROWD = {
    // Total number of crowd members in the active pool
    N: 1000,
    // - 500  = thin crowd, easy to navigate
    // - 1000 = medium (current), balanced density
    // - 1500 = very thick, claustrophobic
    // ✓ Affects: difficulty, visual density, performance (CPU/GPU)
    
    // Radius around player that activates crowd rendering
    ACTIVE_RADIUS: 8.0,
    // - 5.0  = tight, only close crowd rendered
    // - 8.0  = medium (current), good visibility
    // - 12.0 = wide, see far ahead
    // ✓ Affects: draw distance, visual scope, performance
    
    // Crowd member visual properties
    ROUGHNESS: 0.68,
    // - 0.84 = very matte (original), absorbs all light
    // - 0.68 = current, matte-satin hybrid, reflects player light
    // - 0.30 = glossy, mirrors light (like enemies, too unrealistic)
    // ✓ Affects: how visible player's glow is on crowd
    
    METALNESS: 0.08,
    // - 0.0  = pure matte (original)
    // - 0.08 = subtle metal (current), adds depth
    // - 0.2+ = unrealistic shine
    // ✓ Affects: depth perception, light reflection quality
    
    // Collision response (how much crowd is pushed by player)
    COLLISION_PUSH: 0.45,
    // - 0.20 = weak push, crowd blocks you
    // - 0.45 = medium (current), balanced
    // - 0.70 = strong push, easy to bulldoze
    // ✓ Affects: feel of mass vs player weight
    
    // Spawn speed for new crowd members
    SPAWN_INTERVAL_BASE: 5.0,     // Initial spawn time (seconds)
    SPAWN_INTERVAL_ACCELERATION: 0.96,  // Multiplier each spawn (decrease time)
    // - 0.96 = accelerates slowly, ramping difficulty
    // - 0.92 = faster ramp, more intense
    // ✓ Affects: difficulty curve over time
    
    // MAGNETIC ATTRACTION (New mechanic: crowd magnetism when player stands still/moves back)
    // MAGNETIC ATTRACTION: Stagnation Gravity — crowd magnetizes when player is idle/backward
    MAGNETIC_THRESHOLD_SPEED: 0.3,  // Speed below which magnetic attraction activates
    // - 0.2  = very sensitive, easily triggered when barely moving
    // - 0.5  = medium (current), triggered when nearly standing
    // - 1.0  = less sensitive, requires complete stop
    
    MAGNETIC_RADIUS: 7.0,  // Detection radius — only magnetize crowd within this range
    // - 3.0  = very tight, only closest crowd
    // - 5.0  = medium (current), balanced + faster detection
    // - 8.0  = loose, many crowd attracted (expensive)
    
    MAGNETIC_COMFORT_RADIUS: 2.1,  // Ring comfort zone — crowd maintains this distance
    // - 1.2  = very tight ring, overlapping
    // - 1.8  = medium (current), comfortable spacing
    // - 2.5  = loose ring, distant circles
    
    MAGNETIC_ATTRACTION_STRENGTH: 0.28,  // Base steering force magnitude
    // - 0.10 = weak, drifts slowly (more escape room)
    // - 0.20 = medium (current), noticeable convergence
    // - 0.40 = strong, aggressive pull (claustrophobic)
    
    MAGNETIC_MAX_CROWD_ATTRACTED: 35,  // Only pull closest N crowd members
    // - 30   = few members, very light attraction (cheap)
    // - 60   = medium (current), balanced density + performance
    // - 150+ = many members, heavy pressure (expensive, causes freezes)
    
    // 360° ENCIRCLEMENT DETECTION: Sector Bitmasking (optimized)
    ENCIRCLE_SECTOR_COUNT: 8,  // Divide 360° into N sectors (8 = 45° each)
    
    ENCIRCLE_DETECTION_RADIUS: 2.5,  // How far from player to check for surrounding
    // - 1.5  = very tight ring
    // - 2.5  = medium (current), matches comfort radius roughly
    // - 4.0  = loose, easy to trigger
    
    ENCIRCLE_SECTOR_THRESHOLD: 6,  // How many sectors must have crowd (out of 8)
    // - 5 = 62.5% threshold, easier to encircle
    // - 6 = 75% threshold (current), player can escape with gaps
    // - 7 = 87.5% threshold, almost perfect ring
    
    ENCIRCLE_TIMEOUT: 5.0,  // Seconds player can be encircled before game over
    // - 2.0  = quick death, very punishing
    // - 5.0  = medium (current), gives chance to break ring
    // - 10.0 = generous, lots of time to escape
};

// ─────────────────────────────────────────────────────────────────────────────
// 🌫️  FOG MECHANICS (Forgetfulness / Psychological Weight)
// ─────────────────────────────────────────────────────────────────────────────
// Fog represents the terror of faceless crowds and forgotten faces

export const FOG = {
    // Base fog density (will be modulated dynamically)
    BASE_DENSITY: 0.42,
    // - 0.015 = very light, almost invisible
    // - 0.032 = medium (current), atmospheric
    // - 0.050 = thick, hard to see
    // ✓ Affects: visual mystery, readability
    
    // Min/Max fog density based on player speed
    MIN_DENSITY: 0.025,   // When running fast (speed > 7.6)
    MAX_DENSITY: 0.045,   // When standing still (speed ≈ 0)
    // Higher MAX = more oppressive when still
    // ✓ Affects: sensation of being trapped by crowd
    
    // Fog density interpolation smoothness
    DENSITY_LERP_SPEED: 0.08,
    // - 0.02 = very sluggish, takes seconds to change
    // - 0.08 = current, responsive but smooth
    // - 0.25 = instant, jarring changes
    // ✓ Affects: smoothness of fog transitions
    
    // Fog color (should match background)
    // Uses PAL.fog (0x05050c)
};

// ─────────────────────────────────────────────────────────────────────────────
// 🎯 ENEMY MECHANICS (White Crowd / Boss Waves)
// ─────────────────────────────────────────────────────────────────────────────

export const ENEMIES = {
    MAX_ACTIVE: 180,
    // - 80  = sparse waves
    // - 180 = dense (current), feels packed
    // - 300 = overwhelming
    // ✓ Affects: visual density of enemy waves, difficulty spikes
    
    BASE_SPEED: 3.5,
    // - 2.5 = slow, easy to dodge
    // - 3.5 = medium (current), matches player speed parity
    // - 5.0+ = faster than player, must use dash
    // ✓ Affects: evasion difficulty
    
    // Enemy wave density (how packed a single wave is)
    WAVE_DENSITY_FACTOR: 40,   // Number of enemies scales with wave size
    // ✓ Affects: visual impression of wave magnitude
};

// ─────────────────────────────────────────────────────────────────────────────
// 💚 HELPER MECHANICS (Power-ups)
// ─────────────────────────────────────────────────────────────────────────────

export const HELPERS = {
    MAX_ACTIVE: 10,
    // - 5  = rare help
    // - 10 = medium (current), occasional salvation
    // - 20 = frequent help, game feels easy
    // ✓ Affects: difficulty curve, power-up frequency
    
    SPAWN_CHANCE_WITH_ENEMY: 0.35,
    // - 0.0  = never spawn
    // - 0.35 = current, roughly 35% of enemy waves have helpers
    // - 1.0  = always spawn
    // ✓ Affects: life expectancy, difficulty balance
    
    // Spawn distance from player
    SPAWN_OFFSET_MIN: 6.0,    // Minimum distance
    SPAWN_OFFSET_MAX: 10.0,   // Maximum distance
    // ✓ Affects: where helpers appear (should be "ahead" and visible)
};

// ─────────────────────────────────────────────────────────────────────────────
// 🔴 BLOCKER MECHANICS (Immovable Obstacles)
// ─────────────────────────────────────────────────────────────────────────────

export const BLOCKERS = {
    MAX_ACTIVE: 20,
    // ✓ Affects: obstacle density on level
    
    SPAWN_CHANCE: 0.25,   // 25% chance of blocker pair spawning
    // ✓ Affects: obstacle frequency
};

// ─────────────────────────────────────────────────────────────────────────────
// 🟤 SLOWER MECHANICS (Sticky Zones)
// ─────────────────────────────────────────────────────────────────────────────

export const SLOWERS = {
    MAX_ACTIVE: 20,
    // ✓ Affects: number of active slow zones
    
    SPAWN_CHANCE: 0.25,   // 25% chance of slower group
    GROUP_SIZE_RANGE: [1, 4],  // Group has 1-4 slowers
    // ✓ Affects: obstacle frequency and density
    
    SLOW_FACTOR: 0.35,    // Multiply speed by this when in slow zone
    // - 0.2  = almost frozen
    // - 0.35 = current, very sluggish
    // - 0.65 = mild slowdown
    // ✓ Affects: how much slowers impede progress
};

// ─────────────────────────────────────────────────────────────────────────────
// 💡 LIGHTING & MATERIALS
// ─────────────────────────────────────────────────────────────────────────────

export const LIGHTING = {
    // Player's local warm light
    PLAYER_LIGHT_INTENSITY: 1.2,
    // - 0.5 = weak glow, barely illuminates
    // - 1.0 = medium (current), visible on crowd
    // - 2.0 = bright, washes out shadows
    // ✓ Affects: how much player lights up surroundings
    
    PLAYER_LIGHT_DISTANCE: 15,
    // - 6  = only immediate area lit
    // - 12 = current, reaches 3-4 characters away
    // - 20 = lights up half the screen
    // ✓ Affects: visual presence, immersion
    
    // Shadow mapping
    SHADOW_MAP_SIZE: 2048,  // Resolution of shadow texture
    SHADOW_BLUR_RADIUS: 5,  // Softness of shadow edges
    // ✓ Affects: shadow quality, visual fidelity
    
    // Ambient light (fills shadows with base color)
    AMBIENT_INTENSITY: 1.0,
    // - 0.5 = very dark shadows
    // - 1.0 = current, balanced
    // - 2.0 = bright, no shadows
    
    // Directional light (sun)
    SUN_INTENSITY: 1.4,
    // ✓ Affects: overall brightness
};

// ─────────────────────────────────────────────────────────────────────────────
// 📊 WORLD PARAMETERS
// ─────────────────────────────────────────────────────────────────────────────

export const WORLD = {
    WIDTH: 400,            // Map width for spawning
    FRUSTUM_HEIGHT: 14,    // Orthographic camera view height (isometric)
    // ✓ Affects: zoom level, visible area
};

// ─────────────────────────────────────────────────────────────────────────────
// 🎮 COMBO SYSTEM
// ─────────────────────────────────────────────────────────────────────────────

export const COMBO_SEQ = ['x', 'x', 'y'];  // X X Y sequence for helper activation
// ✓ Affects: how player activates power-ups

// ─────────────────────────────────────────────────────────────────────────────
// 📋 Backward-compatible exports (used by rest of codebase)
// ─────────────────────────────────────────────────────────────────────────────

// Legacy exports (keep for backward compatibility with existing code)
export const CROWD_N = CROWD.N;
export const ACTIVE_R = CROWD.ACTIVE_RADIUS;
export const FH = WORLD.FRUSTUM_HEIGHT;
export const WORLD_WIDTH = WORLD.WIDTH;
export const MAX_ENEMIES = ENEMIES.MAX_ACTIVE;
export const MAX_HELPERS = HELPERS.MAX_ACTIVE;
export const MAX_BLOCKERS = BLOCKERS.MAX_ACTIVE;
export const MAX_SLOWERS = SLOWERS.MAX_ACTIVE;
