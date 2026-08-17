import * as THREE from 'three';
import { Game } from '../core/Game';
import { ToonMaterial } from '../utils/ToonMaterial';
import { BiomeType } from './Planet';
import { PaintedTextures } from '../utils/PaintedTextures';
import { GROUND, MATERIAL, ACCENT, BUILDING } from '../utils/palette';

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
  private readonly creatureHome = new THREE.Vector3();
  private readonly creatureUp = new THREE.Vector3();
  private readonly lanternHome = new THREE.Vector3();
  private readonly lanternUp = new THREE.Vector3();
  private readonly lanternSway = new THREE.Vector3(1, 0, 0);

  constructor(game: Game) {
    this.game = game;
    this.createSecrets();
  }

  private createSecrets(): void {
    this.createFloatingIsland();
    this.createBeachCreature();
    this.createMysteryOrb();
  }

  /**
   * A scrap of hillside, not a cone on a grey disc.
   *
   * The village is painted kit. The old isle was a dodecahedron, a
   * cylinder and a pine cone, so it read as a different game. Same
   * cliff, orchard tree and bench as the ground, plus the crystals
   * that mark it as a secret.
   */
  private createFloatingIsland(): void {
    const island = new THREE.Group();

    const sod = new THREE.Mesh(
      new THREE.CylinderGeometry(1.68, 1.86, 0.26, 10),
      ToonMaterial.create({
        color: GROUND.hillside,
        map: PaintedTextures.get('grass', 2)
      })
    );
    sod.position.y = 0.1;
    sod.castShadow = true;
    sod.receiveShadow = true;
    island.add(sod);

    const soil = new THREE.Mesh(
      new THREE.CylinderGeometry(1.74, 1.48, 0.36, 10),
      ToonMaterial.create({
        color: MATERIAL.stone,
        map: PaintedTextures.get('rock', 2)
      })
    );
    soil.position.y = -0.16;
    soil.castShadow = true;
    island.add(soil);

    // Cliff_Rock is 5 × 4.15 × 2.5 m at the origin. Hang it under the sod
    // so the limestone reads as a torn-off chunk, not a grey flying saucer.
    const hungRock = this.plantOnIsle(island, 'Cliff_Rock', 0.34, 0.12, -1.22, 0.04, 0.4);
    this.plantOnIsle(island, 'Cliff_Rock', 0.22, -0.78, -0.78, 0.52, 2.05);
    const plantedTree = this.plantOnIsle(island, 'Tree_Orchard', 0.6, 0.22, 0.2, -0.14, -0.35);
    this.plantOnIsle(island, 'Bench', 0.7, -0.62, 0.2, 0.58, 2.35);

    if (!hungRock) this.fallbackIsleRock(island);
    if (!plantedTree) this.fallbackIsleTree(island);

    const crystalMat = ToonMaterial.create({
      color: ACCENT.lavender,
      emissive: ACCENT.lavender,
      emissiveIntensity: 0.45
    });
    for (let i = 0; i < 4; i++) {
      const crystal = new THREE.Mesh(new THREE.OctahedronGeometry(0.12, 0), crystalMat);
      const angle = (i / 4) * Math.PI * 2 + 0.4;
      crystal.position.set(Math.cos(angle) * 1.18, 0.38, Math.sin(angle) * 1.18);
      crystal.scale.y = 1.45;
      crystal.castShadow = true;
      island.add(crystal);
    }

    this.game.scene.add(island);
    this.floatingIsland = island;
    const tangent = new THREE.Vector3(0, 1, 0);
    if (Math.abs(this.islandAxis.dot(tangent)) > 0.9) tangent.set(1, 0, 0);
    this.islandEast.crossVectors(this.islandAxis, tangent).normalize();
    this.islandNorth.crossVectors(this.islandAxis, this.islandEast).normalize();
    this.placeIsland(0);
  }

  /** Sit a kit piece on the isle in local space. */
  private plantOnIsle(
    island: THREE.Group,
    name: string,
    scale: number,
    x: number,
    y: number,
    z: number,
    yaw = 0
  ): boolean {
    if (!this.game.kit?.isLoaded || !this.game.kit.has(name)) return false;
    const piece = this.game.kit.instance(name);
    if (!piece) return false;
    piece.scale.multiplyScalar(scale);
    piece.position.set(x, y, z);
    piece.rotation.y = yaw;
    island.add(piece);
    return true;
  }

  private fallbackIsleRock(island: THREE.Group): void {
    const lump = new THREE.Mesh(
      new THREE.DodecahedronGeometry(1.3, 0),
      ToonMaterial.create({
        color: MATERIAL.stone,
        map: PaintedTextures.get('rock', 2)
      })
    );
    lump.scale.set(1.12, 0.68, 1);
    lump.position.y = -0.52;
    lump.castShadow = true;
    island.add(lump);
  }

  private fallbackIsleTree(island: THREE.Group): void {
    const trunk = new THREE.Mesh(
      new THREE.CylinderGeometry(0.06, 0.1, 0.85, 6),
      ToonMaterial.create({ color: MATERIAL.trunk })
    );
    trunk.position.set(0.18, 0.64, -0.12);
    trunk.castShadow = true;
    island.add(trunk);

    const canopy = new THREE.Mesh(
      new THREE.IcosahedronGeometry(0.72, 1),
      ToonMaterial.create({
        color: MATERIAL.foliage,
        map: PaintedTextures.get('foliage')
      })
    );
    canopy.scale.y = 0.48;
    canopy.position.set(0.18, 1.2, -0.12);
    canopy.castShadow = true;
    island.add(canopy);
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

  /**
   * A painted lake otter, not a blue sphere with tentacles.
   *
   * The village animals are kit boxes; this one uses the same language
   * (long body, prism head, dash eyes) so the secret belongs in the pond
   * rather than a different game.
   */
  private createBeachCreature(): void {
    const creature = new THREE.Group();
    const piece = this.game.kit?.isLoaded
      ? this.game.kit.instance('Lake_Creature')
      : null;
    if (piece) creature.add(piece);
    else this.fallbackCreature(creature);

    // The "seaside" biome is grass, not water. Sit in the shallows of Le Lac
    // on the visible mesh / water plane, not at a flat planetRadius + 0.5.
    const lake = this.game.planet.areas.find(a => a.name === 'Le Lac');
    const lakePos = lake
      ? lake.center.clone().multiplyScalar(this.game.planet.radius)
      : this.game.planet.getBiomePosition(BiomeType.SEASIDE);
    const shore = this.game.planet.offsetOnSphere(lakePos, 1.15, 13.4);
    const up = this.sitSecret(creature, shore, 0.08);
    creature.quaternion.setFromUnitVectors(this.islandLocalUp, up);

    this.creatureHome.copy(creature.position);
    this.creatureUp.copy(up);
    creature.visible = false;
    this.game.scene.add(creature);
    this.beachCreature = creature;
  }

  private fallbackCreature(creature: THREE.Group): void {
    const hide = ToonMaterial.create({
      color: GROUND.water,
      map: PaintedTextures.get('plaster')
    });
    const belly = ToonMaterial.create({
      color: MATERIAL.stone,
      map: PaintedTextures.get('plaster')
    });
    const body = new THREE.Mesh(new THREE.BoxGeometry(0.38, 0.3, 0.74), hide);
    body.position.y = 0.28;
    body.castShadow = true;
    creature.add(body);
    const chest = new THREE.Mesh(new THREE.BoxGeometry(0.26, 0.12, 0.5), belly);
    chest.position.y = 0.16;
    creature.add(chest);
    const head = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.13, 0.18, 6), hide);
    head.position.set(0, 0.3, -0.56);
    creature.add(head);
  }

  /**
   * A paper shrine lantern, not a glowing sphere with torus rings.
   *
   * Same timber hoops and lime-render paper as the village joinery, with
   * a warm lamp inside. Local +Y stays radial so it hangs above the chapel
   * instead of tilting to world-Y.
   */
  private createMysteryOrb(): void {
    const orb = new THREE.Group();
    const piece = this.game.kit?.isLoaded
      ? this.game.kit.instance('Sky_Lantern')
      : null;
    if (piece) orb.add(piece);
    else this.fallbackLantern(orb);

    const shrine = this.game.planet.areas.find(a => a.name === 'La Chapelle')
      ?? this.game.planet.areas.find(a => a.name === 'Église Saint-Martin');
    const shrinePos = shrine
      ? shrine.center.clone().multiplyScalar(this.game.planet.radius)
      : this.game.planet.getBiomePosition(BiomeType.SHRINE);
    const up = this.sitSecret(orb, shrinePos, 6.4);
    orb.quaternion.setFromUnitVectors(this.islandLocalUp, up);

    this.lanternHome.copy(orb.position);
    this.lanternUp.copy(up);
    this.game.scene.add(orb);
    this.mysteryOrb = orb;
  }

  private fallbackLantern(orb: THREE.Group): void {
    const paper = ToonMaterial.create({
      color: BUILDING.trim,
      map: PaintedTextures.get('plaster')
    });
    const shade = new THREE.Mesh(new THREE.CylinderGeometry(0.24, 0.28, 0.55, 6), paper);
    shade.position.y = -0.3;
    shade.castShadow = true;
    orb.add(shade);
    const flame = new THREE.Mesh(
      new THREE.CylinderGeometry(0.1, 0.14, 0.22, 6),
      ToonMaterial.create({
        color: ACCENT.lamp,
        emissive: ACCENT.lamp,
        emissiveIntensity: 0.75
      })
    );
    flame.position.y = -0.28;
    orb.add(flame);
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
      const dist = playerPos.distanceTo(this.creatureHome);
      this.beachCreature.position.copy(this.creatureHome)
        .addScaledVector(this.creatureUp, Math.sin(elapsed * 1.6) * 0.07);
      this.beachCreature.quaternion.setFromUnitVectors(
        this.islandLocalUp,
        this.creatureUp
      );
      this.beachCreature.rotateOnAxis(this.islandLocalUp, Math.sin(elapsed * 0.9) * 0.16);

      if (dist < 15) {
        this.beachCreature.visible = true;
      }

      if (dist < 3.2) {
        this.discover(
          'creature',
          'A Strange Creature',
          'A curious lake otter blinks at you from the shallows. It seems friendly... and a little lost.'
        );
      }
    }

    if (this.mysteryOrb) {
      this.mysteryOrb.position.copy(this.lanternHome)
        .addScaledVector(this.lanternUp, Math.sin(elapsed * 0.8) * 0.12);
      this.mysteryOrb.quaternion.setFromUnitVectors(
        this.islandLocalUp,
        this.lanternUp
      );
      this.mysteryOrb.rotateOnAxis(this.islandLocalUp, elapsed * 0.28);
      this.mysteryOrb.rotateOnAxis(this.lanternSway, Math.sin(elapsed * 0.7) * 0.08);

      const dist = playerPos.distanceTo(this.lanternHome);
      if (dist < 10) {
        this.discover(
          'orb',
          'The Sky Lantern',
          "A paper lantern hangs above the shrine. The elders say it's been here since the planet was young. It feels warm, like summer."
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
          'A scrap of hillside drifts overhead — orchard tree, a bench, and purple crystals. How does it stay up there?'
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
