import * as THREE from 'three';
import { Game, GameState } from './Game';

export class CameraController {
  private game: Game;
  private camera: THREE.PerspectiveCamera;
  
  private distance: number = 12;
  private height: number = 4;
  
  private yawOffset: number = 0;
  private pitchOffset: number = 0.2;
  private maxPitch: number = 0.8;
  private minPitch: number = -0.3;
  
  private lookSensitivity: number = 0.003;
  private smoothing: number = 5;

  constructor(game: Game) {
    this.game = game;
    this.camera = game.camera;
    
    this.snapToCharacter();
  }

  public reset(): void {
    this.yawOffset = 0;
    this.pitchOffset = 0.2;
    this.snapToCharacter();
  }

  private snapToCharacter(): void {
    const charPos = this.game.character.group.position;
    const planetRadius = this.game.planetRadius;
    
    if (charPos.length() < 1) {
      this.camera.position.set(0, planetRadius + this.height + this.distance, 0);
      this.camera.lookAt(0, planetRadius, 0);
      this.camera.up.set(0, 1, 0);
      return;
    }
    
    const up = charPos.clone().normalize();
    
    let tangent = new THREE.Vector3(0, 1, 0);
    if (Math.abs(up.dot(tangent)) > 0.99) {
      tangent.set(1, 0, 0);
    }
    const right = new THREE.Vector3().crossVectors(up, tangent).normalize();
    const forward = new THREE.Vector3().crossVectors(right, up).normalize();
    
    const behind = forward.clone().negate();
    
    const camPos = charPos.clone()
      .add(up.clone().multiplyScalar(this.height))
      .add(behind.clone().multiplyScalar(this.distance));
    
    const lookAt = charPos.clone().add(up.clone().multiplyScalar(2));
    
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
    
    const lookDelta = this.game.inputManager.consumeLookDelta();
    this.yawOffset -= lookDelta.x * this.lookSensitivity;
    this.pitchOffset -= lookDelta.y * this.lookSensitivity;
    this.pitchOffset = Math.max(this.minPitch, Math.min(this.maxPitch, this.pitchOffset));
    
    const characterUp = characterPos.clone().normalize();
    
    let tangent = new THREE.Vector3(0, 1, 0);
    if (Math.abs(characterUp.dot(tangent)) > 0.99) {
      tangent.set(1, 0, 0);
    }
    const worldRight = new THREE.Vector3().crossVectors(characterUp, tangent).normalize();
    const worldForward = new THREE.Vector3().crossVectors(worldRight, characterUp).normalize();
    
    const tempQuat = new THREE.Quaternion();
    tempQuat.setFromAxisAngle(characterUp, this.yawOffset);
    const baseOffset = worldForward.clone().negate();
    baseOffset.applyQuaternion(tempQuat);
    
    const pitchAxis = new THREE.Vector3().crossVectors(baseOffset, characterUp).normalize();
    if (pitchAxis.length() > 0.01) {
      tempQuat.setFromAxisAngle(pitchAxis, this.pitchOffset);
      baseOffset.applyQuaternion(tempQuat);
    }
    
    let targetPos = characterPos.clone()
      .add(baseOffset.clone().multiplyScalar(this.distance))
      .add(characterUp.clone().multiplyScalar(this.height));
    
    const minCamHeight = planetRadius + 2;
    const targetDist = targetPos.length();
    if (targetDist < minCamHeight) {
      targetPos = targetPos.normalize().multiplyScalar(minCamHeight);
    }
    
    const targetLookAt = characterPos.clone().add(characterUp.clone().multiplyScalar(2));
    
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
    const characterPos = this.game.character.group.position;
    const up = characterPos.clone().normalize();
    
    const cameraForward = new THREE.Vector3();
    this.camera.getWorldDirection(cameraForward);
    
    cameraForward.sub(up.clone().multiplyScalar(cameraForward.dot(up)));
    if (cameraForward.length() < 0.01) {
      return new THREE.Vector3(1, 0, 0);
    }
    cameraForward.normalize();
    
    return cameraForward;
  }

  public getRightOnSurface(): THREE.Vector3 {
    const characterPos = this.game.character.group.position;
    const up = characterPos.clone().normalize();
    const forward = this.getForwardOnSurface();
    
    return new THREE.Vector3().crossVectors(forward, up).normalize().negate();
  }
}
