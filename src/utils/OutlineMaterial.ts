import * as THREE from 'three';

const outlineVertexShader = `
uniform float outlineThickness;
uniform float wobbleAmount;
uniform float wobbleFreq;

void main() {
  vec3 pos = position;
  
  // Wobble the outline for hand-drawn feel
  float wobble = sin(pos.x * wobbleFreq + pos.y * wobbleFreq * 0.7) * wobbleAmount;
  wobble += cos(pos.z * wobbleFreq * 0.8 + pos.y * wobbleFreq) * wobbleAmount * 0.5;
  
  // Push vertices outward along normal (inverted hull)
  vec3 expandedPos = pos + normal * (outlineThickness + wobble);
  
  gl_Position = projectionMatrix * modelViewMatrix * vec4(expandedPos, 1.0);
}
`;

const outlineFragmentShader = `
uniform vec3 outlineColor;

void main() {
  gl_FragColor = vec4(outlineColor, 1.0);
}
`;

export class OutlineMaterial {
  public static create(options: {
    thickness?: number;
    color?: number;
    wobble?: number;
  } = {}): THREE.ShaderMaterial {
    const {
      thickness = 0.03,
      color = 0x1a1a1a,
      wobble = 0.008
    } = options;

    return new THREE.ShaderMaterial({
      uniforms: {
        outlineThickness: { value: thickness },
        outlineColor: { value: new THREE.Color(color) },
        wobbleAmount: { value: wobble },
        wobbleFreq: { value: 8.0 }
      },
      vertexShader: outlineVertexShader,
      fragmentShader: outlineFragmentShader,
      side: THREE.BackSide,
      depthWrite: true
    });
  }

  public static addOutlineToMesh(mesh: THREE.Mesh, options: {
    thickness?: number;
    color?: number;
    wobble?: number;
  } = {}): THREE.Mesh {
    const outlineMaterial = this.create(options);
    const outlineMesh = new THREE.Mesh(mesh.geometry, outlineMaterial);
    outlineMesh.position.copy(mesh.position);
    outlineMesh.rotation.copy(mesh.rotation);
    outlineMesh.scale.copy(mesh.scale);
    return outlineMesh;
  }

  public static createOutlinedGroup(mesh: THREE.Mesh, options: {
    thickness?: number;
    color?: number;
    wobble?: number;
  } = {}): THREE.Group {
    const group = new THREE.Group();
    group.add(mesh);
    
    const outline = this.addOutlineToMesh(mesh, options);
    group.add(outline);
    
    return group;
  }
}
