import * as THREE from 'three';
import { MeshBVH, acceleratedRaycast } from 'three-mesh-bvh';
import { ToonMaterial } from '../utils/ToonMaterial';
import { PaintedTextures } from '../utils/PaintedTextures';
import { GROUND, BUILDING, ROAD, MATERIAL, ACCENT, SKY, pick } from '../utils/palette';
import { Kit, SHOP_SIGNS } from './Kit';
import { distributeRegions, PlacedRegion } from './Regions';
import { Terrain } from './Terrain';

THREE.Mesh.prototype.raycast = acceleratedRaycast;

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

/** A sheep or goat the flock driver will walk around its home disc. */
export interface GrazingAnimal {
  mesh: THREE.Object3D;
  home: THREE.Vector3;
  roam: number;
  kind: 'Sheep' | 'Goat' | 'Dog';
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
  /** Sheep and goats, so the flock can wander them after the world is built. */
  public animals: GrazingAnimal[] = [];
  /** Sail hubs, spun in `update`. */
  private windmills: { sails: THREE.Group; speed: number }[] = [];
  /** The height field. Placement samples this; walking samples the mesh. */
  public terrain!: Terrain;
  /** Region layout, decided before the mesh so their ground can be levelled. */
  private regionLayout: PlacedRegion[] = [];
  private lakeCenter!: THREE.Vector3;
  /** Paddock site, chosen before the mesh so the ground under it can be level. */
  private farmCenter!: THREE.Vector3;
  /** Inward ray onto the visible grass, reused every sample. */
  private readonly groundRay = new THREE.Raycaster();
  private readonly _groundDir = new THREE.Vector3();
  private readonly _groundOrigin = new THREE.Vector3();
  private readonly _groundIn = new THREE.Vector3();

  constructor(radius: number, kit: Kit | null = null) {
    this.kit = kit;
    this.radius = radius;
    this.mesh = new THREE.Group();
    this.decorations = new THREE.Group();
    this.clouds = new THREE.Group();
    
    this.defineBiomes();
    this.spawnPoint = this.computeSpawnPoint();

    // The river axis decides where the valley is carved, so it is fixed before
    // the terrain is built rather than inside createRiver.
    this.riverAxis = new THREE.Vector3(0.52, 0.74, -0.42).normalize();
    this.terrain = new Terrain({ planetRadius: radius, riverAxis: this.riverAxis });

    // Decide where everything goes, level the ground under it, and only then
    // build the mesh. Doing this after the mesh existed left every hamlet and
    // farmstead standing on raw noise, which is what put buildings half in the
    // air on the hillsides.
    this.planLayout();
    this.reserveLakes();
    this.reserveLevelGround();

    this.createPlanetSphere();
    this.createRoads();
    this.createDecorations();
    this.createClouds();
    
    this.mesh.add(this.decorations);
    this.mesh.add(this.clouds);
  }

  /**
   * Level ground for everywhere people built, before the mesh is generated.
   *
   * A townhouse on a 30-degree slope has its floor at the height of its centre
   * and its corners in the air, so settlements get flattened rather than the
   * buildings being made to conform.
   */
  /**
   * Fix the region layout up front.
   *
   * The set-piece areas are registered here as bare Area entries so the
   * lattice can avoid them; their contents are built later.
   */
  private planLayout(): void {
    const town = this.biomes.find(b => b.type === BiomeType.TOWN)!.center;

    const onRiver = town.clone()
      .sub(this.riverAxis.clone().multiplyScalar(town.dot(this.riverAxis)))
      .normalize();

    const seeds: { center: THREE.Vector3; radius: number }[] = [
      { center: town, radius: 20 },
      { center: onRiver, radius: 17 },
      { center: this.getOffsetOnSphere(town.clone().multiplyScalar(this.radius), 2.3, 15)
          .normalize(), radius: 14 }
    ];

    this.regionLayout = distributeRegions(15, seeds, this.radius);
  }

  /**
   * A lake on the river, opposite the village.
   *
   * The river alone is a thin ribbon that barely reads from orbit; a broad
   * basin gives the globe an unmistakable patch of water.
   */
  private reserveLakes(): void {
    const town = this.biomes.find(b => b.type === BiomeType.TOWN)!.center;

    // Follow the river a long way round from the bridge.
    const onRiver = town.clone()
      .sub(this.riverAxis.clone().multiplyScalar(town.dot(this.riverAxis)))
      .normalize();
    const along = new THREE.Vector3().crossVectors(this.riverAxis, onRiver).normalize();

    this.lakeCenter = onRiver.clone()
      .addScaledVector(along, 0.72)
      .normalize();
    this.terrain.addBasin(this.lakeCenter, 13);

    // The boathouse sits on the shore, facing the water — not in the lattice,
    // or it would land in a field.
    const shore = this.getOffsetOnSphere(
      this.lakeCenter.clone().multiplyScalar(this.radius),
      1.15,
      15.2
    );
    this.regionLayout.push({
      kind: 'cale',
      name: 'La Cale',
      radius: 11,
      center: shore.clone().normalize()
    });
  }

  /**
   * Level the ground everywhere people built, before the mesh exists.
   *
   * A townhouse on a slope has its floor at the height of its centre and its
   * corners in the air. Settlements are flattened rather than the buildings
   * being made to conform — which is how real villages sit on hillsides too.
   */
  private reserveLevelGround(): void {
    const town = this.biomes.find(b => b.type === BiomeType.TOWN)!.center;
    this.terrain.addFlatSpot(town, 24);
    this.terrain.addFlatSpot(this.spawnPoint, 13);

    // The bridge approach, so the crossing meets the banks squarely.
    const nearest = town.clone()
      .sub(this.riverAxis.clone().multiplyScalar(town.dot(this.riverAxis)))
      .normalize();
    this.terrain.addFlatSpot(nearest, 10);

    this.farmCenter = this.pickFarmCenter();
    this.terrain.addFlatSpot(this.farmCenter.clone().normalize(), 14);

    const hill = this.biomes.find(b => b.type === BiomeType.HILLSIDE)!.center;
    this.terrain.addFlatSpot(hill, 8);
    const shrine = this.biomes.find(b => b.type === BiomeType.SHRINE)!.center;
    this.terrain.addFlatSpot(shrine, 10);

    // Built-up kinds get level ground. Pasture is included so the flock
    // does not stand in mid-air on a cliff face.
    const needsLevel = new Set([
      'hamlet', 'graveyard', 'mill', 'chapel', 'ruin', 'pasture',
      'clos', 'cale', 'allee', 'bocage', 'wheat'
    ]);
    for (const region of this.regionLayout) {
      if (!needsLevel.has(region.kind)) continue;
      const pad = region.kind === 'ruin' ? 0.95 : region.kind === 'pasture' ? 0.7 : 0.75;
      this.terrain.addFlatSpot(region.center, region.radius * pad);
    }
  }

  /** Same sweep createFarm uses: furthest from the river on the hillside. */
  private pickFarmCenter(): THREE.Vector3 {
    const hillside = this.biomes.find(b => b.type === BiomeType.HILLSIDE)!
      .center.clone().multiplyScalar(this.radius);
    let center = hillside;
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
    return center;
  }

  private createPlanetSphere(): void {
    // Three.js `detail` is edge subdivisions, not recursive splits: 6 gave
    // 980 triangles ~5 m across, so ridges read as a few giant facets and
    // the analytic crest sat metres above the grass. 32 is ~1 m on the flats.
    const geometry = new THREE.IcosahedronGeometry(this.radius, 32);

    const posAttr = geometry.getAttribute('position');
    const colors: number[] = [];
    const dir = new THREE.Vector3();

    for (let i = 0; i < posAttr.count; i++) {
      dir.set(posAttr.getX(i), posAttr.getY(i), posAttr.getZ(i)).normalize();

      // Displace to the height field. Elevation depends only on direction, so
      // the icosahedron's duplicated corner vertices move identically and the
      // mesh cannot split along a seam.
      const surface = this.terrain.surfacePoint(dir);
      posAttr.setXYZ(i, surface.x, surface.y, surface.z);

      const color = this.getBiomeColorAtPosition(dir, this.terrain.heightAt(dir));
      colors.push(color.r, color.g, color.b);
    }

    posAttr.needsUpdate = true;
    geometry.computeVertexNormals();
    geometry.computeBoundingSphere();
    geometry.computeBoundingBox();

    geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));

    // XZ world UVs: the village sits near +Y, so this scale is even underfoot
    // and does not switch projection on a cube face. Two grass paintings then
    // take turns per patch so the old 2×2 never reads as a grid.
    const uvs = new Float32Array(posAttr.count * 2);
    for (let i = 0; i < posAttr.count; i++) {
      uvs[i * 2] = posAttr.getX(i) * 0.16;
      uvs[i * 2 + 1] = posAttr.getZ(i) * 0.16;
    }
    geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
    const material = ToonMaterial.create({
      color: 0xe4ebd4,
      vertexColors: true,
      map: PaintedTextures.get('grass', 1),
      unique: true
    });
    PaintedTextures.varyGround(material);
    
    this.sphere = new THREE.Mesh(geometry, material);
    this.sphere.receiveShadow = true;
    this.mesh.add(this.sphere);
    this.bindGroundMesh();
  }

  /**
   * BVH on the displaced sphere so walkers can sit on the grass you see.
   *
   * Vertices follow `heightAt` exactly; the faces between them do not. On a
   * ridge the analytic crest is above the triangle, which is why the courier
   * and villagers used to hover. A ray against this mesh is the visible ground.
   */
  private bindGroundMesh(): void {
    this.sphere.updateMatrixWorld(true);
    this.sphere.geometry.boundsTree = new MeshBVH(this.sphere.geometry);
    this.groundRay.firstHitOnly = true;
    this.groundRay.near = 0;
  }

  /**
   * Distance from the planet centre to the rendered grass under `direction`.
   *
   * Falls back to the height field if the ray misses, which should not happen
   * on a closed icosahedron.
   */
  public meshRadiusAt(direction: THREE.Vector3): number {
    const dir = this._groundDir.copy(direction);
    const len = dir.length();
    if (len < 1e-8) return this.terrain.surfaceRadius(direction);
    dir.multiplyScalar(1 / len);

    // Start well above the tallest ridge (~13 m) and fire at the centre.
    this._groundOrigin.copy(dir).multiplyScalar(this.radius + 28);
    this._groundIn.copy(dir).negate();
    this.groundRay.far = 48;
    this.groundRay.set(this._groundOrigin, this._groundIn);

    const hits = this.groundRay.intersectObject(this.sphere, false);
    if (hits.length > 0) return hits[0].point.length();
    return this.terrain.surfaceRadius(direction);
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

  private getBiomeColorAtPosition(pos: THREE.Vector3, height: number = 0): THREE.Color {
    const normalizedPos = pos.clone().normalize();

    const finalColor = new THREE.Color(GROUND.base);

    for (const biome of this.biomes) {
      const dist = normalizedPos.distanceTo(biome.center);
      if (dist < biome.radius) {
        const weight = 1 - (dist / biome.radius);
        const smoothWeight = weight * weight * (3 - 2 * weight);
        finalColor.lerp(biome.color, smoothWeight);
      }
    }

    // Bare rock on the high ground and silt down in the valley, so relief
    // reads in colour as well as in silhouette.
    if (height > 4.4) {
      finalColor.lerp(new THREE.Color(MATERIAL.stoneCool),
        THREE.MathUtils.smoothstep(height, 4.4, 12.0) * 0.8);
    } else if (height < -1.2) {
      finalColor.lerp(new THREE.Color(GROUND.seaside),
        THREE.MathUtils.smoothstep(-height, 1.2, 3.2) * 0.7);
    }

    // Painted patches: extra dabs of lighter and deeper grass so the ground
    // does not read as a single filled colour.
    const speckle = Math.abs(Math.sin(
      normalizedPos.x * 17.4 + normalizedPos.y * 13.1 + normalizedPos.z * 9.7
    ));
    if (speckle > 0.74) {
      finalColor.lerp(new THREE.Color(MATERIAL.foliageLight), 0.3);
    } else if (speckle < 0.16) {
      finalColor.lerp(new THREE.Color(MATERIAL.foliageDeep), 0.22);
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
    // Trunk roads between settlements, each a single ribbon.
    for (let i = 0; i < this.biomes.length; i++) {
      for (let j = i + 1; j < this.biomes.length; j++) {
        const from = this.biomes[i].center.clone().multiplyScalar(this.radius);
        const to = this.biomes[j].center.clone().multiplyScalar(this.radius);
        this.layRoad(this.lineStations(from, to, 24), 1.9);
      }
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
    this.createWaterfalls();
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
      if (this.tooSteep(spot)) continue;
      const name = pieces[Math.floor(Math.random() * pieces.length)];
      const piece = this.addPiece(name, spot);
      if (piece && (name === 'Sheep' || name === 'Goat' || name === 'Dog')) {
        this.registerAnimal(piece, name, center, radius * 0.85);
      }
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
        if (this.tooSteep(spot, 0.84)) continue;
        // Face along the row so the piece's length runs with it.
        const ahead = this.getOffsetOnSphere(rowMid, bearing, a + 2);
        this.addPiece(piece, spot, ahead);
      }
    }
  }

  /** A formal drive: a road with plane trees in two ranks. */
  private buildAllee(center: THREE.Vector3, radius: number): void {
    const bearing = Math.random() * Math.PI * 2;
    const from = this.getOffsetOnSphere(center, bearing, radius * 0.72);
    const to = this.getOffsetOnSphere(center, bearing + Math.PI, radius * 0.72);
    this.layRoad(this.lineStations(from, to, 6), 2.0);

    const side = bearing + Math.PI / 2;
    const steps = 7;
    for (let i = 0; i < steps; i++) {
      const along = ((i / (steps - 1)) * 2 - 1) * radius * 0.66;
      const heading = along >= 0 ? bearing : bearing + Math.PI;
      const mid = this.getOffsetOnSphere(center, heading, Math.abs(along));
      this.addPiece('Tree_Plane', this.getOffsetOnSphere(mid, side, 3.5));
      this.addPiece('Tree_Plane', this.getOffsetOnSphere(mid, side + Math.PI, 3.5));
    }
  }

  /** A walled garden with a well in the middle. */
  private buildClos(center: THREE.Vector3, radius: number): void {
    const ring = radius * 0.52;
    const n = 8;
    for (let i = 0; i < n; i++) {
      const angle = (i / n) * Math.PI * 2;
      const spot = this.getOffsetOnSphere(center, angle, ring);
      const next = this.getOffsetOnSphere(center, angle + Math.PI * 2 / n, ring);
      this.addPiece('Wall_Low', spot, next);
    }
    this.addPiece('Well', center);
    this.layRows(center, ring * 0.55, 'Lavender_Row', 3.4, 5.6);
    this.scatterInDisc(center, ring * 0.7, 3, ['Tree_Orchard', 'Hedge']);
  }

  /** A cut in the hillside: rock, a scrap of wall, trees on the rim. */
  private buildQuarry(center: THREE.Vector3, radius: number): void {
    this.addPiece('Cliff_Rock', center);
    this.scatterInDisc(center, radius * 0.5, 6, ['Cliff_Rock'], 3.2);
    this.scatterInDisc(center, radius * 0.75, 3, ['Ruin_Arch', 'Wall_Low'], 3.6);
    this.scatterInDisc(center, radius, 6, ['Tree_Plane', 'Hedge']);
  }

  /** Hedge-lined fields — bocage, not another pasture. */
  private buildBocage(center: THREE.Vector3, radius: number): void {
    this.layRows(center, radius * 0.82, 'Hedge', 4.8, 5.5);
    this.layRows(center, radius * 0.82, 'Hedge', 5.6, 6.2);
    this.scatterInDisc(center, radius, 5, ['Tree_Plane', 'Tree_Orchard']);
    this.scatterInDisc(center, radius * 0.45, 2, ['Sheep'], 2.4);
  }

  /** A boat shed facing the lake. */
  private buildCale(center: THREE.Vector3, radius: number): void {
    const lake = this.lakeCenter.clone().multiplyScalar(this.radius);
    this.addPiece('Boathouse', center, lake);
    this.scatterInDisc(center, radius * 0.7, 4, ['Tree_Plane', 'Wall_Low']);
    const bench = this.createBench();
    this.placeFacing(bench, this.getOffsetOnSphere(center, 2.1, 4.2), lake);
    this.decorations.add(bench);

    // Finn walks the shore, not the village hillside that used to share
    // the "riverbank" name with Les Berges.
    const lakeDir = this.lakeCenter;
    const caleDir = center.clone().normalize();
    const radial = caleDir.clone().addScaledVector(lakeDir, -caleDir.dot(lakeDir));
    if (radial.lengthSq() < 1e-8) {
      radial.crossVectors(lakeDir, new THREE.Vector3(0, 1, 0));
      if (radial.lengthSq() < 1e-8) radial.crossVectors(lakeDir, new THREE.Vector3(1, 0, 0));
    }
    radial.normalize();
    const tangent = new THREE.Vector3().crossVectors(lakeDir, radial).normalize();
    const shore = (along: number) => lakeDir.clone()
      .addScaledVector(radial, 14.2 / this.radius)
      .addScaledVector(tangent, along / this.radius)
      .normalize()
      .multiplyScalar(this.radius);
    this.anchors.set('cale', shore(0));
    this.anchors.set('cale_up', shore(5.5));
    this.anchors.set('cale_down', shore(-5.5));
  }

  /** A short lane with houses either side — the shape of every hamlet. */
  private buildHamlet(center: THREE.Vector3, radius: number): void {
    const bearing = Math.random() * Math.PI * 2;
    const from = this.getOffsetOnSphere(center, bearing, radius * 0.55);
    const to = this.getOffsetOnSphere(center, bearing + Math.PI, radius * 0.55);

    const lane = this.lineStations(from, to, 5);
    this.layRoad(lane, 1.9);
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
    for (const region of this.regionLayout) {
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
          this.scatterInDisc(center, r, 46, ['Tree_Forest', 'Tree_Plane', 'Tree_Orchard'], 2.0);
          break;

        case 'pasture':
          this.scatterInDisc(center, r * 0.9, 11, ['Sheep', 'Goat'], 2.0);
          this.scatterInDisc(center, r * 0.5, 1, ['Dog'], 2.4);
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
          this.scatterInDisc(center, r, 10, ['Tree_Plane', 'Hedge', 'Wall_Low']);
          break;

        case 'mill':
          this.addWindmill(center, this.getOffsetOnSphere(center, 0, 8));
          this.scatterInDisc(center, r * 0.8, 5, ['Haystack'], 2.6);
          this.scatterInDisc(center, r, 6, ['Wall_Low', 'Tree_Plane', 'Hedge']);
          break;

        case 'chapel':
          this.addPiece('Chapel', center, this.getOffsetOnSphere(center, 0, 8));
          this.scatterInDisc(center, r, 10, ['Tree_Plane', 'Wall_Low', 'Hedge']);
          break;

        case 'allee':
          this.buildAllee(center, r);
          break;

        case 'clos':
          this.buildClos(center, r);
          break;

        case 'quarry':
          this.buildQuarry(center, r);
          break;

        case 'bocage':
          this.buildBocage(center, r);
          break;

        case 'cale':
          this.buildCale(center, r);
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

    // The axis is fixed in the constructor: the terrain needs it to carve the
    // valley before any geometry exists. How far the river passes from the
    // village depends only on its Y component (the village sits on +Y):
    // distance = R * (90deg - angle(town, axis)). At 25 units the riverside is
    // its own part of the map rather than stacked on the square.

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

      // Water surface sits a little above the carved valley floor.
      const waterRadius = this.radius + this.terrain.waterLevel + 0.55;
      const edge = (centre: THREE.Vector3, w: number, side: number) =>
        centre.clone().addScaledVector(this.riverAxis, (side * w) / this.radius)
          .normalize().multiplyScalar(waterRadius);

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

    this.applyPlanarUVs(geometry, 0.12);
    const water = new THREE.Mesh(geometry, this.waterMaterial(0.88));
    water.receiveShadow = true;
    this.decorations.add(water);

    // Bridge at the point on the river nearest the village.
    const nearest = townCenter.clone()
      .sub(this.riverAxis.clone().multiplyScalar(townCenter.dot(this.riverAxis)))
      .normalize().multiplyScalar(this.radius);

    this.placeRiverBridge(nearest);

    this.createLake();
    this.markArea('Le Vieux Pont', nearest, 7);
  }

  /**
   * Span the river: deck on the banks, arches over the water.
   *
   * The kit's span is local +X. `placeFacing` aims local +Z, so aiming
   * *across* the water lined the arches up along the bank — a timber wall
   * on the lawn. Aim along the river so X goes across, sit the deck on the
   * visible banks, and do not settle (that drops a bridge into the riverbed).
   */
  private placeRiverBridge(nearest: THREE.Vector3): void {
    if (!this.kit?.has('Bridge_Stone')) return;
    const piece = this.kit.instance('Bridge_Stone');
    if (!piece) return;

    const dir = nearest.clone().normalize();
    const along = new THREE.Vector3().crossVectors(this.riverAxis, dir).normalize();
    const waterR = this.radius + this.terrain.waterLevel + 0.55;

    const left = dir.clone().addScaledVector(this.riverAxis, 0.2).normalize();
    const right = dir.clone().addScaledVector(this.riverAxis, -0.2).normalize();
    const deckR = 0.5 * (this.meshRadiusAt(left) + this.meshRadiusAt(right));

    const nativeDeck = 3.85;
    const nativeSpan = 9;
    const bankSep = this.radius * Math.acos(
      THREE.MathUtils.clamp(left.dot(right), -1, 1)
    );
    const s = THREE.MathUtils.clamp(
      Math.max((bankSep + 2.4) / nativeSpan, (deckR - waterR + 0.5) / nativeDeck),
      0.95,
      1.65
    );
    piece.scale.multiplyScalar(s);

    const pos = dir.clone().multiplyScalar(deckR - nativeDeck * s);
    this.orientUpright(piece, pos, pos.clone().addScaledVector(along, 8));
    this.decorations.add(piece);
    this.claim(nearest, 8);
  }

  /** The lake surface, a disc at the same level as the river. */
  private createLake(): void {
    const centre = this.lakeCenter;
    const waterRadius = this.radius + this.terrain.waterLevel + 0.55;

    let tangent = new THREE.Vector3(0, 1, 0);
    if (Math.abs(centre.dot(tangent)) > 0.9) tangent.set(1, 0, 0);
    const east = new THREE.Vector3().crossVectors(centre, tangent).normalize();
    const north = new THREE.Vector3().crossVectors(centre, east).normalize();

    const segments = 40;
    const lakeRadius = 12.4;
    const positions: number[] = [];

    const rim = (i: number) => {
      const a = (i / segments) * Math.PI * 2;
      // Wobble the shore so it is a lake rather than a coin.
      const r = lakeRadius * (1 + Math.sin(a * 3) * 0.12 + Math.cos(a * 5) * 0.07);
      return centre.clone()
        .addScaledVector(east, (Math.cos(a) * r) / this.radius)
        .addScaledVector(north, (Math.sin(a) * r) / this.radius)
        .normalize().multiplyScalar(waterRadius);
    };

    const middle = centre.clone().multiplyScalar(waterRadius);
    for (let i = 0; i < segments; i++) {
      const a = rim(i);
      const b = rim(i + 1);
      positions.push(middle.x, middle.y, middle.z, a.x, a.y, a.z, b.x, b.y, b.z);
    }

    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    geometry.computeVertexNormals();

    this.applyPlanarUVs(geometry, 0.1);
    const lake = new THREE.Mesh(geometry, this.waterMaterial(0.9));
    lake.receiveShadow = true;
    this.decorations.add(lake);

    this.markArea('Le Lac', centre.clone().multiplyScalar(this.radius), 16);
    this.claim(centre.clone().multiplyScalar(this.radius), 14);
  }

  /**
   * A painted sheet down a real bank, not the kit tower.
   *
   * The kit piece is timber boxes with a blue face. Sitting that on the
   * river and then settling it by a world AABB launched it up the hillside,
   * which is the "sky waterfall" next to the houses. This follows the cliff
   * from the lip into the river instead.
   */
  private createWaterfalls(): void {
    const town = this.biomes.find(b => b.type === BiomeType.TOWN)!.center;
    let u = new THREE.Vector3().crossVectors(this.riverAxis, town);
    if (u.lengthSq() < 1e-6) u = new THREE.Vector3().crossVectors(this.riverAxis, new THREE.Vector3(1, 0, 0));
    u.normalize();
    const v = new THREE.Vector3().crossVectors(this.riverAxis, u).normalize();

    const waterRadius = this.radius + this.terrain.waterLevel + 0.55;
    let placed = 0;
    for (let i = 0; i < 56 && placed < 2; i++) {
      const a = (i / 56) * Math.PI * 2;
      const centre = u.clone().multiplyScalar(Math.cos(a)).addScaledVector(v, Math.sin(a));

      const toLake = this.radius * Math.acos(
        THREE.MathUtils.clamp(centre.dot(this.lakeCenter), -1, 1)
      );
      if (toLake < 22) continue;

      // Keep falls out of the village so a sheet does not land on a facade.
      const toTown = this.radius * Math.acos(
        THREE.MathUtils.clamp(centre.dot(town), -1, 1)
      );
      if (toTown < 22) continue;

      let bestBank: THREE.Vector3 | null = null;
      let bestDrop = 0;
      for (const side of [-1, 1]) {
        const bank = centre.clone().addScaledVector(this.riverAxis, side * 0.24).normalize();
        const drop = this.terrain.heightAt(bank) - this.terrain.waterLevel;
        if (drop > bestDrop) {
          bestDrop = drop;
          bestBank = bank;
        }
      }
      if (!bestBank || bestDrop < 8.5) continue;

      const pool = centre.clone().multiplyScalar(this.radius);
      if (!this.isFree(pool, 6)) continue;

      const sheet = this.buildFallSheet(bestBank, centre, waterRadius);
      if (!sheet) continue;
      this.decorations.add(sheet);

      if (placed === 0) this.markArea('Les Chutes', pool, 11);
      this.claim(pool, 6);
      placed++;
    }
  }

  /**
   * Ribbon from the visible bank down onto the river.
   *
   * Upper rows sit just outside the grass mesh; the last stretch eases onto
   * the water plane so the sheet meets the river instead of hanging above it.
   */
  private buildFallSheet(
    lipDir: THREE.Vector3,
    poolDir: THREE.Vector3,
    waterRadius: number
  ): THREE.Mesh | null {
    const along = new THREE.Vector3().crossVectors(lipDir, poolDir);
    if (along.lengthSq() < 1e-8) {
      along.crossVectors(lipDir, new THREE.Vector3(0, 1, 0));
      if (along.lengthSq() < 1e-8) along.crossVectors(lipDir, new THREE.Vector3(1, 0, 0));
    }
    along.normalize();

    const rows = 10;
    const cols = 6;
    const positions: number[] = [];
    const uvs: number[] = [];
    const dir = new THREE.Vector3();

    const pointAt = (row: number, col: number): THREE.Vector3 => {
      const t = row / (rows - 1);
      dir.copy(lipDir).lerp(poolDir, t).normalize();
      const cliffR = this.meshRadiusAt(dir);
      const meetWater = THREE.MathUtils.smoothstep(t, 0.72, 1);
      const r = THREE.MathUtils.lerp(cliffR + 0.16, waterRadius + 0.05, meetWater);
      const halfW = 1.45 * (1 + 0.1 * Math.sin(t * Math.PI));
      const s = (col / (cols - 1)) * 2 - 1;
      return dir.clone()
        .addScaledVector(along, (s * halfW) / this.radius)
        .normalize()
        .multiplyScalar(r);
    };

    for (let row = 0; row < rows - 1; row++) {
      for (let col = 0; col < cols - 1; col++) {
        const p00 = pointAt(row, col);
        const p10 = pointAt(row, col + 1);
        const p01 = pointAt(row + 1, col);
        const p11 = pointAt(row + 1, col + 1);
        const u0 = col / (cols - 1);
        const u1 = (col + 1) / (cols - 1);
        const v0 = (row / (rows - 1)) * 1.8;
        const v1 = ((row + 1) / (rows - 1)) * 1.8;
        positions.push(
          p00.x, p00.y, p00.z, p01.x, p01.y, p01.z, p10.x, p10.y, p10.z
        );
        uvs.push(u0, v0, u0, v1, u1, v0);
        positions.push(
          p10.x, p10.y, p10.z, p01.x, p01.y, p01.z, p11.x, p11.y, p11.z
        );
        uvs.push(u1, v0, u0, v1, u1, v1);
      }
    }

    if (positions.length < 9) return null;

    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
    geometry.computeVertexNormals();

    const mesh = new THREE.Mesh(geometry, this.fallMaterial());
    mesh.receiveShadow = true;
    return mesh;
  }

  /** Scrolling gouache, used only by the hanging sheets. */
  private fallMaterial(): THREE.MeshToonMaterial {
    const material = ToonMaterial.create({
      color: GROUND.water,
      transparent: true,
      opacity: 0.94,
      map: PaintedTextures.get('water', 3),
      unique: true,
      side: THREE.DoubleSide
    });
    material.depthWrite = true;
    PaintedTextures.fallWater(material);
    return material;
  }

  /** The church, set back from the square on its own patch of ground. */
  private createChurch(): void {
    const center = this.biomes.find(b => b.type === BiomeType.TOWN)!
      .center.clone().multiplyScalar(this.radius);

    const site = this.getOffsetOnSphere(center, 2.3, 15);
    this.addPiece('Church', site, center);

    // The keeper stands at the west door, not inside the nave, and strolls
    // the churchyard rather than cutting through the building.
    this.anchors.set('church', this.getOffsetOnSphere(site, 2.3 + Math.PI, 9));
    this.anchors.set('churchyard', this.getOffsetOnSphere(site, 2.3 + Math.PI + 0.55, 12));
    this.anchors.set('church_path', this.getOffsetOnSphere(site, 2.3 + Math.PI - 0.55, 12));
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

    // The fisher paces the bank, a little upstream of the bridge.
    const bank = (alongDist: number): THREE.Vector3 => onRiver.clone()
      .addScaledVector(along, alongDist)
      .addScaledVector(this.riverAxis, 4.2)
      .normalize().multiplyScalar(this.radius);
    this.anchors.set('riverbank', bank(7));
    this.anchors.set('riverbank_up', bank(12.5));
    this.anchors.set('riverbank_down', bank(2.2));

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
    const center = this.farmCenter;

    const yard = this.getOffsetOnSphere(center, 1.1, 6);
    this.addPiece('Barn', yard, center);
    this.anchors.set('outskirts', this.getOffsetOnSphere(center, 4.4, 17));
    this.anchors.set('outskirts_view', this.getOffsetOnSphere(center, 4.4 + 0.55, 21));
    this.markArea('Les Hauteurs', this.getOffsetOnSphere(center, 4.4, 17), 12);

    // Paddock fence, a ring of panels each facing the middle.
    const paddock = this.getOffsetOnSphere(yard, 2.6, 10);
    this.anchors.set('farm', this.getOffsetOnSphere(paddock, 2.6 + Math.PI, 9));
    this.anchors.set('farm_lane', this.getOffsetOnSphere(paddock, 2.6 + Math.PI + 0.45, 12));
    this.markArea('La Bergerie', paddock, 15);
    const panels = 14;
    for (let i = 0; i < panels; i++) {
      const angle = (i / panels) * Math.PI * 2;
      const post = this.getOffsetOnSphere(paddock, angle, 8);
      const next = this.getOffsetOnSphere(paddock, angle + Math.PI * 2 / panels, 8);
      this.addPiece('Fence', post, next);
    }

    // The flock. They stay inside the fence (radius 8) and wander later.
    for (let i = 0; i < 9; i++) {
      const angle = Math.random() * Math.PI * 2;
      const dist = Math.random() * 6;
      const spot = this.getOffsetOnSphere(paddock, angle, dist);
      const facing = this.getOffsetOnSphere(paddock, angle + 1.2, dist + 3);
      const kind = i % 3 === 0 ? 'Goat' : 'Sheep';
      const piece = this.addPiece(kind, spot, facing, i);
      if (piece) this.registerAnimal(piece, kind, paddock, 6.2);
    }
    const dogSpot = this.getOffsetOnSphere(paddock, 0.8, 4.2);
    const dog = this.addPiece('Dog', dogSpot, paddock);
    if (dog) this.registerAnimal(dog, 'Dog', paddock, 7.4);
  }

  // ---------------------------------------------------------------- streets

  /**
   * Stand `object` at `position` with local +Y radial and local +Z at
   * `faceToward`. Does not snap or settle — the caller chose the point.
   */
  private orientUpright(
    object: THREE.Object3D,
    position: THREE.Vector3,
    faceToward: THREE.Vector3
  ): void {
    const up = position.clone().normalize();
    const forward = faceToward.clone().sub(position);
    forward.sub(up.clone().multiplyScalar(forward.dot(up)));

    if (forward.lengthSq() < 1e-8) {
      forward.set(0, 1, 0).sub(up.clone().multiplyScalar(up.y));
      if (forward.lengthSq() < 1e-8) forward.set(1, 0, 0);
    }
    forward.normalize();

    const right = new THREE.Vector3().crossVectors(up, forward).normalize();
    const matrix = new THREE.Matrix4().makeBasis(right, up, forward);
    object.position.copy(position);
    object.quaternion.setFromRotationMatrix(matrix);
  }

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
    // Sit on the grass you see. The analytic crest is above the triangle
    // on a ridge, which is how benches and mailboxes ended up in the sky.
    const dir = position.clone().normalize();
    const onMesh = dir.multiplyScalar(this.meshRadiusAt(dir));
    this.orientUpright(object, onMesh, faceToward);
    this.settleOnGround(object);
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

  /**
   * One cobbled ribbon along a run of stations.
   *
   * Separate box tiles read as a dashed hatch once the ink pass outlines
   * every edge. A single strip keeps the road a continuous surface.
   */
  private layRoad(stations: StreetStation[], width: number = 2.6): void {
    if (stations.length < 2) return;

    const step = stations[0].pos.distanceTo(stations[1].pos);
    const gap = stations[0].pos.distanceTo(stations[stations.length - 1].pos);
    const closed = gap < step * 1.65;
    const seq = closed ? [...stations, stations[0]] : stations;

    const half = width / 2;
    const positions: number[] = [];
    const uvs: number[] = [];
    const indices: number[] = [];
    let along = 0;

    for (let i = 0; i < seq.length; i++) {
      const station = seq[i];
      const dir = station.pos.clone().normalize();
      const ground = this.terrain.surfacePoint(dir);
      const up = this.terrain.normalAt(dir);
      let tangent = station.tangent.clone();
      tangent.sub(up.clone().multiplyScalar(tangent.dot(up)));
      if (tangent.lengthSq() < 1e-8) tangent.copy(station.tangent);
      tangent.normalize();
      const right = new THREE.Vector3().crossVectors(up, tangent).normalize();
      const lift = up.clone().multiplyScalar(ROAD_THICKNESS);

      const left = ground.clone().addScaledVector(right, -half).add(lift);
      const rite = ground.clone().addScaledVector(right, half).add(lift);
      if (i > 0) along += seq[i - 1].pos.distanceTo(station.pos);
      positions.push(left.x, left.y, left.z, rite.x, rite.y, rite.z);
      uvs.push(along * 0.35, 0, along * 0.35, 1);

      if (i > 0) {
        const a = (i - 1) * 2;
        indices.push(a, a + 2, a + 1, a + 1, a + 2, a + 3);
      }
    }

    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
    geometry.setIndex(indices);
    geometry.computeVertexNormals();

    const road = new THREE.Mesh(geometry, ToonMaterial.create({
      color: ROAD.cobble,
      map: PaintedTextures.get('plaster', 4)
    }));
    road.receiveShadow = true;
    this.decorations.add(road);
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
        if (this.tooSteep(plot, 0.91)) continue;

        const house = this.createHouse();
        this.placeFacing(house, plot, station.pos);
        this.settleOnGround(house);
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
      if (this.tooSteep(pos, 0.88)) continue;
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
      if (this.tooSteep(pos, 0.93)) continue;
      const kitProp = Math.random() < 0.65 ? 'Tree_Plane' : 'Hedge';
      this.addPiece(kitProp, pos);
    }
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
          if (this.tooSteep(mid, 0.9)) continue;
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

  private createTownArea(): void {
    const biome = this.biomes.find(b => b.type === BiomeType.TOWN)!;
    const center = biome.center.clone().multiplyScalar(this.radius);
    
    // The town is a ring road with buildings addressing it from both sides,
    // plus radial lanes running out of it. Everything faces a street.
    const ringRadius = 11;
    const ring = this.ringStations(center, ringRadius, 20);
    this.layRoad(ring, 2.2);
    this.layFrontage(ring, { setback: 7.4, gapChance: 0.24 });

    // Radial lanes off the ring. Their outer frontage forms the town edge.
    const laneCount = 4;
    for (let i = 0; i < laneCount; i++) {
      const angle = (i / laneCount) * Math.PI * 2 + 0.4;
      const inner = this.getOffsetOnSphere(center, angle, ringRadius + 1);
      const outer = this.getOffsetOnSphere(center, angle, ringRadius + 11);

      const lane = this.lineStations(inner, outer, 5);
      this.layRoad(lane, 1.9);
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
    this.layRoad(highStreet, 2.2);
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

  /** True if the slope under `position` is too steep to site a building or tree. */
  private tooSteep(position: THREE.Vector3, minDot: number = 0.86): boolean {
    const dir = position.clone().normalize();
    return this.terrain.normalAt(dir).dot(dir) < minDot;
  }

  /** Cheap UVs from world position, good enough for a repeating painted tile. */
  private applyPlanarUVs(geometry: THREE.BufferGeometry, scale: number): void {
    const pos = geometry.getAttribute('position');
    const uvs = new Float32Array(pos.count * 2);
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i);
      const y = pos.getY(i);
      const z = pos.getZ(i);
      const ax = Math.abs(x), ay = Math.abs(y), az = Math.abs(z);
      if (ay >= ax && ay >= az) {
        uvs[i * 2] = x * scale;
        uvs[i * 2 + 1] = z * scale;
      } else if (ax >= az) {
        uvs[i * 2] = z * scale;
        uvs[i * 2 + 1] = y * scale;
      } else {
        uvs[i * 2] = x * scale;
        uvs[i * 2 + 1] = y * scale;
      }
    }
    geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
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
    if (this.kit?.isLoaded) {
      const pickName = this.kit.has('Tree_Forest') && Math.random() < 0.45
        ? 'Tree_Forest'
        : 'Tree_Plane';
      if (this.kit.has(pickName)) {
        const tree = this.kit.instance(pickName, this.houseVariant++);
        if (tree) {
          this.applyKitScale(tree, pickName);
          return tree;
        }
      }
    }
    return this.createPrimitiveTree();
  }

  /**
   * Plant a tree only where there is room for it, and register the space it
   * takes so nothing else lands on top.
   */
  private plantTree(position: THREE.Vector3, clearance: number = 3.4): boolean {
    if (!this.isFree(position, clearance)) return false;
    if (this.tooSteep(position, 0.88)) return false;

    const tree = this.createTree();
    this.placeOnSphere(tree, position, undefined, 0);
    this.settleOnGround(tree);
    this.decorations.add(tree);
    this.claim(position, 1.6);

    this.foliage.push(tree);
    this.foliageBaseQuaternions.set(tree, tree.quaternion.clone());
    return true;
  }

  /** How flat the ground must be for this piece. 0 means always allowed. */
  private slopeLimit(name: string): number {
    if (name === 'Waterfall' || name === 'Cliff_Rock' || name === 'Bridge_Stone') return 0;
    if (name === 'Haystack' || name === 'Well') return 0.92;
    if (name === 'Sheep' || name === 'Goat' || name === 'Dog') return 0.91;
    if (name.startsWith('Tree') || name === 'Hedge') return 0.88;
    if (name === 'Fence' || name === 'Wall_Low') return 0.9;
    if (name === 'Ruin_Arch' || name === 'Chapel' || name === 'Windmill') return 0.9;
    if (name === 'Barn' || name === 'Church') return 0.88;
    return 0.9;
  }

  /** A kit prop placed flat on the surface, facing a given point. */
  private addPiece(
    name: string,
    position: THREE.Vector3,
    faceToward?: THREE.Vector3,
    variant: number = 0
  ): THREE.Object3D | null {
    if (!this.kit || !this.kit.isLoaded || !this.kit.has(name)) return null;
    const limit = this.slopeLimit(name);
    if (limit > 0 && this.tooSteep(position, limit)) return null;
    const piece = this.kit.instance(name, variant);
    if (!piece) return null;
    this.applyKitScale(piece, name);

    const lean = name.startsWith('Tree') || name === 'Hedge' ? 0 : 0.12;
    if (faceToward) {
      this.placeFacing(piece, position, faceToward);
    } else {
      this.placeOnSphere(piece, position, undefined, lean);
    }
    this.decorations.add(piece);

    const footprint: Record<string, number> = {
      Church: 11, Barn: 5, Bridge_Stone: 7, Fountain: 2.4,
      Well: 1.6, Tree_Plane: 1.6, Tree_Forest: 2.0, Wall_Low: 2.6,
      Waterfall: 5, Cliff_Rock: 3.4
    };
    this.claim(position, footprint[name] ?? 1.2);

    return piece;
  }

  /**
   * The courier is a ~1.4 m kid. Kit trees, stock and the mill were modelled
   * as landmarks and read as giants beside them. Scale is applied here so
   * the Blender source stays in metres for the houses.
   */
  private applyKitScale(object: THREE.Object3D, name: string): void {
    const scale: Record<string, number> = {
      Tree_Plane: 0.58,
      Tree_Forest: 0.5,
      Tree_Orchard: 0.64,
      Sheep: 0.68,
      Goat: 0.66,
      Dog: 0.72,
      Haystack: 0.7,
      Windmill: 0.68,
      Barn: 0.82,
      Hedge: 0.8,
      Church: 0.88,
      Waterfall: 0.52,
      Cliff_Rock: 0.62,
      Ruin_Arch: 0.55
    };
    const s = scale[name];
    if (s && s !== 1) object.scale.multiplyScalar(s);
  }

  private registerAnimal(
    mesh: THREE.Object3D,
    kind: 'Sheep' | 'Goat' | 'Dog',
    home: THREE.Vector3,
    roam: number
  ): void {
    this.animals.push({ mesh, home: home.clone(), roam, kind });
  }

  /**
   * A mill with sails that turn.
   *
   * The kit splits the tower and the sails so the hub can spin. After the
   * glTF Y-up conversion the axle is local +Z, sitting at the old hub
   * (Blender (0, -1.9, 6.4) → (0, 6.4, 1.9)).
   */
  private addWindmill(position: THREE.Vector3, faceToward: THREE.Vector3): void {
    const tower = this.addPiece('Windmill', position, faceToward);
    if (!tower || !this.kit?.has('Windmill_Sails')) return;
    const blades = this.kit.instance('Windmill_Sails', this.houseVariant);
    if (!blades) return;

    const sails = new THREE.Group();
    sails.name = 'WindmillSails';
    sails.position.set(0, 6.4, 1.9);
    sails.add(blades);
    tower.add(sails);
    this.windmills.push({ sails, speed: 0.28 + Math.random() * 0.12 });
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

  /**
   * The "seaside" biome is a grass colour, not a coast. Pier, boat, beach
   * umbrellas and a lighthouse used to land here — on a hillside — which is
   * the coloured cones and the stone tower in the grass. Water things live
   * at Le Lac now.
   */
  private createSeasideArea(): void {
    const biome = this.biomes.find(b => b.type === BiomeType.SEASIDE)!;
    const center = biome.center.clone().multiplyScalar(this.radius);
    this.scatterInDisc(center, 10, 8, ['Tree_Plane', 'Hedge']);
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
    
    const lookoutSpot = this.getOffsetOnSphere(center, 0, 4);
    if (!this.tooSteep(lookoutSpot, 0.9)) {
      const lookout = this.createLookoutPlatform();
      this.placeOnSphere(lookout, lookoutSpot, undefined, 0);
      this.decorations.add(lookout);
    }
    
    for (let i = 0; i < 3; i++) {
      const bench = this.createBench();
      const angle = i * 2;
      const spot = this.getOffsetOnSphere(center, angle, 3 + Math.random() * 2);
      if (this.tooSteep(spot, 0.88)) continue;
      this.placeOnSphere(bench, spot, undefined, 0);
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
    tree.scale.setScalar(0.65);
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

  private createBench(): THREE.Object3D {
    if (this.kit?.has('Bench')) {
      const piece = this.kit.instance('Bench');
      if (piece) {
        this.applyKitScale(piece, 'Bench');
        return piece;
      }
    }
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

  /**
   * A hillside calvary, not the leftover Japanese shrine.
   *
   * The torii, box-shrine and stone lanterns were the old alley kit sitting
   * on a French hill — and they were cubes. A cross on a plinth plus yews
   * is what belongs here.
   */
  private createShrineArea(): void {
    const biome = this.biomes.find(b => b.type === BiomeType.SHRINE)!;
    const center = biome.center.clone().multiplyScalar(this.radius);

    if (!this.addPiece('Calvary', center, this.getOffsetOnSphere(center, 0, 6))) {
      this.addPiece('Chapel', center, this.getOffsetOnSphere(center, 0, 8));
    }
    this.scatterInDisc(center, 8, 6, ['Tree_Plane', 'Wall_Low']);
    const bench = this.createBench();
    this.placeFacing(bench, this.getOffsetOnSphere(center, 1.2, 4), center);
    this.decorations.add(bench);
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

  /**
   * Local-space bounds of an assembled kit piece.
   *
   * World AABBs on a sphere have corners that are not on the object. Sampling
   * the ground there is what launched the waterfall up the hillside.
   */
  private localBounds(object: THREE.Object3D): THREE.Box3 {
    const box = new THREE.Box3();
    const tmp = new THREE.Box3();
    const toLocal = new THREE.Matrix4();
    const invWorld = new THREE.Matrix4().copy(object.matrixWorld).invert();
    object.traverse((child) => {
      const mesh = child as THREE.Mesh;
      if (!mesh.isMesh || !mesh.geometry) return;
      if (!mesh.geometry.boundingBox) mesh.geometry.computeBoundingBox();
      const gb = mesh.geometry.boundingBox;
      if (!gb || gb.isEmpty()) return;
      tmp.copy(gb);
      toLocal.multiplyMatrices(invWorld, mesh.matrixWorld);
      tmp.applyMatrix4(toLocal);
      box.union(tmp);
    });
    return box;
  }

  /**
   * Drop an object along `up` until its downhill feet meet the grass.
   *
   * Only drops. Lifting from a world AABB is what put props in the sky.
   */
  private settleOnGround(object: THREE.Object3D): void {
    object.updateMatrixWorld(true);
    const local = this.localBounds(object);
    if (local.isEmpty()) return;

    const up = object.position.clone().normalize();
    const corners = [
      new THREE.Vector3(local.min.x, local.min.y, local.min.z),
      new THREE.Vector3(local.min.x, local.min.y, local.max.z),
      new THREE.Vector3(local.max.x, local.min.y, local.min.z),
      new THREE.Vector3(local.max.x, local.min.y, local.max.z)
    ];

    let maxAir = -Infinity;
    const world = new THREE.Vector3();
    for (const corner of corners) {
      world.copy(corner).applyMatrix4(object.matrixWorld);
      const radius = world.length();
      if (radius < 1e-4) continue;
      maxAir = Math.max(maxAir, radius - this.meshRadiusAt(world));
    }
    if (!isFinite(maxAir) || maxAir < 0.04) return;

    const drop = Math.min(maxAir + 0.08, 2.4);
    object.position.addScaledVector(up, -drop);
  }

  private placeOnSphere(object: THREE.Object3D, position: THREE.Vector3, yawAngle?: number, lean = 0.12): void {
    const groundDir = position.clone().normalize();
    position = groundDir.clone().multiplyScalar(this.meshRadiusAt(groundDir));
    // Use Matrix4.makeBasis for correct orientation
    // This ensures local +Y points outward along the surface normal
    // IMPORTANT: Do NOT use object.rotateY() after this - it rotates around WORLD Y, not local Y!
    //
    // A little lean is fine on a gentle slope. 55% of the terrain normal
    // on the new cliffs planted trees in the sky and sheep on the wall.
    const slope = this.terrain.normalAt(groundDir);
    const up = groundDir.clone().lerp(slope, lean).normalize();
    
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
    this.settleOnGround(object);
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
    const dir = this.spawnPoint.clone().normalize();
    return dir.multiplyScalar(this.meshRadiusAt(dir) + 0.05);
  }

  /** Distance from the planet centre to the visible ground below a direction. */
  public getGroundRadius(direction: THREE.Vector3): number {
    return this.meshRadiusAt(direction);
  }

  /** Surface point under `position`, sitting on the grass mesh. */
  public groundPoint(position: THREE.Vector3): THREE.Vector3 {
    const dir = position.clone().normalize();
    return dir.multiplyScalar(this.meshRadiusAt(dir));
  }

  /** A point `distance` units along the surface from `center` at `angle`. */
  public offsetOnSphere(center: THREE.Vector3, angle: number, distance: number): THREE.Vector3 {
    return this.getOffsetOnSphere(center, angle, distance);
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

  /**
   * How close a point is to river or lake, 0–1.
   * Used by the ambient bed so water noise only comes up on the banks.
   */
  public waterProximity(position: THREE.Vector3): number {
    const d = position.clone().normalize();
    const fromRiver = this.radius * Math.abs(Math.asin(
      THREE.MathUtils.clamp(d.dot(this.riverAxis), -1, 1)));
    const river = 1 - THREE.MathUtils.smoothstep(fromRiver, 2.5, 16);
    const fromLake = this.radius * Math.acos(
      THREE.MathUtils.clamp(d.dot(this.lakeCenter), -1, 1));
    const lake = 1 - THREE.MathUtils.smoothstep(fromLake, 10, 24);
    return Math.max(river, lake);
  }

  /** 1 in the village, 0 out in the countryside. */
  public urbanAmount(position: THREE.Vector3): number {
    const town = this.biomes.find(b => b.type === BiomeType.TOWN)!.center;
    const d = position.clone().normalize();
    const arc = this.radius * Math.acos(THREE.MathUtils.clamp(d.dot(town), -1, 1));
    return 1 - THREE.MathUtils.smoothstep(arc, 8, 28);
  }

  public getBiomePosition(biome: BiomeType): THREE.Vector3 {
    const biomeData = this.biomes.find(b => b.type === biome)!;
    return biomeData.center.clone().multiplyScalar(this.radius);
  }

  public getSurfacePosition(direction: THREE.Vector3): THREE.Vector3 {
    return this.terrain.surfacePoint(direction);
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

  /** Painted water that drifts, used by the river, the lake and the seaside. */
  private waterMaterial(opacity: number): THREE.MeshToonMaterial {
    const material = ToonMaterial.create({
      color: GROUND.water,
      transparent: true,
      opacity,
      map: PaintedTextures.get('water', 3),
      unique: true
    });
    // Transparent + no depth write let the lake paint over distant hills
    // as a blue halo. Write depth so a hillside in front stays grass.
    material.depthWrite = true;
    material.polygonOffset = true;
    material.polygonOffsetFactor = -1;
    material.polygonOffsetUnits = -1;
    PaintedTextures.shimmerWater(material);
    return material;
  }

  public update(elapsed: number): void {
    this.windTime = elapsed;
    PaintedTextures.tickWater(elapsed);

    for (const mill of this.windmills) {
      mill.sails.rotation.z = elapsed * mill.speed;
    }
    
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
