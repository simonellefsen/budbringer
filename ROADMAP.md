# Roadmap

Tracks completed graphics/world work and known outstanding issues for the
postilion rebuild. Update this file as items are fixed or new ones are found —
don't let it go stale.

## Known issues (open)

- Windmill sails are frozen — the mill is a landmark that should turn.

## Recently fixed (for context — remove once confident these don't regress)

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

- Turn the windmill sails (they are still a static kit mesh).
- Expand region variety further (currently 18 named areas from a fixed
  rota of ~12 kinds, plus `Les Chutes`).
- Investigate whether `postprocessing`'s ink/outline pass could also apply
  to the title-screen orbit view for visual consistency (should already
  work now that title reuses the main scene/composer — verify).
- Hand-paint a second grass variant in Krita so the 2×2 tile is less
  recognisable at walking speed.
