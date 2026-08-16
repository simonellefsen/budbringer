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

## Tech Stack

- **Vite** - Fast build tool and dev server
- **TypeScript** - Type-safe JavaScript
- **Three.js** (r170+) - 3D graphics library
- **Web Audio API** - Procedural sound generation

## Project Structure

```
postilion/
├── src/
│   ├── main.ts              # Entry point
│   ├── core/                # Game engine (Game, Camera, Input, Delivery)
│   ├── world/               # Planet, NPCs, Secrets
│   ├── character/           # Player character
│   ├── ui/                  # Title screen, HUD, Dialogue
│   ├── audio/               # Audio manager
│   └── utils/               # Toon shader material
├── public/
│   └── models/              # Placeholder for GLB models (for future Blender exports)
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
