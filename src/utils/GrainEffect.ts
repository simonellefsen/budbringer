import * as THREE from 'three';
import { Effect } from 'postprocessing';

/**
 * Paper grain + a soft vignette, composited over the whole frame.
 *
 * The reference look stops reading as "clean 3D" once a little tooth sits
 * on every pixel. Cheap, and independent of how many meshes are in the scene.
 */

const fragmentShader = /* glsl */`
uniform float uAmount;
uniform float uVignette;

float hash(const in vec2 p) {
  return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453123);
}

void mainImage(const in vec4 inputColor, const in vec2 uv, out vec4 outputColor) {
  float n = hash(gl_FragCoord.xy * 0.73 + uv * 37.0);
  float grain = mix(1.0 - uAmount, 1.0 + uAmount, n);
  float d = length(uv - 0.5);
  float vig = 1.0 - d * d * uVignette;
  outputColor = vec4(inputColor.rgb * grain * vig, inputColor.a);
}
`;

export class GrainEffect extends Effect {
  constructor(amount = 0.05, vignette = 0.38) {
    super('GrainEffect', fragmentShader, {
      uniforms: new Map<string, THREE.Uniform>([
        ['uAmount', new THREE.Uniform(amount)],
        ['uVignette', new THREE.Uniform(vignette)]
      ])
    });
  }
}
