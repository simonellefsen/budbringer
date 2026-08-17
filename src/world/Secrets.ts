import * as THREE from 'three';
import { Game } from '../core/Game';
import { ToonMaterial } from '../utils/ToonMaterial';
import { BiomeType } from './Planet';

export class Secrets {
  private game: Game;
  private floatingIsland: THREE.Group | null = null;
  private beachCreature: THREE.Group | null = null;
  private mysteryOrb: THREE.Group | null = null;
  private foundSecrets: Set<string> = new Set();
  private gameStartTime: number = -1;
  /** Tilted so the isle tours the globe instead of sitting on +Y (the village). */
  private readonly islandAxis = new THREE.Vector3(0.38, 0.52, 0.76).normalize();
  private readonly islandEast = new THREE.Vector3();
  private readonly islandNorth = new THREE.Vector3();
  private readonly islandDir = new THREE.Vector3();
  private readonly islandLocalUp = new THREE.Vector3(0, 1, 0);

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
    
    this.game.scene.add(island);
    this.floatingIsland = island;
    let tangent = new THREE.Vector3(0, 1, 0);
    if (Math.abs(this.islandAxis.dot(tangent)) > 0.9) tangent.set(1, 0, 0);
    this.islandEast.crossVectors(this.islandAxis, tangent).normalize();
    this.islandNorth.crossVectors(this.islandAxis, this.islandEast).normalize();
    this.placeIsland(0);
  }

  /**
   * Walk the isle around the planet on a tilted great circle.
   *
   * World +Y is the village, so parking it at (0, R+50, 0) left a rock
   * hanging over the square. Local +Y stays radial so the tree stands
   * "up" from the globe.
   */
  private placeIsland(elapsed: number): void {
    if (!this.floatingIsland) return;
    const a = elapsed * 0.065;
    this.islandDir.copy(this.islandEast).multiplyScalar(Math.cos(a))
      .addScaledVector(this.islandNorth, Math.sin(a));
    const r = this.game.planetRadius + 15.2 + Math.sin(elapsed * 0.28) * 1.1;
    this.floatingIsland.position.copy(this.islandDir).multiplyScalar(r);
    this.floatingIsland.quaternion.setFromUnitVectors(
      this.islandLocalUp,
      this.islandDir
    );
    this.floatingIsland.rotateOnAxis(this.islandLocalUp, elapsed * 0.12);
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
    
    // The "seaside" biome is grass, not water. Sit in the shallows of Le Lac
    // on the visible mesh / water plane, not at a flat planetRadius + 0.5.
    const lake = this.game.planet.areas.find(a => a.name === 'Le Lac');
    const lakePos = lake
      ? lake.center.clone().multiplyScalar(this.game.planet.radius)
      : this.game.planet.getBiomePosition(BiomeType.SEASIDE);
    const shore = this.game.planet.offsetOnSphere(lakePos, 1.15, 13.4);
    const up = this.sitSecret(creature, shore, 0.22);
    creature.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), up);
    
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
    
    const shrine = this.game.planet.areas.find(a => a.name === 'La Chapelle')
      ?? this.game.planet.areas.find(a => a.name === 'Église Saint-Martin');
    const shrinePos = shrine
      ? shrine.center.clone().multiplyScalar(this.game.planet.radius)
      : this.game.planet.getBiomePosition(BiomeType.SHRINE);
    this.sitSecret(orb, shrinePos, 6.4);
    
    this.game.scene.add(orb);
    this.mysteryOrb = orb;
  }

  public update(elapsed: number): void {
    this.placeIsland(elapsed);

    if (this.gameStartTime < 0) {
      this.gameStartTime = elapsed;
    }
    const timeSinceStart = elapsed - this.gameStartTime;
    if (timeSinceStart < 8) return;
    
    const playerPos = this.game.character.group.position;
    const playerDist = playerPos.length();
    if (playerDist < this.game.planetRadius * 0.5 || playerDist > this.game.planetRadius * 2) {
      return;
    }
    
    if (this.beachCreature) {
      const playerPos = this.game.character.group.position;
      const creaturePos = this.beachCreature.position;
      const dist = playerPos.distanceTo(creaturePos);
      
      if (dist < 15) {
        this.beachCreature.visible = true;
        this.beachCreature.children.forEach((child: THREE.Object3D, i: number) => {
          if (i > 2) {
            child.rotation.x = Math.sin(elapsed * 3 + i) * 0.3;
          }
        });
      }

      if (dist < 3) {
        this.discover(
          'creature',
          'A Strange Creature',
          'A curious sea creature blinks at you from the shallows. It seems friendly... and a little lost.'
        );
      }
    }
    
    if (this.mysteryOrb) {
      this.mysteryOrb.rotation.y = elapsed * 0.5;
      this.mysteryOrb.rotation.z = Math.sin(elapsed * 0.7) * 0.2;
      
      const playerPos = this.game.character.group.position;
      const orbPos = this.mysteryOrb.position;
      const dist = playerPos.distanceTo(orbPos);
      
      if (dist < 10) {
        this.discover(
          'orb',
          'The Sky Lantern',
          "An ancient light floats above the shrine. The elders say it's been here since the planet was young. It feels warm, like summer."
        );
      }
    }
    
    if (this.floatingIsland) {
      const islandPos = this.floatingIsland.position;
      const dist = playerPos.distanceTo(islandPos);
      
      if (dist < 14) {
        this.discover(
          'island',
          'The Wandering Isle',
          'High above the planet, a tiny island drifts in the sky. Purple crystals glimmer in the light. How does it stay up there?'
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

  /**
   * Sit an object on the grass you see, or on the water if that is higher.
   *
   * Secrets used `planetRadius + 0.5`, which hovers on a ridge and sinks
   * in a valley. The creature belongs in the shallows; the lantern hangs
   * a few metres above the shrine ground.
   */
  private sitSecret(
    object: THREE.Object3D,
    near: THREE.Vector3,
    extra: number
  ): THREE.Vector3 {
    const planet = this.game.planet;
    const dir = near.clone().normalize();
    const grass = planet.meshRadiusAt(dir);
    const water = planet.radius + planet.terrain.waterLevel + 0.55;
    const r = Math.max(grass, water) + extra;
    object.position.copy(dir.clone().multiplyScalar(r));
    return dir;
  }

  public captureSave(): string[] {
    return [...this.foundSecrets];
  }

  public applySave(ids: string[] | undefined): void {
    if (!ids) return;
    const known = new Set(['creature', 'orb', 'island']);
    for (const id of ids) {
      if (known.has(id)) this.foundSecrets.add(id);
    }
  }

  private discover(id: string, title: string, body: string): void {
    if (this.foundSecrets.has(id)) return;
    this.foundSecrets.add(id);
    this.game.persistMap();
    this.game.dialogueSystem.showMessage(title, body);
  }
}
