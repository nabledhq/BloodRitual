# seminole
Seminole is a 3d game where the user is part of a Seminole tribe in the 1900s

## Playing

The game runs in the browser using [three.js](https://threejs.org/) and
[Vite](https://vite.dev/). You need [Node.js](https://nodejs.org/) 20.19 or
newer and a browser with WebGL.

```sh
npm install
npm run dev
```

Then open the URL Vite prints (usually http://localhost:5173). You will see
your character standing in a camp in the Florida Everglades around 1900: a
palmetto-thatched chickee, a star fire with an iron kettle, a dugout canoe by
a tannin-dark pond, cypress, cabbage palms, saw palmetto and sawgrass, and two
villagers going about their day.

Controls:

- **Drag** to orbit the camera around the character
- **Scroll** to zoom in and out
- **Point** at the chickee, fire, mortar, canoe or a villager to highlight it
  and see a short description

## Look and rendering

The aim is believable, polished realism, not photorealism:

- Physically based materials only (`MeshStandardMaterial` /
  `MeshPhysicalMaterial`) with albedo, normal and roughness maps.
- sRGB output, ACES filmic tone mapping and a procedural HDR sky used as both
  background and image-based environment light.
- A directional sun with soft (PCF, wide-radius) 2048² shadow maps, plus mild
  linear fog that matches the hazy horizon.
- Height-varied terrain that blends grass, dirt and mud with height-based
  splatting (`src/terrain.js`).
- Instanced vegetation: every plant type has 2-3 procedural variants and
  randomised position, rotation, scale and tint.
- Characters with adult proportions (about 7 heads tall) in layered clothing,
  with idle and walk animations.

All textures and models are generated in code, so there are no binary assets.
See [ASSETS_LICENSES.md](ASSETS_LICENSES.md).

## Scripts

| Command           | What it does                                   |
| ----------------- | ---------------------------------------------- |
| `npm run dev`     | Start the dev server with hot reload           |
| `npm run build`   | Build a static production bundle into `dist/`  |
| `npm run preview` | Serve the production build locally             |
| `npm test`        | Run the unit tests with Vitest                 |

## Project layout

```
index.html          Page shell and HUD
src/main.js         Entry point: checks for WebGL and starts the game
src/game.js         Renderer, camera, controls, NPCs, hover highlighting and the main loop
src/character.js    Characters (man / woman outfits), proportions, idle and walk animations
src/world.js        Assembles the world: sky, fog, sun, terrain, pond, chickee, props, plants
src/sky.js          Procedural HDR sky / environment map
src/terrain.js      Height field, ground-layer weights and the splat shader
src/vegetation.js   Plant variants and instanced scattering
src/structures.js   The chickee
src/props.js        Fire pit, kettle, mortar, baskets, woodpile, canoe
src/interaction.js  Hover highlight and prompt for interactive objects
src/materials.js    Shared PBR materials and the material audit helper
src/textures.js     Procedural PBR texture sets
src/geometry.js     Geometry helpers (merging, strips, lumpy blobs)
src/noise.js        Deterministic noise functions
src/layout.js       Where things sit in the camp
src/style.css       Page and HUD styles
tests/              Vitest unit tests
```

The man wears a banded knee-length "big shirt", belt and pouch, neckerchief,
cloth turban, leggings and moccasins; the woman wears a cape blouse, a long
banded skirt and many strands of glass beads. This is a game-art
interpretation and has not been reviewed by Seminole cultural advisors; that
review is recommended separately.

To check that nothing in the scene uses an unlit material, call
`findNonPbrObjects(root)` from `src/materials.js`. The tests do this for the
whole scene. In the browser console, `seminole.renderer.info.render` shows
draw calls and triangles.
