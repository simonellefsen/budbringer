import * as THREE from 'three';
import { SKY } from './palette';

/**
 * A painted mint sky that works on a spherical world.
 *
 * A flat background colour makes the horizon a hard seam. This is a huge
 * inward-facing sphere whose gradient is keyed to "looking up from the
 * planet" (the camera's radial) so zenith, horizon and streaky clouds stay
 * consistent wherever you walk.
 */

const vertexShader = /* glsl */`
varying vec3 vWorldPos;
void main() {
  vec4 world = modelMatrix * vec4(position, 1.0);
  vWorldPos = world.xyz;
  gl_Position = projectionMatrix * viewMatrix * world;
}
`;

const fragmentShader = /* glsl */`
uniform vec3 uHorizon;
uniform vec3 uZenith;
uniform vec3 uCloud;
varying vec3 vWorldPos;

float hash(vec3 p) {
  return fract(sin(dot(p, vec3(127.1, 311.7, 74.7))) * 43758.5453);
}

float noise(vec3 p) {
  vec3 i = floor(p);
  vec3 f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  float n000 = hash(i);
  float n100 = hash(i + vec3(1.0, 0.0, 0.0));
  float n010 = hash(i + vec3(0.0, 1.0, 0.0));
  float n110 = hash(i + vec3(1.0, 1.0, 0.0));
  float n001 = hash(i + vec3(0.0, 0.0, 1.0));
  float n101 = hash(i + vec3(1.0, 0.0, 1.0));
  float n011 = hash(i + vec3(0.0, 1.0, 1.0));
  float n111 = hash(i + vec3(1.0, 1.0, 1.0));
  return mix(
    mix(mix(n000, n100, f.x), mix(n010, n110, f.x), f.y),
    mix(mix(n001, n101, f.x), mix(n011, n111, f.x), f.y),
    f.z
  );
}

void main() {
  vec3 viewDir = normalize(vWorldPos - cameraPosition);
  vec3 localUp = normalize(cameraPosition);
  float h = dot(viewDir, localUp);

  float t = smoothstep(-0.04, 0.84, h);
  vec3 col = mix(uHorizon, uZenith, t);

  // Elongated brush-stroke clouds, the mint streaks in the reference skies.
  vec3 q = viewDir * vec3(1.6, 4.8, 1.6);
  float streaks = noise(q);
  streaks = smoothstep(0.5, 0.78, streaks);
  float band = smoothstep(0.05, 0.42, h) * (1.0 - smoothstep(0.7, 0.98, h));
  col = mix(col, uCloud, streaks * band * 0.58);

  gl_FragColor = vec4(col, 1.0);
}
`;

export function createSkyDome(): THREE.Mesh {
  const geometry = new THREE.SphereGeometry(120, 32, 20);
  const material = new THREE.ShaderMaterial({
    uniforms: {
      uHorizon: { value: new THREE.Color(SKY.horizon) },
      uZenith: { value: new THREE.Color(SKY.zenith) },
      uCloud: { value: new THREE.Color(SKY.cloud) }
    },
    vertexShader,
    fragmentShader,
    side: THREE.BackSide,
    depthWrite: false,
    fog: false
  });

  const mesh = new THREE.Mesh(geometry, material);
  mesh.frustumCulled = false;
  mesh.renderOrder = -10;
  mesh.name = 'SkyDome';
  return mesh;
}
