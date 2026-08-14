import * as THREE from 'three';

interface ToonMaterialOptions {
  color?: number;
  emissive?: number;
  emissiveIntensity?: number;
  vertexColors?: boolean;
  flatShading?: boolean;
  side?: THREE.Side;
}

const toonVertexShader = `
varying vec3 vNormal;
varying vec3 vViewPosition;
varying vec3 vWorldPosition;

#ifdef USE_VERTEX_COLORS
  varying vec3 vColor;
  attribute vec3 color;
#endif

void main() {
  vNormal = normalize(normalMatrix * normal);
  
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

varying vec3 vNormal;
varying vec3 vViewPosition;
varying vec3 vWorldPosition;

#ifdef USE_VERTEX_COLORS
  varying vec3 vColor;
#endif

void main() {
  vec3 normal = normalize(vNormal);
  vec3 lightDir = normalize(uLightDirection);
  
  float NdotL = dot(normal, lightDir);
  
  float toonShading;
  if (NdotL > 0.5) {
    toonShading = 1.0;
  } else if (NdotL > 0.0) {
    toonShading = 0.7;
  } else if (NdotL > -0.3) {
    toonShading = 0.5;
  } else {
    toonShading = 0.35;
  }
  
  #ifdef USE_VERTEX_COLORS
    vec3 baseColor = vColor;
  #else
    vec3 baseColor = uColor;
  #endif
  
  vec3 diffuse = baseColor * toonShading;
  vec3 ambient = baseColor * uAmbientColor;
  vec3 emissive = uEmissive * uEmissiveIntensity;
  
  vec3 viewDir = normalize(vViewPosition);
  float rimDot = 1.0 - max(dot(viewDir, normal), 0.0);
  float rimIntensity = smoothstep(0.6, 1.0, rimDot);
  vec3 rim = vec3(0.15) * rimIntensity;
  
  vec3 finalColor = diffuse * uLightColor + ambient + emissive + rim;
  
  gl_FragColor = vec4(finalColor, 1.0);
}
`;

export class ToonMaterial {
  private static lightDirection: THREE.Vector3 = new THREE.Vector3(50, 80, 30).normalize();
  private static lightColor: THREE.Color = new THREE.Color(0xfff5e6);
  private static ambientColor: THREE.Color = new THREE.Color(0.35, 0.35, 0.4);

  public static init(): void {
  }

  public static create(options: ToonMaterialOptions = {}): THREE.ShaderMaterial {
    const {
      color = 0xffffff,
      emissive = 0x000000,
      emissiveIntensity = 0,
      vertexColors = false,
      side = THREE.FrontSide
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
        uAmbientColor: { value: this.ambientColor }
      },
      vertexShader: toonVertexShader,
      fragmentShader: toonFragmentShader,
      side
    });

    return material;
  }

  public static updateLighting(direction: THREE.Vector3, color: THREE.Color, ambient: THREE.Color): void {
    this.lightDirection.copy(direction).normalize();
    this.lightColor.copy(color);
    this.ambientColor.copy(ambient);
  }
}
