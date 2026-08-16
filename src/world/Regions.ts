import * as THREE from 'three';

/**
 * The world map: what kind of place sits where on the globe.
 *
 * The village used to be one settlement at the north pole with loose scatter
 * everywhere else, so walking away from it meant walking into undifferentiated
 * grass with the odd tree. Measuring it showed the sphere was not actually
 * *empty* — median distance to the nearest object was about three metres — but
 * it was the same three metres everywhere, with nowhere worth going.
 *
 * So the globe is now divided into named regions of distinct character, spread
 * evenly by a Fibonacci lattice. Even spacing matters: random points on a
 * sphere clump, which is exactly how you get a crowded half and a bare half.
 */

export type RegionKind =
  | 'village'      // the main settlement, always at the start
  | 'hamlet'       // a handful of houses round a lane
  | 'vineyard'
  | 'orchard'
  | 'lavender'
  | 'wheat'        // stubble and haystacks
  | 'forest'
  | 'pasture'      // walled fields, sheep, the odd barn
  | 'graveyard'
  | 'ruin'
  | 'mill'
  | 'chapel'
  | 'allee'        // a formal double row of plane trees
  | 'clos'         // walled garden, well in the middle
  | 'quarry'       // cliff rock and a broken wall
  | 'bocage'       // hedge grid, a few trees
  | 'cale'         // boathouse on the lake shore
  | 'riverside';   // placed on the water rather than by the lattice

export interface RegionSpec {
  kind: RegionKind;
  /** Shown on the place-name card and in delivery directions. */
  name: string;
  /** Surface radius in world units. */
  radius: number;
}

/**
 * The rota of places, in the order the lattice hands out positions.
 *
 * Names are French because they are proper nouns on a signpost, the same
 * reasoning as the shopfronts; the dialogue around them stays English.
 *
 * Each kind appears once in the first sixteen slots so a lap of the globe
 * is a sequence of different places, not forest–wheat–pasture again. A
 * second hamlet sits at the end in case the lattice has room.
 */
export const REGION_ROTA: RegionSpec[] = [
  { kind: 'hamlet',    name: 'Le Hameau',            radius: 15 },
  { kind: 'vineyard',  name: 'Les Vignes',           radius: 17 },
  { kind: 'allee',     name: "L'Allée des Tilleuls", radius: 16 },
  { kind: 'mill',      name: 'Le Moulin',            radius: 14 },
  { kind: 'forest',    name: 'La Forêt',             radius: 18 },
  { kind: 'clos',      name: 'Le Clos Fleuri',       radius: 13 },
  { kind: 'wheat',     name: 'Les Champs',           radius: 17 },
  { kind: 'quarry',    name: 'La Carrière',          radius: 14 },
  { kind: 'lavender',  name: 'Les Lavandes',         radius: 16 },
  { kind: 'pasture',   name: 'Les Prés',             radius: 16 },
  { kind: 'bocage',    name: 'Le Bocage',            radius: 16 },
  { kind: 'orchard',   name: 'Le Verger',            radius: 16 },
  { kind: 'ruin',      name: 'Le Vieux Château',     radius: 15 },
  { kind: 'chapel',    name: 'La Chapelle',          radius: 13 },
  { kind: 'graveyard', name: 'Le Cimetière',         radius: 13 },
  { kind: 'hamlet',    name: 'Petit-Clocher',        radius: 14 }
];

export interface PlacedRegion extends RegionSpec {
  /** Unit vector to the region's middle. */
  center: THREE.Vector3;
}

/**
 * Fibonacci lattice on the sphere: the standard way to scatter N points with
 * near-uniform spacing and no clustering.
 *
 * `avoid` keeps the lattice clear of ground that is already spoken for — the
 * village and the river run on their own logic and would otherwise get a
 * vineyard dropped through them.
 */
export function distributeRegions(
  count: number,
  avoid: { center: THREE.Vector3; radius: number }[],
  planetRadius: number
): PlacedRegion[] {
  const placed: PlacedRegion[] = [];
  const golden = Math.PI * (3 - Math.sqrt(5));

  // Oversample the lattice, because some candidates are rejected.
  const samples = count * 3;

  for (let i = 0; i < samples && placed.length < count; i++) {
    const y = 1 - (i / (samples - 1)) * 2;
    const ringRadius = Math.sqrt(Math.max(0, 1 - y * y));
    const theta = golden * i;

    const center = new THREE.Vector3(
      Math.cos(theta) * ringRadius,
      y,
      Math.sin(theta) * ringRadius
    ).normalize();

    const spec = REGION_ROTA[placed.length % REGION_ROTA.length];

    const arcTo = (other: THREE.Vector3) =>
      planetRadius * Math.acos(THREE.MathUtils.clamp(center.dot(other), -1, 1));

    // Clear of the hand-placed set pieces.
    let blocked = avoid.some(a => arcTo(a.center) < a.radius + spec.radius * 0.55);

    // And not on top of a region already placed.
    if (!blocked) {
      blocked = placed.some(p => arcTo(p.center) < (p.radius + spec.radius) * 0.62);
    }

    if (blocked) continue;
    placed.push({ ...spec, center });
  }

  return placed;
}
