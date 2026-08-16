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
- **No terrain-aware collision for props/buildings placed via `addPiece`
  and the region scatter helpers** beyond the flat-spot system and the new
  slope skip (`tooSteep`). Worth a walk of hamlet edges now that ridge
  amplitude is higher.

## Recently fixed (for context — remove once confident these don't regress)

- Relief too gentle vs the Messenger reference — ridge amplitude pushed up,
  cliffs sharpened, and waterfalls (`Les Chutes`) placed on high river banks.
- Road ribbons read as separate tiles — each street is now one strip of
  geometry with painted cobble, not a row of boxes.
- Scatter on new cliffs — `tooSteep` skips trees and props on near-vertical
  ground so extra relief does not plant a barn in mid-air.
- Flat cardboard look vs the painted reference — mint sky dome, paper grain,
  gouache albedo maps (grass/rock/plaster/water/foliage), illustrated trees,
  and a yellow-tee courier with a bob and sling.

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
  rotations, no blending). The courier is now the right silhouette; the
  walk is still unblended joint rotations.
- Expand region variety further (currently 18 named areas from a fixed
  rota of ~12 kinds, plus `Les Chutes`).
- Investigate whether `postprocessing`'s ink/outline pass could also apply
  to the title-screen orbit view for visual consistency (should already
  work now that title reuses the main scene/composer — verify).
- Hand-paint a second grass variant in Krita so the 2×2 tile is less
  recognisable at walking speed.
- Camera collision (still open above) is the next non-art blocker.
