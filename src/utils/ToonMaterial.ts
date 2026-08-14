import * as THREE from 'three';

interface ToonMaterialOptions {
  color?: number;
  emissive?: number;
  emissiveIntensity?: number;
  vertexColors?: boolean;
  flatShading?: boolean;
  side?: THREE.Side;
  outline?: boolean;
  transparent?: boolean;
  opacity?: number;
}

const toonVertexShader = `
varying vec3 vNormal;
varying vec3 vViewPosition;
varying vec3 vWorldPosition;
varying vec3 vWorldNormal;

#ifdef USE_VERTEX_COLORS
  varying vec3 vColor;
  attribute vec3 color;
#endif

void main() {
  vNormal = normalize(normalMatrix * normal);
  vWorldNormal = normalize((modelMatrix * vec4(normal, 0.0)).xyz);
  
  vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
  vViewPosition = -mvPosition.xyz;
  vWorldPosition = (modelMatrix * vec4(position, 1.0)).xyz;
  
  #ifdef USE_VERTEX_COLORS
    vColor = color;
  #endif
  
  gl_Position = projectionMatrix * mvPosition;
}
`;

const toonFragmentShader = `
uniform vec3 uColor;
uniform vec3 uEmissive;
uniform float uEmissiveIntensity;
uniform vec3 uLightDirection;
uniform vec3 uLightColor;
uniform vec3 uAmbientColor;
uniform float uOpacity;

varying vec3 vNormal;
varying vec3 vViewPosition;
varying vec3 vWorldPosition;
varying vec3 vWorldNormal;

#ifdef USE_VERTEX_COLORS
  varying vec3 vColor;
#endif

void main() {
  vec3 normal = normalize(vNormal);
  vec3 lightDir = normalize(uLightDirection);
  
  float NdotL = dot(normal, lightDir);
  
  // Posterized toon shading - 3 bands only, very flat
  float toonShading;
  if (NdotL > 0.3) {
    toonShading = 1.0;
  } else if (NdotL > -0.2) {
    toonShading = 0.75;
  } else {
    toonShading = 0.55;
  }
  
  #ifdef USE_VERTEX_COLORS
    vec3 baseColor = vColor;
  #else
    vec3 baseColor = uColor;
  #endif
  
  // Flat color fill with minimal shading variation
  vec3 diffuse = baseColor * toonShading;
  vec3 ambient = baseColor * uAmbientColor * 0.3;
  vec3 emissive = uEmissive * uEmissiveIntensity;
  
  vec3 finalColor = diffuse + ambient + emissive;
  
  // Slight dithering effect for that hand-drawn feel
  float dither = fract(sin(dot(gl_FragCoord.xy, vec2(12.9898, 78.233))) * 43758.5453);
  finalColor += (dither - 0.5) * 0.02;
  
  gl_FragColor = vec4(finalColor, uOpacity);
}
`;

export class ToonMaterial {
  private static lightDirection: THREE.Vector3 = new THREE.Vector3(50, 80, 30).normalize();
  private static lightColor: THREE.Color = new THREE.Color(0xfff8f0);
  private static ambientColor: THREE.Color = new THREE.Color(0.5, 0.55, 0.6);

  public static init(): void {
  }

  public static create(options: ToonMaterialOptions = {}): THREE.ShaderMaterial {
    const {
      color = 0xffffff,
      emissive = 0x000000,
      emissiveIntensity = 0,
      vertexColors = false,
      side = THREE.FrontSide,
      transparent = false,
      opacity = 1.0
    } = options;

    const defines: Record<string, boolean> = {};
    if (vertexColors) {
      defines['USE_VERTEX_COLORS'] = true;
    }

    const material = new THREE.ShaderMaterial({
      defines,
      uniforms: {
        uColor: { value: new THREE.Color(color) },
        uEmissive: { value: new THREE.Color(emissive) },
        uEmissiveIntensity: { value: emissiveIntensity },
        uLightDirection: { value: this.lightDirection },
        uLightColor: { value: this.lightColor },
        uAmbientColor: { value: this.ambientColor },
        uOpacity: { value: opacity }
      },
      vertexShader: toonVertexShader,
      fragmentShader: toonFragmentShader,
      side,
      transparent,
      depthWrite: !transparent
    });

    return material;
  }

  public static updateLighting(direction: THREE.Vector3, color: THREE.Color, ambient: THREE.Color): void {
    this.lightDirection.copy(direction).normalize();
    this.lightColor.copy(color);
    this.ambientColor.copy(ambient);
  }
}
