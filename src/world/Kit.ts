import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { ToonMaterial } from '../utils/ToonMaterial';
import { BUILDING, MATERIAL, ACCENT } from '../utils/palette';

/**
 * Loads the Blender building kit and hands out instances.
 *
 * Materials arrive from Blender named for palette slots (WALL, ROOF, TRIM...)
 * rather than carrying colours. Every one is swapped here for a cached
 * ToonMaterial, so the grade lives in palette.ts and re-colouring the town
 * never means reopening Blender or re-exporting.
 *
 * The glTF exporter splits each object into one mesh per material, so a piece
 * arrives as a Group of single-material meshes rather than one multi-material
 * mesh. Instances clone that group and share both geometry and materials.
 */

const KIT_URL = 'models/kit.glb';

/** Blender material slot -> palette colour. */
const SLOT_COLOURS: Record<string, number> = {
  WALL: BUILDING.walls[0],
  WALL_ALT: BUILDING.walls[2],
  ROOF: BUILDING.roofs[0],
  TRIM: BUILDING.trim,
  WOOD: BUILDING.door,
  METAL: MATERIAL.metal,
  GLASS: BUILDING.window,
  ACCENT: ACCENT.ember
};

export type KitPiece = 'House_TallA' | 'House_MidB' | 'House_NarrowC' | 'Stair_Straight';

export class Kit {
  private templates: Map<string, THREE.Group> = new Map();
  private materialCache: Map<string, THREE.Material> = new Map();
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

  /**
   * Toon material for a Blender slot. Walls and roofs cycle through the
   * palette's variants per instance so a street isn't uniform; trim and
   * fittings stay fixed so it still reads as one place.
   */
  private materialFor(slotName: string, variant: number): THREE.Material {
    let colour: number;

    if (slotName === 'WALL' || slotName === 'WALL_ALT') {
      colour = BUILDING.walls[variant % BUILDING.walls.length];
    } else if (slotName === 'ROOF') {
      colour = BUILDING.roofs[variant % BUILDING.roofs.length];
    } else {
      colour = SLOT_COLOURS[slotName] ?? BUILDING.walls[0];
    }

    const key = `${slotName}|${colour}`;
    let material = this.materialCache.get(key);
    if (!material) {
      material = ToonMaterial.create({ color: colour });
      this.materialCache.set(key, material);
    }
    return material;
  }

  /**
   * An instance of a kit piece, sharing geometry and cached materials with
   * every other instance of the same variant.
   */
  public instance(name: KitPiece | string, variant: number = 0): THREE.Object3D | null {
    const template = this.templates.get(name);
    if (!template) return null;

    const group = new THREE.Group();

    template.traverse((obj) => {
      const source = obj as THREE.Mesh;
      if (!source.isMesh) return;

      const slotName = (source.material as THREE.Material).name;
      const mesh = new THREE.Mesh(source.geometry, this.materialFor(slotName, variant));
      mesh.position.copy(source.position);
      mesh.quaternion.copy(source.quaternion);
      mesh.scale.copy(source.scale);
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      group.add(mesh);
    });

    return group;
  }
}
