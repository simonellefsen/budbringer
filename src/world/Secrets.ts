import * as THREE from 'three';
import { Game } from '../core/Game';
import { ToonMaterial } from '../utils/ToonMaterial';

export class Secrets {
  private game: Game;
  private floatingIsland: THREE.Group | null = null;
  private beachCreature: THREE.Group | null = null;
  private mysteryOrb: THREE.Group | null = null;
  private foundSecrets: Set<string> = new Set();

  constructor(game: Game) {
    this.game = game;
    this.createSecrets();
  }

  private createSecrets(): void {
    this.createFloatingIsland();
    this.createBeachCreature();
    this.createMysteryOrb();
  }

  private createFloatingIsland(): void {
    const island = new THREE.Group();
    
    const baseGeo = new THREE.DodecahedronGeometry(2, 1);
    const baseMat = ToonMaterial.create({ color: 0x7f8c8d });
    const base = new THREE.Mesh(baseGeo, baseMat);
    base.scale.y = 0.5;
    base.castShadow = true;
    island.add(base);
    
    const grassGeo = new THREE.CylinderGeometry(1.8, 2, 0.3, 12);
    const grassMat = ToonMaterial.create({ color: 0x27ae60 });
    const grass = new THREE.Mesh(grassGeo, grassMat);
    grass.position.y = 0.6;
    grass.castShadow = true;
    island.add(grass);
    
    const treeGeo = new THREE.ConeGeometry(0.5, 1.5, 6);
    const treeMat = ToonMaterial.create({ color: 0x16a085 });
    const tree = new THREE.Mesh(treeGeo, treeMat);
    tree.position.y = 1.5;
    tree.castShadow = true;
    island.add(tree);
    
    for (let i = 0; i < 5; i++) {
      const crystalGeo = new THREE.OctahedronGeometry(0.15, 0);
      const crystalMat = ToonMaterial.create({ 
        color: 0x9b59b6, 
        emissive: 0x9b59b6, 
        emissiveIntensity: 0.5 
      });
      const crystal = new THREE.Mesh(crystalGeo, crystalMat);
      const angle = (i / 5) * Math.PI * 2;
      crystal.position.set(
        Math.cos(angle) * 1.2,
        0.8,
        Math.sin(angle) * 1.2
      );
      crystal.scale.y = 1.5;
      island.add(crystal);
    }
    
    island.position.set(0, this.game.planetRadius + 25, 0);
    this.game.scene.add(island);
    this.floatingIsland = island;
  }

  private createBeachCreature(): void {
    const creature = new THREE.Group();
    
    const bodyGeo = new THREE.SphereGeometry(0.6, 16, 16);
    const bodyMat = ToonMaterial.create({ color: 0x3498db });
    const body = new THREE.Mesh(bodyGeo, bodyMat);
    body.scale.set(1, 0.8, 1.2);
    body.castShadow = true;
    creature.add(body);
    
    for (let i = 0; i < 2; i++) {
      const eyeGeo = new THREE.SphereGeometry(0.2, 12, 12);
      const eyeWhite = new THREE.Mesh(eyeGeo, ToonMaterial.create({ color: 0xffffff }));
      eyeWhite.position.set(i === 0 ? -0.25 : 0.25, 0.3, 0.4);
      creature.add(eyeWhite);
      
      const pupilGeo = new THREE.SphereGeometry(0.1, 8, 8);
      const pupil = new THREE.Mesh(pupilGeo, ToonMaterial.create({ color: 0x2c3e50 }));
      pupil.position.set(i === 0 ? -0.25 : 0.25, 0.3, 0.55);
      creature.add(pupil);
    }
    
    for (let i = 0; i < 4; i++) {
      const tentacleGeo = new THREE.CylinderGeometry(0.08, 0.05, 0.5, 6);
      const tentacleMat = ToonMaterial.create({ color: 0x2980b9 });
      const tentacle = new THREE.Mesh(tentacleGeo, tentacleMat);
      const angle = (i / 4) * Math.PI * 2;
      tentacle.position.set(
        Math.cos(angle) * 0.4,
        -0.5,
        Math.sin(angle) * 0.4
      );
      tentacle.rotation.x = 0.3;
      tentacle.rotation.z = Math.cos(angle) * 0.3;
      creature.add(tentacle);
    }
    
    const beachBiome = this.game.planet.biomes?.find(b => b.type === 1);
    if (beachBiome) {
      const beachCenter = this.game.planet.getBiomePosition(1);
      const up = beachCenter.clone().normalize();
      
      let tangent = new THREE.Vector3(0, 1, 0);
      if (Math.abs(up.dot(tangent)) > 0.99) {
        tangent = new THREE.Vector3(1, 0, 0);
      }
      const right = new THREE.Vector3().crossVectors(up, tangent).normalize();
      const forward = new THREE.Vector3().crossVectors(right, up).normalize();
      
      const offset = forward.clone().multiplyScalar(8).add(right.clone().multiplyScalar(3));
      const pos = beachCenter.clone().add(offset).normalize().multiplyScalar(this.game.planetRadius + 0.5);
      
      creature.position.copy(pos);
      
      const defaultUp = new THREE.Vector3(0, 1, 0);
      const quaternion = new THREE.Quaternion().setFromUnitVectors(defaultUp, up);
      creature.quaternion.copy(quaternion);
    }
    
    creature.visible = false;
    this.game.scene.add(creature);
    this.beachCreature = creature;
  }

  private createMysteryOrb(): void {
    const orb = new THREE.Group();
    
    const coreGeo = new THREE.SphereGeometry(0.5, 32, 32);
    const coreMat = ToonMaterial.create({
      color: 0xffeaa7,
      emissive: 0xf39c12,
      emissiveIntensity: 0.8
    });
    const core = new THREE.Mesh(coreGeo, coreMat);
    orb.add(core);
    
    const glowGeo = new THREE.SphereGeometry(0.7, 16, 16);
    const glowMat = new THREE.MeshBasicMaterial({
      color: 0xffeaa7,
      transparent: true,
      opacity: 0.3
    });
    const glow = new THREE.Mesh(glowGeo, glowMat);
    orb.add(glow);
    
    for (let i = 0; i < 3; i++) {
      const ringGeo = new THREE.TorusGeometry(0.8 + i * 0.15, 0.02, 8, 32);
      const ringMat = ToonMaterial.create({
        color: 0xf39c12,
        emissive: 0xf39c12,
        emissiveIntensity: 0.5
      });
      const ring = new THREE.Mesh(ringGeo, ringMat);
      ring.rotation.x = Math.PI / 2 + i * 0.3;
      ring.rotation.y = i * 0.5;
      orb.add(ring);
    }
    
    const shrineBiome = this.game.planet.getBiomePosition(3);
    const up = shrineBiome.clone().normalize();
    orb.position.copy(shrineBiome.clone().add(up.clone().multiplyScalar(8)));
    
    this.game.scene.add(orb);
    this.mysteryOrb = orb;
  }

  public update(elapsed: number): void {
    if (this.floatingIsland) {
      this.floatingIsland.position.y = this.game.planetRadius + 25 + Math.sin(elapsed * 0.3) * 2;
      this.floatingIsland.rotation.y = elapsed * 0.1;
    }
    
    if (this.beachCreature) {
      const playerPos = this.game.character.group.position;
      const creaturePos = this.beachCreature.position;
      const dist = playerPos.distanceTo(creaturePos);
      
      if (dist < 15 && !this.foundSecrets.has('creature')) {
        this.beachCreature.visible = true;
        
      this.beachCreature.children.forEach((child: THREE.Object3D, i: number) => {
        if (i > 2) {
          child.rotation.x = Math.sin(elapsed * 3 + i) * 0.3;
        }
      });
      }
      
      if (dist < 3 && !this.foundSecrets.has('creature')) {
        this.foundSecrets.add('creature');
        this.game.dialogueSystem.showMessage(
          "A Strange Creature",
          "A curious sea creature blinks at you from the shallows. It seems friendly... and a little lost."
        );
      }
    }
    
    if (this.mysteryOrb) {
      this.mysteryOrb.rotation.y = elapsed * 0.5;
      this.mysteryOrb.rotation.z = Math.sin(elapsed * 0.7) * 0.2;
      
      const playerPos = this.game.character.group.position;
      const orbPos = this.mysteryOrb.position;
      const dist = playerPos.distanceTo(orbPos);
      
      if (dist < 10 && !this.foundSecrets.has('orb')) {
        this.foundSecrets.add('orb');
        this.game.dialogueSystem.showMessage(
          "The Sky Lantern",
          "An ancient light floats above the shrine. The elders say it's been here since the planet was young. It feels warm, like summer."
        );
      }
    }
    
    if (this.floatingIsland) {
      const playerPos = this.game.character.group.position;
      const islandPos = this.floatingIsland.position;
      const dist = playerPos.distanceTo(islandPos);
      
      if (dist < 30 && !this.foundSecrets.has('island')) {
        this.foundSecrets.add('island');
        this.game.dialogueSystem.showMessage(
          "The Wandering Isle",
          "High above the planet, a tiny island drifts in the sky. Purple crystals glimmer in the light. How does it stay up there?"
        );
      }
    }
  }

  public getFoundCount(): number {
    return this.foundSecrets.size;
  }

  public getTotalCount(): number {
    return 3;
  }
}
