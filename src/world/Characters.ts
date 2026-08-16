import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { ToonMaterial } from '../utils/ToonMaterial';
import { PLAYER, NPC, MATERIAL, ACCENT } from '../utils/palette';

/**
 * Loads the courier and the villagers, and hands out animatable instances.
 *
 * Each figure is exported from Blender as a root object carrying the torso,
 * with HEAD / ARM_L / ARM_R / LEG_L / LEG_R parented under it, pivots already
 * at neck, shoulders and hips. The game rotates those nodes directly, which is
 * why no skinning or animation clips are needed for a walk cycle.
 *
 * As with the building kit, Blender materials are named for palette slots and
 * carry no colour: the tint of every garment is decided here so the wardrobe
 * lives in palette.ts alongside everything else.
 */

const CHARACTERS_URL = 'models/characters.glb';

export interface FigureColours {
  coat: number;
  coatAlt?: number;
  hat?: number;
  apron?: number;
  bag?: number;
  accent?: number;
  skin?: number;
  hair?: number;
}

/** The limbs the game animates. Missing parts are simply not driven. */
export interface RiggedFigure {
  root: THREE.Group;
  head: THREE.Object3D | null;
  armL: THREE.Object3D | null;
  armR: THREE.Object3D | null;
  legL: THREE.Object3D | null;
  legR: THREE.Object3D | null;
}

/**
 * Wardrobes, keyed to the villagers the delivery quests already name.
 *
 * Present-day clothes, deliberately: the village is old, the people in it are
 * not. Denim on everyone below the waist, and the courier — a teenager — is
 * the only saturated top on screen, so your eye always finds them.
 */
export const WARDROBE: Record<string, FigureColours> = {
  Courier: {
    coat: PLAYER.shirt,
    coatAlt: PLAYER.shorts,
    bag: PLAYER.bag,
    hair: PLAYER.hair,
    skin: PLAYER.skin,
    accent: PLAYER.sock
  },
  Villager_Postmaster: {
    coat: 0x27476b, coatAlt: 0x5c5348, hat: 0x1f3350, bag: 0x6b6155
  },
  Villager_Baker: {
    coat: 0xe6e2d8, coatAlt: 0x46536b, apron: 0xf2ead6
  },
  Villager_Shepherd: {
    coat: 0x5c6b4a, coatAlt: 0x3f5878, hat: 0x8a6a4e, bag: MATERIAL.woodDark
  },
  Villager_Fisher: {
    coat: 0xd6a83f, coatAlt: 0x44515e, hat: 0x7f8a76, bag: MATERIAL.woodDark
  },
  Villager_Artist: {
    coat: 0x8d7fa8, coatAlt: 0x3f5878, hat: 0xb5654a, bag: 0xa89a80
  },
  Villager_Keeper: {
    coat: 0x8c9490, coatAlt: 0x4b4a46
  }
};

export class Characters {
  private templates: Map<string, THREE.Object3D> = new Map();
  private materialCache: Map<string, THREE.Material> = new Map();
  private loaded = false;

  public async load(): Promise<void> {
    const loader = new GLTFLoader();
    const gltf = await loader.loadAsync(CHARACTERS_URL);

    for (const child of [...gltf.scene.children]) {
      if (!child.name || child.name.includes('.')) continue;
      child.position.set(0, 0, 0);
      child.rotation.set(0, 0, 0);
      child.updateMatrixWorld(true);
      this.templates.set(child.name, child);
    }

    this.loaded = true;
  }

  public get isLoaded(): boolean {
    return this.loaded;
  }

  public get figureNames(): string[] {
    return [...this.templates.keys()];
  }

  public has(name: string): boolean {
    return this.templates.has(name);
  }

  private materialFor(slot: string, colours: FigureColours): THREE.Material {
    const colour = ((): number => {
      switch (slot) {
        case 'SKIN': return colours.skin ?? PLAYER.skin;
        case 'HAIR': return colours.hair ?? PLAYER.hair;
        case 'COAT': return colours.coat;
        case 'COAT_ALT': return colours.coatAlt ?? PLAYER.shorts;
        case 'APRON': return colours.apron ?? NPC.apron;
        case 'BOOT': return PLAYER.shoe;
        case 'SOLE': return 0xefe9dd;
        case 'BAG': return colours.bag ?? PLAYER.bag;
        case 'HAT': return colours.hat ?? colours.coat;
        case 'ACCENT': return colours.accent ?? ACCENT.ember;
        default: return colours.coat;
      }
    })();

    const key = `${slot}|${colour}`;
    let material = this.materialCache.get(key);
    if (!material) {
      material = ToonMaterial.create({ color: colour });
      this.materialCache.set(key, material);
    }
    return material;
  }

  /**
   * Deep-clone a template, swapping in toon materials as we go.
   *
   * Geometry is shared with the template; only the node graph is new, so an
   * instance costs a handful of objects rather than a copy of the mesh data.
   */
  private cloneNode(source: THREE.Object3D, colours: FigureColours): THREE.Object3D {
    let node: THREE.Object3D;

    const mesh = source as THREE.Mesh;
    if (mesh.isMesh) {
      const slot = (mesh.material as THREE.Material).name;
      const clone = new THREE.Mesh(mesh.geometry, this.materialFor(slot, colours));
      clone.castShadow = true;
      clone.receiveShadow = true;
      node = clone;
    } else {
      node = new THREE.Group();
    }

    node.name = source.name;
    node.position.copy(source.position);
    node.quaternion.copy(source.quaternion);
    node.scale.copy(source.scale);

    for (const child of source.children) {
      node.add(this.cloneNode(child, colours));
    }
    return node;
  }

  /**
   * An instance of a figure, with its animatable limbs looked up by name.
   *
   * The suffix match is deliberately loose: the glTF exporter splits objects
   * into one mesh per material and appends indices, so a limb can arrive as
   * either "Courier.ARM_L" or a group containing "Courier.ARM_L_1".
   */
  public instance(name: string, overrides?: Partial<FigureColours>): RiggedFigure | null {
    const template = this.templates.get(name);
    if (!template) return null;

    const colours = { ...(WARDROBE[name] ?? WARDROBE.Courier), ...overrides };
    const clone = this.cloneNode(template, colours);

    const root = new THREE.Group();
    root.add(clone);

    const find = (suffix: string): THREE.Object3D | null => {
      let found: THREE.Object3D | null = null;
      root.traverse((obj) => {
        if (found) return;
        if (obj.name.endsWith(suffix) || obj.name.includes(`${suffix}_`)) found = obj;
      });
      return found;
    };

    return {
      root,
      head: find('HEAD'),
      armL: find('ARM_L'),
      armR: find('ARM_R'),
      legL: find('LEG_L'),
      legR: find('LEG_R')
    };
  }
}
