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
  
  private currentPosition: THREE.Vector3 = new THREE.Vector3();
  private currentLookAt: THREE.Vector3 = new THREE.Vector3();
  private targetPosition: THREE.Vector3 = new THREE.Vector3();
  private targetLookAt: THREE.Vector3 = new THREE.Vector3();
  
  private tempQuat: THREE.Quaternion = new THREE.Quaternion();

  constructor(game: Game) {
    this.game = game;
    this.camera = game.camera;
    
    const charPos = game.character.group.position.clone();
    const up = charPos.clone().normalize();
    this.currentPosition.copy(charPos).add(up.multiplyScalar(this.distance));
    this.currentLookAt.copy(charPos);
    this.camera.position.copy(this.currentPosition);
    this.camera.lookAt(this.currentLookAt);
  }

  public update(delta: number): void {
    if (this.game.state !== GameState.PLAYING) return;
    
    const lookDelta = this.game.inputManager.consumeLookDelta();
    this.yawOffset -= lookDelta.x * this.lookSensitivity;
    this.pitchOffset -= lookDelta.y * this.lookSensitivity;
    this.pitchOffset = Math.max(this.minPitch, Math.min(this.maxPitch, this.pitchOffset));
    
    const characterPos = this.game.character.group.position;
    const characterUp = characterPos.clone().normalize();
    
    const characterForward = this.game.character.getForward();
    
    this.tempQuat.setFromAxisAngle(characterUp, this.yawOffset);
    const baseOffset = characterForward.clone().negate();
    baseOffset.applyQuaternion(this.tempQuat);
    
    const pitchAxis = new THREE.Vector3().crossVectors(baseOffset, characterUp).normalize();
    this.tempQuat.setFromAxisAngle(pitchAxis, this.pitchOffset);
    baseOffset.applyQuaternion(this.tempQuat);
    
    this.targetPosition.copy(characterPos)
      .add(baseOffset.multiplyScalar(this.distance))
      .add(characterUp.clone().multiplyScalar(this.height));
    
    this.targetLookAt.copy(characterPos).add(characterUp.clone().multiplyScalar(2));
    
    const smoothFactor = 1 - Math.exp(-this.smoothing * delta);
    this.currentPosition.lerp(this.targetPosition, smoothFactor);
    this.currentLookAt.lerp(this.targetLookAt, smoothFactor);
    
    this.camera.position.copy(this.currentPosition);
    this.camera.lookAt(this.currentLookAt);
    
    const cameraUp = this.currentPosition.clone().normalize();
    this.camera.up.copy(cameraUp);
  }

  public getForwardOnSurface(): THREE.Vector3 {
    const characterPos = this.game.character.group.position;
    const up = characterPos.clone().normalize();
    
    const cameraForward = new THREE.Vector3();
    this.camera.getWorldDirection(cameraForward);
    
    cameraForward.sub(up.clone().multiplyScalar(cameraForward.dot(up)));
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
