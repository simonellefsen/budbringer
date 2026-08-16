import * as THREE from 'three';
import { createNoise3D } from 'simplex-noise';

/**
 * The shape of the ground.
 *
 * The planet was a perfect sphere, so every silhouette was the same arc and
 * the world read flat from orbit however much you put on it. This gives it
 * hills, ridges and a river valley.
 *
 * One rule governs everything here: elevation is a pure function of direction.
 * The mesh, the placement code, the walking code and the camera all call the
 * same `heightAt`, so a building's floor, the courier's feet and the vertex
 * under both agree exactly. Anything that computes ground height its own way
 * will drift, and the drift shows up as sinking buildings or a player skating
 * above the grass.
 *
 * Because it depends only on direction, the icosahedron's duplicated corner
 * vertices displace identically and the mesh cannot crack along a seam.
 */

export interface FlatSpot {
  /** Unit vector to the middle of the level ground. */
  center: THREE.Vector3;
  /** Surface radius held flat, in world units. */
  radius: number;
}

export interface TerrainOptions {
  planetRadius: number;
  /** Axis whose perpendicular great circle the river runs along. */
  riverAxis: THREE.Vector3;
  /** Half-width of the carved valley floor, in world units. */
  riverValleyWidth?: number;
  /** How deep the valley cuts below the surrounding land. */
  riverDepth?: number;
  seed?: number;
}

export class Terrain {
  public readonly planetRadius: number;
  /** Elevation of the flat river floor, relative to the base radius. */
  public readonly waterLevel: number;

  private riverAxis: THREE.Vector3;
  private valleyWidth: number;
  private riverDepth: number;

  private flatSpots: FlatSpot[] = [];
  /** Round basins cut below the water line. */
  private basins: { center: THREE.Vector3; radius: number }[] = [];

  private noiseBase: (x: number, y: number, z: number) => number;
  private noiseHill: (x: number, y: number, z: number) => number;
  private noiseRidge: (x: number, y: number, z: number) => number;
  private noiseDetail: (x: number, y: number, z: number) => number;

  constructor(options: TerrainOptions) {
    this.planetRadius = options.planetRadius;
    this.riverAxis = options.riverAxis.clone().normalize();
    this.valleyWidth = options.riverValleyWidth ?? 5.5;
    this.riverDepth = options.riverDepth ?? 5.4;
    this.waterLevel = -this.riverDepth;

    // Four fixed streams so the world is identical on every load. A seeded
    // string per octave is enough; they only need to be decorrelated.
    const seed = options.seed ?? 20260816;
    this.noiseBase = createNoise3D(mulberry32(seed));
    this.noiseHill = createNoise3D(mulberry32(seed + 101));
    this.noiseRidge = createNoise3D(mulberry32(seed + 202));
    this.noiseDetail = createNoise3D(mulberry32(seed + 303));
  }

  /**
   * Hold ground level around a place.
   *
   * Settlements need buildable ground: a townhouse dropped on a 30-degree
   * slope has its floor at the height of its centre and its corners in the
   * air. Villages, hamlets and the churchyard all register a flat spot.
   */
  public addFlatSpot(center: THREE.Vector3, radius: number): void {
    this.flatSpots.push({ center: center.clone().normalize(), radius });
  }

  /**
   * Cut a round basin, for a lake.
   *
   * Shares the river's water level so one water plane can serve both, and so
   * a lake the river runs into does not step up or down where they meet.
   */
  public addBasin(center: THREE.Vector3, radius: number): void {
    this.basins.push({ center: center.clone().normalize(), radius });
  }

  /** Surface distance between two directions, in world units. */
  private arc(a: THREE.Vector3, b: THREE.Vector3): number {
    return this.planetRadius * Math.acos(THREE.MathUtils.clamp(a.dot(b), -1, 1));
  }

  /** Raw landscape before the river and the flat spots are applied. */
  private baseHeight(d: THREE.Vector3): number {
    const { x, y, z } = d;

    // Broad land masses, then hills, then a little roughness.
    let h = this.noiseBase(x * 1.15, y * 1.15, z * 1.15) * 4.2;
    h += this.noiseHill(x * 2.7, y * 2.7, z * 2.7) * 2.1;
    h += this.noiseDetail(x * 6.4, y * 6.4, z * 6.4) * 0.55;

    // Ridged noise for escarpments: folding the noise about zero and
    // squaring the result gives sharp crests and flat-bottomed valleys,
    // which is what reads as cliffs rather than as more rolling hills.
    const r = 1 - Math.abs(this.noiseRidge(x * 2.1, y * 2.1, z * 2.1));
    const ridge = r * r * r;

    // Only let ridges bite where the base land is already high, so cliffs
    // crown the uplands instead of erupting out of meadows.
    const upland = THREE.MathUtils.smoothstep(h, 0.6, 4.0);
    h += ridge * 6.5 * upland;

    return h;
  }

  /**
   * Elevation above the base radius, in world units.
   *
   * Order matters: land, then carve the valley, then flatten settlements —
   * so a village beside the river sits on level ground above the water rather
   * than having the valley cut through its floor.
   */
  public heightAt(direction: THREE.Vector3): number {
    const d = direction.clone().normalize();
    let h = this.baseHeight(d);

    // River valley. Distance from the water's centreline depends only on the
    // component along the axis: R * |asin(d . axis)|.
    const fromRiver = this.planetRadius
      * Math.abs(Math.asin(THREE.MathUtils.clamp(d.dot(this.riverAxis), -1, 1)));

    if (fromRiver < this.valleyWidth * 2.6) {
      // 1 at the centreline, easing to 0 at the top of the banks.
      const cut = 1 - THREE.MathUtils.smoothstep(
        fromRiver, this.valleyWidth * 0.55, this.valleyWidth * 2.6);
      h = THREE.MathUtils.lerp(h, this.waterLevel, cut);
    }

    // Lake basins, cut to the same level as the river.
    for (const basin of this.basins) {
      const dist = this.arc(d, basin.center);
      if (dist > basin.radius * 1.8) continue;
      const cut = 1 - THREE.MathUtils.smoothstep(dist, basin.radius * 0.6, basin.radius * 1.8);
      h = THREE.MathUtils.lerp(h, this.waterLevel - 0.8, cut);
    }

    // Level ground for the places people built on.
    for (const spot of this.flatSpots) {
      const dist = this.arc(d, spot.center);
      if (dist > spot.radius * 1.7) continue;

      const blend = 1 - THREE.MathUtils.smoothstep(dist, spot.radius * 0.75, spot.radius * 1.7);
      const target = this.baseHeightSmoothedAt(spot.center);
      h = THREE.MathUtils.lerp(h, target, blend);
    }

    return h;
  }

  /**
   * The height a flat spot settles at.
   *
   * Sampling the raw noise at the exact centre would let a single spike decide
   * a whole village's level, so this averages a small ring around it.
   */
  private flatCache: Map<string, number> = new Map();

  private baseHeightSmoothedAt(center: THREE.Vector3): number {
    const key = `${center.x.toFixed(3)},${center.y.toFixed(3)},${center.z.toFixed(3)}`;
    const cached = this.flatCache.get(key);
    if (cached !== undefined) return cached;

    let tangent = new THREE.Vector3(0, 1, 0);
    if (Math.abs(center.dot(tangent)) > 0.9) tangent.set(1, 0, 0);
    const east = new THREE.Vector3().crossVectors(center, tangent).normalize();
    const north = new THREE.Vector3().crossVectors(center, east).normalize();

    let total = this.baseHeight(center);
    let count = 1;
    const spread = 4 / this.planetRadius;

    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2;
      const probe = center.clone()
        .addScaledVector(east, Math.cos(a) * spread)
        .addScaledVector(north, Math.sin(a) * spread)
        .normalize();
      total += this.baseHeight(probe);
      count++;
    }

    const avg = total / count;
    this.flatCache.set(key, avg);
    return avg;
  }

  /** The point on the ground below a direction. */
  public surfacePoint(direction: THREE.Vector3): THREE.Vector3 {
    const d = direction.clone().normalize();
    return d.multiplyScalar(this.planetRadius + this.heightAt(d));
  }

  /** Distance from the planet centre to the ground below a direction. */
  public surfaceRadius(direction: THREE.Vector3): number {
    return this.planetRadius + this.heightAt(direction);
  }

  /**
   * Ground normal, from finite differences on the height field.
   *
   * Used to sit objects on a slope rather than have them stand vertically out
   * of a hillside.
   */
  public normalAt(direction: THREE.Vector3, step: number = 0.6): THREE.Vector3 {
    const d = direction.clone().normalize();

    let tangent = new THREE.Vector3(0, 1, 0);
    if (Math.abs(d.dot(tangent)) > 0.9) tangent.set(1, 0, 0);
    const east = new THREE.Vector3().crossVectors(d, tangent).normalize();
    const north = new THREE.Vector3().crossVectors(d, east).normalize();

    const delta = step / this.planetRadius;
    const sample = (e: number, n: number) => this.surfacePoint(
      d.clone().addScaledVector(east, e * delta).addScaledVector(north, n * delta)
    );

    const px = sample(1, 0);
    const nx = sample(-1, 0);
    const py = sample(0, 1);
    const ny = sample(0, -1);

    const normal = new THREE.Vector3().crossVectors(
      px.sub(nx),
      py.sub(ny)
    ).normalize();

    // Keep it on the outward side.
    if (normal.dot(d) < 0) normal.negate();
    return normal;
  }
}

/** Small deterministic PRNG, so the same world is generated every load. */
function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
