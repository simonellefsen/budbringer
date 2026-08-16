import * as THREE from 'three';
import { MeshBVH, acceleratedRaycast } from 'three-mesh-bvh';
import { Game, GameState } from './Game';

THREE.Mesh.prototype.raycast = acceleratedRaycast;

export class CameraController {
  private game: Game;
  private camera: THREE.PerspectiveCamera;
  
  // Close third-person, human height - see the street ahead
  private distance: number = 4.5;
  private height: number = 2.0;
  
  private pitchOffset: number = 0.08;
  private maxPitch: number = 0.25;
  private minPitch: number = 0.02; // Always look slightly up, never into ground
  
  private lookSensitivity: number = 0.003;
  private smoothing: number = 12;
  
  // Stable heading direction for parallel transport
  private stableHeading: THREE.Vector3 = new THREE.Vector3(0, 0, 1);
  private lastCharacterUp: THREE.Vector3 = new THREE.Vector3(0, 1, 0);
  
  private raycaster: THREE.Raycaster = new THREE.Raycaster();
  private colliders: THREE.Mesh[] = [];
  private collidersReady = false;

  constructor(game: Game) {
    this.game = game;
    this.camera = game.camera;
    
    this.snapToCharacter();
  }

  public reset(): void {
    this.pitchOffset = 0.1; // Start with slight downward look, not top-down
    this.initializeStableHeading();
    this.snapToCharacter();
  }
  
  private initializeStableHeading(): void {
    const charPos = this.game.character.group.position;
    if (charPos.length() < 1) {
      this.stableHeading.set(0, 0, 1);
      this.lastCharacterUp.set(0, 1, 0);
      return;
    }
    
    const up = charPos.clone().normalize();
    this.lastCharacterUp.copy(up);
    
    // Create an initial heading on the tangent plane
    let tangent = new THREE.Vector3(0, 1, 0);
    if (Math.abs(up.dot(tangent)) > 0.99) {
      tangent.set(1, 0, 0);
    }
    const right = new THREE.Vector3().crossVectors(up, tangent).normalize();
    this.stableHeading.crossVectors(right, up).normalize();
  }

  private snapToCharacter(): void {
    const charPos = this.game.character.group.position;
    const planetRadius = this.game.planetRadius;
    const minCamHeight = this.groundClearance(charPos, 1.4);

    if (charPos.length() < 1) {
      this.camera.position.set(0, planetRadius + this.height + this.distance, 0);
      this.camera.lookAt(0, planetRadius, 0);
      this.camera.up.set(0, 1, 0);
      this.initializeStableHeading();
      return;
    }
    
    const up = charPos.clone().normalize();
    this.lastCharacterUp.copy(up);
    
    // Initialize stable heading if needed
    if (this.stableHeading.lengthSq() < 0.5) {
      this.initializeStableHeading();
    }
    
    // Ensure heading is on tangent plane
    this.stableHeading.sub(up.clone().multiplyScalar(this.stableHeading.dot(up)));
    if (this.stableHeading.lengthSq() < 0.01) {
      this.initializeStableHeading();
    } else {
      this.stableHeading.normalize();
    }
    
    const behind = this.stableHeading.clone().negate();
    
    let camPos = charPos.clone()
      .add(up.clone().multiplyScalar(this.height))
      .add(behind.clone().multiplyScalar(this.distance));
    
    // CRITICAL: Ensure camera is always above surface
    if (camPos.length() < minCamHeight) {
      camPos = camPos.normalize().multiplyScalar(minCamHeight);
    }
    
    // Look at character's back/shoulder level for street-level view
    const lookAt = charPos.clone().add(up.clone().multiplyScalar(1.2));
    
    this.camera.position.copy(camPos);
    this.camera.lookAt(lookAt);
    this.camera.up.copy(up);
  }

  public update(delta: number): void {
    if (this.game.state !== GameState.PLAYING) return;
    
    const characterPos = this.game.character.group.position;
    const planetRadius = this.game.planetRadius;
    
    if (characterPos.length() < 1 || !isFinite(characterPos.x)) {
      return;
    }
    
    const distToChar = this.camera.position.distanceTo(characterPos);
    if (distToChar > 50 || !isFinite(distToChar) || distToChar < 0.1) {
      this.snapToCharacter();
      return;
    }
    
    const camDist = this.camera.position.length();
    if (camDist > planetRadius * 5 || camDist < planetRadius * 0.5) {
      this.snapToCharacter();
      return;
    }
    
    const characterUp = characterPos.clone().normalize();
    
    // Parallel transport: rotate heading as the surface normal changes
    if (this.lastCharacterUp.lengthSq() > 0.5) {
      const dot = Math.max(-1, Math.min(1, this.lastCharacterUp.dot(characterUp)));
      if (dot < 0.9999) {
        // Compute rotation from old up to new up
        const rotationAxis = new THREE.Vector3().crossVectors(this.lastCharacterUp, characterUp);
        if (rotationAxis.lengthSq() > 0.0001) {
          rotationAxis.normalize();
          const angle = Math.acos(dot);
          const transportQuat = new THREE.Quaternion().setFromAxisAngle(rotationAxis, angle);
          this.stableHeading.applyQuaternion(transportQuat);
        }
      }
    }
    this.lastCharacterUp.copy(characterUp);
    
    // Re-orthogonalize heading to tangent plane (numerical stability)
    this.stableHeading.sub(characterUp.clone().multiplyScalar(this.stableHeading.dot(characterUp)));
    if (this.stableHeading.lengthSq() < 0.01) {
      this.initializeStableHeading();
    } else {
      this.stableHeading.normalize();
    }
    
    // Apply yaw from mouse/touch input
    const lookDelta = this.game.inputManager.consumeLookDelta();
    if (Math.abs(lookDelta.x) > 0.001) {
      const yawAngle = -lookDelta.x * this.lookSensitivity;
      const yawQuat = new THREE.Quaternion().setFromAxisAngle(characterUp, yawAngle);
      this.stableHeading.applyQuaternion(yawQuat);
      this.stableHeading.normalize();
    }
    
    // Apply pitch
    this.pitchOffset -= lookDelta.y * this.lookSensitivity;
    this.pitchOffset = Math.max(this.minPitch, Math.min(this.maxPitch, this.pitchOffset));
    
    // Camera looks in direction of stableHeading, positioned behind character
    const behind = this.stableHeading.clone().negate();
    
    // Apply pitch to camera offset
    const pitchAxis = new THREE.Vector3().crossVectors(behind, characterUp).normalize();
    let cameraOffset = behind.clone();
    if (pitchAxis.lengthSq() > 0.01) {
      const pitchQuat = new THREE.Quaternion().setFromAxisAngle(pitchAxis, this.pitchOffset);
      cameraOffset.applyQuaternion(pitchQuat);
    }
    
    let targetPos = characterPos.clone()
      .add(cameraOffset.clone().multiplyScalar(this.distance))
      .add(characterUp.clone().multiplyScalar(this.height));
    
    this.liftOffGround(targetPos, 1.25);
    targetPos = this.avoidBuildingCollision(characterPos, targetPos, characterUp);
    this.liftOffGround(targetPos, 1.25);
    
    // Look at character's back for street-level feel
    const targetLookAt = characterPos.clone().add(characterUp.clone().multiplyScalar(1.2));
    
    const smoothFactor = Math.min(1, Math.max(0, 1 - Math.exp(-this.smoothing * delta)));
    
    this.camera.position.lerp(targetPos, smoothFactor);
    this.liftOffGround(this.camera.position, 1.2);
    const pulled = this.avoidBuildingCollision(
      characterPos, this.camera.position, characterUp);
    this.camera.position.copy(pulled);
    this.liftOffGround(this.camera.position, 1.2);
    
    // Clamp lookAt to never be below the character
    const currentLookAt = new THREE.Vector3();
    this.camera.getWorldDirection(currentLookAt);
    currentLookAt.multiplyScalar(5).add(this.camera.position);
    currentLookAt.lerp(targetLookAt, smoothFactor);
    
    // Ensure lookAt is above surface
    const lookAtDist = currentLookAt.length();
    const lookGround =
      this.game.planet.getGroundRadius(currentLookAt.clone().normalize()) + 0.5;
    if (lookAtDist < lookGround) {
      currentLookAt.normalize().multiplyScalar(lookGround);
    }
    
    this.camera.lookAt(currentLookAt);
    this.camera.up.copy(characterUp);
    
    // Final safety check
    const finalCamDist = this.camera.position.length();
    const minCamHeight = this.groundClearance(this.camera.position, 1.1);
    if (finalCamDist < minCamHeight || finalCamDist > planetRadius * 3 || !isFinite(finalCamDist)) {
      this.snapToCharacter();
    }
  }

  public getForwardOnSurface(): THREE.Vector3 {
    // Return the stable heading direction (already on tangent plane)
    return this.stableHeading.clone();
  }

  public getRightOnSurface(): THREE.Vector3 {
    const characterPos = this.game.character.group.position;
    const up = characterPos.clone().normalize();
    const forward = this.stableHeading.clone();
    
    // right = forward × up (no negate - standard right-handed system)
    // A key (left) subtracts right → moves left on screen
    // D key (right) adds right → moves right on screen
    return new THREE.Vector3().crossVectors(forward, up).normalize();
  }

  /**
   * Gather solid meshes once and put a BVH on each.
   *
   * The old path rebuilt a world Box3 for every mesh every frame, which
   * was both the hottest thing in the loop and a bad filter: a road ribbon
   * on a sphere has a huge world AABB, so it counted as a "building".
   */
  public rebuildColliders(): void {
    this.colliders = [];
    const character = this.game.character?.group;
    const planet = this.game.planet;

    this.game.scene.traverse((obj) => {
      const mesh = obj as THREE.Mesh;
      if (!mesh.isMesh) return;
      if (character && character.getObjectById(mesh.id)) return;
      if (planet.isCloudMesh(mesh)) return;
      if (mesh.name === 'SkyDome') return;
      if (mesh.geometry instanceof THREE.IcosahedronGeometry && mesh.parent === planet.mesh) {
        return;
      }
      const mat = mesh.material as THREE.Material;
      if (mat.transparent && mat.opacity < 0.95) return;

      if (!mesh.geometry.boundingBox) mesh.geometry.computeBoundingBox();
      const local = mesh.geometry.boundingBox;
      if (!local) return;
      const size = local.getSize(new THREE.Vector3());
      // Skip roads, water, mailboxes: not tall enough to hide the camera.
      if (size.y < 0.7) return;
      if (size.x * size.y * size.z < 0.35) return;

      if (!mesh.geometry.boundsTree) {
        mesh.geometry.boundsTree = new MeshBVH(mesh.geometry);
      }
      this.colliders.push(mesh);
    });

    this.collidersReady = true;
    this.raycaster.firstHitOnly = true;
  }

  private groundClearance(point: THREE.Vector3, extra: number): number {
    return this.game.planet.getGroundRadius(point.clone().normalize()) + extra;
  }

  private liftOffGround(point: THREE.Vector3, extra: number): void {
    const dir = point.clone().normalize();
    const minR = this.game.planet.getGroundRadius(dir) + extra;
    const r = point.length();
    if (r < minR && r > 1e-4) point.multiplyScalar(minR / r);
  }

  private avoidBuildingCollision(
    charPos: THREE.Vector3,
    targetCamPos: THREE.Vector3,
    charUp: THREE.Vector3
  ): THREE.Vector3 {
    if (!this.collidersReady) this.rebuildColliders();
    if (this.colliders.length === 0) return targetCamPos;

    const rayOrigin = charPos.clone().addScaledVector(charUp, 1.45);
    const rayDir = targetCamPos.clone().sub(rayOrigin);
    const maxDist = rayDir.length();
    if (maxDist < 0.15) return targetCamPos;

    rayDir.normalize();
    this.raycaster.set(rayOrigin, rayDir);
    this.raycaster.far = maxDist;
    this.raycaster.near = 0.05;

    const hits = this.raycaster.intersectObjects(this.colliders, false);
    if (hits.length === 0) return targetCamPos;

    const safeDist = Math.max(0.55, hits[0].distance - 0.45);
    const safePos = rayOrigin.addScaledVector(rayDir, safeDist);
    this.liftOffGround(safePos, 1.15);
    return safePos;
  }
}
