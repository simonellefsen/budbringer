import * as THREE from 'three';

/**
 * Hand-painted gouache tiles (Krita-processed) used as albedo maps.
 *
 * Materials stay palette-driven: these maps are high-key modulation so they
 * add brush and paper without replacing the colour decided in palette.ts.
 */

const URLS = {
  plaster: 'textures/plaster.png',
  grass: 'textures/grass.png',
  rock: 'textures/rock.png',
  water: 'textures/water.png',
  foliage: 'textures/foliage.png',
  paper: 'textures/paper.png'
} as const;

export type PaintedSlot = keyof typeof URLS;

export class PaintedTextures {
  private static maps = new Map<string, THREE.Texture>();
  private static loaded = false;

  public static async load(): Promise<void> {
    if (this.loaded) return;

    const loader = new THREE.TextureLoader();
    const entries = Object.entries(URLS) as [PaintedSlot, string][];

    await Promise.all(entries.map(async ([name, url]) => {
      try {
        const texture = await loader.loadAsync(url);
        texture.colorSpace = THREE.SRGBColorSpace;
        texture.wrapS = THREE.RepeatWrapping;
        texture.wrapT = THREE.RepeatWrapping;
        texture.anisotropy = 4;
        texture.needsUpdate = true;
        this.maps.set(name, texture);
      } catch (err) {
        console.warn(`Painted texture missing: ${url}`, err);
      }
    }));

    this.loaded = true;
  }

  public static get(name: PaintedSlot, repeat = 1): THREE.Texture | undefined {
    const src = this.maps.get(name);
    if (!src) return undefined;
    if (repeat === 1 && src.repeat.x === 1) return src;

    const clone = src.clone();
    clone.wrapS = THREE.RepeatWrapping;
    clone.wrapT = THREE.RepeatWrapping;
    clone.repeat.set(repeat, repeat);
    clone.needsUpdate = true;
    return clone;
  }

  public static get isLoaded(): boolean {
    return this.loaded && this.maps.size > 0;
  }
}
