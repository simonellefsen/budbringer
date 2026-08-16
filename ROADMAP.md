# Roadmap

Tracks completed graphics/world work and known outstanding issues for the
postilion rebuild. Update this file as items are fixed or new ones are found —
don't let it go stale.

## Known issues (open)

- Map place-marks are silent — you cannot tap a name to face that region.

## Recently fixed (for context — remove once confident these don't regress)

- Music-box phrases fired every few seconds in the bright midrange and
  read as a loop — the bed is quieter now, melody is rare and rolled
  off, and pads plus wind do the sitting.
- The world map only pinned you and the current delivery — named regions
  you have already walked now show a small teal mark and their name.
- Waterfalls were a painted slab — the WATER sheets now scroll down the
  cliff face, so Les Chutes reads as falling water.
- The lake and river were a painted sheet — the gouache tile now drifts
  and a soft glint travels along it, so the water reads as water.
- Title and map orbits sat past the ink fade (~36 units) so the globe
  lost every outline. Orbit views now push the fade to the far side of
  the planet and tighten the camera near-plane so depth edges still read.
- Region kinds repeated every lap — the rota is now one of each (avenue,
  walled garden, quarry, bocage, lakeside boathouse, plus the older
  kinds), so the far side is no longer forest–wheat–pasture again.
- The grass tile repeated as a recognisable 2×2 — a second painted fill
  now blends with the original per world-space patch, so neighbouring
  ground is not the same tuft.
- Windmill sails were frozen — the kit now exports the tower and sails
  separately, and the hub turns slowly so the mill reads as a landmark.
- Sheep and goats were planted props — they now graze inside their paddock
  or pasture disc, with a whole-body waddle (the kit mesh has no leg bones).
- Villagers only breathed in place — they now stroll between named anchors
  (shopfront, square, churchyard, riverbank, farm lane), blend a walk into
  the same limb rig as the courier, and stop to face you when you come close.
- Walk cycle snapped between idle / run / jump — those poses now mix with
  damped joints, footsteps fire on foot-plant, and the iPhone stick is analog
  so a light push is a stroll.
- Relief too gentle vs the Messenger reference — ridge amplitude pushed up,
  cliffs sharpened, and waterfalls (`Les Chutes`) placed on high river banks.
- Road ribbons read as separate tiles — each street is now one strip of
  geometry with painted cobble, not a row of boxes.
- Camera clipped into buildings — collision list is built once with a BVH,
  and the camera is lifted using real terrain height instead of a flat
  `planetRadius + 3`.
- Props floating on the new cliffs — trees stand upright and skip steep
  ground, animals need nearly-flat pads, and `settleOnGround` drops each
  piece until its downhill feet meet the mesh. Farm, pasture, ruin, shrine
  and the hillside lookout now get flattened pads.
- Flat cardboard look vs the painted reference — mint sky dome, paper grain,
  gouache albedo maps (grass/rock/plaster/water/foliage), illustrated trees,
  and a yellow-tee courier with a bob and sling.
- Toy-keyboard music vs a real ambient bed — slow A-minor pad progression
  with reverb, delayed piano phrases, and quieter wind/water underneath.
  SFX stay dark (noise footsteps, low dialogue ticks).

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

- Let a tap on a map name spin the orbit to face that region.
