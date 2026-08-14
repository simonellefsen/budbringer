import * as THREE from 'three';
import { ToonMaterial } from '../utils/ToonMaterial';
import { OutlineMaterial } from '../utils/OutlineMaterial';

export enum BiomeType {
  TOWN,
  SEASIDE,
  HILLSIDE,
  SHRINE
}

const OUTLINE_OPTS = { thickness: 0.04, wobble: 0.008 };

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
  private clouds: THREE.Group;

  constructor(radius: number) {
    this.radius = radius;
    this.mesh = new THREE.Group();
    this.decorations = new THREE.Group();
    this.clouds = new THREE.Group();
    
    this.createPlanetSphere();
    this.defineBiomes();
    this.createRoads();
    this.createDecorations();
    this.createClouds();
    
    this.mesh.add(this.decorations);
    this.mesh.add(this.clouds);
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
        type: BiomeType.TOWN,
        color: new THREE.Color(0x8a9a7b),
        center: new THREE.Vector3(0, 1, 0).normalize(),
        radius: 0.45
      },
      {
        type: BiomeType.SEASIDE,
        color: new THREE.Color(0xc4b99a),
        center: new THREE.Vector3(0.7, 0.3, 0.5).normalize(),
        radius: 0.35
      },
      {
        type: BiomeType.HILLSIDE,
        color: new THREE.Color(0x7a9a6b),
        center: new THREE.Vector3(-0.5, 0.5, 0.7).normalize(),
        radius: 0.45
      },
      {
        type: BiomeType.SHRINE,
        color: new THREE.Color(0x6a8a7b),
        center: new THREE.Vector3(-0.6, -0.2, -0.7).normalize(),
        radius: 0.35
      }
    ];
  }

  private getBiomeColorAtPosition(pos: THREE.Vector3): THREE.Color {
    const normalizedPos = pos.clone().normalize();
    
    const baseGreen = new THREE.Color(0x6a7a5b);
    let finalColor = baseGreen.clone();
    
    for (const biome of this.biomes) {
      const dist = normalizedPos.distanceTo(biome.center);
      if (dist < biome.radius) {
        const weight = 1 - (dist / biome.radius);
        const smoothWeight = weight * weight * (3 - 2 * weight);
        finalColor.lerp(biome.color, smoothWeight);
      }
    }
    
    return finalColor;
  }

  private createRoads(): void {
    // Create a dense road network wrapping the ENTIRE sphere
    // Main latitude roads (horizontal rings)
    for (let lat = -0.7; lat <= 0.7; lat += 0.35) {
      this.createLatitudeRoad(lat);
    }
    
    // Main longitude roads (vertical meridians)
    for (let lon = 0; lon < Math.PI * 2; lon += Math.PI / 3) {
      this.createLongitudeRoad(lon);
    }
    
    // Connect all biomes with roads
    for (let i = 0; i < this.biomes.length; i++) {
      for (let j = i + 1; j < this.biomes.length; j++) {
        const from = this.biomes[i].center.clone().multiplyScalar(this.radius);
        const to = this.biomes[j].center.clone().multiplyScalar(this.radius);
        this.createConnectingRoad(from, to);
      }
    }
    
    // Local road networks within each biome
    for (const biome of this.biomes) {
      this.createLocalRoadNetwork(biome.center.clone().multiplyScalar(this.radius), 15);
    }
  }

  private createLatitudeRoad(latitude: number): void {
    const y = latitude;
    const ringRadius = Math.sqrt(1 - y * y);
    const segments = 32;
    
    for (let i = 0; i < segments; i++) {
      const angle1 = (i / segments) * Math.PI * 2;
      const angle2 = ((i + 1) / segments) * Math.PI * 2;
      
      const p1 = new THREE.Vector3(
        Math.cos(angle1) * ringRadius,
        y,
        Math.sin(angle1) * ringRadius
      ).normalize().multiplyScalar(this.radius);
      
      const p2 = new THREE.Vector3(
        Math.cos(angle2) * ringRadius,
        y,
        Math.sin(angle2) * ringRadius
      ).normalize().multiplyScalar(this.radius);
      
      this.createRoadSegment(p1, p2);
    }
  }

  private createLongitudeRoad(longitude: number): void {
    const segments = 24;
    
    for (let i = 0; i < segments; i++) {
      const lat1 = (i / segments) * Math.PI - Math.PI / 2;
      const lat2 = ((i + 1) / segments) * Math.PI - Math.PI / 2;
      
      const p1 = new THREE.Vector3(
        Math.cos(lat1) * Math.cos(longitude),
        Math.sin(lat1),
        Math.cos(lat1) * Math.sin(longitude)
      ).normalize().multiplyScalar(this.radius);
      
      const p2 = new THREE.Vector3(
        Math.cos(lat2) * Math.cos(longitude),
        Math.sin(lat2),
        Math.cos(lat2) * Math.sin(longitude)
      ).normalize().multiplyScalar(this.radius);
      
      this.createRoadSegment(p1, p2);
    }
  }

  private createRoadSegment(from: THREE.Vector3, to: THREE.Vector3): void {
    const roadGeo = new THREE.BoxGeometry(1.8, 0.03, 1);
    const roadMat = ToonMaterial.create({ color: 0x505050 });
    const road = new THREE.Mesh(roadGeo, roadMat);
    road.receiveShadow = true;
    
    const mid = from.clone().add(to).multiplyScalar(0.5).normalize().multiplyScalar(this.radius);
    this.placeOnSphere(road, mid);
    
    // Orient along road direction
    const dir = to.clone().sub(from);
    const up = mid.clone().normalize();
    dir.sub(up.clone().multiplyScalar(dir.dot(up))).normalize();
    if (dir.lengthSq() > 0.001) {
      road.lookAt(mid.clone().add(dir));
      road.rotateX(Math.PI / 2);
    }
    
    this.decorations.add(road);
    
    // Center line
    const lineGeo = new THREE.BoxGeometry(0.12, 0.035, 0.6);
    const lineMat = ToonMaterial.create({ color: 0xffffff });
    const line = new THREE.Mesh(lineGeo, lineMat);
    line.position.copy(road.position);
    line.quaternion.copy(road.quaternion);
    line.translateY(0.01);
    this.decorations.add(line);
  }

  private createLocalRoadNetwork(center: THREE.Vector3, _radius: number): void {
    // Create a grid of roads around biome center
    for (let ring = 0; ring < 3; ring++) {
      const ringRadius = 3 + ring * 4;
      const segments = 8 + ring * 4;
      
      for (let i = 0; i < segments; i++) {
        const angle = (i / segments) * Math.PI * 2;
        const pos = this.getOffsetOnSphere(center, angle, ringRadius);
        
        const roadGeo = new THREE.BoxGeometry(2.2, 0.03, 3);
        const roadMat = ToonMaterial.create({ color: 0x484848 });
        const road = new THREE.Mesh(roadGeo, roadMat);
        road.receiveShadow = true;
        
        this.placeOnSphere(road, pos);
        road.rotateY(angle + Math.PI / 2);
        this.decorations.add(road);
        
        // Center line dashes
        for (let d = 0; d < 2; d++) {
          const dashGeo = new THREE.BoxGeometry(0.1, 0.035, 0.5);
          const dashMat = ToonMaterial.create({ color: 0xffffff });
          const dash = new THREE.Mesh(dashGeo, dashMat);
          dash.position.copy(road.position);
          dash.quaternion.copy(road.quaternion);
          dash.translateY(0.01);
          dash.translateZ(-0.6 + d * 1.2);
          this.decorations.add(dash);
        }
      }
    }
  }

  private createConnectingRoad(from: THREE.Vector3, to: THREE.Vector3): void {
    const steps = 15;
    for (let i = 0; i < steps; i++) {
      const t = i / steps;
      const pos = from.clone().lerp(to, t).normalize().multiplyScalar(this.radius);
      
      const roadGeo = new THREE.BoxGeometry(1.8, 0.02, 2);
      const roadMat = ToonMaterial.create({ color: 0x4a4a4a });
      const road = new THREE.Mesh(roadGeo, roadMat);
      this.placeOnSphere(road, pos);
      
      const dir = to.clone().sub(from).normalize();
      const up = pos.clone().normalize();
      const lookDir = dir.clone().sub(up.clone().multiplyScalar(dir.dot(up))).normalize();
      road.lookAt(pos.clone().add(lookDir));
      road.rotateX(Math.PI / 2);
      
      this.decorations.add(road);
    }
  }

  private createDecorations(): void {
    // Create dense decorations for each biome
    this.createTownArea();
    this.createSeasideArea();
    this.createHillsideArea();
    this.createShrineArea();
    
    // Fill gaps between biomes with additional houses and props
    this.fillGlobalDecorations();
  }

  private fillGlobalDecorations(): void {
    // Scatter houses, trees, and props across the entire sphere
    // to eliminate barren patches
    
    const numGlobalHouses = 30;
    const numGlobalTrees = 40;
    const numGlobalProps = 50;
    
    // Random houses everywhere
    for (let i = 0; i < numGlobalHouses; i++) {
      const theta = Math.random() * Math.PI * 2;
      const phi = Math.acos(2 * Math.random() - 1);
      const pos = new THREE.Vector3(
        Math.sin(phi) * Math.cos(theta),
        Math.cos(phi),
        Math.sin(phi) * Math.sin(theta)
      ).multiplyScalar(this.radius);
      
      // Check distance from biome centers to avoid overlap
      let tooClose = false;
      for (const biome of this.biomes) {
        const dist = pos.clone().normalize().distanceTo(biome.center);
        if (dist < biome.radius * 0.6) {
          tooClose = true;
          break;
        }
      }
      if (tooClose) continue;
      
      const house = this.createJapaneseHouse();
      this.placeOnSphere(house, pos);
      house.rotateY(Math.random() * Math.PI * 2);
      this.decorations.add(house);
    }
    
    // Trees everywhere
    for (let i = 0; i < numGlobalTrees; i++) {
      const theta = Math.random() * Math.PI * 2;
      const phi = Math.acos(2 * Math.random() - 1);
      const pos = new THREE.Vector3(
        Math.sin(phi) * Math.cos(theta),
        Math.cos(phi),
        Math.sin(phi) * Math.sin(theta)
      ).multiplyScalar(this.radius);
      
      const tree = this.createTree();
      this.placeOnSphere(tree, pos);
      this.decorations.add(tree);
      this.foliage.push(tree);
    }
    
    // Random props: poles, vending machines, benches, etc.
    for (let i = 0; i < numGlobalProps; i++) {
      const theta = Math.random() * Math.PI * 2;
      const phi = Math.acos(2 * Math.random() - 1);
      const pos = new THREE.Vector3(
        Math.sin(phi) * Math.cos(theta),
        Math.cos(phi),
        Math.sin(phi) * Math.sin(theta)
      ).multiplyScalar(this.radius);
      
      const propType = Math.floor(Math.random() * 5);
      let prop: THREE.Group;
      
      switch (propType) {
        case 0:
          prop = this.createTelephonePole();
          break;
        case 1:
          prop = this.createVendingMachine([0x2ecc71, 0x3498db, 0xe74c3c][Math.floor(Math.random() * 3)]);
          break;
        case 2:
          prop = this.createBench();
          break;
        case 3:
          prop = this.createTrafficCone();
          break;
        default:
          prop = this.createMailbox();
          break;
      }
      
      this.placeOnSphere(prop, pos);
      prop.rotateY(Math.random() * Math.PI * 2);
      this.decorations.add(prop);
    }
    
    // Add retaining walls along roads
    this.createGlobalRetainingWalls();
  }

  private createGlobalRetainingWalls(): void {
    // Add retaining walls at various points around the sphere
    for (let lat = -0.5; lat <= 0.5; lat += 0.5) {
      for (let lon = 0; lon < Math.PI * 2; lon += Math.PI / 2) {
        const y = lat;
        const ringRadius = Math.sqrt(1 - y * y);
        const pos = new THREE.Vector3(
          Math.cos(lon) * ringRadius,
          y,
          Math.sin(lon) * ringRadius
        ).normalize().multiplyScalar(this.radius);
        
        const wall = this.createRetainingWall();
        this.placeOnSphere(wall, pos);
        wall.rotateY(lon);
        this.decorations.add(wall);
      }
    }
  }

  private createTownArea(): void {
    const biome = this.biomes.find(b => b.type === BiomeType.TOWN)!;
    const center = biome.center.clone().multiplyScalar(this.radius);
    
    // Dense ring of houses - multiple rings
    for (let ring = 0; ring < 3; ring++) {
      const numHouses = 8 + ring * 4;
      const ringDist = 4 + ring * 5;
      
      for (let i = 0; i < numHouses; i++) {
        const angle = (i / numHouses) * Math.PI * 2 + ring * 0.2;
        const dist = ringDist + Math.random() * 2;
        const offset = this.getOffsetOnSphere(center, angle, dist);
        
        const house = this.createJapaneseHouse();
        this.placeOnSphere(house, offset);
        house.rotateY(angle + Math.PI + (Math.random() - 0.5) * 0.3);
        this.decorations.add(house);
      }
    }
    
    // Multiple vending machines
    for (let i = 0; i < 5; i++) {
      const vm = this.createVendingMachine([0x2ecc71, 0x3498db, 0xe74c3c][i % 3]);
      const angle = 0.5 + i * 1.2;
      this.placeOnSphere(vm, this.getOffsetOnSphere(center, angle, 3 + i * 2));
      this.decorations.add(vm);
    }
    
    const mailbox = this.createMailbox();
    this.placeOnSphere(mailbox, this.getOffsetOnSphere(center, 1.5, 4));
    this.decorations.add(mailbox);
    
    for (let i = 0; i < 4; i++) {
      const pole = this.createTelephonePole();
      const angle = (i / 4) * Math.PI * 2 + 0.3;
      this.placeOnSphere(pole, this.getOffsetOnSphere(center, angle, 6 + Math.random() * 2));
      this.decorations.add(pole);
    }
    
    const mirror = this.createTrafficMirror();
    this.placeOnSphere(mirror, this.getOffsetOnSphere(center, 2.2, 5));
    this.decorations.add(mirror);
    
    for (let i = 0; i < 3; i++) {
      const cone = this.createTrafficCone();
      this.placeOnSphere(cone, this.getOffsetOnSphere(center, 1.8 + i * 0.15, 4 + i * 0.5));
      this.decorations.add(cone);
    }
    
    const bin = this.createTrashBin();
    this.placeOnSphere(bin, this.getOffsetOnSphere(center, 0.3, 3.5));
    this.decorations.add(bin);
    
    const wall = this.createRetainingWall();
    this.placeOnSphere(wall, this.getOffsetOnSphere(center, Math.PI, 7));
    this.decorations.add(wall);
  }

  private createJapaneseHouse(): THREE.Group {
    const house = new THREE.Group();
    
    // Random house colors for variety
    const wallColors = [0xd4cbb8, 0xe0d6c8, 0xc8c0b0, 0xdcd4c4, 0xf0e8d8];
    const roofColors = [0x4a4a4a, 0x3a3a3a, 0x5a4a3a, 0x4a3a3a];
    const wallColor = wallColors[Math.floor(Math.random() * wallColors.length)];
    const roofColor = roofColors[Math.floor(Math.random() * roofColors.length)];
    
    // Main body
    const bodyGeo = new THREE.BoxGeometry(3, 2.5, 2.5);
    const bodyMat = ToonMaterial.create({ color: wallColor });
    const body = new THREE.Mesh(bodyGeo, bodyMat);
    body.position.y = 1.25;
    body.castShadow = true;
    body.receiveShadow = true;
    house.add(body);
    house.add(OutlineMaterial.addOutlineToMesh(body, OUTLINE_OPTS));
    
    // Pitched roof (proper triangle/gable)
    const roofShape = new THREE.Shape();
    roofShape.moveTo(-1.9, 0);
    roofShape.lineTo(0, 1.2);
    roofShape.lineTo(1.9, 0);
    roofShape.lineTo(-1.9, 0);
    
    const roofExtrudeSettings = { depth: 3.2, bevelEnabled: false };
    const roofGeo = new THREE.ExtrudeGeometry(roofShape, roofExtrudeSettings);
    const roofMat = ToonMaterial.create({ color: roofColor });
    const roof = new THREE.Mesh(roofGeo, roofMat);
    roof.position.set(0, 2.5, -1.6);
    roof.castShadow = true;
    house.add(roof);
    house.add(OutlineMaterial.addOutlineToMesh(roof, OUTLINE_OPTS));
    
    // Door
    const doorGeo = new THREE.BoxGeometry(0.8, 1.6, 0.1);
    const doorMat = ToonMaterial.create({ color: 0x6b5344 });
    const door = new THREE.Mesh(doorGeo, doorMat);
    door.position.set(0, 0.8, 1.3);
    house.add(door);
    
    // Windows with frames
    for (let i = 0; i < 2; i++) {
      const windowGeo = new THREE.BoxGeometry(0.6, 0.6, 0.1);
      const windowMat = ToonMaterial.create({ color: 0x87CEEB });
      const windowMesh = new THREE.Mesh(windowGeo, windowMat);
      windowMesh.position.set(i === 0 ? -0.9 : 0.9, 1.8, 1.3);
      house.add(windowMesh);
      
      const frameGeo = new THREE.BoxGeometry(0.7, 0.7, 0.05);
      const frameMat = ToonMaterial.create({ color: 0x3a3a3a });
      const frame = new THREE.Mesh(frameGeo, frameMat);
      frame.position.copy(windowMesh.position);
      frame.position.z += 0.03;
      house.add(frame);
    }
    
    // AC unit
    const acGeo = new THREE.BoxGeometry(0.8, 0.4, 0.3);
    const acMat = ToonMaterial.create({ color: 0xe8e8e8 });
    const ac = new THREE.Mesh(acGeo, acMat);
    ac.position.set(1.2, 2.0, -1.3);
    house.add(ac);
    house.add(OutlineMaterial.addOutlineToMesh(ac, { thickness: 0.02, wobble: 0.004 }));
    
    return house;
  }

  private createVendingMachine(color: number = 0x2ecc71): THREE.Group {
    const vm = new THREE.Group();
    
    const bodyGeo = new THREE.BoxGeometry(0.9, 1.8, 0.7);
    const bodyMat = ToonMaterial.create({ color });
    const body = new THREE.Mesh(bodyGeo, bodyMat);
    body.position.y = 0.9;
    body.castShadow = true;
    vm.add(body);
    
    const screenGeo = new THREE.BoxGeometry(0.7, 1.0, 0.05);
    const screenMat = ToonMaterial.create({ color: 0x2c3e50 });
    const screen = new THREE.Mesh(screenGeo, screenMat);
    screen.position.set(0, 1.1, 0.38);
    vm.add(screen);
    
    for (let row = 0; row < 3; row++) {
      for (let col = 0; col < 3; col++) {
        const canGeo = new THREE.CylinderGeometry(0.06, 0.06, 0.15, 8);
        const canMat = ToonMaterial.create({ 
          color: [0xe74c3c, 0xf39c12, 0x3498db][Math.floor(Math.random() * 3)]
        });
        const can = new THREE.Mesh(canGeo, canMat);
        can.position.set(-0.2 + col * 0.2, 0.8 + row * 0.3, 0.35);
        can.rotation.x = Math.PI / 2;
        vm.add(can);
      }
    }
    
    return vm;
  }

  private createMailbox(): THREE.Group {
    const mb = new THREE.Group();
    
    const postGeo = new THREE.CylinderGeometry(0.08, 0.08, 1.2, 8);
    const postMat = ToonMaterial.create({ color: 0xe74c3c });
    const post = new THREE.Mesh(postGeo, postMat);
    post.position.y = 0.6;
    mb.add(post);
    
    const boxGeo = new THREE.CylinderGeometry(0.25, 0.25, 0.5, 16);
    const boxMat = ToonMaterial.create({ color: 0xe74c3c });
    const box = new THREE.Mesh(boxGeo, boxMat);
    box.position.y = 1.35;
    box.castShadow = true;
    mb.add(box);
    
    const topGeo = new THREE.SphereGeometry(0.25, 16, 8, 0, Math.PI * 2, 0, Math.PI / 2);
    const top = new THREE.Mesh(topGeo, boxMat);
    top.position.y = 1.6;
    mb.add(top);
    
    const slotGeo = new THREE.BoxGeometry(0.2, 0.03, 0.1);
    const slotMat = ToonMaterial.create({ color: 0x2c3e50 });
    const slot = new THREE.Mesh(slotGeo, slotMat);
    slot.position.set(0, 1.45, 0.2);
    mb.add(slot);
    
    return mb;
  }

  private createTelephonePole(): THREE.Group {
    const pole = new THREE.Group();
    
    const poleGeo = new THREE.CylinderGeometry(0.08, 0.1, 5, 8);
    const poleMat = ToonMaterial.create({ color: 0x6b5344 });
    const poleM = new THREE.Mesh(poleGeo, poleMat);
    poleM.position.y = 2.5;
    poleM.castShadow = true;
    pole.add(poleM);
    
    const armGeo = new THREE.BoxGeometry(1.5, 0.08, 0.08);
    const arm = new THREE.Mesh(armGeo, poleMat);
    arm.position.y = 4.5;
    pole.add(arm);
    
    for (let i = 0; i < 2; i++) {
      const wireGeo = new THREE.CylinderGeometry(0.01, 0.01, 3, 4);
      const wireMat = ToonMaterial.create({ color: 0x2c2c2c });
      const wire = new THREE.Mesh(wireGeo, wireMat);
      wire.position.set(i === 0 ? -0.5 : 0.5, 4.5, 0);
      wire.rotation.z = Math.PI / 2;
      pole.add(wire);
    }
    
    return pole;
  }

  private createTrafficMirror(): THREE.Group {
    const mirror = new THREE.Group();
    
    const poleGeo = new THREE.CylinderGeometry(0.04, 0.04, 2.5, 8);
    const poleMat = ToonMaterial.create({ color: 0xf39c12 });
    const pole = new THREE.Mesh(poleGeo, poleMat);
    pole.position.y = 1.25;
    mirror.add(pole);
    
    const mirrorGeo = new THREE.SphereGeometry(0.35, 16, 16, 0, Math.PI);
    const mirrorMat = ToonMaterial.create({ color: 0xbdc3c7 });
    const mirrorM = new THREE.Mesh(mirrorGeo, mirrorMat);
    mirrorM.position.y = 2.3;
    mirrorM.rotation.y = Math.PI;
    mirrorM.castShadow = true;
    mirror.add(mirrorM);
    
    const frameGeo = new THREE.TorusGeometry(0.35, 0.04, 8, 16);
    const frameMat = ToonMaterial.create({ color: 0xf39c12 });
    const frame = new THREE.Mesh(frameGeo, frameMat);
    frame.position.y = 2.3;
    frame.rotation.x = Math.PI / 2;
    mirror.add(frame);
    
    return mirror;
  }

  private createTrafficCone(): THREE.Group {
    const cone = new THREE.Group();
    
    const coneGeo = new THREE.ConeGeometry(0.15, 0.5, 8);
    const coneMat = ToonMaterial.create({ color: 0xf39c12 });
    const coneM = new THREE.Mesh(coneGeo, coneMat);
    coneM.position.y = 0.25;
    coneM.castShadow = true;
    cone.add(coneM);
    
    const stripeGeo = new THREE.CylinderGeometry(0.08, 0.12, 0.1, 8);
    const stripeMat = ToonMaterial.create({ color: 0xffffff });
    const stripe = new THREE.Mesh(stripeGeo, stripeMat);
    stripe.position.y = 0.25;
    cone.add(stripe);
    
    const baseGeo = new THREE.BoxGeometry(0.35, 0.05, 0.35);
    const baseMat = ToonMaterial.create({ color: 0xf39c12 });
    const base = new THREE.Mesh(baseGeo, baseMat);
    base.position.y = 0.025;
    cone.add(base);
    
    return cone;
  }

  private createTrashBin(): THREE.Group {
    const bin = new THREE.Group();
    
    const binGeo = new THREE.CylinderGeometry(0.25, 0.2, 0.6, 8);
    const binMat = ToonMaterial.create({ color: 0x3498db });
    const binM = new THREE.Mesh(binGeo, binMat);
    binM.position.y = 0.3;
    binM.castShadow = true;
    bin.add(binM);
    
    const lidGeo = new THREE.CylinderGeometry(0.27, 0.27, 0.08, 8);
    const lidMat = ToonMaterial.create({ color: 0x2980b9 });
    const lid = new THREE.Mesh(lidGeo, lidMat);
    lid.position.y = 0.64;
    bin.add(lid);
    
    return bin;
  }

  private createRetainingWall(): THREE.Group {
    const wall = new THREE.Group();
    
    for (let i = 0; i < 5; i++) {
      const blockGeo = new THREE.BoxGeometry(2, 1.5, 0.8);
      const blockMat = ToonMaterial.create({ color: 0x9a9a8a });
      const block = new THREE.Mesh(blockGeo, blockMat);
      block.position.set(i * 2 - 4, 0.75, 0);
      block.castShadow = true;
      block.receiveShadow = true;
      wall.add(block);
    }
    
    return wall;
  }

  private createSeasideArea(): void {
    const biome = this.biomes.find(b => b.type === BiomeType.SEASIDE)!;
    const center = biome.center.clone().multiplyScalar(this.radius);
    
    this.createWater(center);
    
    const pier = this.createPier();
    this.placeOnSphere(pier, this.getOffsetOnSphere(center, 0.5, 3));
    this.decorations.add(pier);
    
    const boat = this.createFishingBoat();
    this.placeOnSphere(boat, this.getOffsetOnSphere(center, 0.8, 5));
    this.decorations.add(boat);
    
    for (let i = 0; i < 3; i++) {
      const umbrella = this.createBeachUmbrella();
      const angle = 1.5 + i * 0.4;
      this.placeOnSphere(umbrella, this.getOffsetOnSphere(center, angle, 3 + Math.random()));
      this.decorations.add(umbrella);
    }
    
    const lighthouse = this.createLighthouse();
    this.placeOnSphere(lighthouse, this.getOffsetOnSphere(center, Math.PI, 6));
    this.decorations.add(lighthouse);
  }

  private createWater(center: THREE.Vector3): void {
    const waterGroup = new THREE.Group();
    
    const waterMat = ToonMaterial.create({ 
      color: 0x4a90a4,
      transparent: true,
      opacity: 0.85
    });
    
    for (let ring = 0; ring < 3; ring++) {
      const innerRadius = 6 + ring * 3;
      const outerRadius = 9 + ring * 3;
      const segments = 24;
      
      for (let i = 0; i < segments; i++) {
        const angle1 = (i / segments) * Math.PI * 2;
        const angle2 = ((i + 1) / segments) * Math.PI * 2;
        
        const waterGeo = new THREE.BufferGeometry();
        const positions: number[] = [];
        
        const p1 = this.getOffsetOnSphere(center, angle1, innerRadius);
        const p2 = this.getOffsetOnSphere(center, angle2, innerRadius);
        const p3 = this.getOffsetOnSphere(center, angle2, outerRadius);
        const p4 = this.getOffsetOnSphere(center, angle1, outerRadius);
        
        const offset = 0.05;
        const up1 = p1.clone().normalize();
        const up2 = p2.clone().normalize();
        const up3 = p3.clone().normalize();
        const up4 = p4.clone().normalize();
        
        p1.sub(up1.multiplyScalar(offset));
        p2.sub(up2.multiplyScalar(offset));
        p3.sub(up3.multiplyScalar(offset));
        p4.sub(up4.multiplyScalar(offset));
        
        positions.push(p1.x, p1.y, p1.z);
        positions.push(p2.x, p2.y, p2.z);
        positions.push(p3.x, p3.y, p3.z);
        positions.push(p1.x, p1.y, p1.z);
        positions.push(p3.x, p3.y, p3.z);
        positions.push(p4.x, p4.y, p4.z);
        
        waterGeo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
        waterGeo.computeVertexNormals();
        
        const waterMesh = new THREE.Mesh(waterGeo, waterMat);
        waterGroup.add(waterMesh);
      }
    }
    
    this.decorations.add(waterGroup);
  }

  private createPier(): THREE.Group {
    const pier = new THREE.Group();
    
    const deckGeo = new THREE.BoxGeometry(2, 0.2, 8);
    const deckMat = ToonMaterial.create({ color: 0x8b7355 });
    const deck = new THREE.Mesh(deckGeo, deckMat);
    deck.position.y = 0.8;
    deck.castShadow = true;
    deck.receiveShadow = true;
    pier.add(deck);
    
    for (let i = 0; i < 6; i++) {
      const postGeo = new THREE.CylinderGeometry(0.1, 0.12, 1.5, 6);
      const postMat = ToonMaterial.create({ color: 0x6b5344 });
      const post = new THREE.Mesh(postGeo, postMat);
      post.position.set(
        (i % 2 === 0 ? -0.7 : 0.7),
        0.4,
        -3 + Math.floor(i / 2) * 3
      );
      post.castShadow = true;
      pier.add(post);
    }
    
    return pier;
  }

  private createFishingBoat(): THREE.Group {
    const boat = new THREE.Group();
    
    const hullGeo = new THREE.BoxGeometry(1.2, 0.6, 3);
    const hullMat = ToonMaterial.create({ color: 0x2980b9 });
    const hull = new THREE.Mesh(hullGeo, hullMat);
    hull.position.y = 0.3;
    hull.castShadow = true;
    boat.add(hull);
    
    const cabinGeo = new THREE.BoxGeometry(0.8, 0.8, 1);
    const cabinMat = ToonMaterial.create({ color: 0xecf0f1 });
    const cabin = new THREE.Mesh(cabinGeo, cabinMat);
    cabin.position.set(0, 0.9, -0.5);
    cabin.castShadow = true;
    boat.add(cabin);
    
    return boat;
  }

  private createBeachUmbrella(): THREE.Group {
    const umbrella = new THREE.Group();
    
    const poleGeo = new THREE.CylinderGeometry(0.03, 0.03, 2, 6);
    const poleMat = ToonMaterial.create({ color: 0x8b7355 });
    const pole = new THREE.Mesh(poleGeo, poleMat);
    pole.position.y = 1;
    umbrella.add(pole);
    
    const topGeo = new THREE.ConeGeometry(1, 0.6, 8);
    const topMat = ToonMaterial.create({ 
      color: [0xe74c3c, 0xf39c12, 0x3498db][Math.floor(Math.random() * 3)]
    });
    const top = new THREE.Mesh(topGeo, topMat);
    top.position.y = 2.1;
    top.rotation.x = Math.PI;
    top.castShadow = true;
    umbrella.add(top);
    
    return umbrella;
  }

  private createLighthouse(): THREE.Group {
    const lh = new THREE.Group();
    
    const baseGeo = new THREE.CylinderGeometry(1, 1.3, 4, 8);
    const baseMat = ToonMaterial.create({ color: 0xecf0f1 });
    const base = new THREE.Mesh(baseGeo, baseMat);
    base.position.y = 2;
    base.castShadow = true;
    lh.add(base);
    
    for (let i = 0; i < 3; i++) {
      const stripeGeo = new THREE.CylinderGeometry(1.05 - i * 0.1, 1.15 - i * 0.1, 0.5, 8);
      const stripeMat = ToonMaterial.create({ color: 0xe74c3c });
      const stripe = new THREE.Mesh(stripeGeo, stripeMat);
      stripe.position.y = 0.8 + i * 1.3;
      lh.add(stripe);
    }
    
    const lampGeo = new THREE.CylinderGeometry(0.6, 0.8, 1, 8);
    const lampMat = ToonMaterial.create({ color: 0x2c3e50 });
    const lamp = new THREE.Mesh(lampGeo, lampMat);
    lamp.position.y = 4.5;
    lh.add(lamp);
    
    const lightGeo = new THREE.SphereGeometry(0.4, 8, 8);
    const lightMat = ToonMaterial.create({ color: 0xffeaa7, emissive: 0xf39c12, emissiveIntensity: 0.5 });
    const light = new THREE.Mesh(lightGeo, lightMat);
    light.position.y = 4.5;
    lh.add(light);
    
    return lh;
  }

  private createHillsideArea(): void {
    const biome = this.biomes.find(b => b.type === BiomeType.HILLSIDE)!;
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
    
    const lookout = this.createLookoutPlatform();
    this.placeOnSphere(lookout, this.getOffsetOnSphere(center, 0, 4));
    this.decorations.add(lookout);
    
    for (let i = 0; i < 3; i++) {
      const bench = this.createBench();
      const angle = i * 2;
      this.placeOnSphere(bench, this.getOffsetOnSphere(center, angle, 3 + Math.random() * 2));
      this.decorations.add(bench);
    }
  }

  private createTree(): THREE.Group {
    const tree = new THREE.Group();
    
    const trunkGeo = new THREE.CylinderGeometry(0.15, 0.25, 2, 8);
    const trunkMat = ToonMaterial.create({ color: 0x6b5344 });
    const trunk = new THREE.Mesh(trunkGeo, trunkMat);
    trunk.position.y = 1;
    trunk.castShadow = true;
    tree.add(trunk);
    
    const foliageGeo = new THREE.IcosahedronGeometry(1.3, 1);
    const foliageMat = ToonMaterial.create({ color: 0x4a8a5b });
    const foliage = new THREE.Mesh(foliageGeo, foliageMat);
    foliage.position.y = 2.8;
    foliage.castShadow = true;
    tree.add(foliage);
    
    return tree;
  }

  private createLookoutPlatform(): THREE.Group {
    const lookout = new THREE.Group();
    
    const platformGeo = new THREE.CylinderGeometry(1.8, 1.8, 0.3, 8);
    const platformMat = ToonMaterial.create({ color: 0x8b7355 });
    const platform = new THREE.Mesh(platformGeo, platformMat);
    platform.position.y = 2.5;
    platform.castShadow = true;
    platform.receiveShadow = true;
    lookout.add(platform);
    
    for (let i = 0; i < 4; i++) {
      const angle = (i / 4) * Math.PI * 2;
      const postGeo = new THREE.CylinderGeometry(0.12, 0.12, 2.5, 6);
      const postMat = ToonMaterial.create({ color: 0x6b5344 });
      const post = new THREE.Mesh(postGeo, postMat);
      post.position.set(
        Math.cos(angle) * 1.4,
        1.25,
        Math.sin(angle) * 1.4
      );
      post.castShadow = true;
      lookout.add(post);
    }
    
    const railGeo = new THREE.TorusGeometry(1.5, 0.06, 8, 16);
    const railMat = ToonMaterial.create({ color: 0x8b7355 });
    const rail = new THREE.Mesh(railGeo, railMat);
    rail.position.y = 2.9;
    rail.rotation.x = Math.PI / 2;
    lookout.add(rail);
    
    return lookout;
  }

  private createBench(): THREE.Group {
    const bench = new THREE.Group();
    
    const seatGeo = new THREE.BoxGeometry(1.5, 0.1, 0.5);
    const seatMat = ToonMaterial.create({ color: 0x8b7355 });
    const seat = new THREE.Mesh(seatGeo, seatMat);
    seat.position.y = 0.45;
    seat.castShadow = true;
    bench.add(seat);
    
    const backGeo = new THREE.BoxGeometry(1.5, 0.5, 0.08);
    const back = new THREE.Mesh(backGeo, seatMat);
    back.position.set(0, 0.7, -0.2);
    back.rotation.x = 0.15;
    bench.add(back);
    
    for (let i = 0; i < 2; i++) {
      const legGeo = new THREE.BoxGeometry(0.1, 0.4, 0.4);
      const legMat = ToonMaterial.create({ color: 0x4a4a4a });
      const leg = new THREE.Mesh(legGeo, legMat);
      leg.position.set(i === 0 ? -0.6 : 0.6, 0.2, 0);
      bench.add(leg);
    }
    
    return bench;
  }

  private createShrineArea(): void {
    const biome = this.biomes.find(b => b.type === BiomeType.SHRINE)!;
    const center = biome.center.clone().multiplyScalar(this.radius);
    
    const torii = this.createToriiGate();
    this.placeOnSphere(torii, this.getOffsetOnSphere(center, 0, 5));
    this.decorations.add(torii);
    
    const shrine = this.createShrine();
    this.placeOnSphere(shrine, center);
    this.decorations.add(shrine);
    
    for (let i = 0; i < 6; i++) {
      const lantern = this.createStoneLantern();
      const angle = (i / 6) * Math.PI * 2;
      this.placeOnSphere(lantern, this.getOffsetOnSphere(center, angle, 3));
      this.decorations.add(lantern);
    }
    
    const steps = this.createStoneSteps();
    this.placeOnSphere(steps, this.getOffsetOnSphere(center, 0, 3));
    this.decorations.add(steps);
  }

  private createToriiGate(): THREE.Group {
    const gate = new THREE.Group();
    
    const postMat = ToonMaterial.create({ color: 0xc0392b });
    
    for (let i = 0; i < 2; i++) {
      const postGeo = new THREE.CylinderGeometry(0.2, 0.25, 5, 8);
      const post = new THREE.Mesh(postGeo, postMat);
      post.position.set(i === 0 ? -2 : 2, 2.5, 0);
      post.castShadow = true;
      gate.add(post);
    }
    
    const topGeo = new THREE.BoxGeometry(5.5, 0.4, 0.5);
    const top = new THREE.Mesh(topGeo, postMat);
    top.position.y = 4.8;
    top.castShadow = true;
    gate.add(top);
    
    const beam2Geo = new THREE.BoxGeometry(4.5, 0.3, 0.4);
    const beam2 = new THREE.Mesh(beam2Geo, postMat);
    beam2.position.y = 4;
    gate.add(beam2);
    
    return gate;
  }

  private createShrine(): THREE.Group {
    const shrine = new THREE.Group();
    
    const baseGeo = new THREE.BoxGeometry(5, 0.5, 4);
    const baseMat = ToonMaterial.create({ color: 0x8a8a7a });
    const base = new THREE.Mesh(baseGeo, baseMat);
    base.position.y = 0.25;
    base.castShadow = true;
    base.receiveShadow = true;
    shrine.add(base);
    
    const bodyGeo = new THREE.BoxGeometry(4, 3, 3);
    const bodyMat = ToonMaterial.create({ color: 0xc0392b });
    const body = new THREE.Mesh(bodyGeo, bodyMat);
    body.position.y = 2;
    body.castShadow = true;
    shrine.add(body);
    
    const roofGeo = new THREE.BoxGeometry(5.5, 0.5, 4);
    const roofMat = ToonMaterial.create({ color: 0x2c3e50 });
    const roof = new THREE.Mesh(roofGeo, roofMat);
    roof.position.y = 3.75;
    roof.castShadow = true;
    shrine.add(roof);
    
    const roof2Geo = new THREE.BoxGeometry(4.5, 0.4, 3.5);
    const roof2 = new THREE.Mesh(roof2Geo, roofMat);
    roof2.position.y = 4.15;
    shrine.add(roof2);
    
    return shrine;
  }

  private createStoneLantern(): THREE.Group {
    const lantern = new THREE.Group();
    
    const baseGeo = new THREE.CylinderGeometry(0.25, 0.3, 0.3, 6);
    const stoneMat = ToonMaterial.create({ color: 0x7a7a6a });
    const base = new THREE.Mesh(baseGeo, stoneMat);
    base.position.y = 0.15;
    base.castShadow = true;
    lantern.add(base);
    
    const stemGeo = new THREE.CylinderGeometry(0.1, 0.1, 1, 6);
    const stem = new THREE.Mesh(stemGeo, stoneMat);
    stem.position.y = 0.8;
    lantern.add(stem);
    
    const houseGeo = new THREE.BoxGeometry(0.5, 0.5, 0.5);
    const houseMat = ToonMaterial.create({ color: 0xffeaa7, emissive: 0xf39c12, emissiveIntensity: 0.3 });
    const house = new THREE.Mesh(houseGeo, houseMat);
    house.position.y = 1.55;
    lantern.add(house);
    
    const topGeo = new THREE.ConeGeometry(0.35, 0.3, 4);
    const top = new THREE.Mesh(topGeo, stoneMat);
    top.position.y = 1.95;
    top.rotation.y = Math.PI / 4;
    lantern.add(top);
    
    return lantern;
  }

  private createStoneSteps(): THREE.Group {
    const steps = new THREE.Group();
    
    for (let i = 0; i < 5; i++) {
      const stepGeo = new THREE.BoxGeometry(2, 0.2, 0.5);
      const stepMat = ToonMaterial.create({ color: 0x7a7a6a });
      const step = new THREE.Mesh(stepGeo, stepMat);
      step.position.set(0, i * 0.25, -i * 0.5);
      step.castShadow = true;
      step.receiveShadow = true;
      steps.add(step);
    }
    
    return steps;
  }

  private createClouds(): void {
    for (let i = 0; i < 8; i++) {
      const cloud = this.createCloud();
      const theta = Math.random() * Math.PI * 2;
      const phi = Math.random() * Math.PI;
      
      const dist = this.radius + 20 + Math.random() * 15;
      cloud.position.set(
        Math.sin(phi) * Math.cos(theta) * dist,
        Math.cos(phi) * dist * 0.5 + 10,
        Math.sin(phi) * Math.sin(theta) * dist
      );
      cloud.scale.setScalar(2 + Math.random() * 2);
      
      this.clouds.add(cloud);
    }
  }

  private createCloud(): THREE.Group {
    const cloud = new THREE.Group();
    
    const cloudMat = ToonMaterial.create({ color: 0x9fd5d1 });
    
    for (let i = 0; i < 5; i++) {
      const blobGeo = new THREE.SphereGeometry(1 + Math.random() * 0.5, 8, 8);
      const blob = new THREE.Mesh(blobGeo, cloudMat);
      blob.position.set(
        (Math.random() - 0.5) * 3,
        (Math.random() - 0.5) * 0.5,
        (Math.random() - 0.5) * 2
      );
      blob.scale.y = 0.6;
      cloud.add(blob);
    }
    
    return cloud;
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
    const townCenter = this.biomes.find(b => b.type === BiomeType.TOWN)!.center;
    return townCenter.clone().multiplyScalar(this.radius + 0.5);
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
      const windOffset = Math.sin(this.windTime * 1.5 + pos.x * 0.3) * 0.015;
      const windOffset2 = Math.cos(this.windTime * 1.2 + pos.z * 0.3) * 0.01;
      
      tree.rotation.x = windOffset;
      tree.rotation.z = windOffset2;
    }
    
    this.clouds.children.forEach((cloud, i) => {
      cloud.position.x += Math.sin(elapsed * 0.1 + i) * 0.01;
      cloud.position.z += Math.cos(elapsed * 0.08 + i) * 0.01;
    });
  }
}
