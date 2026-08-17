# Roadmap

Tracks completed graphics/world work and known outstanding issues for the
postilion rebuild. Update this file as items are fixed or new ones are found —
don't let it go stale.

## Known issues (open)

- (none right now)

## Recently fixed (for context — remove once confident these don't regress)

- The wandering isle was a cone-tree on a grey disc, so it read as a
  leftover from another game. It now shares the village's painted
  cliff, orchard tree and bench.
- The wandering isle sat on world +Y, so it hung over the village pole
  and you could never reach it. It now tours a tilted orbit about 15 m
  up, standing radial, and can be found when it passes overhead.
- The sea creature sat at planet radius on the grassy "seaside" biome,
  so it hovered or sank. It now waits in the shallows of Le Lac, and
  the sky lantern hangs above the real shrine ground.
- Finding a secret again after a refresh replayed the speech. The three
  finds now persist with the mailbag, and the checklist shows how many
  you have already seen.
- There was no way to walk the mail again without wiping the browser.
  The title screen and the checklist now offer "start the mail over"
  (twice to confirm); the pin and walked places stay.
- A refresh sent you back to Maple's first letter. Completed deliveries
  and the letter in your bag now come back with the pin and the places
  you have walked.
- A refresh forgot the rose pin and every walked region. Both now live
  in local storage, and the compass points at the pin when you have no
  letter in hand.
- The map only marked places you had already walked — a tap on empty
  grass now drops a rose pin you can face again, even on the far side.
- Courier, villagers and the flock were still crate-people and a vertical
  wool drum. Figures have a prism skull, neck and tapered limbs; sheep
  lie along their body; a black-and-white sheepdog herds the paddock.
- Streets still read as Minecraft: one-box houses, green drum trees, a
  leftover torii, and roofs with no tile. Houses now jetty / lean-to /
  L-wing, canopies are flattened painted masses, benches and a calvary
  are kit pieces, and roofs / timber multiply painted gouache tiles.
- Fisher Finn stood on a village hillside; the stone bridge sat on the
  lawn as a two-arch wall; beach umbrellas, a lighthouse and mailboxes
  were scattered on cliffs. Finn walks the lake shore, the bridge spans
  the river, the fake seaside beach is gone, and props only sit on
  reasonably flat grass.
- The kit waterfall was a timber tower. Settling it by a world bounding
  box launched it up the hillside as a "sky waterfall". Falls are now a
  painted sheet that follows the cliff into the river, and props only
  drop onto their own feet — they are never lifted by phantom corners.
- Courier and villagers hovered on ridges: the planet was 980 triangles
  (~5 m facets) and walkers stood on the analytic crest above those
  faces, plus a leftover 0.5 m foot pad. The sphere is denser now,
  walkers / shadows / `settleOnGround` raycast the visible grass, and
  the sole sits a few centimetres up.
- A leftover seaside water disc sat at planet radius and painted a blue
  halo through the hills; kit waterfalls on the lake ridge looked like
  a mystery building. That disc is gone, lake water writes depth, and
  falls stay smaller and away from Le Lac.
- Map place-marks were silent — a tap on a name, your pin or the
  delivery pin now eases the orbit to face that region.
- Trees, sheep and the mill read as giants next to the courier, and the
  camera could barely tilt (14°, inverted, look-at locked on the
  shoulders) so a facade was hard to frame. Kit props are scaled down;
  pitch now looks up a wall or down the street.
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

- The sea creature and the sky lantern are still primitive spheres —
  they could be built in the same painted-kit language as the village.
