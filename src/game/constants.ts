// ------------------------------------------------------------
// Global tuning constants for DEEP DIVE
// All gameplay happens in a "logical" coordinate space that is
// LW units wide; the canvas scales this to the real pixel size.
// ------------------------------------------------------------

export const LW = 420; // logical width
export const PLAYER_SCREEN_Y = 0.70; // player's vertical position (fraction of height)
export const PLAYER_HIT_RADIUS = 15;
export const PLAYER_COLLECT_RADIUS = 30;

export const BOOST_DURATION = 3.0; // seconds - exact
export const BOOST_COOLDOWN = 4.0; // seconds before boost is available again
export const BOOST_SPEED_MULT = 2.1;

export const DEPTH_PER_UNIT = 1 / 12; // meters per logical unit travelled

export const SCORE = {
  bubble: 1,
  coin: 5,
  fish: 10,
  pearl: 25,
  smash: 3,
};

export const SAVE_KEYS = {
  best: "deepdive.best",
  music: "deepdive.music",
  sound: "deepdive.sound",
  tutorial: "deepdive.tutorialDone",
};

/** Base forward speed (logical units / s) as a function of depth (meters). */
export function baseSpeedForDepth(depth: number): number {
  // Starts gentle (150), asymptotically approaches 400.
  return 150 + 250 * (1 - Math.exp(-depth / 2600));
}

/** 0..1 difficulty factor derived from depth. Smooth, no walls. */
export function difficultyForDepth(depth: number): number {
  return 1 - Math.exp(-depth / 3200);
}
