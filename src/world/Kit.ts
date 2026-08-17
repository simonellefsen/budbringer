import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { ToonMaterial } from '../utils/ToonMaterial';
import { PaintedTextures, PaintedSlot } from '../utils/PaintedTextures';
import { BUILDING, MATERIAL, ACCENT, GROUND, INK, pick } from '../utils/palette';

/**
 * Loads the Blender village kit and hands out instances.
 *
 * Materials arrive from Blender named for palette slots (WALL, ROOF, TIMBER...)
 * rather than carrying colours. Every one is swapped here for a cached
 * ToonMaterial, so the grade lives in palette.ts and re-colouring the village
 * never means reopening Blender or re-exporting.
 *
 * The glTF exporter splits each object into one mesh per material, so a piece
 * arrives as a Group of single-material meshes. Instances clone that group and
 * share both geometry and materials.
 */

const KIT_URL = 'models/kit.glb';

export type KitPiece =
  | 'House_TallA' | 'House_MidB' | 'House_NarrowC'
  | 'House_TimberD' | 'House_TimberE'
  | 'Shop_A' | 'Shop_B'
  | 'Church' | 'Bridge_Stone' | 'Fountain' | 'Well'
  | 'Tree_Plane' | 'Tree_Forest' | 'Tree_Orchard'
  | 'Wall_Low' | 'Barn' | 'Sheep' | 'Goat' | 'Fence'
  | 'Waterfall' | 'Cliff_Rock'
  | 'Windmill' | 'Windmill_Sails'
  | 'Bench' | 'Calvary';

/** House pieces suitable for ordinary street frontage. */
export const HOUSE_PIECES: KitPiece[] = [
  'House_TallA', 'House_MidB', 'House_NarrowC', 'House_TimberD', 'House_TimberE'
];

/** Shop pieces, which carry a sign board. */
export const SHOP_PIECES: KitPiece[] = ['Shop_A', 'Shop_B'];

/**
 * The village's trades, in French. Dialogue stays in English — only the
 * painted signage is French, the way it would be in Gerberoy or Colmar.
 */
export const SHOP_SIGNS = [
  'La Poste',
  'Épicerie',
  'Poissonnerie',
  'Boucherie',
  'Café de la Place',
  'Boulangerie',
  'Fromagerie',
  'Pâtisserie',
  'Mairie',
  'Le Cheval Blanc'
];

/** Blender material slot -> palette colour, for slots that don't vary. */
const SLOT_COLOURS: Record<string, number> = {
  ROOF: BUILDING.roofs[0],
  TIMBER: BUILDING.timber,
  TRIM: BUILDING.trim,
  WOOD: BUILDING.door,
  STONE: MATERIAL.stone,
  METAL: MATERIAL.metalDark,
  GLASS: BUILDING.window,
  SHUTTER: BUILDING.shutters[0],
  ACCENT: ACCENT.geranium,
  FOLIAGE: 0xdde8c8,
  CROP: 0xe8d9a8,
  BLOOM: ACCENT.lavender,
  WATER: 0xd4ecec,
  SIGN: BUILDING.timberDark
};

/** Which painted tile each slot multiplies with, if the texture loaded. */
const SLOT_MAPS: Partial<Record<string, PaintedSlot>> = {
  WALL: 'plaster',
  WALL_ALT: 'plaster',
  PAINTED: 'plaster',
  TRIM: 'plaster',
  STONE: 'rock',
  FOLIAGE: 'foliage',
  CROP: 'grass',
  WATER: 'water',
  WOOD: 'wood',
  TIMBER: 'wood',
  ROOF: 'roof'
};

export class Kit {
  private templates: Map<string, THREE.Group> = new Map();
  private materialCache: Map<string, THREE.Material> = new Map();
  private signCache: Map<string, THREE.Material> = new Map();
  private loaded = false;

  public async load(): Promise<void> {
    const loader = new GLTFLoader();
    const gltf = await loader.loadAsync(KIT_URL);

    // Top-level children are the pieces; the kit is laid out in a row in
    // Blender for browsability, so each needs recentring on its own origin.
    for (const child of [...gltf.scene.children]) {
      if (!child.name) continue;
      child.position.set(0, 0, 0);
      child.rotation.set(0, 0, 0);
      child.updateMatrixWorld(true);
      this.templates.set(child.name, child as THREE.Group);
    }

    this.loaded = true;
  }

  public get isLoaded(): boolean {
    return this.loaded;
  }

  public get pieceNames(): string[] {
    return [...this.templates.keys()];
  }

  public has(name: string): boolean {
    return this.templates.has(name);
  }

  /**
   * Toon material for a Blender slot. Walls, roofs and shutters cycle through
   * the palette's variants per instance so a street isn't uniform; stone, trim
   * and fittings stay fixed so it still reads as one village.
   */
  private materialFor(slotName: string, variant: number): THREE.Material {
    let colour: number;

    switch (slotName) {
      case 'WALL':
      case 'WALL_ALT':
        colour = BUILDING.walls[variant % BUILDING.walls.length];
        break;
      case 'PAINTED':
        colour = BUILDING.painted[variant % BUILDING.painted.length];
        break;
      case 'ROOF':
        colour = BUILDING.roofs[variant % BUILDING.roofs.length];
        break;
      case 'SHUTTER':
        colour = BUILDING.shutters[variant % BUILDING.shutters.length];
        break;
      case 'WATER':
        colour = GROUND.water;
        break;
      default:
        colour = SLOT_COLOURS[slotName] ?? BUILDING.walls[0];
    }

    const mapName = SLOT_MAPS[slotName];
    const map = mapName ? PaintedTextures.get(mapName) : undefined;
    const key = `${slotName}|${colour}|${map?.uuid ?? '-'}`;
    let material = this.materialCache.get(key);
    if (!material) {
      if (slotName === 'WATER' && map) {
        // Own map so scrolling V does not move the river's tile, and a
        // taller repeat so the sheet has enough streaks to read as a fall.
        const fallMap = map.clone();
        fallMap.wrapS = THREE.RepeatWrapping;
        fallMap.wrapT = THREE.RepeatWrapping;
        fallMap.repeat.set(1.4, 2.6);
        const falling = ToonMaterial.create({ color: colour, map: fallMap, unique: true });
        PaintedTextures.fallWater(falling);
        material = falling;
      } else {
        material = ToonMaterial.create({ color: colour, map });
      }
      this.materialCache.set(key, material);
    }
    return material;
  }

  /**
   * A shop sign, drawn to a canvas and used as the board's texture.
   *
   * Canvas rather than SDF text: troika ships no default font
   * (defaultFontURL is null), so using it would mean bundling and loading a
   * typeface. A canvas uses one already on the machine and needs no fetch,
   * which also keeps the sign working offline.
   */
  private signMaterial(text: string): THREE.Material {
    const cached = this.signCache.get(text);
    if (cached) return cached;

    const width = 512;
    const height = 128;
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;

    const ctx = canvas.getContext('2d')!;
    ctx.fillStyle = '#' + new THREE.Color(BUILDING.timberDark).getHexString();
    ctx.fillRect(0, 0, width, height);

    // A thin painted border, as on a real hand-lettered board.
    ctx.strokeStyle = '#' + new THREE.Color(ACCENT.lemon).getHexString();
    ctx.lineWidth = 4;
    ctx.strokeRect(9, 9, width - 18, height - 18);

    ctx.fillStyle = '#' + new THREE.Color(0xf4ecd8).getHexString();
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';

    // Shrink to fit rather than clipping: "Café de la Place" is a lot longer
    // than "Mairie" and both have to sit on the same board.
    let size = 58;
    do {
      ctx.font = `600 ${size}px "Georgia", "Times New Roman", serif`;
      if (ctx.measureText(text).width <= width - 56) break;
      size -= 2;
    } while (size > 18);

    ctx.fillText(text, width / 2, height / 2 + 2);

    const texture = new THREE.CanvasTexture(canvas);
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.anisotropy = 4;
    texture.needsUpdate = true;

    const material = new THREE.MeshToonMaterial({ map: texture, fog: true });
    this.signCache.set(text, material);
    return material;
  }

  /**
   * An instance of a kit piece, sharing geometry and cached materials with
   * every other instance of the same variant.
   *
   * `sign` letters the SIGN board, for shop pieces that have one.
   */
  public instance(
    name: KitPiece | string,
    variant: number = 0,
    sign?: string
  ): THREE.Object3D | null {
    const template = this.templates.get(name);
    if (!template) return null;

    const group = new THREE.Group();

    template.traverse((obj) => {
      const source = obj as THREE.Mesh;
      if (!source.isMesh) return;

      const slotName = (source.material as THREE.Material).name;
      const material = (slotName === 'SIGN' && sign)
        ? this.signMaterial(sign)
        : this.materialFor(slotName, variant);

      const mesh = new THREE.Mesh(source.geometry, material);
      mesh.position.copy(source.position);
      mesh.quaternion.copy(source.quaternion);
      mesh.scale.copy(source.scale);
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      group.add(mesh);
    });

    return group;
  }

  /** A house for ordinary frontage. */
  public house(variant: number): THREE.Object3D | null {
    const piece = HOUSE_PIECES[variant % HOUSE_PIECES.length];
    return this.instance(piece, variant);
  }

  /** A shop with a French sign on the board. */
  public shop(variant: number, signText?: string): THREE.Object3D | null {
    const piece = SHOP_PIECES[variant % SHOP_PIECES.length];
    return this.instance(piece, variant, signText ?? pick(SHOP_SIGNS));
  }
}

/** Re-exported so callers can tint fallback geometry to match. */
export const KIT_INK = INK;
