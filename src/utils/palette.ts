/**
 * The single source of truth for colour in the game.
 *
 * The village is French: Gerberoy's brick and roses, Lacoste's golden limestone
 * alleys, Colmar's painted half-timber along the water, Estaing's grey stone
 * stacked above a river. That means warm ochre and cream walls under terracotta
 * and slate, dark timber framing, and painted shutters as the saturated notes —
 * not the cool greys and teals of the earlier Japanese-alley direction.
 *
 * Rules of thumb when adding to this file:
 *   - Nothing is pure black or pure white. Ink is #2a2118, lime render #f4ecd8.
 *   - Wall neutrals carry a warm (yellow-red) bias; stone carries a grey-green one.
 *   - Saturated colour belongs on joinery — shutters, doors, signs — and on the
 *     handful of painted Colmar facades. Never on a whole street.
 */

/** Atmosphere. Mint painted sky — the fog colour must stay in the same family. */
export const SKY = {
  horizon: 0xb7ddd6,
  zenith: 0x6eaea8,
  fog: 0xa8d4ce,
  cloud: 0xdceee8,
  cloudShade: 0xb4d0cc
} as const;

/** Light. Warm afternoon key, cool sky fill — the fill is what tints shadows. */
export const LIGHT = {
  sun: 0xfff0d8,
  skyFill: 0x9dc0e0,
  groundBounce: 0xcbb994,
  ambient: 0xd8dfe4
} as const;

/** Terrain. Pasture green, river gravel, cobbled square, churchyard grass. */
export const GROUND = {
  base: 0x7d9a62,
  town: 0x86a068,
  seaside: 0xc4b48c,
  hillside: 0x6b8f4e,
  shrine: 0x7d9a5c,
  water: 0x5e9aa3,
  waterDeep: 0x4a7d88
} as const;

/**
 * Buildings.
 *
 * `walls` are the everyday village renders: limestone, lime plaster, warm
 * cream. `painted` is the Colmar note — used on a minority of houses only.
 */
export const BUILDING = {
  walls: [
    0xe9d9b2, // Lacoste golden limestone
    0xf0e6cf, // pale lime render
    0xdcc9a0, // weathered ochre
    0xe8d3b8, // Gerberoy peach plaster
    0xd6c4a2,
    0xf2ead6
  ] as number[],
  painted: [
    0xcf7a63, // Colmar terracotta red
    0xe0b455, // mustard yellow
    0x8fa8bf, // powder blue
    0xdca0a4, // dusty rose
    0xa8bd96  // sage green
  ] as number[],
  roofs: [
    0xa85f45, // terracotta pantile
    0xb56b4d,
    0x96543d,
    0x6b7280, // slate
    0x5d6672
  ] as number[],
  timber: 0x5f4433,     // half-timber framing
  timberDark: 0x4a3527,
  door: 0x5a6f4e,
  doorAlt: 0x4a6580,
  window: 0xbcd2dc,
  shutters: [0x7a9b7e, 0x6b8caa, 0xa85a42, 0x8a7f9b] as number[],
  windowFrame: 0xf2ead6,
  trim: 0xeae0c8,
  sill: 0xd0c4a8,
  chimney: 0xa8705a
} as const;

/** Streets. Cobble and gravel, never asphalt. */
export const ROAD = {
  asphalt: 0x9c917c,  // cobbled lane (name kept: many call sites)
  cobble: 0x94897a,
  gravel: 0xb5a98e,
  line: 0xc4bba4,
  kerb: 0xa89d88
} as const;

/** Natural and structural materials. */
export const MATERIAL = {
  wood: 0x9a7a52,
  woodDark: 0x6b5136,
  woodPale: 0xc0a478,
  stone: 0xb0a894,        // dressed limestone
  stoneDark: 0x8d8676,    // church and bridge masonry
  stoneCool: 0x9aa096,    // Estaing grey
  concrete: 0xbdb49c,
  metal: 0x8c9490,
  metalDark: 0x4f5a56,
  foliage: 0x4f7d40,
  foliageDeep: 0x3d6634,
  foliageLight: 0x6b9552,
  trunk: 0x6d5540,
  ivy: 0x44702f,
  hedge: 0x4a6b35
} as const;

/** Rationed saturation: flowers, signage, awnings, the odd painted shutter. */
export const ACCENT = {
  ember: 0xc4603a,
  emberDeep: 0xa04728,
  teal: 0x5b8a94,
  lemon: 0xdcb551,
  rose: 0xd4788a,      // climbing roses, Gerberoy
  geranium: 0xc4485a,  // window-box red
  lavender: 0x8f8ab8,
  lamp: 0xffe3ae
} as const;

/** The courier — yellow tee, dark shorts, grey sling, messy bob. */
export const PLAYER = {
  skin: 0xf0d0b0,
  hair: 0x2a241c,
  shirt: 0xf0c44a,
  shorts: 0x2c3036,
  shoe: 0x3a322c,
  sock: 0xf4ecd8,
  bag: 0x7a7368,
  bagStrap: 0x6a6358
} as const;

/** Villagers. Muted, so the courier stays the brightest thing on screen. */
export const NPC = {
  maple: 0x5c7f9c,
  finn: 0xc49a5e,
  hazel: 0x8f7f9e,
  kai: 0xb0654c,
  brie: 0xeae0c8,
  skin: 0xf0d3ae,
  apron: 0xf2ead6,
  eye: 0x33291f
} as const;

/** Ink, used by the outline pass. Warm near-black, not neutral. */
export const INK = 0x2a2118;

/** Pick a random entry from any of the list constants above. */
export function pick<T>(list: readonly T[]): T {
  return list[Math.floor(Math.random() * list.length)];
}
