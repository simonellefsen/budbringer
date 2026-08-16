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
  private static waterTime = { value: 0 };

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

  public static tickWater(elapsed: number): void {
    this.waterTime.value = elapsed;
  }

  /**
   * A slow drift on the painted water tile, plus a soft travelling glint.
   *
   * Vertex ripples would chew the ink lines; sliding the gouache and mixing
   * a second, offset sample is enough to stop the river reading as a decal.
   */
  public static shimmerWater(material: THREE.MeshToonMaterial): void {
    if (!material.map) return;
    const time = this.waterTime;
    material.onBeforeCompile = (shader) => {
      shader.uniforms.uWaterTime = time;
      shader.fragmentShader = shader.fragmentShader
        .replace(
          '#include <common>',
          '#include <common>\nuniform float uWaterTime;'
        )
        .replace(
          '#include <map_fragment>',
          `
#ifdef USE_MAP
	vec2 flow = vec2(uWaterTime * 0.016, uWaterTime * -0.011);
	vec4 strokeA = texture2D(map, vMapUv + flow);
	vec4 strokeB = texture2D(map, vMapUv * 1.12 + vec2(-flow.y, flow.x) + 0.33);
	float mixW = 0.5 + 0.5 * sin(uWaterTime * 0.27 + vMapUv.x * 3.4);
	vec4 sampledDiffuseColor = mix(strokeA, strokeB, mixW * 0.28);
	float glint = smoothstep(0.78, 0.97,
		sin(vMapUv.x * 6.5 + uWaterTime * 0.42) * sin(vMapUv.y * 3.2 - uWaterTime * 0.25));
	sampledDiffuseColor.rgb += vec3(0.06, 0.08, 0.075) * glint;
	diffuseColor *= sampledDiffuseColor;
#endif
`
        );
    };
    material.customProgramCacheKey = () => 'water-shimmer-v1';
    material.needsUpdate = true;
  }
}
