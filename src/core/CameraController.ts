import * as THREE from 'three';
import { Game, GameState } from './Game';

export class CameraController {
  private game: Game;
  private camera: THREE.PerspectiveCamera;
  
  // Very close third-person, human height - can't see whole planet as diorama
  private distance: number = 3.2;
  private height: number = 1.2;
  
  private pitchOffset: number = 0.04;
  private maxPitch: number = 0.35;
  private minPitch: number = -0.08;
  
  private lookSensitivity: number = 0.003;
  private smoothing: number = 12;
  
  // Stable heading direction for parallel transport
  private stableHeading: THREE.Vector3 = new THREE.Vector3(0, 0, 1);
  private lastCharacterUp: THREE.Vector3 = new THREE.Vector3(0, 1, 0);

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
    
    const camPos = charPos.clone()
      .add(up.clone().multiplyScalar(this.height))
      .add(behind.clone().multiplyScalar(this.distance));
    
    // Look at character's back/shoulder level for street-level view
    const lookAt = charPos.clone().add(up.clone().multiplyScalar(1.0));
    
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
    
    const minCamHeight = planetRadius + 1.0;
    const targetDist = targetPos.length();
    if (targetDist < minCamHeight) {
      targetPos = targetPos.normalize().multiplyScalar(minCamHeight);
    }
    
    // Look at character's back for street-level feel
    const targetLookAt = characterPos.clone().add(characterUp.clone().multiplyScalar(1.0));
    
    const smoothFactor = Math.min(1, Math.max(0, 1 - Math.exp(-this.smoothing * delta)));
    
    this.camera.position.lerp(targetPos, smoothFactor);
    
    const currentCamDist = this.camera.position.length();
    if (currentCamDist < minCamHeight) {
      this.camera.position.normalize().multiplyScalar(minCamHeight);
    }
    
    const currentLookAt = new THREE.Vector3();
    this.camera.getWorldDirection(currentLookAt);
    currentLookAt.multiplyScalar(10).add(this.camera.position);
    currentLookAt.lerp(targetLookAt, smoothFactor);
    
    this.camera.lookAt(currentLookAt);
    this.camera.up.copy(characterUp);
    
    const finalCamDist = this.camera.position.length();
    if (finalCamDist > planetRadius * 3) {
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
}
