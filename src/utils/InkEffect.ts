import * as THREE from 'three';
import { Effect, EffectAttribute } from 'postprocessing';
import { INK } from './palette';

/**
 * Screen-space ink outlines.
 *
 * The previous approach duplicated each mesh, flipped it to back-faces and
 * pushed its vertices along their normals. On boxes and extrusions the normals
 * are split per face, so that pushes the six faces apart into detached plates
 * instead of growing a shell — and because the thickness was in world units,
 * a line's screen width changed with distance and object size.
 *
 * This does the job the way the reference art does: one pass over the frame,
 * detecting edges in the depth and normal buffers, drawing every line at the
 * same pixel width no matter what it wraps. Cost is fixed per frame rather
 * than growing with scene complexity.
 *
 * Two detectors run together because they catch different things:
 *   - depth discontinuity finds silhouettes, where one surface occludes another
 *   - normal discontinuity finds creases, where two faces meet at the same depth
 *     (a wall meeting a roof, which the depth test alone would miss entirely)
 */

const fragmentShader = /* glsl */`
uniform sampler2D uNormalBuffer;
uniform vec3 uInkColor;
uniform float uThickness;
uniform float uDepthSensitivity;
uniform float uNormalSensitivity;
uniform float uWobbleAmount;
uniform float uWobbleScale;
uniform float uOpacity;
uniform float uMaxDistance;

// Linearise so a fixed threshold means the same thing near and far.
float linearise(const in float d) {
  float z = d * 2.0 - 1.0;
  return (2.0 * cameraNear * cameraFar) /
         (cameraFar + cameraNear - z * (cameraFar - cameraNear));
}

// Cheap value noise, used only to make the sample offset waver a little so
// the lines read as drawn rather than as a filter.
float hash(const in vec2 p) {
  return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453123);
}

float noise(const in vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  float a = hash(i);
  float b = hash(i + vec2(1.0, 0.0));
  float c = hash(i + vec2(0.0, 1.0));
  float d = hash(i + vec2(1.0, 1.0));
  return mix(mix(a, b, f.x), mix(c, d, f.x), f.y);
}

void mainImage(const in vec4 inputColor, const in vec2 uv, const in float depth, out vec4 outputColor) {
  vec2 texel = uThickness / resolution;

  // Nudge the sampling cross by a little noise so the outline wobbles.
  vec2 wobble = vec2(
    noise(uv * uWobbleScale),
    noise(uv * uWobbleScale + 37.0)
  ) - 0.5;
  vec2 off = texel + wobble * uWobbleAmount * texel;

  float dC = linearise(depth);

  // Roberts cross on depth: compare opposite diagonals rather than a full
  // Sobel. Half the taps, and it produces a thinner, more even line.
  float d1 = linearise(texture2D(depthBuffer, uv + vec2( off.x,  off.y)).r);
  float d2 = linearise(texture2D(depthBuffer, uv + vec2(-off.x, -off.y)).r);
  float d3 = linearise(texture2D(depthBuffer, uv + vec2( off.x, -off.y)).r);
  float d4 = linearise(texture2D(depthBuffer, uv + vec2(-off.x,  off.y)).r);

  float depthDiff = sqrt(pow(d1 - d2, 2.0) + pow(d3 - d4, 2.0));
  // Scale the threshold with distance, or every distant surface becomes an edge.
  float depthEdge = step(uDepthSensitivity * dC * 0.06, depthDiff);

  vec3 n1 = texture2D(uNormalBuffer, uv + vec2( off.x,  off.y)).rgb;
  vec3 n2 = texture2D(uNormalBuffer, uv + vec2(-off.x, -off.y)).rgb;
  vec3 n3 = texture2D(uNormalBuffer, uv + vec2( off.x, -off.y)).rgb;
  vec3 n4 = texture2D(uNormalBuffer, uv + vec2(-off.x,  off.y)).rgb;

  vec3 nd1 = n1 - n2;
  vec3 nd2 = n3 - n4;
  float normalDiff = sqrt(dot(nd1, nd1) + dot(nd2, nd2));
  float normalEdge = step(uNormalSensitivity, normalDiff);

  float edge = max(depthEdge, normalEdge);

  // Let lines fade out toward the far plane so the horizon doesn't turn solid.
  float fade = 1.0 - smoothstep(uMaxDistance * 0.55, uMaxDistance, dC);
  edge *= fade * uOpacity;

  outputColor = vec4(mix(inputColor.rgb, uInkColor, edge), inputColor.a);
}
`;

export interface InkEffectOptions {
  normalBuffer: THREE.Texture;
  color?: number;
  /** Line width in pixels. */
  thickness?: number;
  depthSensitivity?: number;
  normalSensitivity?: number;
  wobbleAmount?: number;
  wobbleScale?: number;
  opacity?: number;
  /** View distance past which lines fade out entirely. */
  maxDistance?: number;
}

export class InkEffect extends Effect {
  constructor({
    normalBuffer,
    color = INK,
    thickness = 1.35,
    depthSensitivity = 1.0,
    normalSensitivity = 0.42,
    wobbleAmount = 0.85,
    wobbleScale = 260.0,
    opacity = 0.92,
    maxDistance = 60.0
  }: InkEffectOptions) {
    super('InkEffect', fragmentShader, {
      attributes: EffectAttribute.DEPTH,
      uniforms: new Map<string, THREE.Uniform>([
        ['uNormalBuffer', new THREE.Uniform(normalBuffer)],
        ['uInkColor', new THREE.Uniform(new THREE.Color(color))],
        ['uThickness', new THREE.Uniform(thickness)],
        ['uDepthSensitivity', new THREE.Uniform(depthSensitivity)],
        ['uNormalSensitivity', new THREE.Uniform(normalSensitivity)],
        ['uWobbleAmount', new THREE.Uniform(wobbleAmount)],
        ['uWobbleScale', new THREE.Uniform(wobbleScale)],
        ['uOpacity', new THREE.Uniform(opacity)],
        ['uMaxDistance', new THREE.Uniform(maxDistance)]
      ])
    });
  }

  private setNumber(name: string, value: number): void {
    const uniform = this.uniforms.get(name);
    if (uniform) uniform.value = value;
  }

  public set thickness(v: number) { this.setNumber('uThickness', v); }
  public set depthSensitivity(v: number) { this.setNumber('uDepthSensitivity', v); }
  public set normalSensitivity(v: number) { this.setNumber('uNormalSensitivity', v); }
  public set wobbleAmount(v: number) { this.setNumber('uWobbleAmount', v); }
  public set opacity(v: number) { this.setNumber('uOpacity', v); }
  public set maxDistance(v: number) { this.setNumber('uMaxDistance', v); }
}
