import * as THREE from 'three';
import { Game, GameState } from './Game';

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
  
  // Raycaster for collision detection
  private raycaster: THREE.Raycaster = new THREE.Raycaster();

  constructor(game: Game) {
    this.game = game;
    this.camera = game.camera;
    
    this.snapToCharacter();
  }

  public reset(): void {
    this.pitchOffset = 0.2;
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
    const minCamHeight = planetRadius + 3.0;
    
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
    
    // CRITICAL: Aggressive camera height clamping - never go inside planet
    const minCamHeight = planetRadius + 3.0;
    const targetDist = targetPos.length();
    if (targetDist < minCamHeight) {
      // Push camera up along surface normal
      const surfaceNormal = targetPos.clone().normalize();
      targetPos.copy(surfaceNormal.multiplyScalar(minCamHeight));
    }
    
    // COLLISION CHECK: Raycast from character to target camera position
    // If there's a building in the way, move camera closer to character
    targetPos = this.avoidBuildingCollision(characterPos, targetPos, characterUp);
    
    // Look at character's back for street-level feel
    const targetLookAt = characterPos.clone().add(characterUp.clone().multiplyScalar(1.2));
    
    const smoothFactor = Math.min(1, Math.max(0, 1 - Math.exp(-this.smoothing * delta)));
    
    this.camera.position.lerp(targetPos, smoothFactor);
    
    // Double-check: ensure camera never goes below surface after lerp
    const currentCamDist = this.camera.position.length();
    if (currentCamDist < minCamHeight) {
      this.camera.position.normalize().multiplyScalar(minCamHeight);
    }
    
    // Clamp lookAt to never be below the character
    const currentLookAt = new THREE.Vector3();
    this.camera.getWorldDirection(currentLookAt);
    currentLookAt.multiplyScalar(5).add(this.camera.position);
    currentLookAt.lerp(targetLookAt, smoothFactor);
    
    // Ensure lookAt is above surface
    const lookAtDist = currentLookAt.length();
    if (lookAtDist < planetRadius + 0.5) {
      currentLookAt.normalize().multiplyScalar(planetRadius + 0.5);
    }
    
    this.camera.lookAt(currentLookAt);
    this.camera.up.copy(characterUp);
    
    // Final safety check
    const finalCamDist = this.camera.position.length();
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
    
    return new THREE.Vector3().crossVectors(forward, up).normalize().negate();
  }

  private avoidBuildingCollision(charPos: THREE.Vector3, targetCamPos: THREE.Vector3, charUp: THREE.Vector3): THREE.Vector3 {
    // Cast a ray from character (slightly above) toward the target camera position
    const rayOrigin = charPos.clone().add(charUp.clone().multiplyScalar(1.5));
    const rayDir = targetCamPos.clone().sub(rayOrigin);
    const maxDist = rayDir.length();
    
    if (maxDist < 0.1) {
      return targetCamPos;
    }
    
    rayDir.normalize();
    this.raycaster.set(rayOrigin, rayDir);
    this.raycaster.far = maxDist;
    
    // Get all scene meshes except the character and planet ground
    const meshesToTest: THREE.Mesh[] = [];
    this.game.scene.traverse((obj) => {
      if (obj instanceof THREE.Mesh && 
          obj.parent !== this.game.character.group &&
          !obj.name.includes('ground') &&
          !obj.name.includes('planet')) {
        // Only test building-like objects (not tiny props)
        const box = new THREE.Box3().setFromObject(obj);
        const size = new THREE.Vector3();
        box.getSize(size);
        // Only test objects with some volume (buildings)
        if (size.x > 1 && size.y > 1 && size.z > 1) {
          meshesToTest.push(obj);
        }
      }
    });
    
    if (meshesToTest.length === 0) {
      return targetCamPos;
    }
    
    const intersections = this.raycaster.intersectObjects(meshesToTest, false);
    
    if (intersections.length > 0) {
      // There's an obstacle between character and camera
      // Place camera just before the intersection point
      const hitDist = intersections[0].distance;
      const safeDist = Math.max(0.5, hitDist - 0.5);
      
      // Move camera closer along the ray
      const safePos = rayOrigin.clone().add(rayDir.clone().multiplyScalar(safeDist));
      
      // Also push camera slightly upward to avoid clipping through roofs
      const planetRadius = this.game.planetRadius;
      const minHeight = planetRadius + 2.5;
      if (safePos.length() < minHeight) {
        safePos.normalize().multiplyScalar(minHeight);
      }
      
      return safePos;
    }
    
    return targetCamPos;
  }
}
