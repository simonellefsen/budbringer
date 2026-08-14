import * as THREE from 'three';

const outlineVertexShader = `
varying vec2 vUv;

void main() {
  vUv = uv;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
`;

const outlineFragmentShader = `
uniform sampler2D tDiffuse;
uniform sampler2D tDepth;
uniform sampler2D tNormal;
uniform vec2 resolution;
uniform float cameraNear;
uniform float cameraFar;
uniform vec3 outlineColor;
uniform float outlineThickness;

varying vec2 vUv;

float customPerspectiveDepthToViewZ(float invClipZ, float near, float far) {
  return (near * far) / ((far - near) * invClipZ - far);
}

float customViewZToOrthographicDepth(float viewZ, float near, float far) {
  return (viewZ + near) / (near - far);
}

float readDepth(sampler2D depthSampler, vec2 coord) {
  float fragCoordZ = texture2D(depthSampler, coord).x;
  float viewZ = customPerspectiveDepthToViewZ(fragCoordZ, cameraNear, cameraFar);
  return customViewZToOrthographicDepth(viewZ, cameraNear, cameraFar);
}

void main() {
  vec2 texel = vec2(1.0 / resolution.x, 1.0 / resolution.y);
  vec4 color = texture2D(tDiffuse, vUv);
  
  float thickness = outlineThickness;
  
  // Sobel edge detection on depth
  float depthCenter = readDepth(tDepth, vUv);
  float depthLeft = readDepth(tDepth, vUv - vec2(texel.x * thickness, 0.0));
  float depthRight = readDepth(tDepth, vUv + vec2(texel.x * thickness, 0.0));
  float depthTop = readDepth(tDepth, vUv - vec2(0.0, texel.y * thickness));
  float depthBottom = readDepth(tDepth, vUv + vec2(0.0, texel.y * thickness));
  
  float depthDiff = abs(depthLeft - depthRight) + abs(depthTop - depthBottom);
  
  // Normal edge detection
  vec3 normalCenter = texture2D(tNormal, vUv).rgb * 2.0 - 1.0;
  vec3 normalLeft = texture2D(tNormal, vUv - vec2(texel.x * thickness, 0.0)).rgb * 2.0 - 1.0;
  vec3 normalRight = texture2D(tNormal, vUv + vec2(texel.x * thickness, 0.0)).rgb * 2.0 - 1.0;
  vec3 normalTop = texture2D(tNormal, vUv - vec2(0.0, texel.y * thickness)).rgb * 2.0 - 1.0;
  vec3 normalBottom = texture2D(tNormal, vUv + vec2(0.0, texel.y * thickness)).rgb * 2.0 - 1.0;
  
  float normalDiff = length(normalLeft - normalRight) + length(normalTop - normalBottom);
  
  // Combine edges with thresholds
  float depthEdge = step(0.001, depthDiff);
  float normalEdge = step(0.5, normalDiff);
  
  float edge = max(depthEdge, normalEdge * 0.8);
  
  // Wobbly line effect - slight offset based on position
  float wobble = sin(vUv.x * 100.0 + vUv.y * 80.0) * 0.3 + 0.7;
  edge *= wobble;
  
  // Mix outline color
  vec3 finalColor = mix(color.rgb, outlineColor, edge * 0.9);
  
  gl_FragColor = vec4(finalColor, color.a);
}
`;

export class OutlineEffect {
  private scene: THREE.Scene;
  private camera: THREE.Camera;
  private renderer: THREE.WebGLRenderer;
  
  private renderTarget: THREE.WebGLRenderTarget;
  private depthTarget: THREE.WebGLRenderTarget;
  private normalTarget: THREE.WebGLRenderTarget;
  
  private normalMaterial: THREE.ShaderMaterial;
  private outlineMaterial: THREE.ShaderMaterial;
  private quad: THREE.Mesh;
  private quadScene: THREE.Scene;
  private quadCamera: THREE.OrthographicCamera;

  constructor(renderer: THREE.WebGLRenderer, scene: THREE.Scene, camera: THREE.Camera) {
    this.renderer = renderer;
    this.scene = scene;
    this.camera = camera;
    
    const size = renderer.getSize(new THREE.Vector2());
    const pixelRatio = renderer.getPixelRatio();
    
    this.renderTarget = new THREE.WebGLRenderTarget(
      size.x * pixelRatio,
      size.y * pixelRatio
    );
    
    this.depthTarget = new THREE.WebGLRenderTarget(
      size.x * pixelRatio,
      size.y * pixelRatio,
      {
        minFilter: THREE.NearestFilter,
        magFilter: THREE.NearestFilter,
        type: THREE.FloatType,
        depthBuffer: true
      }
    );
    this.depthTarget.depthTexture = new THREE.DepthTexture(
      size.x * pixelRatio,
      size.y * pixelRatio
    );
    this.depthTarget.depthTexture.type = THREE.UnsignedIntType;
    
    this.normalTarget = new THREE.WebGLRenderTarget(
      size.x * pixelRatio,
      size.y * pixelRatio
    );
    
    this.normalMaterial = new THREE.ShaderMaterial({
      vertexShader: `
        varying vec3 vNormal;
        void main() {
          vNormal = normalize(normalMatrix * normal);
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
      `,
      fragmentShader: `
        varying vec3 vNormal;
        void main() {
          gl_FragColor = vec4(vNormal * 0.5 + 0.5, 1.0);
        }
      `
    });
    
    const perspCamera = camera as THREE.PerspectiveCamera;
    
    this.outlineMaterial = new THREE.ShaderMaterial({
      uniforms: {
        tDiffuse: { value: this.renderTarget.texture },
        tDepth: { value: this.depthTarget.depthTexture },
        tNormal: { value: this.normalTarget.texture },
        resolution: { value: new THREE.Vector2(size.x * pixelRatio, size.y * pixelRatio) },
        cameraNear: { value: perspCamera.near },
        cameraFar: { value: perspCamera.far },
        outlineColor: { value: new THREE.Color(0x1a1a1a) },
        outlineThickness: { value: 1.5 }
      },
      vertexShader: outlineVertexShader,
      fragmentShader: outlineFragmentShader
    });
    
    const quadGeometry = new THREE.PlaneGeometry(2, 2);
    this.quad = new THREE.Mesh(quadGeometry, this.outlineMaterial);
    this.quadScene = new THREE.Scene();
    this.quadScene.add(this.quad);
    this.quadCamera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
  }

  public render(): void {
    const originalOverrideMaterial = this.scene.overrideMaterial;
    
    this.renderer.setRenderTarget(this.depthTarget);
    this.renderer.render(this.scene, this.camera);
    
    this.scene.overrideMaterial = this.normalMaterial;
    this.renderer.setRenderTarget(this.normalTarget);
    this.renderer.render(this.scene, this.camera);
    this.scene.overrideMaterial = originalOverrideMaterial;
    
    this.renderer.setRenderTarget(this.renderTarget);
    this.renderer.render(this.scene, this.camera);
    
    this.renderer.setRenderTarget(null);
    this.renderer.render(this.quadScene, this.quadCamera);
  }

  public setSize(width: number, height: number): void {
    const pixelRatio = this.renderer.getPixelRatio();
    const w = width * pixelRatio;
    const h = height * pixelRatio;
    
    this.renderTarget.setSize(w, h);
    this.depthTarget.setSize(w, h);
    this.normalTarget.setSize(w, h);
    
    this.outlineMaterial.uniforms.resolution.value.set(w, h);
  }

  public dispose(): void {
    this.renderTarget.dispose();
    this.depthTarget.dispose();
    this.normalTarget.dispose();
    this.normalMaterial.dispose();
    this.outlineMaterial.dispose();
  }
}
