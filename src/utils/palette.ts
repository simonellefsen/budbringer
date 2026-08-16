/**
 * The single source of truth for colour in the game.
 *
 * The old palette was the Flat UI CSS set (0x2ecc71, 0x3498db, 0xe74c3c...) used
 * unmodified at full saturation next to pure-black roofs and roads. The target
 * look works the other way round: chalky, desaturated creams and green-greys
 * carry almost the whole frame, and saturation is rationed to a single warm
 * orange and a single teal, spent only on things that should draw the eye.
 *
 * Rules of thumb when adding to this file:
 *   - Nothing is pure black or pure white. Ink is #1e2624, paper is #f3eee2.
 *   - Neutrals carry a green bias so they sit inside the teal atmosphere.
 *   - If a new colour is saturated, it belongs in ACCENT and needs a reason.
 */

/** Atmosphere. The sky colour is also the fog colour, so they must match. */
export const SKY = {
  horizon: 0x8fd2c9,
  zenith: 0x5fb8ae,
  fog: 0x7ecabf,
  cloud: 0xd8ece6,
  cloudShade: 0xb6d9d1
} as const;

/** Light. Warm key, cool fill — the fill is what tints the shadows. */
export const LIGHT = {
  sun: 0xfff1dc,
  skyFill: 0x9fd3e8,
  groundBounce: 0xd9cfae,
  ambient: 0xcfe0e2
} as const;

/** Terrain, blended across the sphere by biome. */
export const GROUND = {
  base: 0x77856a,
  town: 0x8b9878,
  seaside: 0xcfc3a4,
  hillside: 0x7d9068,
  shrine: 0x76897e,
  water: 0x5b9aa6,
  waterDeep: 0x47808d
} as const;

/** Buildings. Walls are picked at random per house; roofs likewise. */
export const BUILDING = {
  walls: [0xefe9db, 0xe4dccb, 0xd9d0bd, 0xcdc4b0, 0xf3eee2, 0xe8dfc9] as number[],
  roofs: [0x4a4f52, 0x3f4447, 0x57504a, 0x464040, 0x525558] as number[],
  door: 0x8a6f52,
  window: 0xa8ccd0,
  windowFrame: 0x4a4f52,
  trim: 0xdcd4c2,
  ac: 0xdedbd2
} as const;

/** Streets. Asphalt is a light green-grey, not the near-black it was. */
export const ROAD = {
  asphalt: 0x6b6f6a,
  line: 0xece7da,
  kerb: 0xc6c2b4
} as const;

/** Natural materials. */
export const MATERIAL = {
  wood: 0x9a7f60,
  woodDark: 0x6f5a44,
  woodPale: 0xbda684,
  stone: 0xa6a89b,
  stoneDark: 0x8b8d81,
  concrete: 0xb9b8ae,
  metal: 0x9aa3a2,
  metalDark: 0x5c6462,
  foliage: 0x5f8a5f,
  foliageDeep: 0x4c7350,
  trunk: 0x7a6249
} as const;

/** Rationed saturation. Use these sparingly and deliberately. */
export const ACCENT = {
  ember: 0xdd5f2a,
  emberDeep: 0xb8471c,
  teal: 0x4aa79c,
  lemon: 0xe8c15c,
  rose: 0xd88b7a,
  lamp: 0xffe6b0
} as const;

/** The courier. */
export const PLAYER = {
  skin: 0xf0d0b0,
  hair: 0x24282a,
  shirt: 0xe8952f,
  shorts: 0x2f3335,
  shoe: 0x2a2e30,
  sock: 0xf3eee2,
  bag: 0x7d7468,
  bagStrap: 0x6a6259
} as const;

/** Villagers. Muted bodies so the courier's orange stays the brightest thing. */
export const NPC = {
  maple: 0x5b8ba8,
  finn: 0xd8a15a,
  hazel: 0x8f7ba6,
  kai: 0xc2705a,
  brie: 0xe6e0d2,
  skin: 0xf0d3ae,
  apron: 0xefe9db,
  eye: 0x2c3230
} as const;

/** Ink, used by the outline pass and any UI drawn in 3D. */
export const INK = 0x1e2624;

/** Pick a deterministic-ish random entry from one of the array palettes. */
export function pick(list: readonly number[]): number {
  return list[Math.floor(Math.random() * list.length)];
}
