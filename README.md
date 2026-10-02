# seminole
Seminole is a 3d game where the user is part of a Seminole tribe in the 1900s

## Playing

The game runs in the browser using [Babylon.js](https://www.babylonjs.com/)
(rendering, animation) with the [Havok](https://www.npmjs.com/package/@babylonjs/havok)
physics plugin (collision), built with [Vite](https://vite.dev/). You need [Node.js](https://nodejs.org/) 20.19 or
newer and a browser with WebGL.

```sh
npm install
npm run dev
```

Then open the URL Vite prints (usually http://localhost:5173). You will see
your character standing in a camp in the Florida Everglades around 1900: a
palmetto-thatched chickee, a star fire with an iron kettle, a dugout canoe by
a tannin-dark pond, cypress, cabbage palms, saw palmetto and sawgrass, and
seven villagers of all ages going about their day. A **How to Play** panel listing the controls
is shown when the game starts; press `H` to hide or show it again.

## Controls

Movement is relative to the camera: "forward" is the direction the camera
is looking.

| Action                 | Keys             |
| ---------------------- | ---------------- |
| Move forward           | `W` / `↑`        |
| Move back              | `S` / `↓`        |
| Move left              | `A` / `←`        |
| Move right             | `D` / `→`        |
| Run (hold)             | `Shift`          |
| Jump                   | `Space`          |
| Crouch (hold)          | `C`              |
| Look around            | `Drag mouse`     |
| Zoom                   | `Scroll`         |
| Show / hide this panel | `H`              |

Tips:

- Use WASD or the arrow keys to move.
- Hold Shift while moving to run.
- Press Space while moving to jump over obstacles.
- Hold C to crouch.

**Point** at the chickee, fire, mortar, canoe or a villager to highlight it
and see a short description. Outside the flat camp clearing the character
follows the height of the terrain.

Walk speed, the run multiplier, jump strength and crouch speed are set in
`src/config.js`. Key bindings are set in `src/input.js`.

## Look and rendering

The aim is believable, polished realism, not photorealism:

- Physically based Babylon.js `PBRMaterial`s only, with albedo, normal and
  roughness maps (sheen for cloth and skin, clear coat for water, beads and
  eyes).
- A right-handed scene, ACES tone mapping and a procedural HDR sky, sampled
  into a float cube map and used as both skybox and image-based
  environment light.
- A directional sun with one bounded 2048² PCF shadow map (fixed extents
  over the camp), plus linear fog that matches the hazy horizon.
- Height-varied terrain that blends grass, dirt and mud with height-based
  splatting (`src/terrain.js`, shader in `src/engine/TerrainMaterial.js`).
- Vegetation drawn with thin instances: every plant type has 2-3 procedural
  variants and randomised position, rotation, scale and tint.
- Procedural, seeded characters (see [Characters](#characters)) with PBR
  skin, strand-card hair, layered period clothing and idle, walk and run
  clips played as Babylon `AnimationGroup`s whose weights blend over about
  a quarter of a second, so transitions never snap.
- Collision: terrain, the chickee (posts, platform, roof), trees, the fire,
  mortar, woodpile, canoe, baskets, stump and the villagers block the
  player, through simplified invisible Havok colliders (`src/colliders.js`).
  The follow camera is pulled in when terrain or a building would come
  between it and the player.

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
index.html              Page shell, HUD, hover prompt and the How to Play panel container
src/main.js             Entry point: checks for WebGL and starts the game
src/engine/             Babylon.js runtime
  Game.js               Engine, scene, managers and the main loop
  SceneManager.js       Scene settings, sky/IBL, fog, lights, the shadow generator; builds authored content (thin instances for plants)
  AssetManager.js       Turns authored mesh data, materials and textures into Babylon meshes, PBRMaterials and RawTextures (cached)
  TerrainMaterial.js    PBR material with the terrain splat shader
  InputManager.js       Keyboard intents and pointer position
  PlayerController.js   Player movement, Havok character controller, animation
  CameraController.js   ArcRotateCamera follow camera: orbit, limits, zoom, smoothing, collision
  AnimationController.js  Bakes idle/walk/run clips into AnimationGroups and blends their weights
  PhysicsManager.js     Havok plugin, static/animated colliders, character controllers, raycasts
  NPCManager.js         Villagers: placement, the walking loop, animation and colliders
  InteractionSystem.js  Pointing at things: highlight and prompt
src/procedural/         Engine-neutral authoring kernel: maths, mesh data and a scene description
src/config.js           Movement constants (speeds, jump, crouch)
src/input.js            Keyboard bindings and held-key tracking
src/movement.js         Character movement: walking, running, jumping and crouching over the terrain
src/controls-panel.js   The How to Play panel (built from the key bindings)
src/villagers.js        The villagers: who they are, where they stand, the walking loop
src/colliders.js        Simplified collision shapes for the solid things in the world
src/character.js        Builds characters from parameters; proportions
src/character-animation.js  Idle, walk and run poses (baked into clips by the engine)
src/character-params.js Seeded character parameters (body, face, skin, hair, clothing) per variant
src/character-head.js   Sculpted head, ears, eyes, hair cards and brows
src/character-geometry.js  Part merging, hands, feet, limbs, garments and patchwork
src/character-materials.js Skin, hair, eye and cloth textures and materials
src/lineup.js           Character lineup page (characters.html, dev server only)
src/world.js            Assembles the world: sky, fog, sun, terrain, pond, chickee, props, plants
src/sky.js              Procedural HDR sky radiance
src/terrain.js          Height field, ground-layer weights and the terrain material description
src/vegetation.js       Plant variants and instanced scattering
src/structures.js       The chickee
src/props.js            Fire pit, kettle, mortar, baskets, woodpile, canoe
src/interaction.js      Interactive-object helpers and highlight colour
src/materials.js        Shared PBR materials and the material audit helper
src/textures.js         Procedural PBR texture sets
src/geometry.js         Geometry helpers (merging, strips, lumpy blobs)
src/noise.js            Deterministic noise functions
src/layout.js           Where things sit in the camp
src/style.css           Page, HUD, prompt and panel styles
tests/                  Vitest unit tests (the game tests run Babylon's NullEngine with the real Havok module)
```

## Characters

Everyone in the camp, the player included, is built in code from a seeded
set of parameters (`generateCharacterParams(seed, variant)` in
`src/character-params.js`); the same seed always gives the same person and
different seeds give different faces, builds and clothing. There are six
variants: `elderMan`, `elderWoman`, `man`, `woman`, `teen` and `child`.

- **Body:** height, build, age and sex drive every length. Adults are 7.1 to
  7.7 heads tall, teens about 6.7 and children about 5.5 to 6.3; arm span is
  roughly equal to height. Elders stand with a slight stoop.
- **Face:** a sculpted head with brow ridge, eye sockets, cheekbones, jaw,
  chin, nose, lips and ears. Each feature's shape and placement varies with
  the seed, with small left/right differences so faces are not
  mirror-perfect. Eyes have a separate sclera, textured iris and a glossy
  cornea, with eyelids, lashes and brows.
- **Skin:** warm brown tones with individual variation, redder cheeks and
  lips and baked occlusion in vertex colours, a pore and wrinkle detail
  normal map that gets stronger with age, and a wrapped, red-shifted diffuse
  term that approximates subsurface scattering.
- **Hair:** a scalp layer plus alpha-tested strand cards with a dull,
  low-gloss finish. Women and girls wear buns or long hair; men's hair is
  short under the turban; elders are grey.
- **Clothing (around 1900):** men and boys wear cotton "big shirts" with
  applique bands and simple patchwork rows, finger-woven wool sashes or
  buckskin belts, neckerchiefs, wool turbans and leggings; women and girls
  wear cape blouses, long banded skirts with patchwork and many strands of
  glass trade beads. Feet are in buckskin moccasins or bare. Folds are
  modelled in the garment shape and in a fold / seam / stitch normal map.
  Cotton, wool, leather, beads, skin, hair and eyes each have their own
  roughness and sheen.
- **Motion:** a relaxed idle (arms down, softly curled fingers, breathing,
  a slow weight shift and looking around, each villager on their own
  rhythm), a walk cycle and, when sprinting, a run cycle. The poses are
  baked into `AnimationGroup`s (`src/engine/AnimationController.js`) and
  blended by weight with the character's speed.

Run `npm run dev` and open `/characters.html` to see the player and every
villager in a row; `/characters.html?seed=5&variant=elderWoman` shows a
single generated character.

![Character lineup](docs/screenshots/characters-lineup.jpg)

This is a game-art interpretation and has not been reviewed by Seminole
cultural advisors; that review is recommended separately.

To check that nothing in the scene uses an unlit material, call
`findNonPbrObjects(root)` from `src/materials.js`. The tests do this for the
whole scene. In the browser console, `seminole.scene` is the Babylon.js
scene (for example `seminole.scene.getActiveMeshes().length`) and
`seminole.engine.getFps()` the frame rate.
