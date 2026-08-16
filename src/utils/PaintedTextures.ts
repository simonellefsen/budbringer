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
  grassB: 'textures/grass_b.png',
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

  /**
   * Break the obvious 2×2 of a single grass tile.
   *
   * Two independently seamless paintings are blended per world-space patch,
   * and the second sample is rotated so even a missing variant still helps.
   * They cannot share an atlas: two seamless tiles do not share edges, so a
   * sheet of them would show a grid.
   */
  public static varyGround(material: THREE.MeshToonMaterial): void {
    const mapB = this.get('grassB') ?? material.map ?? null;
    material.onBeforeCompile = (shader) => {
      shader.uniforms.mapB = { value: mapB };
      shader.vertexShader = shader.vertexShader
        .replace(
          '#include <common>',
          '#include <common>\nvarying vec3 vWorldPos;'
        )
        .replace(
          '#include <project_vertex>',
          'vWorldPos = (modelMatrix * vec4(transformed, 1.0)).xyz;\n#include <project_vertex>'
        );
      shader.fragmentShader = shader.fragmentShader
        .replace(
          '#include <common>',
          '#include <common>\nvarying vec3 vWorldPos;\nuniform sampler2D mapB;'
        )
        .replace(
          '#include <map_fragment>',
          `
#ifdef USE_MAP
	vec2 uvA = vMapUv;
	vec2 uvB = vec2(-vMapUv.y, vMapUv.x) + vec2(0.29, 0.41);
	vec4 texA = texture2D(map, uvA);
	vec4 texB = texture2D(mapB, uvB);
	float h = fract(sin(dot(floor(vWorldPos * 0.17), vec3(12.9898, 78.233, 45.164))) * 43758.5453);
	float m = smoothstep(0.3, 0.7, h);
	vec4 sampledDiffuseColor = mix(texA, texB, m);
	diffuseColor *= sampledDiffuseColor;
#endif
`
        );
    };
    material.customProgramCacheKey = () => 'grass-vary-v1';
    material.needsUpdate = true;
  }
}
