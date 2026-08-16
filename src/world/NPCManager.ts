import * as THREE from 'three';
import { Game } from '../core/Game';
import { ToonMaterial } from '../utils/ToonMaterial';
import { NPC as NPC_COLOR, MATERIAL, ACCENT } from '../utils/palette';
import { RiggedFigure } from './Characters';
import { BiomeType } from './Planet';

export interface NPC {
  name: string;
  figure?: RiggedFigure | null;
  position: THREE.Vector3;
  mesh: THREE.Group;
  idleAnimation: (elapsed: number) => void;
  greetings: string[];
  biome: BiomeType;
}

export class NPCManager {
  private game: Game;
  public npcs: NPC[] = [];
  private interactionDistance: number = 6;

  constructor(game: Game) {
    this.game = game;
    this.createNPCs();
  }

  private createNPCs(): void {
    this.createPostmasterMaple();
    this.createFisherFinn();
    this.createHermitHazel();
    this.createKeeperKai();
    this.createBakerBrie();
    this.createShepherdSylvie();
  }

  private createPostmasterMaple(): void {
    const position = this.positionAt('post',
      () => this.getPositionInBiome(BiomeType.TOWN, 0, 5));
    const built = this.buildVillager('Postmaster Maple', {
      bodyColor: NPC_COLOR.maple,
      hatColor: MATERIAL.metalDark,
      hatStyle: 'cap',
      hasApron: false,
      hasBag: true
    });
    const mesh = built.mesh;
    
    this.placeOnSphere(mesh, position);
    this.game.scene.add(mesh);
    
    this.npcs.push({
      name: 'Postmaster Maple',
      position,
      mesh,
      figure: built.figure,
      idleAnimation: () => {},
      greetings: [
        "Welcome, young courier! Ready to deliver some letters?",
        "The mail must flow! Got a fresh batch for you.",
        "Ah, my favorite postilion! Here's today's route."
      ],
      biome: BiomeType.TOWN
    });
  }

  private createFisherFinn(): void {
    const position = this.positionAt('riverbank',
      () => this.getPositionInBiome(BiomeType.SEASIDE, 0.5, 6));
    const built = this.buildVillager('Fisher Finn', {
      bodyColor: NPC_COLOR.finn,
      hatColor: MATERIAL.stone,
      hatStyle: 'wide',
      hasApron: false,
      hasBag: false
    });
    const mesh = built.mesh;
    
    const rod = this.createFishingRod();
    mesh.add(rod);
    
    this.placeOnSphere(mesh, position);
    this.game.scene.add(mesh);
    
    this.npcs.push({
      name: 'Fisher Finn',
      position,
      mesh,
      figure: built.figure,
      idleAnimation: () => {},
      greetings: [
        "Quiet today. Fish aren't biting, but letters are welcome.",
        "Ho there! Come to help an old fisher?",
        "Best spot on the whole planet, right here."
      ],
      biome: BiomeType.SEASIDE
    });
  }

  private createHermitHazel(): void {
    const hillsBiome = this.game.planet.getBiomePosition(BiomeType.HILLSIDE);
    const beachBiome = this.game.planet.getBiomePosition(BiomeType.SEASIDE);
    const midpoint = hillsBiome.clone().add(beachBiome).multiplyScalar(0.5);
    const position = this.positionAt('outskirts',
      () => midpoint.normalize().multiplyScalar(this.game.planetRadius));
    
    const built = this.buildVillager('Hermit Hazel', {
      bodyColor: NPC_COLOR.hazel,
      hatColor: NPC_COLOR.hazel,
      hatStyle: 'hood',
      hasApron: false,
      hasBag: false
    });
    const mesh = built.mesh;
    
    this.placeOnSphere(mesh, position);
    this.game.scene.add(mesh);
    
    this.npcs.push({
      name: 'Hermit Hazel',
      position,
      mesh,
      figure: built.figure,
      idleAnimation: () => {},
      greetings: [
        "A visitor? How... unusual. What news from the world?",
        "The stars told me you'd come. They're rarely wrong.",
        "Hmm, another letter? The world hasn't forgotten me, it seems."
      ],
      biome: BiomeType.HILLSIDE
    });
  }

  private createKeeperKai(): void {
    const position = this.positionAt('church',
      () => this.getPositionInBiome(BiomeType.SHRINE, Math.PI, 4));
    const built = this.buildVillager('Keeper Kai', {
      bodyColor: NPC_COLOR.kai,
      hatColor: ACCENT.lamp,
      hatStyle: 'tall',
      hasApron: true,
      hasBag: false
    });
    const mesh = built.mesh;
    
    this.placeOnSphere(mesh, position);
    this.game.scene.add(mesh);
    
    this.npcs.push({
      name: 'Keeper Kai',
      position,
      mesh,
      figure: built.figure,
      idleAnimation: () => {},
      greetings: [
        "Blessings upon you, little courier.",
        "The ancestors smile on those who bring good tidings.",
        "Welcome to the shrine. Your journey honors us."
      ],
      biome: BiomeType.SHRINE
    });
  }

  private createBakerBrie(): void {
    const position = this.positionAt('bakery',
      () => this.getPositionInBiome(BiomeType.TOWN, Math.PI * 0.7, 6));
    const built = this.buildVillager('Baker Brie', {
      bodyColor: NPC_COLOR.brie,
      hatColor: ACCENT.lamp,
      hatStyle: 'chef',
      hasApron: true,
      hasBag: false
    });
    const mesh = built.mesh;
    
    this.placeOnSphere(mesh, position);
    this.game.scene.add(mesh);
    
    this.npcs.push({
      name: 'Baker Brie',
      position,
      mesh,
      figure: built.figure,
      idleAnimation: () => {},
      greetings: [
        "Fresh bread, warm heart! What brings you by?",
        "Careful, the rolls are still hot! Oh, a letter?",
        "The best things in life: good bread and good friends."
      ],
      biome: BiomeType.TOWN
    });
  }

  /**
   * Which modelled villager stands in for each named character. Dialogue stays
   * in English; only the shop signage around them is French.
   */
  private static readonly FIGURE_FOR: Record<string, string> = {
    'Postmaster Maple': 'Villager_Postmaster',
    'Baker Brie': 'Villager_Baker',
    'Fisher Finn': 'Villager_Fisher',
    'Hermit Hazel': 'Villager_Artist',
    'Keeper Kai': 'Villager_Keeper',
    'Shepherd Sylvie': 'Villager_Shepherd'
  };

  /**
   * A villager. Uses the Blender figure when characters.glb loaded, and falls
   * back to the old capsule-and-hat assembly otherwise.
   */
  private buildVillager(name: string, options: {
    bodyColor: number;
    hatColor: number;
    hatStyle: string;
    hasApron: boolean;
    hasBag: boolean;
  }): { mesh: THREE.Group; figure: RiggedFigure | null } {
    const figureName = NPCManager.FIGURE_FOR[name];
    const characters = this.game.characters;

    if (figureName && characters?.isLoaded && characters.has(figureName)) {
      const rigged = characters.instance(figureName);
      if (rigged) {
        const holder = new THREE.Group();
        holder.add(rigged.root);
        return { mesh: holder, figure: rigged };
      }
    }

    return { mesh: this.createNPCMesh(options), figure: null };
  }

  private createShepherdSylvie(): void {
    const position = this.positionAt('farm',
      () => this.getPositionInBiome(BiomeType.HILLSIDE, 1.1, 12));

    const built = this.buildVillager('Shepherd Sylvie', {
      bodyColor: 0x7c6a4e,
      hatColor: 0x9a8763,
      hatStyle: 'wide',
      hasApron: false,
      hasBag: true
    });
    const mesh = built.mesh;

    this.placeOnSphere(mesh, position);
    this.game.scene.add(mesh);

    this.npcs.push({
      name: 'Shepherd Sylvie',
      position,
      mesh,
      figure: built.figure,
      idleAnimation: () => {},
      greetings: [
        "Mind the goats, they'll eat a letter if you let them.",
        "Twenty-two sheep this morning. Twenty-one now. It's always the same one.",
        "Come far? The walk up here sorts out who really wants to visit."
      ],
      biome: BiomeType.HILLSIDE
    });
  }

  private createNPCMesh(options: {
    bodyColor: number;
    hatColor: number;
    hatStyle: string;
    hasApron: boolean;
    hasBag: boolean;
  }): THREE.Group {
    const npc = new THREE.Group();
    
    const bodyGeo = new THREE.CapsuleGeometry(0.4, 0.8, 8, 16);
    const bodyMat = ToonMaterial.create({ color: options.bodyColor });
    const body = new THREE.Mesh(bodyGeo, bodyMat);
    body.position.y = 0.9;
    body.castShadow = true;
    npc.add(body);
    
    const headGeo = new THREE.SphereGeometry(0.35, 16, 16);
    const skinMat = ToonMaterial.create({ color: NPC_COLOR.skin });
    const head = new THREE.Mesh(headGeo, skinMat);
    head.position.y = 1.85;
    head.castShadow = true;
    npc.add(head);
    
    const hatMat = ToonMaterial.create({ color: options.hatColor });
    let hat: THREE.Mesh;
    
    switch (options.hatStyle) {
      case 'cap':
        const capGeo = new THREE.SphereGeometry(0.38, 16, 8, 0, Math.PI * 2, 0, Math.PI / 2);
        hat = new THREE.Mesh(capGeo, hatMat);
        hat.position.y = 1.95;
        const brimGeo = new THREE.CylinderGeometry(0.25, 0.3, 0.05, 16);
        const brim = new THREE.Mesh(brimGeo, hatMat);
        brim.position.set(0, 1.9, 0.2);
        brim.rotation.x = -0.3;
        npc.add(brim);
        break;
      case 'wide':
        const wideGeo = new THREE.CylinderGeometry(0.5, 0.6, 0.15, 16);
        hat = new THREE.Mesh(wideGeo, hatMat);
        hat.position.y = 2.15;
        break;
      case 'hood':
        const hoodGeo = new THREE.ConeGeometry(0.4, 0.5, 8);
        hat = new THREE.Mesh(hoodGeo, hatMat);
        hat.position.y = 2.15;
        break;
      case 'tall':
        const tallGeo = new THREE.CylinderGeometry(0.3, 0.35, 0.6, 8);
        hat = new THREE.Mesh(tallGeo, hatMat);
        hat.position.y = 2.35;
        break;
      case 'chef':
        const chefGeo = new THREE.CylinderGeometry(0.35, 0.3, 0.4, 16);
        hat = new THREE.Mesh(chefGeo, hatMat);
        hat.position.y = 2.2;
        const puffGeo = new THREE.SphereGeometry(0.35, 16, 16);
        const puff = new THREE.Mesh(puffGeo, hatMat);
        puff.position.y = 2.45;
        puff.scale.y = 0.7;
        npc.add(puff);
        break;
      default:
        const defaultGeo = new THREE.ConeGeometry(0.35, 0.4, 8);
        hat = new THREE.Mesh(defaultGeo, hatMat);
        hat.position.y = 2.15;
    }
    
    hat.castShadow = true;
    npc.add(hat);
    
    for (let i = 0; i < 2; i++) {
      const eyeGeo = new THREE.SphereGeometry(0.06, 8, 8);
      const eyeMat = ToonMaterial.create({ color: NPC_COLOR.eye });
      const eye = new THREE.Mesh(eyeGeo, eyeMat);
      eye.position.set(i === 0 ? -0.12 : 0.12, 1.9, 0.28);
      npc.add(eye);
    }
    
    if (options.hasApron) {
      const apronGeo = new THREE.BoxGeometry(0.6, 0.5, 0.1);
      const apronMat = ToonMaterial.create({ color: NPC_COLOR.apron });
      const apron = new THREE.Mesh(apronGeo, apronMat);
      apron.position.set(0, 0.7, 0.35);
      npc.add(apron);
    }
    
    if (options.hasBag) {
      const bagGeo = new THREE.BoxGeometry(0.35, 0.4, 0.15);
      const bagMat = ToonMaterial.create({ color: MATERIAL.woodDark });
      const bag = new THREE.Mesh(bagGeo, bagMat);
      bag.position.set(-0.4, 0.8, 0);
      bag.rotation.z = 0.3;
      bag.castShadow = true;
      npc.add(bag);
    }
    
    return npc;
  }

  private createFishingRod(): THREE.Group {
    const rod = new THREE.Group();
    
    const poleGeo = new THREE.CylinderGeometry(0.02, 0.03, 2.5, 6);
    const poleMat = ToonMaterial.create({ color: MATERIAL.wood });
    const pole = new THREE.Mesh(poleGeo, poleMat);
    pole.position.set(0.5, 1.2, 0.3);
    pole.rotation.z = -0.5;
    pole.rotation.x = 0.3;
    rod.add(pole);
    
    return rod;
  }

  /**
   * Where a villager stands.
   *
   * Positions used to be fixed bearings and distances from a biome centre,
   * computed with no knowledge of what the world generator had actually built
   * there. Once the church, square and farm went in, that put the baker inside
   * the nave and the fisher inside a tree. Each villager now takes a named
   * anchor the generator registered next to the building they belong to.
   */
  private positionAt(anchor: string, fallback: () => THREE.Vector3): THREE.Vector3 {
    const at = this.game.planet.anchors.get(anchor);
    return at ? at.clone() : fallback();
  }

  private getPositionInBiome(biome: BiomeType, angle: number, distance: number): THREE.Vector3 {
    const biomeCenter = this.game.planet.getBiomePosition(biome);
    const up = biomeCenter.clone().normalize();
    
    let tangent = new THREE.Vector3(0, 1, 0);
    if (Math.abs(up.dot(tangent)) > 0.99) {
      tangent = new THREE.Vector3(1, 0, 0);
    }
    
    const right = new THREE.Vector3().crossVectors(up, tangent).normalize();
    const forward = new THREE.Vector3().crossVectors(right, up).normalize();
    
    const offset = new THREE.Vector3()
      .addScaledVector(forward, Math.cos(angle) * distance)
      .addScaledVector(right, Math.sin(angle) * distance);
    
    const newPos = biomeCenter.clone().add(offset);
    return newPos.normalize().multiplyScalar(this.game.planetRadius);
  }

  /**
   * Stand a villager on the surface, facing the middle of the village.
   *
   * setFromUnitVectors alone only aligns the up axis; the yaw it leaves behind
   * is whatever the shortest arc happens to give, so villagers ended up facing
   * walls at arbitrary angles. The modelled figures front on +Z, so build the
   * basis explicitly and point that at the village.
   */
  private placeOnSphere(object: THREE.Object3D, position: THREE.Vector3): void {
    const up = position.clone().normalize();
    object.position.copy(position);

    const lookAt = this.game.planet.getBiomePosition(BiomeType.TOWN);
    const forward = lookAt.clone().sub(position);
    forward.sub(up.clone().multiplyScalar(forward.dot(up)));

    if (forward.lengthSq() < 1e-8) {
      forward.set(0, 1, 0).sub(up.clone().multiplyScalar(up.y));
      if (forward.lengthSq() < 1e-8) forward.set(1, 0, 0);
    }
    forward.normalize();

    const right = new THREE.Vector3().crossVectors(up, forward).normalize();
    const matrix = new THREE.Matrix4().makeBasis(right, up, forward);
    object.quaternion.setFromRotationMatrix(matrix);
  }

  /**
   * Idle motion for the villagers: a slow breathing sway on the whole figure
   * and a little arm drift, so a stationary NPC does not read as a statue.
   *
   * Driven off the rig's named parts where there is one; the per-NPC
   * idleAnimation callbacks that poked mesh.children[0] no longer apply, since
   * a modelled villager's child zero is a torso mesh rather than a body group.
   */
  public update(_delta: number, elapsed: number): void {
    for (let i = 0; i < this.npcs.length; i++) {
      const npc = this.npcs[i];
      npc.idleAnimation(elapsed);

      const figure = npc.figure;
      if (!figure) continue;

      const phase = elapsed * 1.1 + i * 1.7;
      figure.root.position.y = Math.sin(phase) * 0.014;
      if (figure.head) {
        figure.head.rotation.y = Math.sin(phase * 0.45) * 0.22;
      }
      if (figure.armL) figure.armL.rotation.x = Math.sin(phase * 0.6) * 0.05;
      if (figure.armR) figure.armR.rotation.x = -Math.sin(phase * 0.6) * 0.05;
    }
  }

  public getNearestNPC(position: THREE.Vector3): NPC | null {
    let nearest: NPC | null = null;
    let nearestDist = this.interactionDistance;
    
    const playerDir = position.clone().normalize();
    const planetRadius = this.game.planetRadius;
    
    for (const npc of this.npcs) {
      if (!npc.position || npc.position.lengthSq() < 0.01) {
        continue;
      }
      
      const npcWorldPos = npc.mesh.position.clone();
      if (npcWorldPos.lengthSq() < 0.01) {
        continue;
      }
      
      const npcDir = npcWorldPos.normalize();
      const dot = Math.max(-1, Math.min(1, playerDir.dot(npcDir)));
      const angle = Math.acos(dot);
      const arcDist = planetRadius * angle;
      
      if (arcDist < nearestDist) {
        nearestDist = arcDist;
        nearest = npc;
      }
    }
    
    return nearest;
  }

  public getNPCByName(name: string): NPC | null {
    return this.npcs.find(npc => npc.name === name) || null;
  }

  public getRandomGreeting(npc: NPC): string {
    const index = Math.floor(Math.random() * npc.greetings.length);
    return npc.greetings[index];
  }
}
