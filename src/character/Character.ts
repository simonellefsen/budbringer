import * as THREE from 'three';
import { Game, GameState } from '../core/Game';
import { ToonMaterial } from '../utils/ToonMaterial';
import { PLAYER } from '../utils/palette';
import { RiggedFigure } from '../world/Characters';

function mix3(
  idle: number,
  walk: number,
  jump: number,
  idleW: number,
  walkW: number,
  jumpW: number
): number {
  return idle * idleW + walk * walkW + jump * jumpW;
}

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
  private moveWeight: number = 0;
  private walkBlend: number = 0;
  private jumpBlend: number = 0;
  private walkPhase: number = 0;
  private lastStrideSin: number = 0;
  
  // Character parts for animation
  private torso!: THREE.Group;
  private head!: THREE.Group;
  private leftLeg!: THREE.Group;
  private rightLeg!: THREE.Group;
  private leftArm!: THREE.Group;
  private rightArm!: THREE.Group;
  private bag!: THREE.Group;
  private figure: RiggedFigure | null = null;
  private groundShadow!: THREE.Mesh;

  constructor(game: Game, spawnPosition: THREE.Vector3) {
    this.game = game;
    this.group = new THREE.Group();
    
    this.createCourier();
    
    // getSpawnPosition already accounts for terrain height; re-deriving it from
    // planetRadius here put the courier a couple of metres underground.
    const spawnDir = spawnPosition.clone().normalize();
    const surfaceHeight = this.game.planet.getGroundRadius(spawnDir) + 0.5;
    this.group.position.copy(spawnDir.multiplyScalar(surfaceHeight));
    this.alignToSurface();
    this.isGrounded = true;
  }

  /**
   * The courier. Uses the modelled figure from characters.glb when it loaded,
   * and falls back to the old primitive assembly otherwise so a missing GLB
   * still gives you someone to walk around with.
   */
  private createCourier(): void {
    const rigged = this.game.characters?.isLoaded
      ? this.game.characters.instance('Courier')
      : null;

    if (rigged) {
      this.figure = rigged;
      // The kit models face +Z, but alignToSurface builds the group's basis
      // with Matrix4.lookAt, which points -Z along the direction of travel.
      // Without this the courier walks backwards.
      rigged.root.rotation.y = Math.PI;
      this.group.add(rigged.root);
      this.createGroundShadow();
      return;
    }

    this.createPrimitiveCourier();
  }

  private createGroundShadow(): void {
    const shadowGeo = new THREE.CircleGeometry(0.4, 16);
    const shadowMat = new THREE.MeshBasicMaterial({
      color: 0x000000, transparent: true, opacity: 0.2, depthWrite: false
    });
    this.groundShadow = new THREE.Mesh(shadowGeo, shadowMat);
    this.groundShadow.rotation.x = -Math.PI / 2;
    this.game.scene.add(this.groundShadow);
  }

  private createPrimitiveCourier(): void {
    // Colors matching Messenger-style kid
    const skinColor = PLAYER.skin;
    const hairColor = PLAYER.hair;
    const shirtColor = PLAYER.shirt;
    const shortsColor = PLAYER.shorts;
    const shoeColor = PLAYER.shoe;
    const sockColor = PLAYER.sock;
    const bagColor = PLAYER.bag;


    // === TORSO (t-shirt) ===
    this.torso = new THREE.Group();
    const torsoGeo = new THREE.BoxGeometry(0.38, 0.42, 0.22);
    const torsoMat = ToonMaterial.create({ color: shirtColor });
    const torsoMesh = new THREE.Mesh(torsoGeo, torsoMat);
    torsoMesh.castShadow = true;
    this.torso.add(torsoMesh);
    this.torso.position.y = 0.82;
    this.group.add(this.torso);

    // === HEAD ===
    this.head = new THREE.Group();
    const headGeo = new THREE.SphereGeometry(0.16, 12, 12);
    const headMat = ToonMaterial.create({ color: skinColor });
    const headMesh = new THREE.Mesh(headGeo, headMat);
    headMesh.castShadow = true;
    this.head.add(headMesh);

    // Hair - messy dark style
    const hairGroup = new THREE.Group();
    const hairMat = ToonMaterial.create({ color: hairColor });
    
    // Main hair mass
    const mainHairGeo = new THREE.SphereGeometry(0.17, 8, 8);
    const mainHair = new THREE.Mesh(mainHairGeo, hairMat);
    mainHair.scale.set(1.15, 0.85, 1.1);
    mainHair.position.y = 0.05;
    hairGroup.add(mainHair);

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
      const eyeMat = ToonMaterial.create({ color: PLAYER.hair });
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
    this.leftArm.position.set(-0.25, 0.9, 0);
    this.group.add(this.leftArm);

    this.rightArm = new THREE.Group();
    const rightArmMesh = new THREE.Mesh(armGeo, armMat);
    rightArmMesh.castShadow = true;
    this.rightArm.add(rightArmMesh);
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
    
    const leftLowerLeg = new THREE.Mesh(lowerLegGeo, skinMat);
    leftLowerLeg.position.y = -0.28;
    this.leftLeg.add(leftLowerLeg);
    
    const leftSock = new THREE.Mesh(sockGeo, sockMat);
    leftSock.position.y = -0.42;
    this.leftLeg.add(leftSock);
    
    const leftShoe = new THREE.Mesh(shoeGeo, shoeMat);
    leftShoe.position.set(0, -0.48, 0.02);
    this.leftLeg.add(leftShoe);
    
    this.leftLeg.position.set(-0.09, 0.58, 0);
    this.group.add(this.leftLeg);

    // Right leg
    this.rightLeg = new THREE.Group();
    const rightUpperLeg = new THREE.Mesh(upperLegGeo, shortsMat);
    rightUpperLeg.position.y = -0.08;
    this.rightLeg.add(rightUpperLeg);
    
    const rightLowerLeg = new THREE.Mesh(lowerLegGeo, skinMat);
    rightLowerLeg.position.y = -0.28;
    this.rightLeg.add(rightLowerLeg);
    
    const rightSock = new THREE.Mesh(sockGeo, sockMat);
    rightSock.position.y = -0.42;
    this.rightLeg.add(rightSock);
    
    const rightShoe = new THREE.Mesh(shoeGeo, shoeMat);
    rightShoe.position.set(0, -0.48, 0.02);
    this.rightLeg.add(rightShoe);
    
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

    // Bag body on hip
    const bagBodyGeo = new THREE.BoxGeometry(0.24, 0.18, 0.1);
    const bagBody = new THREE.Mesh(bagBodyGeo, bagMat);
    bagBody.position.set(0.2, 0.52, 0.06);
    bagBody.rotation.z = -0.12;
    bagBody.castShadow = true;
    this.bag.add(bagBody);

    // Bag flap
    const flapGeo = new THREE.BoxGeometry(0.22, 0.06, 0.015);
    const flap = new THREE.Mesh(flapGeo, bagMat);
    flap.position.set(0.2, 0.6, 0.12);
    flap.rotation.z = -0.12;
    this.bag.add(flap);

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
    
    let axisX = input.moveX;
    let axisY = input.moveY;
    if (axisX === 0 && axisY === 0) {
      if (input.forward) axisY += 1;
      if (input.backward) axisY -= 1;
      if (input.left) axisX -= 1;
      if (input.right) axisX += 1;
    }

    const moveDir = new THREE.Vector3();
    moveDir.addScaledVector(forward, axisY);
    moveDir.addScaledVector(right, axisX);
    
    const up = this.group.position.clone().normalize();
    moveDir.sub(up.clone().multiplyScalar(moveDir.dot(up)));

    const intent = Math.min(1, moveDir.length());
    
    if (intent > 0.02) {
      moveDir.multiplyScalar(1 / intent);
      this.isWalking = true;
      this.moveWeight = intent;
      
      this.currentForward.lerp(moveDir, 10 * delta);
      this.currentForward.normalize();
      
      const verticalVel = up.clone().multiplyScalar(this.velocity.dot(up));
      const targetHorizontalVel = moveDir.clone().multiplyScalar(this.moveSpeed * intent);
      this.velocity.copy(targetHorizontalVel).add(verticalVel);
    } else {
      this.isWalking = false;
      this.moveWeight = 0;
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

    // Ground height varies with direction now, so it has to be sampled under
    // the courier every frame rather than assumed constant.
    const groundDir = this.group.position.clone().normalize();
    const surfaceHeight = this.game.planet.getGroundRadius(groundDir) + 0.5;
    const maxHeight = surfaceHeight + 20;
    const groundTolerance = 0.1;
    
    if (distFromCenter < 1) {
      this.group.position.set(0, this.game.planetRadius + 0.5, 0);
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
    const up = this.group.position.clone().normalize();
    const surfaceHeight = this.game.planet.getGroundRadius(up) + 0.02;

    this.groundShadow.position.copy(up.clone().multiplyScalar(surfaceHeight));
    
    const defaultUp = new THREE.Vector3(0, 1, 0);
    const shadowQuat = new THREE.Quaternion().setFromUnitVectors(defaultUp, up.normalize());
    this.groundShadow.quaternion.copy(shadowQuat);
    
    const heightAboveSurface = this.group.position.length()
      - this.game.planet.getGroundRadius(this.group.position.clone().normalize()) - 0.5;
    const shadowScale = Math.max(0.25, 1 - heightAboveSurface * 0.08);
    const shadowOpacity = Math.max(0.08, 0.2 - heightAboveSurface * 0.02);
    this.groundShadow.scale.setScalar(shadowScale);
    (this.groundShadow.material as THREE.MeshBasicMaterial).opacity = shadowOpacity;
  }

  private alignToSurface(): void {
    const pos = this.group.position;
    const up = pos.clone().normalize();
    
    // Project currentForward onto tangent plane
    let forward = this.currentForward.clone();
    forward.sub(up.clone().multiplyScalar(forward.dot(up)));
    
    if (forward.lengthSq() < 0.0001) {
      // Fallback forward direction
      forward.set(1, 0, 0);
      forward.sub(up.clone().multiplyScalar(forward.dot(up)));
      if (forward.lengthSq() < 0.0001) {
        forward.set(0, 0, 1);
        forward.sub(up.clone().multiplyScalar(forward.dot(up)));
      }
    }
    forward.normalize();
    
    // Calculate look-at target: position + forward direction
    const lookTarget = pos.clone().add(forward);
    
    // Use Three.js lookAt with proper up vector
    // Create a temporary matrix to compute the rotation
    const m = new THREE.Matrix4();
    m.lookAt(pos, lookTarget, up);
    this.group.quaternion.setFromRotationMatrix(m);
  }

  private animate(delta: number): void {
    const wantWalk = this.isWalking && this.isGrounded ? this.moveWeight : 0;
    const wantJump = this.isGrounded ? 0 : 1;
    this.walkBlend = THREE.MathUtils.damp(this.walkBlend, wantWalk, 10, delta);
    this.jumpBlend = THREE.MathUtils.damp(this.jumpBlend, wantJump, 12, delta);

    this.animationTime += delta * (1.7 + this.walkBlend * 6.5);
    if (this.walkBlend > 0.01 && this.isGrounded) {
      this.walkPhase += delta * (7.2 + this.walkBlend * 2.4);
    }

    const jumpW = this.jumpBlend;
    const walkW = this.walkBlend * (1 - jumpW);
    const idleW = Math.max(0, 1 - walkW - jumpW);

    if (walkW > 0.35 && this.isGrounded) {
      const stride = Math.sin(this.walkPhase);
      if (
        (this.lastStrideSin > 0 && stride <= 0) ||
        (this.lastStrideSin < 0 && stride >= 0)
      ) {
        this.game.audioManager.playFootstep(0.55 + walkW * 0.45);
      }
      this.lastStrideSin = stride;
    }

    if (this.figure) {
      this.animateFigure(delta, idleW, walkW, jumpW);
      return;
    }
    this.animatePrimitive(delta, idleW, walkW, jumpW);
  }

  /**
   * Walk / idle / jump for the modelled courier.
   *
   * The Blender figure exports its limbs as separate nodes with pivots already
   * at the shoulders and hips, so a gait is just four rotations — no skinning
   * and no animation clips. Poses are mixed, then each joint damps toward the
   * mix so start / stop / jump never snap.
   */
  private animateFigure(
    delta: number,
    idleW: number,
    walkW: number,
    jumpW: number
  ): void {
    const { root, head, armL, armR, legL, legR } = this.figure!;
    const swing = Math.sin(this.walkPhase);
    const bob = Math.abs(swing);
    const breathe = Math.sin(this.animationTime);

    const rootX = mix3(0, 0.09, -0.08, idleW, walkW, jumpW);
    const rootY = mix3(breathe * 0.012, bob * 0.045, 0, idleW, walkW, jumpW);
    const headZ = mix3(breathe * 0.018, Math.sin(this.walkPhase * 0.5) * 0.05, 0, idleW, walkW, jumpW);
    const armLX = mix3(0, -swing * 0.48, 0.7, idleW, walkW, jumpW);
    const armRX = mix3(0, swing * 0.48, 0.7, idleW, walkW, jumpW);
    const legLX = mix3(0, swing * 0.62, -0.42, idleW, walkW, jumpW);
    const legRX = mix3(0, -swing * 0.62, 0.2, idleW, walkW, jumpW);

    root.rotation.x = THREE.MathUtils.damp(root.rotation.x, rootX, 14, delta);
    root.position.y = THREE.MathUtils.damp(root.position.y, rootY, 16, delta);
    if (head) head.rotation.z = THREE.MathUtils.damp(head.rotation.z, headZ, 12, delta);
    if (armL) armL.rotation.x = THREE.MathUtils.damp(armL.rotation.x, armLX, 16, delta);
    if (armR) armR.rotation.x = THREE.MathUtils.damp(armR.rotation.x, armRX, 16, delta);
    if (legL) legL.rotation.x = THREE.MathUtils.damp(legL.rotation.x, legLX, 16, delta);
    if (legR) legR.rotation.x = THREE.MathUtils.damp(legR.rotation.x, legRX, 16, delta);
  }

  private animatePrimitive(
    delta: number,
    idleW: number,
    walkW: number,
    jumpW: number
  ): void {
    const swing = Math.sin(this.walkPhase);
    const bounce = Math.abs(swing) * 0.03;
    const breathe = Math.sin(this.animationTime) * 0.008;

    const torsoX = mix3(0, 0.25, -0.1, idleW, walkW, jumpW);
    const headX = mix3(0, -0.15, 0, idleW, walkW, jumpW);
    const torsoY = 0.82 + mix3(breathe, bounce, 0, idleW, walkW, jumpW);
    const headY = 1.2 + mix3(breathe, bounce, 0, idleW, walkW, jumpW);
    const armLX = mix3(0, -swing * 0.6 - 0.2, 0.5, idleW, walkW, jumpW);
    const armRX = mix3(0, swing * 0.6 - 0.2, 0.5, idleW, walkW, jumpW);
    const legLX = mix3(0, swing * 0.75, -0.35, idleW, walkW, jumpW);
    const legRX = mix3(0, -swing * 0.75, 0.15, idleW, walkW, jumpW);
    const bagZ = mix3(0, Math.sin(this.walkPhase * 0.7) * 0.06, 0, idleW, walkW, jumpW);
    const bagX = mix3(0, Math.sin(this.walkPhase * 1.4) * 0.03, 0, idleW, walkW, jumpW);

    this.torso.rotation.x = THREE.MathUtils.damp(this.torso.rotation.x, torsoX, 14, delta);
    this.head.rotation.x = THREE.MathUtils.damp(this.head.rotation.x, headX, 12, delta);
    this.torso.position.y = THREE.MathUtils.damp(this.torso.position.y, torsoY, 16, delta);
    this.head.position.y = THREE.MathUtils.damp(this.head.position.y, headY, 16, delta);
    this.leftArm.rotation.x = THREE.MathUtils.damp(this.leftArm.rotation.x, armLX, 16, delta);
    this.rightArm.rotation.x = THREE.MathUtils.damp(this.rightArm.rotation.x, armRX, 16, delta);
    this.leftLeg.rotation.x = THREE.MathUtils.damp(this.leftLeg.rotation.x, legLX, 16, delta);
    this.rightLeg.rotation.x = THREE.MathUtils.damp(this.rightLeg.rotation.x, legRX, 16, delta);
    this.bag.rotation.z = THREE.MathUtils.damp(this.bag.rotation.z, bagZ, 10, delta);
    this.bag.rotation.x = THREE.MathUtils.damp(this.bag.rotation.x, bagX, 10, delta);
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
