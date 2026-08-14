import * as THREE from 'three';
import { Game } from '../core/Game';
import { ToonMaterial } from '../utils/ToonMaterial';
import { BiomeType } from './Planet';

export interface NPC {
  name: string;
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
  }

  private createPostmasterMaple(): void {
    const position = this.getPositionInBiome(BiomeType.TOWN, 0, 5);
    const mesh = this.createNPCMesh({
      bodyColor: 0x3498db,
      hatColor: 0x2c3e50,
      hatStyle: 'cap',
      hasApron: false,
      hasBag: true
    });
    
    this.placeOnSphere(mesh, position);
    this.game.scene.add(mesh);
    
    this.npcs.push({
      name: 'Postmaster Maple',
      position,
      mesh,
      idleAnimation: (elapsed) => {
        mesh.children[0].rotation.y = Math.sin(elapsed * 0.5) * 0.1;
      },
      greetings: [
        "Welcome, young courier! Ready to deliver some letters?",
        "The mail must flow! Got a fresh batch for you.",
        "Ah, my favorite budbringer! Here's today's route."
      ],
      biome: BiomeType.TOWN
    });
  }

  private createFisherFinn(): void {
    const position = this.getPositionInBiome(BiomeType.SEASIDE, 0.5, 6);
    const mesh = this.createNPCMesh({
      bodyColor: 0xf39c12,
      hatColor: 0x7f8c8d,
      hatStyle: 'wide',
      hasApron: false,
      hasBag: false
    });
    
    const rod = this.createFishingRod();
    mesh.add(rod);
    
    this.placeOnSphere(mesh, position);
    this.game.scene.add(mesh);
    
    this.npcs.push({
      name: 'Fisher Finn',
      position,
      mesh,
      idleAnimation: (elapsed) => {
        const rod = mesh.children[mesh.children.length - 1];
        rod.rotation.z = Math.sin(elapsed * 1.5) * 0.15;
      },
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
    const position = midpoint.normalize().multiplyScalar(this.game.planetRadius);
    
    const mesh = this.createNPCMesh({
      bodyColor: 0x9b59b6,
      hatColor: 0x8e44ad,
      hatStyle: 'hood',
      hasApron: false,
      hasBag: false
    });
    
    this.placeOnSphere(mesh, position);
    this.game.scene.add(mesh);
    
    this.npcs.push({
      name: 'Hermit Hazel',
      position,
      mesh,
      idleAnimation: (elapsed) => {
        const body = mesh.children[0];
        body.rotation.x = Math.sin(elapsed * 0.8) * 0.03;
      },
      greetings: [
        "A visitor? How... unusual. What news from the world?",
        "The stars told me you'd come. They're rarely wrong.",
        "Hmm, another letter? The world hasn't forgotten me, it seems."
      ],
      biome: BiomeType.HILLSIDE
    });
  }

  private createKeeperKai(): void {
    const position = this.getPositionInBiome(BiomeType.SHRINE, Math.PI, 4);
    const mesh = this.createNPCMesh({
      bodyColor: 0xe74c3c,
      hatColor: 0xffeaa7,
      hatStyle: 'tall',
      hasApron: true,
      hasBag: false
    });
    
    this.placeOnSphere(mesh, position);
    this.game.scene.add(mesh);
    
    this.npcs.push({
      name: 'Keeper Kai',
      position,
      mesh,
      idleAnimation: (elapsed) => {
        const body = mesh.children[0];
        body.rotation.y = Math.sin(elapsed * 0.3) * 0.05;
      },
      greetings: [
        "Blessings upon you, little courier.",
        "The ancestors smile on those who bring good tidings.",
        "Welcome to the shrine. Your journey honors us."
      ],
      biome: BiomeType.SHRINE
    });
  }

  private createBakerBrie(): void {
    const position = this.getPositionInBiome(BiomeType.TOWN, Math.PI * 0.7, 6);
    const mesh = this.createNPCMesh({
      bodyColor: 0xecf0f1,
      hatColor: 0xffeaa7,
      hatStyle: 'chef',
      hasApron: true,
      hasBag: false
    });
    
    this.placeOnSphere(mesh, position);
    this.game.scene.add(mesh);
    
    this.npcs.push({
      name: 'Baker Brie',
      position,
      mesh,
      idleAnimation: (elapsed) => {
        mesh.children[0].position.y = 0.9 + Math.sin(elapsed * 2) * 0.02;
      },
      greetings: [
        "Fresh bread, warm heart! What brings you by?",
        "Careful, the rolls are still hot! Oh, a letter?",
        "The best things in life: good bread and good friends."
      ],
      biome: BiomeType.TOWN
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
    const skinMat = ToonMaterial.create({ color: 0xfad7a0 });
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
      const eyeMat = ToonMaterial.create({ color: 0x2c3e50 });
      const eye = new THREE.Mesh(eyeGeo, eyeMat);
      eye.position.set(i === 0 ? -0.12 : 0.12, 1.9, 0.28);
      npc.add(eye);
    }
    
    if (options.hasApron) {
      const apronGeo = new THREE.BoxGeometry(0.6, 0.5, 0.1);
      const apronMat = ToonMaterial.create({ color: 0xecf0f1 });
      const apron = new THREE.Mesh(apronGeo, apronMat);
      apron.position.set(0, 0.7, 0.35);
      npc.add(apron);
    }
    
    if (options.hasBag) {
      const bagGeo = new THREE.BoxGeometry(0.35, 0.4, 0.15);
      const bagMat = ToonMaterial.create({ color: 0x8b4513 });
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
    const poleMat = ToonMaterial.create({ color: 0x8b4513 });
    const pole = new THREE.Mesh(poleGeo, poleMat);
    pole.position.set(0.5, 1.2, 0.3);
    pole.rotation.z = -0.5;
    pole.rotation.x = 0.3;
    rod.add(pole);
    
    return rod;
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

  private placeOnSphere(object: THREE.Object3D, position: THREE.Vector3): void {
    const up = position.clone().normalize();
    object.position.copy(position);
    
    const defaultUp = new THREE.Vector3(0, 1, 0);
    const quaternion = new THREE.Quaternion().setFromUnitVectors(defaultUp, up);
    object.quaternion.copy(quaternion);
  }

  public update(_delta: number, elapsed: number): void {
    for (const npc of this.npcs) {
      npc.idleAnimation(elapsed);
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
