import * as THREE from 'three';
import { Game, GameState } from '../core/Game';
import { ToonMaterial } from '../utils/ToonMaterial';
import { OutlineMaterial } from '../utils/OutlineMaterial';

export class Character {
  private game: Game;
  public group: THREE.Group;
  
  private velocity: THREE.Vector3 = new THREE.Vector3();
  private moveSpeed: number = 10;
  private jumpForce: number = 12;
  private gravity: number = 25; // Higher gravity for snappier, less floaty feel
  
  private isGrounded: boolean = true;
  private jumpCooldown: number = 0;
  private isJumping: boolean = false;
  
  private currentForward: THREE.Vector3 = new THREE.Vector3(0, 0, 1);
  
  private animationTime: number = 0;
  private isWalking: boolean = false;
  
  // Character parts for animation
  private torso!: THREE.Group;
  private head!: THREE.Group;
  private leftLeg!: THREE.Group;
  private rightLeg!: THREE.Group;
  private leftArm!: THREE.Group;
  private rightArm!: THREE.Group;
  private bag!: THREE.Group;
  private groundShadow!: THREE.Mesh;

  constructor(game: Game, spawnPosition: THREE.Vector3) {
    this.game = game;
    this.group = new THREE.Group();
    
    this.createKidCourier();
    
    const surfaceHeight = this.game.planetRadius + 0.5;
    const safeSpawn = spawnPosition.clone().normalize().multiplyScalar(surfaceHeight);
    this.group.position.copy(safeSpawn);
    this.alignToSurface();
    this.isGrounded = true;
  }

  private createKidCourier(): void {
    // Colors matching Messenger-style kid
    const skinColor = 0xf5d0b5;
    const hairColor = 0x2a2a2a;
    const shirtColor = 0xf5a623; // Yellow-orange like Messenger
    const shortsColor = 0x1a1a1a;
    const shoeColor = 0x2a2a2a;
    const sockColor = 0xffffff;
    const bagColor = 0x6b6b6b;

    const outlineOpts = { thickness: 0.02, wobble: 0.005 };

    // === TORSO (t-shirt) ===
    this.torso = new THREE.Group();
    const torsoGeo = new THREE.BoxGeometry(0.38, 0.42, 0.22);
    const torsoMat = ToonMaterial.create({ color: shirtColor });
    const torsoMesh = new THREE.Mesh(torsoGeo, torsoMat);
    torsoMesh.castShadow = true;
    this.torso.add(torsoMesh);
    this.torso.add(OutlineMaterial.addOutlineToMesh(torsoMesh, outlineOpts));
    this.torso.position.y = 0.82;
    this.group.add(this.torso);

    // === HEAD ===
    this.head = new THREE.Group();
    const headGeo = new THREE.SphereGeometry(0.16, 12, 12);
    const headMat = ToonMaterial.create({ color: skinColor });
    const headMesh = new THREE.Mesh(headGeo, headMat);
    headMesh.castShadow = true;
    this.head.add(headMesh);
    this.head.add(OutlineMaterial.addOutlineToMesh(headMesh, outlineOpts));

    // Hair - messy dark style
    const hairGroup = new THREE.Group();
    const hairMat = ToonMaterial.create({ color: hairColor });
    
    // Main hair mass
    const mainHairGeo = new THREE.SphereGeometry(0.17, 8, 8);
    const mainHair = new THREE.Mesh(mainHairGeo, hairMat);
    mainHair.scale.set(1.15, 0.85, 1.1);
    mainHair.position.y = 0.05;
    hairGroup.add(mainHair);
    hairGroup.add(OutlineMaterial.addOutlineToMesh(mainHair, outlineOpts));

    // Messy spiky bits
    for (let i = 0; i < 6; i++) {
      const spikeGeo = new THREE.ConeGeometry(0.05, 0.1, 4);
      const spike = new THREE.Mesh(spikeGeo, hairMat);
      const angle = (i / 6) * Math.PI * 1.5 - Math.PI * 0.4;
      spike.position.set(
        Math.sin(angle) * 0.11,
        0.1 + Math.random() * 0.05,
        Math.cos(angle) * 0.07 - 0.02
      );
      spike.rotation.x = -0.4 + Math.random() * 0.3;
      spike.rotation.z = (Math.random() - 0.5) * 0.5;
      hairGroup.add(spike);
    }
    this.head.add(hairGroup);

    // Eyes - simple dots
    for (let i = 0; i < 2; i++) {
      const eyeGeo = new THREE.SphereGeometry(0.022, 8, 8);
      const eyeMat = ToonMaterial.create({ color: 0x1a1a1a });
      const eye = new THREE.Mesh(eyeGeo, eyeMat);
      eye.position.set(i === 0 ? -0.055 : 0.055, 0.02, 0.13);
      this.head.add(eye);
    }

    // Small ears
    for (let i = 0; i < 2; i++) {
      const earGeo = new THREE.SphereGeometry(0.035, 6, 6);
      const earMat = ToonMaterial.create({ color: skinColor });
      const ear = new THREE.Mesh(earGeo, earMat);
      ear.position.set(i === 0 ? -0.14 : 0.14, 0, 0);
      ear.scale.set(0.5, 1, 0.7);
      this.head.add(ear);
    }

    this.head.position.y = 1.2;
    this.group.add(this.head);

    // === ARMS (skin tone - short sleeves) ===
    const armGeo = new THREE.CapsuleGeometry(0.045, 0.24, 4, 8);
    const armMat = ToonMaterial.create({ color: skinColor });

    this.leftArm = new THREE.Group();
    const leftArmMesh = new THREE.Mesh(armGeo, armMat);
    leftArmMesh.castShadow = true;
    this.leftArm.add(leftArmMesh);
    this.leftArm.add(OutlineMaterial.addOutlineToMesh(leftArmMesh, outlineOpts));
    this.leftArm.position.set(-0.25, 0.9, 0);
    this.group.add(this.leftArm);

    this.rightArm = new THREE.Group();
    const rightArmMesh = new THREE.Mesh(armGeo, armMat);
    rightArmMesh.castShadow = true;
    this.rightArm.add(rightArmMesh);
    this.rightArm.add(OutlineMaterial.addOutlineToMesh(rightArmMesh, outlineOpts));
    this.rightArm.position.set(0.25, 0.9, 0);
    this.group.add(this.rightArm);

    // === LEGS ===
    const upperLegGeo = new THREE.CapsuleGeometry(0.06, 0.12, 4, 8);
    const lowerLegGeo = new THREE.CapsuleGeometry(0.045, 0.16, 4, 8);
    const skinMat = ToonMaterial.create({ color: skinColor });
    const shortsMat = ToonMaterial.create({ color: shortsColor });
    const sockGeo = new THREE.CylinderGeometry(0.05, 0.05, 0.06, 8);
    const sockMat = ToonMaterial.create({ color: sockColor });
    const shoeGeo = new THREE.BoxGeometry(0.1, 0.05, 0.15);
    const shoeMat = ToonMaterial.create({ color: shoeColor });

    // Left leg
    this.leftLeg = new THREE.Group();
    const leftUpperLeg = new THREE.Mesh(upperLegGeo, shortsMat);
    leftUpperLeg.position.y = -0.08;
    this.leftLeg.add(leftUpperLeg);
    this.leftLeg.add(OutlineMaterial.addOutlineToMesh(leftUpperLeg, outlineOpts));
    
    const leftLowerLeg = new THREE.Mesh(lowerLegGeo, skinMat);
    leftLowerLeg.position.y = -0.28;
    this.leftLeg.add(leftLowerLeg);
    this.leftLeg.add(OutlineMaterial.addOutlineToMesh(leftLowerLeg, outlineOpts));
    
    const leftSock = new THREE.Mesh(sockGeo, sockMat);
    leftSock.position.y = -0.42;
    this.leftLeg.add(leftSock);
    
    const leftShoe = new THREE.Mesh(shoeGeo, shoeMat);
    leftShoe.position.set(0, -0.48, 0.02);
    this.leftLeg.add(leftShoe);
    this.leftLeg.add(OutlineMaterial.addOutlineToMesh(leftShoe, outlineOpts));
    
    this.leftLeg.position.set(-0.09, 0.58, 0);
    this.group.add(this.leftLeg);

    // Right leg
    this.rightLeg = new THREE.Group();
    const rightUpperLeg = new THREE.Mesh(upperLegGeo, shortsMat);
    rightUpperLeg.position.y = -0.08;
    this.rightLeg.add(rightUpperLeg);
    this.rightLeg.add(OutlineMaterial.addOutlineToMesh(rightUpperLeg, outlineOpts));
    
    const rightLowerLeg = new THREE.Mesh(lowerLegGeo, skinMat);
    rightLowerLeg.position.y = -0.28;
    this.rightLeg.add(rightLowerLeg);
    this.rightLeg.add(OutlineMaterial.addOutlineToMesh(rightLowerLeg, outlineOpts));
    
    const rightSock = new THREE.Mesh(sockGeo, sockMat);
    rightSock.position.y = -0.42;
    this.rightLeg.add(rightSock);
    
    const rightShoe = new THREE.Mesh(shoeGeo, shoeMat);
    rightShoe.position.set(0, -0.48, 0.02);
    this.rightLeg.add(rightShoe);
    this.rightLeg.add(OutlineMaterial.addOutlineToMesh(rightShoe, outlineOpts));
    
    this.rightLeg.position.set(0.09, 0.58, 0);
    this.group.add(this.rightLeg);

    // === MESSENGER BAG (diagonal strap) ===
    this.bag = new THREE.Group();
    const bagMat = ToonMaterial.create({ color: bagColor });

    // Diagonal strap across chest
    const strapGeo = new THREE.BoxGeometry(0.05, 0.45, 0.015);
    const strap = new THREE.Mesh(strapGeo, bagMat);
    strap.position.set(0, 0.9, 0.12);
    strap.rotation.z = -0.35;
    this.bag.add(strap);
    this.bag.add(OutlineMaterial.addOutlineToMesh(strap, outlineOpts));

    // Bag body on hip
    const bagBodyGeo = new THREE.BoxGeometry(0.24, 0.18, 0.1);
    const bagBody = new THREE.Mesh(bagBodyGeo, bagMat);
    bagBody.position.set(0.2, 0.52, 0.06);
    bagBody.rotation.z = -0.12;
    bagBody.castShadow = true;
    this.bag.add(bagBody);
    this.bag.add(OutlineMaterial.addOutlineToMesh(bagBody, outlineOpts));

    // Bag flap
    const flapGeo = new THREE.BoxGeometry(0.22, 0.06, 0.015);
    const flap = new THREE.Mesh(flapGeo, bagMat);
    flap.position.set(0.2, 0.6, 0.12);
    flap.rotation.z = -0.12;
    this.bag.add(flap);
    this.bag.add(OutlineMaterial.addOutlineToMesh(flap, outlineOpts));

    this.group.add(this.bag);

    // === GROUND SHADOW (soft blob) ===
    const shadowGeo = new THREE.CircleGeometry(0.4, 16);
    const shadowMat = new THREE.MeshBasicMaterial({
      color: 0x000000,
      transparent: true,
      opacity: 0.2,
      depthWrite: false
    });
    this.groundShadow = new THREE.Mesh(shadowGeo, shadowMat);
    this.groundShadow.rotation.x = -Math.PI / 2;
    this.game.scene.add(this.groundShadow);
  }

  public update(delta: number): void {
    if (this.game.state !== GameState.PLAYING) return;
    
    this.handleInput(delta);
    this.applyGravity(delta);
    this.move(delta);
    this.alignToSurface();
    this.updateShadow();
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
      
      const verticalVel = up.clone().multiplyScalar(this.velocity.dot(up));
      const targetHorizontalVel = moveDir.clone().multiplyScalar(this.moveSpeed);
      this.velocity.copy(targetHorizontalVel).add(verticalVel);
    } else {
      this.isWalking = false;
      const verticalVel = up.clone().multiplyScalar(this.velocity.dot(up));
      this.velocity.copy(verticalVel);
    }
    
    if (input.jump && this.isGrounded && this.jumpCooldown <= 0) {
      this.velocity.add(up.clone().multiplyScalar(this.jumpForce));
      this.isGrounded = false;
      this.isJumping = true;
      this.jumpCooldown = 0.5;
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
    const maxHeight = this.game.planetRadius + 20;
    const groundTolerance = 0.1;
    
    if (distFromCenter < 1) {
      this.group.position.set(0, surfaceHeight, 0);
      this.velocity.set(0, 0, 0);
      this.isGrounded = true;
      return;
    }
    
    if (distFromCenter > maxHeight) {
      const up = this.group.position.clone().normalize();
      this.group.position.copy(up.multiplyScalar(surfaceHeight));
      this.velocity.set(0, 0, 0);
      this.isGrounded = true;
      return;
    }
    
    const up = this.group.position.clone().normalize();
    
    if (distFromCenter <= surfaceHeight) {
      this.group.position.copy(up.clone().multiplyScalar(surfaceHeight));
      
      const verticalVel = this.velocity.dot(up);
      if (verticalVel < 0) {
        this.velocity.sub(up.clone().multiplyScalar(verticalVel));
      }
      
      if (!this.isGrounded) {
        this.isGrounded = true;
        this.isJumping = false;
        if (Math.abs(verticalVel) > 2) {
          this.game.audioManager.playLand();
        }
      }
    } else if (distFromCenter < surfaceHeight + groundTolerance && !this.isJumping) {
      this.group.position.copy(up.clone().multiplyScalar(surfaceHeight));
      this.isGrounded = true;
    } else {
      this.isGrounded = false;
    }
  }

  private updateShadow(): void {
    const surfaceHeight = this.game.planetRadius + 0.01;
    const up = this.group.position.clone().normalize();
    
    this.groundShadow.position.copy(up.multiplyScalar(surfaceHeight));
    
    const defaultUp = new THREE.Vector3(0, 1, 0);
    const shadowQuat = new THREE.Quaternion().setFromUnitVectors(defaultUp, up.normalize());
    this.groundShadow.quaternion.copy(shadowQuat);
    
    const heightAboveSurface = this.group.position.length() - this.game.planetRadius - 0.5;
    const shadowScale = Math.max(0.25, 1 - heightAboveSurface * 0.08);
    const shadowOpacity = Math.max(0.08, 0.2 - heightAboveSurface * 0.02);
    this.groundShadow.scale.setScalar(shadowScale);
    (this.groundShadow.material as THREE.MeshBasicMaterial).opacity = shadowOpacity;
  }

  private alignToSurface(): void {
    const up = this.group.position.clone().normalize();
    
    // Project forward onto tangent plane
    const localForward = this.currentForward.clone();
    localForward.sub(up.clone().multiplyScalar(localForward.dot(up)));
    
    if (localForward.lengthSq() < 0.001) {
      // Fallback: use a default tangent direction
      let tangent = new THREE.Vector3(0, 0, 1);
      tangent.sub(up.clone().multiplyScalar(tangent.dot(up)));
      if (tangent.lengthSq() < 0.001) {
        tangent.set(1, 0, 0);
        tangent.sub(up.clone().multiplyScalar(tangent.dot(up)));
      }
      localForward.copy(tangent);
    }
    localForward.normalize();
    
    // Use lookAt approach: character should "stand" on surface with feet down
    // First align to surface normal (up direction)
    const defaultUp = new THREE.Vector3(0, 1, 0);
    const surfaceQuat = new THREE.Quaternion().setFromUnitVectors(defaultUp, up);
    
    // Then rotate around up axis to face forward direction
    // Get the forward after surface alignment
    const worldForward = new THREE.Vector3(0, 0, 1).applyQuaternion(surfaceQuat);
    
    // Calculate angle between aligned forward and desired forward on tangent plane
    const right = new THREE.Vector3().crossVectors(up, localForward);
    if (right.lengthSq() > 0.001) {
      right.normalize();
      const correctedForward = new THREE.Vector3().crossVectors(right, up).negate().normalize();
      
      // Angle between worldForward and correctedForward around up axis
      let angle = Math.acos(Math.max(-1, Math.min(1, worldForward.dot(correctedForward))));
      const cross = new THREE.Vector3().crossVectors(worldForward, correctedForward);
      if (cross.dot(up) < 0) angle = -angle;
      
      const yawQuat = new THREE.Quaternion().setFromAxisAngle(up, angle);
      this.group.quaternion.copy(surfaceQuat).multiply(yawQuat);
    } else {
      this.group.quaternion.copy(surfaceQuat);
    }
  }

  private animate(delta: number): void {
    if (this.isWalking && this.isGrounded) {
      this.animationTime += delta * 16; // Faster animation cycle
      
      // Strong forward lean while running (Messenger-style sprint)
      this.torso.rotation.x = 0.25;
      this.head.rotation.x = -0.15;
      
      // Leg swing - wide stride
      const legSwing = Math.sin(this.animationTime) * 0.75;
      this.leftLeg.rotation.x = legSwing;
      this.rightLeg.rotation.x = -legSwing;
      
      // Arm swing - pumping motion opposite to legs
      const armSwing = Math.sin(this.animationTime) * 0.6;
      this.leftArm.rotation.x = -armSwing - 0.2; // Arms slightly forward
      this.rightArm.rotation.x = armSwing - 0.2;
      
      // Bounce - subtle for grounded feel
      const bounce = Math.abs(Math.sin(this.animationTime * 2)) * 0.02;
      this.torso.position.y = 0.82 + bounce;
      this.head.position.y = 1.2 + bounce;
      
      // Bag sway
      this.bag.rotation.z = Math.sin(this.animationTime * 0.7) * 0.06;
      this.bag.rotation.x = Math.sin(this.animationTime * 1.4) * 0.03;
      
      this.game.audioManager.playFootstep();
    } else if (this.isJumping) {
      // Jump pose
      this.torso.rotation.x = -0.1;
      this.leftLeg.rotation.x = -0.35;
      this.rightLeg.rotation.x = 0.15;
      this.leftArm.rotation.x = 0.5;
      this.rightArm.rotation.x = 0.5;
    } else {
      // Idle - subtle breathing
      this.animationTime += delta * 2;
      
      this.torso.rotation.x = 0;
      this.head.rotation.x = 0;
      this.leftLeg.rotation.x *= 0.9;
      this.rightLeg.rotation.x *= 0.9;
      this.leftArm.rotation.x *= 0.9;
      this.rightArm.rotation.x *= 0.9;
      
      // Subtle idle sway
      const breathe = Math.sin(this.animationTime) * 0.008;
      this.torso.position.y = 0.82 + breathe;
      this.head.position.y = 1.2 + breathe;
    }
  }

  private checkNPCInteraction(): void {
    if (!this.game.inputManager.consumeInteract()) return;
    
    const delivery = this.game.deliverySystem;
    const interactionRange = 6;
    
    let targetNPC = this.game.npcManager.getNearestNPC(this.group.position);
    
    if (delivery.hasLetter && delivery.currentDelivery) {
      const deliveryTarget = this.game.npcManager.getNPCByName(delivery.currentDelivery.to);
      if (deliveryTarget) {
        const targetPos = deliveryTarget.mesh.position;
        const playerDir = this.group.position.clone().normalize();
        const targetDir = targetPos.clone().normalize();
        const dot = Math.max(-1, Math.min(1, playerDir.dot(targetDir)));
        const angle = Math.acos(dot);
        const arcDist = this.game.planetRadius * angle;
        
        if (arcDist <= interactionRange) {
          targetNPC = deliveryTarget;
        }
      }
    }
    
    if (!targetNPC) return;
    
    const npcWorldPos = targetNPC.mesh.position;
    const playerDir = this.group.position.clone().normalize();
    const npcDir = npcWorldPos.clone().normalize();
    const dot = Math.max(-1, Math.min(1, playerDir.dot(npcDir)));
    const angle = Math.acos(dot);
    const arcDist = this.game.planetRadius * angle;
    
    if (arcDist > interactionRange) return;
    
    if (delivery.canPickupFrom(targetNPC.name)) {
      const message = delivery.pickupLetter();
      this.game.dialogueSystem.showDialogue(targetNPC.name, message);
    } else if (delivery.canDeliverTo(targetNPC.name)) {
      const response = delivery.deliverLetter();
      this.game.dialogueSystem.showDialogue(targetNPC.name, response);
    } else {
      const greeting = this.game.npcManager.getRandomGreeting(targetNPC);
      this.game.dialogueSystem.showDialogue(targetNPC.name, greeting);
    }
  }

  public getForward(): THREE.Vector3 {
    return this.currentForward.clone();
  }

  public getPosition(): THREE.Vector3 {
    return this.group.position.clone();
  }

  public setColor(type: string, color: number): void {
    const newMat = ToonMaterial.create({ color });
    
    if (type === 'shirt' && this.torso.children[0]) {
      (this.torso.children[0] as THREE.Mesh).material = newMat;
    }
  }
}
