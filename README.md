# the postilion

A tiny spherical-planet mail-courier game. Walk around a handcrafted world, deliver letters, meet characters, and discover secrets.

![Genre](https://img.shields.io/badge/genre-adventure%20%7C%20exploration-blue)
![Stack](https://img.shields.io/badge/stack-Vite%20%7C%20TypeScript%20%7C%20Three.js-green)
![Platform](https://img.shields.io/badge/platform-browser-orange)

## About

**the postilion** is an original browser game inspired by the pocket-world delivery genre. You play as a young courier on a small spherical planet, delivering letters between the villagers while exploring charming biomes and uncovering secrets.

### Features

- **Spherical world**: Walk in any direction and loop around the entire planet. No invisible walls.
- **Five delivery quests**: Pick up letters from NPCs and deliver them to recipients across the globe.
- **Four distinct biomes**: Village, Beach, Hills, and Shrine - each with unique decorations and NPCs.
- **Cel-shaded graphics**: Custom toon shader with warm lighting and readable silhouettes.
- **Original procedural audio**: Lo-fi ambient music and sound effects generated in real-time.
- **Mobile support**: Touch controls with virtual joystick for on-the-go play.
- **Hidden secrets**: Three optional discoveries for curious explorers.

## Getting Started

### Prerequisites

- Node.js 18+ and npm

### Installation

```bash
npm install
```

### Development

```bash
npm run dev
```

Opens the game at [http://localhost:3000](http://localhost:3000).

### Build

```bash
npm run build
```

Creates a production build in the `dist/` folder, ready for deployment to Vercel or any static host.

### Preview Production Build

```bash
npm run preview
```

## How to Play

### Controls

| Action | Desktop | Mobile |
|--------|---------|--------|
| Move | WASD / Arrow Keys | Virtual Joystick (left side) |
| Hop | Space | HOP button |
| Talk / Interact | E / Enter | TALK button |
| Look Around | Mouse (click to lock) | Drag right side of screen |

### Gameplay

1. **Start at the Village**: You begin near the Postmaster Maple at the village post office.
2. **Pick up letters**: Talk to NPCs with letters to collect. A compass in the HUD points to your current recipient.
3. **Deliver letters**: Find the recipient and talk to them to complete the delivery.
4. **Explore**: Walk around the entire planet! Discover the Beach, Hills, and Shrine biomes.
5. **Find secrets**: Three hidden discoveries await curious players.

### NPCs

- **Postmaster Maple** (Village) - Your quest giver and the heart of the mail system.
- **Fisher Finn** (Beach) - An old fisherman by the pier.
- **Hermit Hazel** (Between Beach & Hills) - A mysterious artist living in solitude.
- **Keeper Kai** (Shrine) - Guardian of the ancient shrine.
- **Baker Brie** (Village) - The village baker with warm bread and warmer heart.

## Art direction

The village is French — the reference set is Gerberoy, Lacoste, Colmar and
Estaing. That means warm ochre and cream renders under terracotta and slate,
dark half-timber framing, painted shutters, geraniums in the window boxes, a
Romanesque church as the landmark you navigate by, a river looping the planet
with a stone bridge across it, and a village square with a fountain and plane
trees.

Shop signage is French — *La Poste*, *Épicerie*, *Boucherie*, *Café de la
Place*. Dialogue is English.

The look is built from four layers, in this order:

1. **Light** — a warm key that tracks the player over a cool `HemisphereLight`,
   so shadows come out tinted rather than grey.
2. **Cel fill** — `MeshToonMaterial` with a three-band gradient map, which keeps
   Three.js's real lighting path: shadow maps, fog and lights all apply.
3. **Ink** — a screen-space pass detecting edges in the depth and normal
   buffers, so every outline is the same pixel width regardless of distance.
4. **Colour** — every hex value in the game lives in `src/utils/palette.ts`.
   Re-grading the whole village is a one-file edit.

## Tech stack

### Runtime

| Package | Role |
|---|---|
| **Vite** | Build tool and dev server |
| **TypeScript** | Type-safe source |
| **Three.js** (r170+) | 3D renderer |
| **postprocessing** | Effect composer + `NormalPass` behind the ink outline pass |
| **three-custom-shader-material** | Available for custom shading over lit materials |
| **three-mesh-bvh** | Fast spatial queries for camera collision |
| **troika-three-text** | SDF text (not currently used — shop signs are canvas textures, since troika ships no default font) |
| **simplex-noise** | Coherent noise for placement |
| **tweakpane** | Live sliders for art direction |
| **stats-gl** | Frame-time and draw-call readout |
| **howler** | Audio playback |
| **Web Audio API** | Procedural sound generation |

### Asset pipeline

| Tool | Role |
|---|---|
| **Blender 5.2 LTS** | All models. Driven from scripts, not hand-modelled |
| **blender-mcp** | Blender add-on exposing the running instance over MCP, so the model scripts can be run and previewed without leaving the editor |
| **@gltf-transform/cli** | GLB inspection and optimisation |
| **Krita** | Hand-painted texture work |
| **Affinity Designer** | Signage and UI vector work |

Models are generated by the scripts in `tools/blender/` rather than modelled by
hand, so the kit is reproducible and reviewable in git — the `.blend` files are
outputs, not the source of truth.

Two conventions hold across every exported asset:

- **Materials are named for palette slots** (`WALL`, `ROOF`, `TIMBER`, `SHUTTER`
  …) and carry no colour. The game swaps each for a `ToonMaterial` on load, so
  re-colouring never means reopening Blender.
- **Faces stay flat-shaded.** The ink pass finds creases by comparing view-space
  normals between neighbouring pixels; smooth shading averages them away and the
  line disappears.

Two gotchas worth knowing before editing the scripts:

- `obj.matrix_world` is empty until the depsgraph evaluates, so geometry is
  transformed in Python and handed to Blender once at the end.
- The glTF exporter splits each object into **one mesh per material**, so a
  piece arrives in the game as a `Group` of single-material meshes.

```bash
# regenerate the kit and characters (needs Blender + blender-mcp connected)
blender --background --python tools/blender/build_kit.py
blender --background --python tools/blender/build_characters.py
```

## Project structure

```
postilion/
├── src/
│   ├── main.ts              # Entry point
│   ├── core/                # Game, Camera, Input, Delivery
│   ├── world/               # Planet, Kit, Characters, NPCs, Secrets
│   ├── character/           # Player character
│   ├── ui/                  # Title screen, HUD, Dialogue
│   ├── audio/               # Audio manager
│   └── utils/               # palette.ts, ToonMaterial, InkEffect
├── tools/
│   └── blender/             # build_kit.py, build_characters.py, .blend outputs
├── public/
│   └── models/              # kit.glb, characters.glb
├── docs/
│   └── art-pass.html        # Render diagnosis behind the graphics work
├── index.html
├── package.json
├── tsconfig.json
└── vite.config.ts
```

## Credits

This is an **original work**. All code, art, writing, and audio are created from scratch.

Inspired by the spirit of pocket-world adventure games like:
- A Short Hike
- Super Mario Galaxy (gravity mechanics)
- Sable / Jet Set Radio (cel-shading aesthetics)

**This project is not affiliated with, endorsed by, or derived from any existing game.** No assets, code, or content have been copied from other works.

## License

MIT License - feel free to learn from the code and create your own adventures!

---

*Made with ☕ and Three.js*
