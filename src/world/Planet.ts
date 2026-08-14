import * as THREE from 'three';
import { ToonMaterial } from '../utils/ToonMaterial';

export enum BiomeType {
  VILLAGE,
  BEACH,
  HILLS,
  SHRINE
}

interface BiomeData {
  type: BiomeType;
  color: THREE.Color;
  center: THREE.Vector3;
  radius: number;
}

export class Planet {
  public mesh: THREE.Group;
  public radius: number;
  private sphere!: THREE.Mesh;
  public biomes: BiomeData[] = [];
  private decorations: THREE.Group;
  private foliage: THREE.Object3D[] = [];
  private windTime: number = 0;

  constructor(radius: number) {
    this.radius = radius;
    this.mesh = new THREE.Group();
    this.decorations = new THREE.Group();
    
    this.createPlanetSphere();
    this.defineBiomes();
    this.createDecorations();
    
    this.mesh.add(this.decorations);
  }

  private createPlanetSphere(): void {
    const geometry = new THREE.IcosahedronGeometry(this.radius, 5);
    
    const posAttr = geometry.getAttribute('position');
    const colors: number[] = [];
    
    for (let i = 0; i < posAttr.count; i++) {
      const x = posAttr.getX(i);
      const y = posAttr.getY(i);
      const z = posAttr.getZ(i);
      
      const pos = new THREE.Vector3(x, y, z);
      const color = this.getBiomeColorAtPosition(pos);
      colors.push(color.r, color.g, color.b);
    }
    
    geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
    
    const material = ToonMaterial.create({
      vertexColors: true,
      flatShading: false
    });
    
    this.sphere = new THREE.Mesh(geometry, material);
    this.sphere.receiveShadow = true;
    this.mesh.add(this.sphere);
  }

  private defineBiomes(): void {
    this.biomes = [
      {
        type: BiomeType.VILLAGE,
        color: new THREE.Color(0x7cb342),
        center: new THREE.Vector3(0, 1, 0).normalize(),
        radius: 0.4
      },
      {
        type: BiomeType.BEACH,
        color: new THREE.Color(0xf4d03f),
        center: new THREE.Vector3(0.7, 0.3, 0.5).normalize(),
        radius: 0.35
      },
      {
        type: BiomeType.HILLS,
        color: new THREE.Color(0x27ae60),
        center: new THREE.Vector3(-0.5, 0.5, 0.7).normalize(),
        radius: 0.45
      },
      {
        type: BiomeType.SHRINE,
        color: new THREE.Color(0x9b59b6).lerp(new THREE.Color(0x27ae60), 0.4),
        center: new THREE.Vector3(-0.6, -0.2, -0.7).normalize(),
        radius: 0.3
      }
    ];
  }

  private getBiomeColorAtPosition(pos: THREE.Vector3): THREE.Color {
    const normalizedPos = pos.clone().normalize();
    
    const baseGreen = new THREE.Color(0x4a7c59);
    let finalColor = baseGreen.clone();
    let totalWeight = 0;
    
    for (const biome of this.biomes) {
      const dist = normalizedPos.distanceTo(biome.center);
      if (dist < biome.radius) {
        const weight = 1 - (dist / biome.radius);
        const smoothWeight = weight * weight * (3 - 2 * weight);
        finalColor.lerp(biome.color, smoothWeight);
        totalWeight += smoothWeight;
      }
    }
    
    const noise = (Math.random() - 0.5) * 0.05;
    finalColor.r = Math.max(0, Math.min(1, finalColor.r + noise));
    finalColor.g = Math.max(0, Math.min(1, finalColor.g + noise));
    finalColor.b = Math.max(0, Math.min(1, finalColor.b + noise));
    
    return finalColor;
  }

  private createDecorations(): void {
    this.createVillage();
    this.createBeach();
    this.createHills();
    this.createShrine();
    this.createScatteredTrees();
  }

  private createVillage(): void {
    const biome = this.biomes.find(b => b.type === BiomeType.VILLAGE)!;
    const center = biome.center.clone().multiplyScalar(this.radius);
    
    for (let i = 0; i < 5; i++) {
      const angle = (i / 5) * Math.PI * 2;
      const dist = 3 + Math.random() * 2;
      const offset = this.getOffsetOnSphere(center, angle, dist);
      
      const house = this.createHouse();
      this.placeOnSphere(house, offset);
      this.decorations.add(house);
    }
    
    const well = this.createWell();
    this.placeOnSphere(well, center);
    this.decorations.add(well);
    
    const postOffice = this.createPostOffice();
    const postOffset = this.getOffsetOnSphere(center, 0, 5);
    this.placeOnSphere(postOffice, postOffset);
    this.decorations.add(postOffice);
  }

  private createHouse(): THREE.Group {
    const house = new THREE.Group();
    
    const bodyGeo = new THREE.BoxGeometry(2, 1.5, 2);
    const bodyMat = ToonMaterial.create({ color: 0xffeaa7 });
    const body = new THREE.Mesh(bodyGeo, bodyMat);
    body.position.y = 0.75;
    body.castShadow = true;
    body.receiveShadow = true;
    house.add(body);
    
    const roofGeo = new THREE.ConeGeometry(1.8, 1.2, 4);
    const roofMat = ToonMaterial.create({ color: 0xc0392b });
    const roof = new THREE.Mesh(roofGeo, roofMat);
    roof.position.y = 2.1;
    roof.rotation.y = Math.PI / 4;
    roof.castShadow = true;
    house.add(roof);
    
    const doorGeo = new THREE.BoxGeometry(0.5, 0.8, 0.1);
    const doorMat = ToonMaterial.create({ color: 0x8b4513 });
    const door = new THREE.Mesh(doorGeo, doorMat);
    door.position.set(0, 0.4, 1.05);
    house.add(door);
    
    return house;
  }

  private createPostOffice(): THREE.Group {
    const building = new THREE.Group();
    
    const bodyGeo = new THREE.BoxGeometry(3, 2, 2.5);
    const bodyMat = ToonMaterial.create({ color: 0xecf0f1 });
    const body = new THREE.Mesh(bodyGeo, bodyMat);
    body.position.y = 1;
    body.castShadow = true;
    body.receiveShadow = true;
    building.add(body);
    
    const roofGeo = new THREE.BoxGeometry(3.4, 0.3, 2.9);
    const roofMat = ToonMaterial.create({ color: 0x2c3e50 });
    const roof = new THREE.Mesh(roofGeo, roofMat);
    roof.position.y = 2.15;
    roof.castShadow = true;
    building.add(roof);
    
    const signGeo = new THREE.BoxGeometry(1.5, 0.4, 0.1);
    const signMat = ToonMaterial.create({ color: 0x3498db });
    const sign = new THREE.Mesh(signGeo, signMat);
    sign.position.set(0, 2.5, 1.3);
    building.add(sign);
    
    const mailboxGeo = new THREE.BoxGeometry(0.4, 0.6, 0.3);
    const mailboxMat = ToonMaterial.create({ color: 0xe74c3c });
    const mailbox = new THREE.Mesh(mailboxGeo, mailboxMat);
    mailbox.position.set(1.8, 0.5, 1);
    mailbox.castShadow = true;
    building.add(mailbox);
    
    return building;
  }

  private createWell(): THREE.Group {
    const well = new THREE.Group();
    
    const baseGeo = new THREE.CylinderGeometry(0.8, 0.9, 0.8, 12);
    const baseMat = ToonMaterial.create({ color: 0x7f8c8d });
    const base = new THREE.Mesh(baseGeo, baseMat);
    base.position.y = 0.4;
    base.castShadow = true;
    base.receiveShadow = true;
    well.add(base);
    
    const roofGeo = new THREE.ConeGeometry(1.2, 0.8, 6);
    const roofMat = ToonMaterial.create({ color: 0x8b4513 });
    const roof = new THREE.Mesh(roofGeo, roofMat);
    roof.position.y = 1.8;
    roof.castShadow = true;
    well.add(roof);
    
    for (let i = 0; i < 2; i++) {
      const postGeo = new THREE.BoxGeometry(0.1, 1.2, 0.1);
      const postMat = ToonMaterial.create({ color: 0x8b4513 });
      const post = new THREE.Mesh(postGeo, postMat);
      post.position.set(i === 0 ? -0.6 : 0.6, 1, 0);
      post.castShadow = true;
      well.add(post);
    }
    
    return well;
  }

  private createBeach(): void {
    const biome = this.biomes.find(b => b.type === BiomeType.BEACH)!;
    const center = biome.center.clone().multiplyScalar(this.radius);
    
    for (let i = 0; i < 4; i++) {
      const angle = (i / 4) * Math.PI * 2;
      const dist = 2 + Math.random() * 3;
      const offset = this.getOffsetOnSphere(center, angle, dist);
      
      const palm = this.createPalmTree();
      this.placeOnSphere(palm, offset);
      this.decorations.add(palm);
      this.foliage.push(palm);
    }
    
    const pier = this.createPier();
    const pierOffset = this.getOffsetOnSphere(center, Math.PI / 4, 4);
    this.placeOnSphere(pier, pierOffset);
    this.decorations.add(pier);
    
    const boat = this.createBoat();
    const boatOffset = this.getOffsetOnSphere(center, Math.PI / 3, 6);
    this.placeOnSphere(boat, boatOffset);
    this.decorations.add(boat);
  }

  private createPalmTree(): THREE.Group {
    const tree = new THREE.Group();
    
    const trunkGeo = new THREE.CylinderGeometry(0.15, 0.2, 3, 8);
    const trunkMat = ToonMaterial.create({ color: 0x8b7355 });
    const trunk = new THREE.Mesh(trunkGeo, trunkMat);
    trunk.position.y = 1.5;
    trunk.castShadow = true;
    tree.add(trunk);
    
    for (let i = 0; i < 6; i++) {
      const angle = (i / 6) * Math.PI * 2;
      const leafGeo = new THREE.ConeGeometry(0.3, 2, 4);
      const leafMat = ToonMaterial.create({ color: 0x27ae60 });
      const leaf = new THREE.Mesh(leafGeo, leafMat);
      leaf.position.set(
        Math.cos(angle) * 0.5,
        3,
        Math.sin(angle) * 0.5
      );
      leaf.rotation.x = Math.PI / 4;
      leaf.rotation.y = angle;
      leaf.castShadow = true;
      tree.add(leaf);
    }
    
    return tree;
  }

  private createPier(): THREE.Group {
    const pier = new THREE.Group();
    
    const deckGeo = new THREE.BoxGeometry(1.5, 0.2, 6);
    const deckMat = ToonMaterial.create({ color: 0x8b7355 });
    const deck = new THREE.Mesh(deckGeo, deckMat);
    deck.position.y = 0.5;
    deck.castShadow = true;
    deck.receiveShadow = true;
    pier.add(deck);
    
    for (let i = 0; i < 4; i++) {
      const postGeo = new THREE.CylinderGeometry(0.1, 0.1, 1.5, 6);
      const postMat = ToonMaterial.create({ color: 0x6b5344 });
      const post = new THREE.Mesh(postGeo, postMat);
      post.position.set(
        (i % 2 === 0 ? -0.5 : 0.5),
        0,
        -2 + i * 1.5
      );
      post.castShadow = true;
      pier.add(post);
    }
    
    return pier;
  }

  private createBoat(): THREE.Group {
    const boat = new THREE.Group();
    
    const hullGeo = new THREE.BoxGeometry(1, 0.5, 2.5);
    const hullMat = ToonMaterial.create({ color: 0xc0392b });
    const hull = new THREE.Mesh(hullGeo, hullMat);
    hull.position.y = 0.3;
    hull.castShadow = true;
    boat.add(hull);
    
    const mastGeo = new THREE.CylinderGeometry(0.05, 0.05, 2, 6);
    const mastMat = ToonMaterial.create({ color: 0x8b4513 });
    const mast = new THREE.Mesh(mastGeo, mastMat);
    mast.position.y = 1.5;
    mast.castShadow = true;
    boat.add(mast);
    
    const sailGeo = new THREE.BufferGeometry();
    const sailVerts = new Float32Array([
      0, 0.5, 0,
      0, 2.5, 0,
      0.8, 1.5, 0
    ]);
    sailGeo.setAttribute('position', new THREE.BufferAttribute(sailVerts, 3));
    sailGeo.computeVertexNormals();
    const sailMat = ToonMaterial.create({ color: 0xecf0f1, side: THREE.DoubleSide });
    const sail = new THREE.Mesh(sailGeo, sailMat);
    sail.castShadow = true;
    boat.add(sail);
    
    return boat;
  }

  private createHills(): void {
    const biome = this.biomes.find(b => b.type === BiomeType.HILLS)!;
    const center = biome.center.clone().multiplyScalar(this.radius);
    
    for (let i = 0; i < 8; i++) {
      const angle = (i / 8) * Math.PI * 2;
      const dist = 2 + Math.random() * 5;
      const offset = this.getOffsetOnSphere(center, angle, dist);
      
      const tree = this.createTree();
      this.placeOnSphere(tree, offset);
      this.decorations.add(tree);
      this.foliage.push(tree);
    }
    
    for (let i = 0; i < 5; i++) {
      const angle = Math.random() * Math.PI * 2;
      const dist = 1 + Math.random() * 4;
      const offset = this.getOffsetOnSphere(center, angle, dist);
      
      const rock = this.createRock();
      this.placeOnSphere(rock, offset);
      this.decorations.add(rock);
    }
    
    const lookout = this.createLookout();
    const lookoutOffset = this.getOffsetOnSphere(center, Math.PI, 3);
    this.placeOnSphere(lookout, lookoutOffset);
    this.decorations.add(lookout);
  }

  private createTree(): THREE.Group {
    const tree = new THREE.Group();
    
    const trunkGeo = new THREE.CylinderGeometry(0.2, 0.3, 2, 8);
    const trunkMat = ToonMaterial.create({ color: 0x8b4513 });
    const trunk = new THREE.Mesh(trunkGeo, trunkMat);
    trunk.position.y = 1;
    trunk.castShadow = true;
    tree.add(trunk);
    
    const foliageGeo = new THREE.IcosahedronGeometry(1.2, 1);
    const foliageMat = ToonMaterial.create({ color: 0x228b22 });
    const foliage = new THREE.Mesh(foliageGeo, foliageMat);
    foliage.position.y = 2.5;
    foliage.castShadow = true;
    tree.add(foliage);
    
    return tree;
  }

  private createRock(): THREE.Group {
    const rock = new THREE.Group();
    
    const geo = new THREE.DodecahedronGeometry(0.5 + Math.random() * 0.5, 0);
    const mat = ToonMaterial.create({ color: 0x7f8c8d });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.scale.y = 0.7;
    mesh.rotation.set(
      Math.random() * 0.5,
      Math.random() * Math.PI,
      Math.random() * 0.5
    );
    mesh.position.y = 0.3;
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    rock.add(mesh);
    
    return rock;
  }

  private createLookout(): THREE.Group {
    const lookout = new THREE.Group();
    
    const platformGeo = new THREE.CylinderGeometry(1.5, 1.5, 0.3, 8);
    const platformMat = ToonMaterial.create({ color: 0x8b7355 });
    const platform = new THREE.Mesh(platformGeo, platformMat);
    platform.position.y = 3;
    platform.castShadow = true;
    platform.receiveShadow = true;
    lookout.add(platform);
    
    for (let i = 0; i < 4; i++) {
      const angle = (i / 4) * Math.PI * 2;
      const postGeo = new THREE.CylinderGeometry(0.15, 0.15, 3, 6);
      const postMat = ToonMaterial.create({ color: 0x6b5344 });
      const post = new THREE.Mesh(postGeo, postMat);
      post.position.set(
        Math.cos(angle) * 1.2,
        1.5,
        Math.sin(angle) * 1.2
      );
      post.castShadow = true;
      lookout.add(post);
    }
    
    const railGeo = new THREE.TorusGeometry(1.3, 0.08, 8, 16);
    const railMat = ToonMaterial.create({ color: 0x8b7355 });
    const rail = new THREE.Mesh(railGeo, railMat);
    rail.position.y = 3.5;
    rail.rotation.x = Math.PI / 2;
    lookout.add(rail);
    
    return lookout;
  }

  private createShrine(): void {
    const biome = this.biomes.find(b => b.type === BiomeType.SHRINE)!;
    const center = biome.center.clone().multiplyScalar(this.radius);
    
    const shrine = this.createShrineBuilding();
    this.placeOnSphere(shrine, center);
    this.decorations.add(shrine);
    
    const gate = this.createToriiGate();
    const gateOffset = this.getOffsetOnSphere(center, 0, 6);
    this.placeOnSphere(gate, gateOffset);
    this.decorations.add(gate);
    
    for (let i = 0; i < 4; i++) {
      const angle = (i / 4) * Math.PI * 2 + Math.PI / 4;
      const dist = 3;
      const offset = this.getOffsetOnSphere(center, angle, dist);
      
      const lantern = this.createLantern();
      this.placeOnSphere(lantern, offset);
      this.decorations.add(lantern);
    }
  }

  private createShrineBuilding(): THREE.Group {
    const shrine = new THREE.Group();
    
    const baseGeo = new THREE.BoxGeometry(4, 0.5, 3);
    const baseMat = ToonMaterial.create({ color: 0x7f8c8d });
    const base = new THREE.Mesh(baseGeo, baseMat);
    base.position.y = 0.25;
    base.castShadow = true;
    base.receiveShadow = true;
    shrine.add(base);
    
    const bodyGeo = new THREE.BoxGeometry(3.5, 2, 2.5);
    const bodyMat = ToonMaterial.create({ color: 0xc0392b });
    const body = new THREE.Mesh(bodyGeo, bodyMat);
    body.position.y = 1.5;
    body.castShadow = true;
    shrine.add(body);
    
    const roofGeo = new THREE.BoxGeometry(4.5, 0.4, 3.5);
    const roofMat = ToonMaterial.create({ color: 0x2c3e50 });
    const roof = new THREE.Mesh(roofGeo, roofMat);
    roof.position.y = 2.7;
    roof.castShadow = true;
    shrine.add(roof);
    
    const roof2Geo = new THREE.BoxGeometry(3.8, 0.3, 3);
    const roof2 = new THREE.Mesh(roof2Geo, roofMat);
    roof2.position.y = 3.1;
    roof2.castShadow = true;
    shrine.add(roof2);
    
    return shrine;
  }

  private createToriiGate(): THREE.Group {
    const gate = new THREE.Group();
    
    const postMat = ToonMaterial.create({ color: 0xc0392b });
    
    for (let i = 0; i < 2; i++) {
      const postGeo = new THREE.CylinderGeometry(0.2, 0.25, 4, 8);
      const post = new THREE.Mesh(postGeo, postMat);
      post.position.set(i === 0 ? -1.5 : 1.5, 2, 0);
      post.castShadow = true;
      gate.add(post);
    }
    
    const beamGeo = new THREE.BoxGeometry(4, 0.3, 0.4);
    const beam = new THREE.Mesh(beamGeo, postMat);
    beam.position.y = 3.8;
    beam.castShadow = true;
    gate.add(beam);
    
    const beam2Geo = new THREE.BoxGeometry(3.5, 0.25, 0.35);
    const beam2 = new THREE.Mesh(beam2Geo, postMat);
    beam2.position.y = 3.2;
    beam2.castShadow = true;
    gate.add(beam2);
    
    return gate;
  }

  private createLantern(): THREE.Group {
    const lantern = new THREE.Group();
    
    const baseGeo = new THREE.CylinderGeometry(0.3, 0.4, 0.3, 6);
    const baseMat = ToonMaterial.create({ color: 0x7f8c8d });
    const base = new THREE.Mesh(baseGeo, baseMat);
    base.position.y = 0.15;
    base.castShadow = true;
    lantern.add(base);
    
    const stemGeo = new THREE.CylinderGeometry(0.08, 0.08, 1, 6);
    const stem = new THREE.Mesh(stemGeo, baseMat);
    stem.position.y = 0.8;
    stem.castShadow = true;
    lantern.add(stem);
    
    const lampGeo = new THREE.BoxGeometry(0.5, 0.5, 0.5);
    const lampMat = ToonMaterial.create({ color: 0xffeaa7, emissive: 0xffa500, emissiveIntensity: 0.3 });
    const lamp = new THREE.Mesh(lampGeo, lampMat);
    lamp.position.y = 1.55;
    lamp.castShadow = true;
    lantern.add(lamp);
    
    const topGeo = new THREE.ConeGeometry(0.4, 0.3, 4);
    const top = new THREE.Mesh(topGeo, baseMat);
    top.position.y = 1.95;
    top.rotation.y = Math.PI / 4;
    top.castShadow = true;
    lantern.add(top);
    
    return lantern;
  }

  private createScatteredTrees(): void {
    for (let i = 0; i < 15; i++) {
      const theta = Math.random() * Math.PI * 2;
      const phi = Math.acos(2 * Math.random() - 1);
      
      const pos = new THREE.Vector3(
        Math.sin(phi) * Math.cos(theta),
        Math.cos(phi),
        Math.sin(phi) * Math.sin(theta)
      ).multiplyScalar(this.radius);
      
      let tooClose = false;
      for (const biome of this.biomes) {
        const biomeCenter = biome.center.clone().multiplyScalar(this.radius);
        if (pos.distanceTo(biomeCenter) < biome.radius * this.radius * 0.8) {
          tooClose = true;
          break;
        }
      }
      
      if (!tooClose) {
        const tree = Math.random() > 0.3 ? this.createTree() : this.createRock();
        this.placeOnSphere(tree, pos);
        this.decorations.add(tree);
        if (tree.children.length > 1) {
          this.foliage.push(tree);
        }
      }
    }
  }

  private getOffsetOnSphere(center: THREE.Vector3, angle: number, distance: number): THREE.Vector3 {
    const up = center.clone().normalize();
    
    let tangent = new THREE.Vector3(0, 1, 0);
    if (Math.abs(up.dot(tangent)) > 0.99) {
      tangent = new THREE.Vector3(1, 0, 0);
    }
    
    const right = new THREE.Vector3().crossVectors(up, tangent).normalize();
    const forward = new THREE.Vector3().crossVectors(right, up).normalize();
    
    const offset = new THREE.Vector3()
      .addScaledVector(forward, Math.cos(angle) * distance)
      .addScaledVector(right, Math.sin(angle) * distance);
    
    const newPos = center.clone().add(offset);
    return newPos.normalize().multiplyScalar(this.radius);
  }

  private placeOnSphere(object: THREE.Object3D, position: THREE.Vector3): void {
    const up = position.clone().normalize();
    
    object.position.copy(position);
    
    const defaultUp = new THREE.Vector3(0, 1, 0);
    const quaternion = new THREE.Quaternion().setFromUnitVectors(defaultUp, up);
    object.quaternion.copy(quaternion);
    
    object.rotateY(Math.random() * Math.PI * 2);
  }

  public getSpawnPosition(): THREE.Vector3 {
    const villageCenter = this.biomes.find(b => b.type === BiomeType.VILLAGE)!.center;
    return villageCenter.clone().multiplyScalar(this.radius + 0.5);
  }

  public getBiomePosition(biome: BiomeType): THREE.Vector3 {
    const biomeData = this.biomes.find(b => b.type === biome)!;
    return biomeData.center.clone().multiplyScalar(this.radius);
  }

  public getSurfacePosition(direction: THREE.Vector3): THREE.Vector3 {
    return direction.clone().normalize().multiplyScalar(this.radius);
  }

  public update(elapsed: number): void {
    this.windTime = elapsed;
    
    for (const tree of this.foliage) {
      const pos = tree.position;
      const windOffset = Math.sin(this.windTime * 2 + pos.x * 0.5) * 0.02;
      const windOffset2 = Math.cos(this.windTime * 1.5 + pos.z * 0.5) * 0.015;
      
      tree.rotation.x = windOffset;
      tree.rotation.z = windOffset2;
    }
  }
}
