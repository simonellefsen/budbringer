import * as THREE from 'three';
import { Game, GameState } from '../core/Game';
import { ToonMaterial } from '../utils/ToonMaterial';

export class Character {
  private game: Game;
  public group: THREE.Group;
  
  private velocity: THREE.Vector3 = new THREE.Vector3();
  private moveSpeed: number = 8;
  private jumpForce: number = 6;
  private gravity: number = 15;
  
  private isGrounded: boolean = true;
  private jumpCooldown: number = 0;
  private isJumping: boolean = false;
  
  private currentForward: THREE.Vector3 = new THREE.Vector3(0, 0, 1);
  
  private animationTime: number = 0;
  private isWalking: boolean = false;
  
  private body!: THREE.Mesh;
  private head!: THREE.Mesh;
  private leftLeg!: THREE.Mesh;
  private rightLeg!: THREE.Mesh;
  private leftArm!: THREE.Mesh;
  private rightArm!: THREE.Mesh;
  private hat!: THREE.Mesh;
  private satchel!: THREE.Group;

  constructor(game: Game, spawnPosition: THREE.Vector3) {
    this.game = game;
    this.group = new THREE.Group();
    
    this.createCharacterMesh();
    
    this.group.position.copy(spawnPosition);
    this.alignToSurface();
  }

  private createCharacterMesh(): void {
    const skinColor = 0xfad7a0;
    const shirtColor = 0x3498db;
    const pantsColor = 0x2c3e50;
    const hatColor = 0xe74c3c;
    const satchelColor = 0x8b4513;
    
    const bodyGeo = new THREE.CapsuleGeometry(0.25, 0.4, 8, 16);
    const bodyMat = ToonMaterial.create({ color: shirtColor });
    this.body = new THREE.Mesh(bodyGeo, bodyMat);
    this.body.position.y = 0.7;
    this.body.castShadow = true;
    this.group.add(this.body);
    
    const headGeo = new THREE.SphereGeometry(0.25, 16, 16);
    const headMat = ToonMaterial.create({ color: skinColor });
    this.head = new THREE.Mesh(headGeo, headMat);
    this.head.position.y = 1.3;
    this.head.castShadow = true;
    this.group.add(this.head);
    
    const hatGeo = new THREE.ConeGeometry(0.28, 0.35, 8);
    const hatMat = ToonMaterial.create({ color: hatColor });
    this.hat = new THREE.Mesh(hatGeo, hatMat);
    this.hat.position.y = 1.55;
    this.hat.castShadow = true;
    this.group.add(this.hat);
    
    const brimGeo = new THREE.CylinderGeometry(0.32, 0.35, 0.05, 16);
    const brim = new THREE.Mesh(brimGeo, hatMat);
    brim.position.y = 1.4;
    brim.castShadow = true;
    this.group.add(brim);
    
    const legGeo = new THREE.CapsuleGeometry(0.1, 0.3, 4, 8);
    const legMat = ToonMaterial.create({ color: pantsColor });
    
    this.leftLeg = new THREE.Mesh(legGeo, legMat);
    this.leftLeg.position.set(-0.12, 0.25, 0);
    this.leftLeg.castShadow = true;
    this.group.add(this.leftLeg);
    
    this.rightLeg = new THREE.Mesh(legGeo, legMat);
    this.rightLeg.position.set(0.12, 0.25, 0);
    this.rightLeg.castShadow = true;
    this.group.add(this.rightLeg);
    
    const armGeo = new THREE.CapsuleGeometry(0.08, 0.25, 4, 8);
    const armMat = ToonMaterial.create({ color: shirtColor });
    
    this.leftArm = new THREE.Mesh(armGeo, armMat);
    this.leftArm.position.set(-0.35, 0.75, 0);
    this.leftArm.castShadow = true;
    this.group.add(this.leftArm);
    
    this.rightArm = new THREE.Mesh(armGeo, armMat);
    this.rightArm.position.set(0.35, 0.75, 0);
    this.rightArm.castShadow = true;
    this.group.add(this.rightArm);
    
    for (let i = 0; i < 2; i++) {
      const eyeGeo = new THREE.SphereGeometry(0.04, 8, 8);
      const eyeMat = ToonMaterial.create({ color: 0x2c3e50 });
      const eye = new THREE.Mesh(eyeGeo, eyeMat);
      eye.position.set(i === 0 ? -0.08 : 0.08, 1.32, 0.2);
      this.group.add(eye);
    }
    
    this.satchel = new THREE.Group();
    
    const bagGeo = new THREE.BoxGeometry(0.25, 0.3, 0.12);
    const bagMat = ToonMaterial.create({ color: satchelColor });
    const bag = new THREE.Mesh(bagGeo, bagMat);
    bag.position.set(0.3, 0.6, 0.1);
    bag.rotation.z = -0.2;
    bag.castShadow = true;
    this.satchel.add(bag);
    
    const strapGeo = new THREE.BoxGeometry(0.05, 0.5, 0.02);
    const strap = new THREE.Mesh(strapGeo, bagMat);
    strap.position.set(0.15, 0.85, 0.08);
    strap.rotation.z = -0.4;
    this.satchel.add(strap);
    
    const flapGeo = new THREE.BoxGeometry(0.22, 0.1, 0.02);
    const flap = new THREE.Mesh(flapGeo, bagMat);
    flap.position.set(0.3, 0.72, 0.17);
    flap.rotation.z = -0.2;
    this.satchel.add(flap);
    
    this.group.add(this.satchel);
  }

  public update(delta: number): void {
    if (this.game.state !== GameState.PLAYING) return;
    
    this.handleInput(delta);
    this.applyGravity(delta);
    this.move(delta);
    this.alignToSurface();
    this.animate(delta);
    this.checkNPCInteraction();
    
    if (this.jumpCooldown > 0) {
      this.jumpCooldown -= delta;
    }
  }

  private handleInput(delta: number): void {
    const input = this.game.inputManager.state;
    const cameraController = this.game.cameraController;
    
    const forward = cameraController.getForwardOnSurface();
    const right = cameraController.getRightOnSurface();
    
    const moveDir = new THREE.Vector3();
    
    if (input.forward) moveDir.add(forward);
    if (input.backward) moveDir.sub(forward);
    if (input.left) moveDir.sub(right);
    if (input.right) moveDir.add(right);
    
    const up = this.group.position.clone().normalize();
    moveDir.sub(up.clone().multiplyScalar(moveDir.dot(up)));
    
    if (moveDir.lengthSq() > 0.001) {
      moveDir.normalize();
      this.isWalking = true;
      
      this.currentForward.lerp(moveDir, 10 * delta);
      this.currentForward.normalize();
      
      this.velocity.add(moveDir.multiplyScalar(this.moveSpeed * delta * 10));
    } else {
      this.isWalking = false;
    }
    
    const maxSpeed = this.moveSpeed;
    const horizontalVel = this.velocity.clone();
    horizontalVel.sub(up.clone().multiplyScalar(horizontalVel.dot(up)));
    
    if (horizontalVel.length() > maxSpeed) {
      horizontalVel.normalize().multiplyScalar(maxSpeed);
      const verticalVel = up.clone().multiplyScalar(this.velocity.dot(up));
      this.velocity.copy(horizontalVel).add(verticalVel);
    }
    
    const friction = this.isGrounded ? 8 : 2;
    horizontalVel.multiplyScalar(Math.exp(-friction * delta));
    const verticalVel = up.clone().multiplyScalar(this.velocity.dot(up));
    this.velocity.copy(horizontalVel).add(verticalVel);
    
    if (input.jump && this.isGrounded && this.jumpCooldown <= 0) {
      this.velocity.add(up.clone().multiplyScalar(this.jumpForce));
      this.isGrounded = false;
      this.isJumping = true;
      this.jumpCooldown = 0.3;
      this.game.audioManager.playJump();
    }
  }

  private applyGravity(delta: number): void {
    const up = this.group.position.clone().normalize();
    const gravityDir = up.clone().negate();
    
    if (!this.isGrounded) {
      this.velocity.add(gravityDir.multiplyScalar(this.gravity * delta));
    }
  }

  private move(delta: number): void {
    const movement = this.velocity.clone().multiplyScalar(delta);
    this.group.position.add(movement);
    
    const distFromCenter = this.group.position.length();
    const surfaceHeight = this.game.planetRadius + 0.5;
    
    if (distFromCenter < surfaceHeight) {
      const up = this.group.position.clone().normalize();
      this.group.position.copy(up.multiplyScalar(surfaceHeight));
      
      const verticalVel = up.clone().multiplyScalar(this.velocity.dot(up));
      if (verticalVel.dot(up) < 0) {
        this.velocity.sub(verticalVel);
      }
      
      if (!this.isGrounded) {
        this.isGrounded = true;
        this.isJumping = false;
        if (Math.abs(this.velocity.dot(up)) > 2) {
          this.game.audioManager.playLand();
        }
      }
    } else {
      this.isGrounded = false;
    }
  }

  private alignToSurface(): void {
    const up = this.group.position.clone().normalize();
    
    const defaultUp = new THREE.Vector3(0, 1, 0);
    const surfaceQuat = new THREE.Quaternion().setFromUnitVectors(defaultUp, up);
    
    const localForward = this.currentForward.clone();
    localForward.sub(up.clone().multiplyScalar(localForward.dot(up)));
    localForward.normalize();
    
    if (localForward.lengthSq() > 0.001) {
      const angle = Math.atan2(
        localForward.dot(new THREE.Vector3().crossVectors(up, new THREE.Vector3(0, 0, 1)).normalize()),
        localForward.dot(new THREE.Vector3(0, 0, 1).sub(up.clone().multiplyScalar(new THREE.Vector3(0, 0, 1).dot(up))).normalize())
      );
      
      const lookQuat = new THREE.Quaternion().setFromAxisAngle(up, angle);
      this.group.quaternion.copy(surfaceQuat).multiply(lookQuat);
    } else {
      this.group.quaternion.copy(surfaceQuat);
    }
  }

  private animate(delta: number): void {
    if (this.isWalking && this.isGrounded) {
      this.animationTime += delta * 12;
      
      const legSwing = Math.sin(this.animationTime) * 0.5;
      this.leftLeg.rotation.x = legSwing;
      this.rightLeg.rotation.x = -legSwing;
      
      const armSwing = Math.sin(this.animationTime) * 0.3;
      this.leftArm.rotation.x = -armSwing;
      this.rightArm.rotation.x = armSwing;
      
      this.body.position.y = 0.7 + Math.abs(Math.sin(this.animationTime * 2)) * 0.03;
      
      this.game.audioManager.playFootstep();
    } else if (this.isJumping) {
      this.leftLeg.rotation.x = -0.3;
      this.rightLeg.rotation.x = -0.3;
      this.leftArm.rotation.x = 0.5;
      this.rightArm.rotation.x = 0.5;
    } else {
      this.leftLeg.rotation.x *= 0.9;
      this.rightLeg.rotation.x *= 0.9;
      this.leftArm.rotation.x *= 0.9;
      this.rightArm.rotation.x *= 0.9;
      
      const breathe = Math.sin(this.animationTime * 0.5) * 0.01;
      this.body.scale.y = 1 + breathe;
      this.animationTime += delta * 2;
    }
    
    const satchelBounce = this.isWalking ? Math.sin(this.animationTime * 2) * 0.02 : 0;
    this.satchel.position.y = satchelBounce;
  }

  private checkNPCInteraction(): void {
    if (!this.game.inputManager.consumeInteract()) return;
    
    const nearestNPC = this.game.npcManager.getNearestNPC(this.group.position);
    if (!nearestNPC) return;
    
    const delivery = this.game.deliverySystem;
    
    if (delivery.canPickupFrom(nearestNPC.name)) {
      const message = delivery.pickupLetter();
      this.game.dialogueSystem.showDialogue(nearestNPC.name, message);
    } else if (delivery.canDeliverTo(nearestNPC.name)) {
      const response = delivery.deliverLetter();
      this.game.dialogueSystem.showDialogue(nearestNPC.name, response);
    } else {
      const greeting = this.game.npcManager.getRandomGreeting(nearestNPC);
      this.game.dialogueSystem.showDialogue(nearestNPC.name, greeting);
    }
  }

  public getForward(): THREE.Vector3 {
    return this.currentForward.clone();
  }

  public getPosition(): THREE.Vector3 {
    return this.group.position.clone();
  }
}
