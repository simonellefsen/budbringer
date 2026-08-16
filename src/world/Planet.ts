import * as THREE from 'three';
import { ToonMaterial } from '../utils/ToonMaterial';
import { GROUND, BUILDING, ROAD, MATERIAL, ACCENT, SKY, pick } from '../utils/palette';
import { Kit, SHOP_SIGNS } from './Kit';
import { distributeRegions, PlacedRegion } from './Regions';

export enum BiomeType {
  TOWN,
  SEASIDE,
  HILLSIDE,
  SHRINE
}


/** How far the road slabs stand proud of the sphere surface. */
const ROAD_THICKNESS = 0.08;

/** Radius of clear ground kept around the player's start, in world units. */
const SPAWN_CLEARANCE = 11;

/** A point along a street: where it is, which way it runs, which way is up. */
interface StreetStation {
  pos: THREE.Vector3;
  tangent: THREE.Vector3;
  up: THREE.Vector3;
}

/**
 * A named region of the village.
 *
 * These do the wayfinding: the HUD announces the one you are standing in, and
 * a delivery task names the one its recipient is waiting in, so "find Fisher
 * Finn" becomes "go to Les Berges" rather than a hunt around a sphere.
 */
export interface Area {
  name: string;
  /** Unit vector to the region's middle. */
  center: THREE.Vector3;
  /** Surface radius in world units. */
  radius: number;
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
  private foliageBaseQuaternions: Map<THREE.Object3D, THREE.Quaternion> = new Map();
  private windTime: number = 0;
  private clouds: THREE.Group;
  private spawnPoint!: THREE.Vector3;
  private kit: Kit | null = null;
  private houseVariant = 0;
  private shopsPlaced = 0;
  private riverAxis!: THREE.Vector3;
  /** Ground already taken by something solid, so scatter can avoid it. */
  private occupied: { pos: THREE.Vector3; radius: number }[] = [];
  /** Named places the NPCs are posted to. */
  public anchors: Map<string, THREE.Vector3> = new Map();
  /** Named regions, for the place-name card and for directing deliveries. */
  public areas: Area[] = [];

  constructor(radius: number, kit: Kit | null = null) {
    this.kit = kit;
    this.radius = radius;
    this.mesh = new THREE.Group();
    this.decorations = new THREE.Group();
    this.clouds = new THREE.Group();
    
    this.createPlanetSphere();
    this.defineBiomes();
    this.spawnPoint = this.computeSpawnPoint();
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
      vertexColors: true
    });
    
    this.sphere = new THREE.Mesh(geometry, material);
    this.sphere.receiveShadow = true;
    this.mesh.add(this.sphere);
  }

  private defineBiomes(): void {
    this.biomes = [
      {
        type: BiomeType.TOWN,
        color: new THREE.Color(GROUND.town),
        center: new THREE.Vector3(0, 1, 0).normalize(),
        radius: 0.45
      },
      {
        type: BiomeType.SEASIDE,
        color: new THREE.Color(GROUND.seaside),
        center: new THREE.Vector3(0.7, 0.3, 0.5).normalize(),
        radius: 0.35
      },
      {
        type: BiomeType.HILLSIDE,
        color: new THREE.Color(GROUND.hillside),
        center: new THREE.Vector3(-0.5, 0.5, 0.7).normalize(),
        radius: 0.45
      },
      {
        type: BiomeType.SHRINE,
        color: new THREE.Color(GROUND.shrine),
        center: new THREE.Vector3(-0.6, -0.2, -0.7).normalize(),
        radius: 0.35
      }
    ];
  }

  private getBiomeColorAtPosition(pos: THREE.Vector3): THREE.Color {
    const normalizedPos = pos.clone().normalize();
    
    const baseGreen = new THREE.Color(GROUND.base);
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

  /**
   * Roads only where a road would actually be: between the places you walk to,
   * and one loop through each settlement.
   *
   * This used to lay eleven latitude rings, twelve longitude lines, eight
   * diagonals and three concentric rings per biome — around 2,000 separate box
   * meshes, which made asphalt the dominant surface of the planet and speckled
   * every shot with centre-line dashes. Once the ink pass went in, every one of
   * those boxes also started contributing edges, so the ground turned to hatch.
   */
  private createRoads(): void {
    // Trunk roads between settlements.
    for (let i = 0; i < this.biomes.length; i++) {
      for (let j = i + 1; j < this.biomes.length; j++) {
        const from = this.biomes[i].center.clone().multiplyScalar(this.radius);
        const to = this.biomes[j].center.clone().multiplyScalar(this.radius);
        this.createConnectingRoad(from, to);
      }
    }
  }

  private createConnectingRoad(from: THREE.Vector3, to: THREE.Vector3): void {
    const steps = 15;
    for (let i = 0; i < steps; i++) {
      const t = i / steps;
      const pos = from.clone().lerp(to, t).normalize().multiplyScalar(this.radius);
      
      const roadGeo = new THREE.BoxGeometry(1.8, ROAD_THICKNESS, 2);
      const roadMat = ToonMaterial.create({ color: ROAD.asphalt });
      const road = new THREE.Mesh(roadGeo, roadMat);
      
      // Use proper orientation with makeBasis
      const up = pos.clone().normalize();
      const dir = to.clone().sub(from);
      dir.sub(up.clone().multiplyScalar(dir.dot(up))).normalize();
      
      if (dir.lengthSq() < 0.01) {
        dir.set(1, 0, 0);
        dir.sub(up.clone().multiplyScalar(dir.dot(up))).normalize();
      }
      
      const right = new THREE.Vector3().crossVectors(dir, up).normalize();
      const forward = new THREE.Vector3().crossVectors(up, right).normalize();
      
      const matrix = new THREE.Matrix4();
      matrix.makeBasis(right, up, forward);
      
      road.position.copy(pos);
      road.quaternion.setFromRotationMatrix(matrix);
      
      this.decorations.add(road);
    }
  }

  /**
   * Order is load-bearing. Every pass claims the ground it uses, and later
   * passes skip claimed ground — so the big set pieces have to go down first.
   * Running the scatter before the church meant trees were planted where the
   * nave was about to be.
   */
  private createDecorations(): void {
    // Landmarks first: they are the largest and least movable.
    this.createRiver();
    this.createChurch();
    this.createSquare();
    this.createFarm();

    // Then streets and the frontage that addresses them.
    this.createTownArea();
    this.createSeasideArea();
    this.createHillsideArea();
    this.createShrineArea();
    this.createPark();

    // Every other part of the globe gets a character of its own.
    this.createRegions();

    // Loose scatter last, into whatever ground is left.
    this.fillGlobalDecorations();
  }

  // ---------------------------------------------------------------- regions

  /** Scatter `count` pieces over a disc, each upright and randomly turned. */
  private scatterInDisc(
    center: THREE.Vector3, radius: number, count: number,
    pieces: string[], clearance = 2.2
  ): void {
    for (let i = 0; i < count; i++) {
      // sqrt keeps the density even rather than crowding the middle.
      const dist = radius * Math.sqrt(Math.random());
      const spot = this.getOffsetOnSphere(center, Math.random() * Math.PI * 2, dist);
      if (!this.isFree(spot, clearance)) continue;
      this.addPiece(pieces[Math.floor(Math.random() * pieces.length)], spot);
    }
  }

  /**
   * Lay pieces in parallel rows across a disc — vines, lavender, orchards.
   *
   * Rows are what make cultivated land read as cultivated: scattered vines
   * look like scrub, and the same vines in lines look like a vineyard.
   */
  private layRows(
    center: THREE.Vector3, radius: number, piece: string,
    rowGap: number, alongGap: number
  ): void {
    const bearing = Math.random() * Math.PI * 2;
    for (let r = -radius; r <= radius; r += rowGap) {
      const halfChord = Math.sqrt(Math.max(0, radius * radius - r * r));
      const rowMid = this.getOffsetOnSphere(center, bearing + Math.PI / 2, r);

      for (let a = -halfChord; a <= halfChord; a += alongGap) {
        const spot = this.getOffsetOnSphere(rowMid, bearing, a);
        if (!this.isFree(spot, 1.1)) continue;
        // Face along the row so the piece's length runs with it.
        const ahead = this.getOffsetOnSphere(rowMid, bearing, a + 2);
        this.addPiece(piece, spot, ahead);
      }
    }
  }

  /** A short lane with houses either side — the shape of every hamlet. */
  private buildHamlet(center: THREE.Vector3, radius: number): void {
    const bearing = Math.random() * Math.PI * 2;
    const from = this.getOffsetOnSphere(center, bearing, radius * 0.55);
    const to = this.getOffsetOnSphere(center, bearing + Math.PI, radius * 0.55);

    const lane = this.lineStations(from, to, 5);
    this.layRoad(lane, 2.4);
    this.layFrontage(lane, { setback: 6.4, gapChance: 0.28 });

    this.addPiece('Well', this.getOffsetOnSphere(center, bearing + 1.3, 4));
    this.scatterInDisc(center, radius, 7, ['Tree_Plane', 'Wall_Low', 'Hedge']);
  }

  /**
   * Give every part of the globe a character.
   *
   * Regions are spread by a Fibonacci lattice rather than at random: random
   * points on a sphere clump, which is precisely how you end up with a crowded
   * hemisphere and a bare one.
   */
  private createRegions(): void {
    const avoid = this.areas.map(a => ({ center: a.center, radius: a.radius }));
    const regions: PlacedRegion[] = distributeRegions(16, avoid, this.radius);

    for (const region of regions) {
      const center = region.center.clone().multiplyScalar(this.radius);
      const r = region.radius;

      switch (region.kind) {
        case 'hamlet':
          this.buildHamlet(center, r);
          break;

        case 'vineyard':
          this.layRows(center, r * 0.8, 'Vine_Row', 3.4, 6.4);
          this.scatterInDisc(center, r, 3, ['Wall_Low', 'Tree_Plane']);
          break;

        case 'lavender':
          this.layRows(center, r * 0.8, 'Lavender_Row', 2.6, 5.8);
          this.scatterInDisc(center, r, 3, ['Tree_Plane', 'Hedge']);
          break;

        case 'orchard':
          this.layRows(center, r * 0.78, 'Tree_Orchard', 4.2, 4.2);
          this.scatterInDisc(center, r, 4, ['Hedge', 'Wall_Low']);
          break;

        case 'wheat':
          this.scatterInDisc(center, r * 0.85, 16, ['Haystack'], 2.6);
          this.scatterInDisc(center, r, 6, ['Hedge', 'Wall_Low', 'Tree_Plane']);
          this.addPiece('Barn', this.getOffsetOnSphere(center, 1.0, r * 0.6), center);
          break;

        case 'forest':
          this.scatterInDisc(center, r, 46, ['Tree_Plane', 'Tree_Orchard'], 2.0);
          break;

        case 'pasture':
          this.scatterInDisc(center, r * 0.9, 12, ['Sheep', 'Goat'], 2.0);
          this.scatterInDisc(center, r, 10, ['Fence', 'Wall_Low', 'Hedge'], 2.4);
          this.addPiece('Barn', this.getOffsetOnSphere(center, 2.4, r * 0.55), center);
          break;

        case 'graveyard':
          this.addPiece('Chapel', center, this.getOffsetOnSphere(center, 0, 8));
          this.layRows(center, r * 0.62, 'Grave_A', 3.0, 2.2);
          this.scatterInDisc(center, r * 0.7, 10, ['Grave_B', 'Grave_C'], 1.6);
          this.scatterInDisc(center, r, 8, ['Wall_Low', 'Tree_Plane']);
          break;

        case 'ruin':
          this.addPiece('Ruin_Arch', center);
          this.scatterInDisc(center, r * 0.7, 5, ['Ruin_Arch', 'Wall_Low'], 5.0);
          this.scatterInDisc(center, r, 12, ['Tree_Plane', 'Hedge']);
          break;

        case 'mill':
          this.addPiece('Windmill', center, this.getOffsetOnSphere(center, 0, 8));
          this.scatterInDisc(center, r * 0.8, 5, ['Haystack'], 2.6);
          this.scatterInDisc(center, r, 6, ['Wall_Low', 'Tree_Plane', 'Hedge']);
          break;

        case 'chapel':
          this.addPiece('Chapel', center, this.getOffsetOnSphere(center, 0, 8));
          this.scatterInDisc(center, r, 10, ['Tree_Plane', 'Wall_Low', 'Hedge']);
          break;

        default:
          this.scatterInDisc(center, r, 12, ['Tree_Plane', 'Hedge']);
      }

      this.markArea(region.name, center, region.radius);
      this.claim(center, 2);
    }
  }

  // ------------------------------------------------------------ set pieces

  /**
   * A river running the whole way round the sphere on a great circle, with a
   * stone bridge where the village's main road crosses it.
   *
   * A great circle rather than a meandering path: on a closed surface the
   * water has to either loop or end abruptly, and a loop is the only one of
   * those that doesn't look like a bug.
   */
  private createRiver(): void {
    const townCenter = this.biomes.find(b => b.type === BiomeType.TOWN)!.center;

    // The river runs on the great circle perpendicular to this axis, so how
    // far it passes from the village depends only on the axis' Y component
    // (the village sits on +Y): distance = R * (90deg - angle(town, axis)).
    //
    // The old axis put it 7 units out, which stacked the bridge, the square and
    // the churchyard on top of each other — the place-name lookup takes the
    // smallest matching region, so standing at the church announced Le Vieux
    // Pont. At 25 units the riverside is its own part of the map.
    this.riverAxis = new THREE.Vector3(0.52, 0.74, -0.42).normalize();

    let u = new THREE.Vector3().crossVectors(this.riverAxis, townCenter);
    if (u.lengthSq() < 1e-6) u = new THREE.Vector3().crossVectors(this.riverAxis, new THREE.Vector3(1, 0, 0));
    u.normalize();
    const v = new THREE.Vector3().crossVectors(this.riverAxis, u).normalize();

    const segments = 96;
    const halfWidth = 3.4;
    const positions: number[] = [];

    for (let i = 0; i < segments; i++) {
      const a0 = (i / segments) * Math.PI * 2;
      const a1 = ((i + 1) / segments) * Math.PI * 2;

      const centre0 = u.clone().multiplyScalar(Math.cos(a0)).addScaledVector(v, Math.sin(a0));
      const centre1 = u.clone().multiplyScalar(Math.cos(a1)).addScaledVector(v, Math.sin(a1));

      // Widen and narrow gently so it reads as a river, not a canal.
      const w0 = halfWidth * (1 + Math.sin(a0 * 3) * 0.22);
      const w1 = halfWidth * (1 + Math.sin(a1 * 3) * 0.22);

      const edge = (centre: THREE.Vector3, w: number, side: number) =>
        centre.clone().addScaledVector(this.riverAxis, (side * w) / this.radius)
          .normalize().multiplyScalar(this.radius - 0.28);

      const a = edge(centre0, w0, 1);
      const b = edge(centre1, w1, 1);
      const c = edge(centre1, w1, -1);
      const d = edge(centre0, w0, -1);

      positions.push(a.x, a.y, a.z, b.x, b.y, b.z, c.x, c.y, c.z);
      positions.push(a.x, a.y, a.z, c.x, c.y, c.z, d.x, d.y, d.z);
    }

    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    geometry.computeVertexNormals();

    const water = new THREE.Mesh(geometry, ToonMaterial.create({
      color: GROUND.water,
      transparent: true,
      opacity: 0.9
    }));
    water.receiveShadow = true;
    this.decorations.add(water);

    // Bridge at the point on the river nearest the village.
    const nearest = townCenter.clone()
      .sub(this.riverAxis.clone().multiplyScalar(townCenter.dot(this.riverAxis)))
      .normalize().multiplyScalar(this.radius);

    const along = new THREE.Vector3().crossVectors(this.riverAxis, nearest).normalize();
    const bridge = this.addPiece('Bridge_Stone', nearest,
      nearest.clone().addScaledVector(along, 5));

    this.markArea('Le Vieux Pont', nearest, 7);

    if (bridge) {
      // The kit bridge spans along its own X, so face it across the water.
      const across = nearest.clone().addScaledVector(this.riverAxis, 5);
      this.placeFacing(bridge, nearest, across);
    }
  }

  /** The church, set back from the square on its own patch of ground. */
  private createChurch(): void {
    const center = this.biomes.find(b => b.type === BiomeType.TOWN)!
      .center.clone().multiplyScalar(this.radius);

    const site = this.getOffsetOnSphere(center, 2.3, 15);
    this.addPiece('Church', site, center);

    // The keeper stands at the west door, not inside the nave.
    this.anchors.set('church', this.getOffsetOnSphere(site, 2.3 + Math.PI, 9));
    this.markArea('Église Saint-Martin', site, 14);

    // Churchyard wall and a couple of trees.
    for (let i = 0; i < 6; i++) {
      const angle = (i / 6) * Math.PI * 2;
      const spot = this.getOffsetOnSphere(site, angle, 9);
      this.addPiece('Wall_Low', spot, site);
    }
    for (const angle of [0.8, 3.9]) {
      this.addPiece('Tree_Plane', this.getOffsetOnSphere(site, angle, 7));
    }
  }

  /** The village square: fountain, plane trees, benches, a well. */
  private createSquare(): void {
    const center = this.biomes.find(b => b.type === BiomeType.TOWN)!
      .center.clone().multiplyScalar(this.radius);

    const square = this.getOffsetOnSphere(center, 4.6, 13);

    this.addPiece('Fountain', square);
    this.addPiece('Well', this.getOffsetOnSphere(square, 1.2, 5));
    this.anchors.set('square', this.getOffsetOnSphere(square, 3.0, 3.2));
    this.markArea('Place du Marché', square, 11);

    // Two shops on the square, so the baker and the postmaster each have a
    // doorway to stand outside rather than a spot in an empty field.
    const trades: [string, string, number][] = [
      ['bakery', 'Boulangerie', 0.6],
      ['post', 'La Poste', 3.5]
    ];
    for (const [key, signText, angle] of trades) {
      const plot = this.getOffsetOnSphere(square, angle, 9.5);
      const shop = this.kit?.isLoaded
        ? this.kit.shop(this.houseVariant++, signText)
        : null;
      if (shop) {
        this.placeFacing(shop, plot, square);
        this.decorations.add(shop);
        this.claim(plot, 3.4);
      }
      // Stand them in front of the shop, between it and the square.
      this.anchors.set(key, plot.clone().lerp(square, 0.42)
        .normalize().multiplyScalar(this.radius));
    }

    // Plane trees ringing the square, as in every French village.
    for (let i = 0; i < 7; i++) {
      const angle = (i / 7) * Math.PI * 2 + 0.2;
      this.addPiece('Tree_Plane', this.getOffsetOnSphere(square, angle, 6.5));
    }

    for (let i = 0; i < 4; i++) {
      const angle = (i / 4) * Math.PI * 2 + 0.7;
      const bench = this.createBench();
      this.placeFacing(bench, this.getOffsetOnSphere(square, angle, 3.4), square);
      this.decorations.add(bench);
    }
  }

  /** A park along the river bank: trees, benches, low walls. */
  private createPark(): void {
    if (!this.riverAxis) return;

    const townCenter = this.biomes.find(b => b.type === BiomeType.TOWN)!.center;
    const onRiver = townCenter.clone()
      .sub(this.riverAxis.clone().multiplyScalar(townCenter.dot(this.riverAxis)))
      .normalize().multiplyScalar(this.radius);

    const along = new THREE.Vector3().crossVectors(this.riverAxis, onRiver).normalize();

    this.markArea('Les Berges', onRiver, 17);

    // The fisher sits on the bank, a little upstream of the bridge.
    this.anchors.set('riverbank', onRiver.clone()
      .addScaledVector(along, 7)
      .addScaledVector(this.riverAxis, 4.2)
      .normalize().multiplyScalar(this.radius));

    for (let i = -4; i <= 4; i++) {
      if (i === 0) continue; // leave the bridge approach clear
      const base = onRiver.clone().addScaledVector(along, i * 4.5)
        .normalize().multiplyScalar(this.radius);

      // Bank side away from the water.
      const spot = base.clone().addScaledVector(this.riverAxis, 6.2)
        .normalize().multiplyScalar(this.radius);

      if (i % 2 === 0) {
        this.addPiece('Tree_Plane', spot);
      } else {
        const bench = this.createBench();
        this.placeFacing(bench, spot, base);
        this.decorations.add(bench);
      }
    }
  }

  /** A smallholding outside the village: barn, fenced paddock, sheep and goats. */
  private createFarm(): void {
    const hillside = this.biomes.find(b => b.type === BiomeType.HILLSIDE)!
      .center.clone().multiplyScalar(this.radius);

    // Put the farm on whichever side of the hillside is furthest from the
    // water. The river's great circle runs through this biome, and nudging the
    // site by hand just moved the problem — one attempt parked the paddock
    // five metres from the bridge, another shunted it next to the village
    // square. Distance from the river is R * |asin(p . riverAxis)|, so sweep
    // the bearings and take the best one.
    let center = hillside;
    if (this.riverAxis) {
      let bestOffset = -1;
      for (let i = 0; i < 24; i++) {
        const bearing = (i / 24) * Math.PI * 2;
        const candidate = this.getOffsetOnSphere(hillside, bearing, 13);
        const offset = Math.abs(candidate.clone().normalize().dot(this.riverAxis));
        if (offset > bestOffset) {
          bestOffset = offset;
          center = candidate;
        }
      }
    }

    const yard = this.getOffsetOnSphere(center, 1.1, 6);
    this.addPiece('Barn', yard, center);
    this.anchors.set('outskirts', this.getOffsetOnSphere(center, 4.4, 17));
    this.markArea('Les Hauteurs', this.getOffsetOnSphere(center, 4.4, 17), 12);

    // Paddock fence, a ring of panels each facing the middle.
    const paddock = this.getOffsetOnSphere(yard, 2.6, 10);
    this.anchors.set('farm', this.getOffsetOnSphere(paddock, 2.6 + Math.PI, 9));
    this.markArea('La Bergerie', paddock, 15);
    const panels = 14;
    for (let i = 0; i < panels; i++) {
      const angle = (i / panels) * Math.PI * 2;
      const post = this.getOffsetOnSphere(paddock, angle, 8);
      const next = this.getOffsetOnSphere(paddock, angle + Math.PI * 2 / panels, 8);
      this.addPiece('Fence', post, next);
    }

    // The flock.
    for (let i = 0; i < 9; i++) {
      const angle = Math.random() * Math.PI * 2;
      const dist = Math.random() * 6;
      const spot = this.getOffsetOnSphere(paddock, angle, dist);
      const facing = this.getOffsetOnSphere(paddock, angle + 1.2, dist + 3);
      this.addPiece(i % 3 === 0 ? 'Goat' : 'Sheep', spot, facing, i);
    }
  }

  // ---------------------------------------------------------------- streets

  /**
   * Orient an object so its local +Y is the surface normal and its local +Z
   * points at `faceToward`.
   *
   * The kit's buildings have their fronts on +Z: Blender models them facing -Y,
   * and the glTF exporter's Z-up to Y-up conversion maps Blender -Y onto +Z.
   */
  private placeFacing(
    object: THREE.Object3D,
    position: THREE.Vector3,
    faceToward: THREE.Vector3
  ): void {
    const up = position.clone().normalize();

    const forward = faceToward.clone().sub(position);
    forward.sub(up.clone().multiplyScalar(forward.dot(up)));

    if (forward.lengthSq() < 1e-8) {
      // Degenerate: the target is directly overhead. Any tangent will do.
      forward.set(0, 1, 0).sub(up.clone().multiplyScalar(up.y));
      if (forward.lengthSq() < 1e-8) forward.set(1, 0, 0);
    }
    forward.normalize();

    // right x up = forward, so makeBasis gives a right-handed frame with the
    // building's face along +Z.
    const right = new THREE.Vector3().crossVectors(up, forward).normalize();
    const matrix = new THREE.Matrix4().makeBasis(right, up, forward);

    object.position.copy(position);
    object.quaternion.setFromRotationMatrix(matrix);
  }

  /** Evenly spaced points around a circle of surface-arc `radius` about `center`. */
  private ringStations(center: THREE.Vector3, radius: number, count: number): StreetStation[] {
    const stations: StreetStation[] = [];
    for (let i = 0; i < count; i++) {
      const angle = (i / count) * Math.PI * 2;
      const pos = this.getOffsetOnSphere(center, angle, radius);
      const next = this.getOffsetOnSphere(center, angle + 0.01, radius);
      const up = pos.clone().normalize();
      const tangent = next.sub(pos);
      tangent.sub(up.clone().multiplyScalar(tangent.dot(up))).normalize();
      stations.push({ pos, tangent, up });
    }
    return stations;
  }

  /** Points along the great-circle arc from `from` to `to`. */
  private lineStations(from: THREE.Vector3, to: THREE.Vector3, count: number): StreetStation[] {
    const stations: StreetStation[] = [];
    for (let i = 0; i <= count; i++) {
      const t = i / count;
      const pos = from.clone().lerp(to, t).normalize().multiplyScalar(this.radius);
      const ahead = from.clone().lerp(to, Math.min(1, t + 0.01))
        .normalize().multiplyScalar(this.radius);
      const up = pos.clone().normalize();
      const tangent = ahead.sub(pos);
      tangent.sub(up.clone().multiplyScalar(tangent.dot(up)));
      if (tangent.lengthSq() < 1e-8) continue;
      tangent.normalize();
      stations.push({ pos, tangent, up });
    }
    return stations;
  }

  /** Lay road slabs down the centreline of a run of stations. */
  private layRoad(stations: StreetStation[], width: number = 2.6): void {
    for (const station of stations) {
      const geo = new THREE.BoxGeometry(width, ROAD_THICKNESS, 2.6);
      const road = new THREE.Mesh(geo, ToonMaterial.create({ color: ROAD.asphalt }));
      road.receiveShadow = true;

      const right = new THREE.Vector3().crossVectors(station.up, station.tangent).normalize();
      const matrix = new THREE.Matrix4().makeBasis(right, station.up, station.tangent);
      road.position.copy(station.pos);
      road.quaternion.setFromRotationMatrix(matrix);

      this.decorations.add(road);
    }
  }

  /**
   * Line both sides of a street with buildings that face it.
   *
   * This is what replaces uniform-random scatter. Placement used to drop
   * houses at arbitrary positions and arbitrary yaw, so nothing addressed a
   * road and the town read as a field with objects in it.
   */
  private layFrontage(
    stations: StreetStation[],
    options: { setback?: number; gapChance?: number; sides?: number[]; stride?: number } = {}
  ): void {
    const {
      setback = 7.0,
      gapChance = 0.22,
      sides = [1, -1],
      stride = 1
    } = options;

    for (let i = 0; i < stations.length; i += stride) {
      const station = stations[i];
      const across = new THREE.Vector3()
        .crossVectors(station.up, station.tangent).normalize();

      for (const side of sides) {
        // Alleys: the gaps between buildings are as much of the look as the
        // buildings, so leave some plots empty.
        if (Math.random() < gapChance) continue;

        const plot = station.pos.clone()
          .addScaledVector(across, side * setback)
          .normalize().multiplyScalar(this.radius);

        if (!this.clearOfSpawn(plot, SPAWN_CLEARANCE * 0.8)) continue;

        if (!this.isFree(plot, 3.0)) continue;

        const house = this.createHouse();
        this.placeFacing(house, plot, station.pos);
        this.decorations.add(house);
        this.claim(plot, 3.2);
      }
    }
  }

  private fillGlobalDecorations(): void {
    // Scatter houses, trees, and props across the entire sphere
    // Dense content to wrap the entire sphere - no empty patches
    
    // Seen from orbit the gaps between regions are what read as bare, so the
    // in-between fill is generous. The occupancy check keeps it from landing
    // on anything, and most candidates are rejected — these are attempts, not
    // guaranteed placements.
    const numGlobalTrees = 260;
    const numGlobalProps = 220;

    // Roadside hamlets rather than 60 houses scattered at random bearings.
    // Buildings only exist where a road gives them something to address.
    this.createRoadsideHamlets();

    // Trees everywhere
    for (let i = 0; i < numGlobalTrees; i++) {
      const theta = Math.random() * Math.PI * 2;
      const phi = Math.acos(2 * Math.random() - 1);
      const pos = new THREE.Vector3(
        Math.sin(phi) * Math.cos(theta),
        Math.cos(phi),
        Math.sin(phi) * Math.sin(theta)
      ).multiplyScalar(this.radius);
      
      if (!this.clearOfSpawn(pos, SPAWN_CLEARANCE * 0.7)) continue;
      this.plantTree(pos);
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
      
      if (!this.clearOfSpawn(pos, SPAWN_CLEARANCE * 0.6)) continue;

      // Village furniture only. Traffic cones, traffic mirrors and vending
      // machines belonged to the Japanese-alley direction and read as litter
      // in a French village.
      const kitProp = ['Tree_Plane', 'Wall_Low', 'Tree_Plane', 'Well'][
        Math.floor(Math.random() * 4)];

      if (this.addPiece(kitProp, pos)) continue;

      const prop = Math.random() < 0.5 ? this.createBench() : this.createMailbox();
      this.placeOnSphere(prop, pos);
      this.decorations.add(prop);
    }
    
    // Add retaining walls along roads
    this.createGlobalRetainingWalls();
  }

  /**
   * Small clusters of frontage along the trunk roads between settlements, so
   * the walk between biomes passes through inhabited places instead of an
   * evenly dusted field of houses.
   */
  private createRoadsideHamlets(): void {
    for (let i = 0; i < this.biomes.length; i++) {
      for (let j = i + 1; j < this.biomes.length; j++) {
        const from = this.biomes[i].center.clone().multiplyScalar(this.radius);
        const to = this.biomes[j].center.clone().multiplyScalar(this.radius);

        // Two hamlets per trunk road, at a third and two thirds along.
        for (const t of [0.34, 0.66]) {
          const mid = from.clone().lerp(to, t).normalize().multiplyScalar(this.radius);
          const ahead = from.clone().lerp(to, t + 0.04)
            .normalize().multiplyScalar(this.radius);

          const span = this.lineStations(
            mid.clone().lerp(ahead, -1.6).normalize().multiplyScalar(this.radius),
            mid.clone().lerp(ahead, 2.6).normalize().multiplyScalar(this.radius),
            3
          );

          this.layFrontage(span, { setback: 6.8, gapChance: 0.35 });
        }
      }
    }
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
        this.placeOnSphere(wall, pos, lon);
        this.decorations.add(wall);
      }
    }
  }

  private createTownArea(): void {
    const biome = this.biomes.find(b => b.type === BiomeType.TOWN)!;
    const center = biome.center.clone().multiplyScalar(this.radius);
    
    // The town is a ring road with buildings addressing it from both sides,
    // plus radial lanes running out of it. Everything faces a street.
    const ringRadius = 11;
    const ring = this.ringStations(center, ringRadius, 20);
    this.layRoad(ring, 3.0);
    this.layFrontage(ring, { setback: 7.4, gapChance: 0.24 });

    // Radial lanes off the ring. Their outer frontage forms the town edge.
    const laneCount = 4;
    for (let i = 0; i < laneCount; i++) {
      const angle = (i / laneCount) * Math.PI * 2 + 0.4;
      const inner = this.getOffsetOnSphere(center, angle, ringRadius + 1);
      const outer = this.getOffsetOnSphere(center, angle, ringRadius + 11);

      const lane = this.lineStations(inner, outer, 5);
      this.layRoad(lane, 2.4);
      this.layFrontage(lane, { setback: 6.6, gapChance: 0.3, stride: 1 });
    }

    // A short high street running past the start, so the opening shot looks
    // down a corridor rather than across open ground.
    const spawn = this.spawnPoint.clone();
    const towardCenter = center.clone().sub(spawn).normalize();
    const highStart = spawn.clone().addScaledVector(towardCenter, -7)
      .normalize().multiplyScalar(this.radius);
    const highEnd = spawn.clone().addScaledVector(towardCenter, 16)
      .normalize().multiplyScalar(this.radius);

    this.markArea('Le Bourg', center, 20);

    const highStreet = this.lineStations(highStart, highEnd, 7);
    this.layRoad(highStreet, 3.0);
    this.layFrontage(highStreet, { setback: 7.2, gapChance: 0.18 });
    
    // Street furniture. A French village has a post box, garden walls and
    // plane trees — not vending machines, traffic mirrors and cones, which
    // were props for the Japanese-alley direction this started as.
    const mailbox = this.createMailbox();
    this.placeOnSphere(mailbox, this.getOffsetOnSphere(center, 1.5, 5));
    this.decorations.add(mailbox);

    for (let i = 0; i < 5; i++) {
      const angle = (i / 5) * Math.PI * 2 + 0.3;
      const spot = this.getOffsetOnSphere(center, angle, 7 + Math.random() * 2);
      if (!this.clearOfSpawn(spot, SPAWN_CLEARANCE * 0.7)) continue;
      this.addPiece('Tree_Plane', spot);
    }

    for (let i = 0; i < 4; i++) {
      const angle = (i / 4) * Math.PI * 2 + 1.1;
      const spot = this.getOffsetOnSphere(center, angle, 9);
      this.addPiece('Wall_Low', spot, center);
    }
  }

  /**
   * A street-front building. Comes from the Blender kit when it has loaded,
   * and falls back to the old primitive assembly so a missing GLB degrades
   * to a playable world rather than an empty one.
   *
   * Roughly one plot in four is a shop, which is what puts French signage
   * along the street without turning the village into a high street.
   */
  private createHouse(allowShop: boolean = true): THREE.Object3D {
    if (this.kit && this.kit.isLoaded) {
      const variant = this.houseVariant++;
      const wantShop = allowShop && this.shopsPlaced < SHOP_SIGNS.length
        && Math.random() < 0.28;

      const built = wantShop
        ? this.kit.shop(variant, SHOP_SIGNS[this.shopsPlaced++])
        : this.kit.house(variant);

      if (built) return built;
    }
    return this.createPrimitiveHouse();
  }

  /**
   * Record that something solid stands here, so later placement passes can
   * avoid it.
   *
   * Trees were landing inside houses because scatter only ever tested the
   * distance to a biome centre — it had no idea where any building actually
   * ended up.
   */
  /** Register a named region and, usually, the anchor that sits inside it. */
  private markArea(name: string, center: THREE.Vector3, radius: number): void {
    this.areas.push({ name, center: center.clone().normalize(), radius });
  }

  /**
   * The named region containing a point, or null out in open country.
   *
   * Among the regions that contain the point, the one whose centre is nearest
   * wins. Preferring the smallest region instead looks reasonable and is not:
   * on a sphere this size the regions overlap heavily, so a small one anywhere
   * near a big one swallows it — that rule put the shepherd's farm under
   * Le Vieux Pont and the fisher under La Bergerie. Nearest-centre asks the
   * question the player is actually asking, which is what am I standing next
   * to.
   */
  public getAreaAt(position: THREE.Vector3): Area | null {
    const dir = position.clone().normalize();
    let best: Area | null = null;
    let bestArc = Infinity;

    for (const area of this.areas) {
      const dot = THREE.MathUtils.clamp(dir.dot(area.center), -1, 1);
      const arc = this.radius * Math.acos(dot);
      if (arc <= area.radius && arc < bestArc) {
        best = area;
        bestArc = arc;
      }
    }
    return best;
  }

  private claim(position: THREE.Vector3, radius: number): void {
    this.occupied.push({ pos: position.clone().normalize(), radius });
  }

  /** True if nothing already claimed ground within `clearance` of here. */
  private isFree(position: THREE.Vector3, clearance: number): boolean {
    const dir = position.clone().normalize();
    for (const claim of this.occupied) {
      const dot = THREE.MathUtils.clamp(dir.dot(claim.pos), -1, 1);
      const arc = this.radius * Math.acos(dot);
      if (arc < claim.radius + clearance) return false;
    }
    return true;
  }

  /** A tree. Uses the kit's plane tree; falls back to the primitive one. */
  private createTree(): THREE.Object3D {
    if (this.kit?.isLoaded && this.kit.has('Tree_Plane')) {
      const tree = this.kit.instance('Tree_Plane', this.houseVariant++);
      if (tree) return tree;
    }
    return this.createPrimitiveTree();
  }

  /**
   * Plant a tree only where there is room for it, and register the space it
   * takes so nothing else lands on top.
   */
  private plantTree(position: THREE.Vector3, clearance: number = 3.4): boolean {
    if (!this.isFree(position, clearance)) return false;

    const tree = this.createTree();
    this.placeOnSphere(tree, position);
    this.decorations.add(tree);
    this.claim(position, 1.6);

    this.foliage.push(tree);
    this.foliageBaseQuaternions.set(tree, tree.quaternion.clone());
    return true;
  }

  /** A kit prop placed flat on the surface, facing a given point. */
  private addPiece(
    name: string,
    position: THREE.Vector3,
    faceToward?: THREE.Vector3,
    variant: number = 0
  ): THREE.Object3D | null {
    if (!this.kit || !this.kit.isLoaded || !this.kit.has(name)) return null;
    const piece = this.kit.instance(name, variant);
    if (!piece) return null;

    if (faceToward) {
      this.placeFacing(piece, position, faceToward);
    } else {
      this.placeOnSphere(piece, position);
    }
    this.decorations.add(piece);

    const footprint: Record<string, number> = {
      Church: 11, Barn: 5, Bridge_Stone: 7, Fountain: 2.4,
      Well: 1.6, Tree_Plane: 1.6, Wall_Low: 2.6
    };
    this.claim(position, footprint[name] ?? 1.2);

    return piece;
  }

  private createPrimitiveHouse(): THREE.Group {
    const house = new THREE.Group();
    
    // Random house colors for variety
    const wallColor = pick(BUILDING.walls);
    const roofColor = pick(BUILDING.roofs);
    
    // Main body
    const bodyGeo = new THREE.BoxGeometry(3, 2.5, 2.5);
    const bodyMat = ToonMaterial.create({ color: wallColor });
    const body = new THREE.Mesh(bodyGeo, bodyMat);
    body.position.y = 1.25;
    body.castShadow = true;
    body.receiveShadow = true;
    house.add(body);
    
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
    
    // Door
    const doorGeo = new THREE.BoxGeometry(0.8, 1.6, 0.1);
    const doorMat = ToonMaterial.create({ color: BUILDING.door });
    const door = new THREE.Mesh(doorGeo, doorMat);
    door.position.set(0, 0.8, 1.3);
    house.add(door);
    
    // Windows with frames
    for (let i = 0; i < 2; i++) {
      const windowGeo = new THREE.BoxGeometry(0.6, 0.6, 0.1);
      const windowMat = ToonMaterial.create({ color: BUILDING.window });
      const windowMesh = new THREE.Mesh(windowGeo, windowMat);
      windowMesh.position.set(i === 0 ? -0.9 : 0.9, 1.8, 1.3);
      house.add(windowMesh);
      
      const frameGeo = new THREE.BoxGeometry(0.7, 0.7, 0.05);
      const frameMat = ToonMaterial.create({ color: BUILDING.windowFrame });
      const frame = new THREE.Mesh(frameGeo, frameMat);
      frame.position.copy(windowMesh.position);
      frame.position.z += 0.03;
      house.add(frame);
    }
    
    // AC unit
    const acGeo = new THREE.BoxGeometry(0.8, 0.4, 0.3);
    const acMat = ToonMaterial.create({ color: BUILDING.trim });
    const ac = new THREE.Mesh(acGeo, acMat);
    ac.position.set(1.2, 2.0, -1.3);
    house.add(ac);
    
    return house;
  }

  private createMailbox(): THREE.Group {
    const mb = new THREE.Group();
    
    const postGeo = new THREE.CylinderGeometry(0.08, 0.08, 1.2, 8);
    const postMat = ToonMaterial.create({ color: ACCENT.ember });
    const post = new THREE.Mesh(postGeo, postMat);
    post.position.y = 0.6;
    mb.add(post);
    
    const boxGeo = new THREE.CylinderGeometry(0.25, 0.25, 0.5, 16);
    const boxMat = ToonMaterial.create({ color: ACCENT.ember });
    const box = new THREE.Mesh(boxGeo, boxMat);
    box.position.y = 1.35;
    box.castShadow = true;
    mb.add(box);
    
    const topGeo = new THREE.SphereGeometry(0.25, 16, 8, 0, Math.PI * 2, 0, Math.PI / 2);
    const top = new THREE.Mesh(topGeo, boxMat);
    top.position.y = 1.6;
    mb.add(top);
    
    const slotGeo = new THREE.BoxGeometry(0.2, 0.03, 0.1);
    const slotMat = ToonMaterial.create({ color: MATERIAL.metalDark });
    const slot = new THREE.Mesh(slotGeo, slotMat);
    slot.position.set(0, 1.45, 0.2);
    mb.add(slot);
    
    return mb;
  }

  private createRetainingWall(): THREE.Group {
    const wall = new THREE.Group();
    
    for (let i = 0; i < 5; i++) {
      const blockGeo = new THREE.BoxGeometry(2, 1.5, 0.8);
      const blockMat = ToonMaterial.create({ color: MATERIAL.stone });
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
      color: GROUND.water,
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
    const deckMat = ToonMaterial.create({ color: MATERIAL.wood });
    const deck = new THREE.Mesh(deckGeo, deckMat);
    deck.position.y = 0.8;
    deck.castShadow = true;
    deck.receiveShadow = true;
    pier.add(deck);
    
    for (let i = 0; i < 6; i++) {
      const postGeo = new THREE.CylinderGeometry(0.1, 0.12, 1.5, 6);
      const postMat = ToonMaterial.create({ color: MATERIAL.woodDark });
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
    const hullMat = ToonMaterial.create({ color: ACCENT.teal });
    const hull = new THREE.Mesh(hullGeo, hullMat);
    hull.position.y = 0.3;
    hull.castShadow = true;
    boat.add(hull);
    
    const cabinGeo = new THREE.BoxGeometry(0.8, 0.8, 1);
    const cabinMat = ToonMaterial.create({ color: BUILDING.trim });
    const cabin = new THREE.Mesh(cabinGeo, cabinMat);
    cabin.position.set(0, 0.9, -0.5);
    cabin.castShadow = true;
    boat.add(cabin);
    
    return boat;
  }

  private createBeachUmbrella(): THREE.Group {
    const umbrella = new THREE.Group();
    
    const poleGeo = new THREE.CylinderGeometry(0.03, 0.03, 2, 6);
    const poleMat = ToonMaterial.create({ color: MATERIAL.wood });
    const pole = new THREE.Mesh(poleGeo, poleMat);
    pole.position.y = 1;
    umbrella.add(pole);
    
    const topGeo = new THREE.ConeGeometry(1, 0.6, 8);
    const topMat = ToonMaterial.create({ 
      color: [ACCENT.ember, ACCENT.lemon, ACCENT.teal][Math.floor(Math.random() * 3)]
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
    const baseMat = ToonMaterial.create({ color: BUILDING.trim });
    const base = new THREE.Mesh(baseGeo, baseMat);
    base.position.y = 2;
    base.castShadow = true;
    lh.add(base);
    
    for (let i = 0; i < 3; i++) {
      const stripeGeo = new THREE.CylinderGeometry(1.05 - i * 0.1, 1.15 - i * 0.1, 0.5, 8);
      const stripeMat = ToonMaterial.create({ color: ACCENT.ember });
      const stripe = new THREE.Mesh(stripeGeo, stripeMat);
      stripe.position.y = 0.8 + i * 1.3;
      lh.add(stripe);
    }
    
    const lampGeo = new THREE.CylinderGeometry(0.6, 0.8, 1, 8);
    const lampMat = ToonMaterial.create({ color: MATERIAL.metalDark });
    const lamp = new THREE.Mesh(lampGeo, lampMat);
    lamp.position.y = 4.5;
    lh.add(lamp);
    
    const lightGeo = new THREE.SphereGeometry(0.4, 8, 8);
    const lightMat = ToonMaterial.create({ color: ACCENT.lamp, emissive: ACCENT.lemon, emissiveIntensity: 0.5 });
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
      
      this.plantTree(offset);
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

  private createPrimitiveTree(): THREE.Group {
    const tree = new THREE.Group();
    
    const trunkGeo = new THREE.CylinderGeometry(0.15, 0.25, 2, 8);
    const trunkMat = ToonMaterial.create({ color: MATERIAL.trunk });
    const trunk = new THREE.Mesh(trunkGeo, trunkMat);
    trunk.position.y = 1;
    trunk.castShadow = true;
    tree.add(trunk);
    
    const foliageGeo = new THREE.IcosahedronGeometry(1.3, 1);
    const foliageMat = ToonMaterial.create({ color: MATERIAL.foliage });
    const foliage = new THREE.Mesh(foliageGeo, foliageMat);
    foliage.position.y = 2.8;
    foliage.castShadow = true;
    tree.add(foliage);
    
    return tree;
  }

  private createLookoutPlatform(): THREE.Group {
    const lookout = new THREE.Group();
    
    const platformGeo = new THREE.CylinderGeometry(1.8, 1.8, 0.3, 8);
    const platformMat = ToonMaterial.create({ color: MATERIAL.wood });
    const platform = new THREE.Mesh(platformGeo, platformMat);
    platform.position.y = 2.5;
    platform.castShadow = true;
    platform.receiveShadow = true;
    lookout.add(platform);
    
    for (let i = 0; i < 4; i++) {
      const angle = (i / 4) * Math.PI * 2;
      const postGeo = new THREE.CylinderGeometry(0.12, 0.12, 2.5, 6);
      const postMat = ToonMaterial.create({ color: MATERIAL.woodDark });
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
    const railMat = ToonMaterial.create({ color: MATERIAL.wood });
    const rail = new THREE.Mesh(railGeo, railMat);
    rail.position.y = 2.9;
    rail.rotation.x = Math.PI / 2;
    lookout.add(rail);
    
    return lookout;
  }

  private createBench(): THREE.Group {
    const bench = new THREE.Group();
    
    const seatGeo = new THREE.BoxGeometry(1.5, 0.1, 0.5);
    const seatMat = ToonMaterial.create({ color: MATERIAL.wood });
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
      const legMat = ToonMaterial.create({ color: MATERIAL.metalDark });
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
    
    const postMat = ToonMaterial.create({ color: ACCENT.emberDeep });
    
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
    const baseMat = ToonMaterial.create({ color: MATERIAL.stone });
    const base = new THREE.Mesh(baseGeo, baseMat);
    base.position.y = 0.25;
    base.castShadow = true;
    base.receiveShadow = true;
    shrine.add(base);
    
    const bodyGeo = new THREE.BoxGeometry(4, 3, 3);
    const bodyMat = ToonMaterial.create({ color: ACCENT.emberDeep });
    const body = new THREE.Mesh(bodyGeo, bodyMat);
    body.position.y = 2;
    body.castShadow = true;
    shrine.add(body);
    
    const roofGeo = new THREE.BoxGeometry(5.5, 0.5, 4);
    const roofMat = ToonMaterial.create({ color: MATERIAL.metalDark });
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
    const stoneMat = ToonMaterial.create({ color: MATERIAL.stoneDark });
    const base = new THREE.Mesh(baseGeo, stoneMat);
    base.position.y = 0.15;
    base.castShadow = true;
    lantern.add(base);
    
    const stemGeo = new THREE.CylinderGeometry(0.1, 0.1, 1, 6);
    const stem = new THREE.Mesh(stemGeo, stoneMat);
    stem.position.y = 0.8;
    lantern.add(stem);
    
    const houseGeo = new THREE.BoxGeometry(0.5, 0.5, 0.5);
    const houseMat = ToonMaterial.create({ color: ACCENT.lamp, emissive: ACCENT.lemon, emissiveIntensity: 0.3 });
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
      const stepMat = ToonMaterial.create({ color: MATERIAL.stoneDark });
      const step = new THREE.Mesh(stepGeo, stepMat);
      step.position.set(0, i * 0.25, -i * 0.5);
      step.castShadow = true;
      step.receiveShadow = true;
      steps.add(step);
    }
    
    return steps;
  }

  /**
   * Clouds.
   *
   * These used to be five near-spherical blobs scaled 2-4x and parked 20 units
   * up, which on a radius-30 planet made each one about as wide as the visible
   * world — they read as blimps rather than weather. They are now much flatter,
   * smaller, higher and more numerous.
   */
  private createClouds(): void {
    for (let i = 0; i < 22; i++) {
      const cloud = this.createCloud();
      const theta = Math.random() * Math.PI * 2;
      const phi = Math.random() * Math.PI;
      
      const dist = this.radius + 34 + Math.random() * 22;
      cloud.position.set(
        Math.sin(phi) * Math.cos(theta) * dist,
        Math.cos(phi) * dist,
        Math.sin(phi) * Math.sin(theta) * dist
      );
      cloud.scale.setScalar(0.85 + Math.random() * 0.75);
      
      this.clouds.add(cloud);
    }
  }

  private createCloud(): THREE.Group {
    const cloud = new THREE.Group();
    
    const cloudMat = ToonMaterial.create({ color: SKY.cloud });
    
    // A flat raft of overlapping lobes, wider than it is tall.
    const lobes = 4 + Math.floor(Math.random() * 3);
    for (let i = 0; i < lobes; i++) {
      const blobGeo = new THREE.SphereGeometry(1.1 + Math.random() * 0.7, 7, 5);
      const blob = new THREE.Mesh(blobGeo, cloudMat);
      blob.position.set(
        (i - (lobes - 1) / 2) * 1.35 + (Math.random() - 0.5) * 0.5,
        (Math.random() - 0.5) * 0.25,
        (Math.random() - 0.5) * 1.1
      );
      blob.scale.set(1.15, 0.34, 0.9);
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

  private placeOnSphere(object: THREE.Object3D, position: THREE.Vector3, yawAngle?: number): void {
    // Use Matrix4.makeBasis for correct orientation
    // This ensures local +Y points outward along the surface normal
    // IMPORTANT: Do NOT use object.rotateY() after this - it rotates around WORLD Y, not local Y!
    const up = position.clone().normalize();
    
    object.position.copy(position);
    
    // Create an arbitrary tangent vector for local +Z (forward)
    let forward = new THREE.Vector3(0, 1, 0);
    if (Math.abs(up.dot(forward)) > 0.99) {
      forward = new THREE.Vector3(1, 0, 0);
    }
    // Project forward onto tangent plane
    forward.sub(up.clone().multiplyScalar(forward.dot(up))).normalize();
    
    // Apply yaw by rotating forward around the surface normal (up)
    // Use provided yaw angle, or random if not specified
    const yaw = yawAngle !== undefined ? yawAngle : Math.random() * Math.PI * 2;
    const yawQuat = new THREE.Quaternion().setFromAxisAngle(up, yaw);
    forward.applyQuaternion(yawQuat);
    
    // right = up x forward, NOT forward x up.
    //
    // The comment here used to claim forward x up gave a right-handed system.
    // It gives a left-handed one: with basis (right, up, forward) the
    // determinant is right . (up x forward) = -|up x forward|^2, which is
    // negative — a reflection, not a rotation. setFromRotationMatrix has no
    // defined behaviour on a reflection, so every object placed this way came
    // out at an arbitrary tilt, some of them fully upside down.
    //
    // This is why trees lay on their sides and props floated at angles.
    const right = new THREE.Vector3().crossVectors(up, forward).normalize();

    // Re-orthogonalise: right x up == (up x forward) x up == forward.
    forward.crossVectors(right, up).normalize();
    
    // Build rotation matrix from basis vectors: right (X), up (Y), forward (Z)
    const matrix = new THREE.Matrix4();
    matrix.makeBasis(right, up, forward);
    
    object.quaternion.setFromRotationMatrix(matrix);
  }

  private computeSpawnPoint(): THREE.Vector3 {
    const townBiome = this.biomes.find(b => b.type === BiomeType.TOWN)!;
    const townCenter = townBiome.center.clone();

    let tangent = new THREE.Vector3(0, 1, 0);
    if (Math.abs(townCenter.dot(tangent)) > 0.9) {
      tangent.set(1, 0, 0);
    }
    const offset = new THREE.Vector3().crossVectors(townCenter, tangent).normalize();

    const spawnDir = townCenter.clone().add(offset.multiplyScalar(0.15)).normalize();
    return spawnDir.multiplyScalar(this.radius);
  }

  public getSpawnPosition(): THREE.Vector3 {
    return this.spawnPoint.clone().normalize().multiplyScalar(this.radius + 0.5);
  }

  /**
   * Surface distance from the spawn, in world units along the sphere.
   */
  private arcFromSpawn(pos: THREE.Vector3): number {
    const a = this.spawnPoint.clone().normalize();
    const b = pos.clone().normalize();
    return this.radius * Math.acos(THREE.MathUtils.clamp(a.dot(b), -1, 1));
  }

  /**
   * Keep a clear plaza around the start.
   *
   * The camera trails the player by 4.5 units, so a building anywhere inside
   * that radius ends up between the camera and the courier — filling the frame
   * with a roof. Placement was uniform random and only avoided the biome
   * centres, so the opening shot of the game was routinely a wall.
   */
  private clearOfSpawn(pos: THREE.Vector3, margin: number = SPAWN_CLEARANCE): boolean {
    return this.arcFromSpawn(pos) > margin;
  }

  public getBiomePosition(biome: BiomeType): THREE.Vector3 {
    const biomeData = this.biomes.find(b => b.type === biome)!;
    return biomeData.center.clone().multiplyScalar(this.radius);
  }

  public getSurfacePosition(direction: THREE.Vector3): THREE.Vector3 {
    return direction.clone().normalize().multiplyScalar(this.radius);
  }

  /** True if the mesh belongs to the cloud layer. */
  public isCloudMesh(mesh: THREE.Object3D): boolean {
    let node: THREE.Object3D | null = mesh;
    while (node) {
      if (node === this.clouds) return true;
      node = node.parent;
    }
    return false;
  }

  public update(elapsed: number): void {
    this.windTime = elapsed;
    
    for (const tree of this.foliage) {
      const baseQuat = this.foliageBaseQuaternions.get(tree);
      if (!baseQuat) continue;
      
      const pos = tree.position;
      const windOffset = Math.sin(this.windTime * 1.5 + pos.x * 0.3) * 0.015;
      const windOffset2 = Math.cos(this.windTime * 1.2 + pos.z * 0.3) * 0.01;
      
      // Apply wind as LOCAL rotation on top of base orientation
      // Create a small rotation in local space and multiply with base
      const windQuat = new THREE.Quaternion();
      const euler = new THREE.Euler(windOffset, 0, windOffset2, 'XYZ');
      windQuat.setFromEuler(euler);
      
      // Result = base * wind (local wind applied to base orientation)
      tree.quaternion.copy(baseQuat).multiply(windQuat);
    }
    
    this.clouds.children.forEach((cloud, i) => {
      cloud.position.x += Math.sin(elapsed * 0.1 + i) * 0.01;
      cloud.position.z += Math.cos(elapsed * 0.08 + i) * 0.01;
    });
  }
}
