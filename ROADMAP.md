# Roadmap

Tracks completed graphics/world work and known outstanding issues for the
postilion rebuild. Update this file as items are fixed or new ones are found —
don't let it go stale.

## Known issues (open)

- **Camera clips into buildings.** `CameraController.avoidBuildingCollision`
  rebuilds a `Box3` for every mesh in the scene each frame, and doesn't
  account for terrain height. Seen clipping the courier's view into a
  building interior. Needs: a cheaper broad-phase (three-mesh-bvh is already
  installed for this) and terrain-aware clearance.
- **Relief is gentler than the Messenger reference.** Current terrain gives
  ~14 units of relief on a 30-unit radius; the reference globe reads as much
  more dramatic (cliffs, coves, layered structures). Pushing amplitude
  further will expose props scattered *between* regions that aren't
  flattened yet (only settlements/hamlets/mills/graveyards/chapels/ruins
  register flat spots) — those will need to either avoid steep slopes or
  get their own flattening.
- **Road ribbons still read as separate tiles**, not a continuous cobbled
  surface. Each station lays its own box; needs merging into one ribbon
  geometry per road.
- **No terrain-aware collision for props/buildings placed via `addPiece`
  and the region scatter helpers** beyond the flat-spot system — verify
  edge cases (e.g. cliffs cutting through a hamlet's outer houses) if relief
  amplitude increases.

## Recently fixed (for context — remove once confident these don't regress)

- Buildings tipping over on slopes — now stand upright, only small props
  lean (55% of slope).
- Region layout computed after mesh generation, leaving buildings on
  unflattened noise — layout now planned before terrain mesh is built.
- No visible water — valley was too shallow/wide; narrowed + deepened, and
  added a lake (`Le Lac`) sharing the river's water level via basins.
- Title screen showed a second, stale hand-built world — now orbits the
  real planet (`TitleScreen` 700 → 180 lines).
- Fog left off after leaving the title screen — fog park/restore is now
  explicit (`Game.suspendFog`/`restoreFog`) instead of inferred from frame
  loop state.
- Left-handed placement basis causing ~183/259 decorations to be tilted or
  upside down — fixed handedness in `placeOnSphere`.
- NPCs placed inside buildings (church, tree) — villagers now use named
  anchors registered by the world generator instead of blind biome-relative
  offsets.
- Globe read as sparse/undifferentiated from orbit — added 18 named regions
  (Fibonacci-lattice distributed) with themed populators (vineyard rows,
  orchards, pasture, forest, graveyard, mill, chapel, ruin, hamlet).
- Added world map view (orbit camera + pins) as the primary "map" UI,
  matching the reference game's approach of using the globe itself as the
  map.
- `postilion.vercel.app` domain wasn't attached to the Vercel project
  (only `budbringer-mocha.vercel.app` was) — attached properly via the
  project domains API; now follows production deploys automatically.

## Possible future work

- Modelled character animation improvements (currently simple node
  rotations, no blending).
- Expand region variety further (currently 18 named areas from a fixed
  rota of ~12 kinds).
- Investigate whether `postprocessing`'s ink/outline pass could also apply
  to the title-screen orbit view for visual consistency (should already
  work now that title reuses the main scene/composer — verify).
