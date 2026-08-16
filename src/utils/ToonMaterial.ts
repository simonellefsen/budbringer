import * as THREE from 'three';

/**
 * Toon materials for the whole game.
 *
 * This used to be a raw ShaderMaterial that computed its own three-band ramp
 * from a hand-set light direction. It never sampled a shadow map, never read a
 * light and never applied fog, so every light in the scene was inert and the
 * 2048^2 shadow map was rendered into the void — the reason the world read as
 * unlit cardboard.
 *
 * It is now MeshToonMaterial, which bands the diffuse term through a gradient
 * map while keeping three's real lighting path: shadow maps, fog, and every
 * light in the scene. Shadows come out tinted because the fill is a
 * HemisphereLight rather than flat white ambient (see Game.setupLighting).
 *
 * Materials are cached by their visual properties. The old code called
 * create() once per mesh and ended up with 3,530 distinct materials to draw
 * 85,120 triangles; identical requests now return the same instance, which is
 * also what makes the renderer able to batch them.
 */

interface ToonMaterialOptions {
  color?: number;
  emissive?: number;
  emissiveIntensity?: number;
  vertexColors?: boolean;
  map?: THREE.Texture | null;
  side?: THREE.Side;
  transparent?: boolean;
  opacity?: number;
  /** Opt out of the cache when the caller intends to mutate the material. */
  unique?: boolean;
}

/** Number of bands in the toon ramp. Two reads closest to the reference art. */
const BANDS = 3;

/**
 * How bright each band is. The floor is deliberately well above zero: unlit
 * faces should stay coloured and let the cool hemisphere fill tint them, not
 * crush to black the way a 0.0 first stop does.
 */
const BAND_STOPS = [0.52, 0.78, 1.0];

export class ToonMaterial {
  private static gradientMap: THREE.DataTexture | null = null;
  private static cache: Map<string, THREE.MeshToonMaterial> = new Map();

  public static init(): void {
    this.buildGradientMap();
  }

  /**
   * A tiny 1-D texture read by MeshToonMaterial to quantise the diffuse term.
   * NearestFilter is what makes the steps hard instead of a smooth ramp.
   */
  private static buildGradientMap(): void {
    if (this.gradientMap) return;

    const data = new Uint8Array(BANDS * 4);
    for (let i = 0; i < BANDS; i++) {
      const v = Math.round(BAND_STOPS[i] * 255);
      data[i * 4 + 0] = v;
      data[i * 4 + 1] = v;
      data[i * 4 + 2] = v;
      data[i * 4 + 3] = 255;
    }

    const texture = new THREE.DataTexture(data, BANDS, 1, THREE.RGBAFormat);
    texture.minFilter = THREE.NearestFilter;
    texture.magFilter = THREE.NearestFilter;
    texture.generateMipmaps = false;
    texture.needsUpdate = true;

    this.gradientMap = texture;
  }

  public static create(options: ToonMaterialOptions = {}): THREE.MeshToonMaterial {
    const {
      color = 0xffffff,
      emissive = 0x000000,
      emissiveIntensity = 0,
      vertexColors = false,
      map = null,
      side = THREE.FrontSide,
      transparent = false,
      opacity = 1.0,
      unique = false
    } = options;

    this.buildGradientMap();

    const key = [
      color, emissive, emissiveIntensity,
      vertexColors ? 1 : 0,
      map ? map.uuid : '-',
      side, transparent ? 1 : 0, opacity
    ].join('|');

    if (!unique) {
      const cached = this.cache.get(key);
      if (cached) return cached;
    }

    const material = new THREE.MeshToonMaterial({
      color,
      emissive,
      emissiveIntensity,
      gradientMap: this.gradientMap,
      vertexColors,
      side,
      transparent,
      opacity,
      depthWrite: !transparent,
      fog: true
    });
    if (map) material.map = map;

    if (!unique) {
      this.cache.set(key, material);
    }

    return material;
  }

  /** How many distinct materials the scene is actually carrying. */
  public static get cacheSize(): number {
    return this.cache.size;
  }

  public static dispose(): void {
    for (const material of this.cache.values()) {
      material.dispose();
    }
    this.cache.clear();
    this.gradientMap?.dispose();
    this.gradientMap = null;
  }
}
