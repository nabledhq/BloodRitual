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
a tannin-dark pond, cypress, cabbage palms, saw palmetto and sawgrass, and
seven villagers of all ages going about their day. Walk up to a villager
and press `E` to interact; what you do changes your reputation with the
camp's factions (press `R` to see it). A **How to Play** panel listing the controls
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
| Talk to a villager     | `E`              |
| Show / hide reputation | `R`              |
| Show / hide this panel | `H`              |

Tips:

- Use WASD or the arrow keys to move.
- Hold Shift while moving to run.
- Press Space while moving to jump over obstacles.
- Hold C to crouch.
- Stand next to a villager and press E, then a number key to choose what to do.
- What you do changes how each group sees you; press R to see where you stand.

**Point** at the chickee, fire, mortar, canoe or a villager to highlight it
and see a short description. Outside the flat camp clearing the character
follows the height of the terrain.

Walk speed, the run multiplier, jump strength and crouch speed are set in
`src/config.js`. Key bindings are set in `src/input.js`.

## Reputation

Groups in the world remember what you do. Each **faction** has a score from
-100 to 100 (starting at 0) that maps to a tier:

| Tier       | Score        | Prices | Will talk |
| ---------- | ------------ | ------ | --------- |
| Hostile    | -100 to -60  | ×1.5   | No        |
| Distrusted | -59 to -20   | ×1.2   | Yes       |
| Neutral    | -19 to 19    | ×1.0   | Yes       |
| Trusted    | 20 to 59     | ×0.9   | Yes       |
| Honored    | 60 to 100    | ×0.8   | Yes       |

Walk up to a villager and a hint shows who they are, which faction they
belong to and how that faction sees you. Press `E` to open a small menu
(Help, Trade fairly, Steal, Threaten); choose with `1`–`4` or a click, and
`E` closes it. One action can move several factions at once, in different
directions. A villager whose faction is Hostile turns away instead. Press `R`
for a live panel of every faction's score and tier, and how much attention
the authorities are paying you (0–3). Reputation is saved in the browser's
`localStorage` and restored when the page is reloaded; to start over, run
`seminoleReputation.reset()` in the browser console.

Everything is data in `src/data/reputation.json`: the factions, the score
range, the tiers (with their price multiplier and whether the faction will
talk), the authority-attention thresholds, every action's per-faction deltas
and the villager menu. Adding a faction or an action only needs a change to
that file. Villagers are given a faction in `VILLAGERS` in `src/game.js`.

Other systems can query `src/reputation.js`:

```js
import {
  applyAction, getReputation, getTier, onReputationChanged,
  getPriceMultiplier, willTalk, getAuthorityAttention, isUnlocked,
} from './reputation.js';

applyAction('resist_authorities');           // families up, authorities down
getReputation('traders');                     // -> 0
getTier('traders');                           // -> 'neutral'
getPriceMultiplier('traders');                // -> 1
willTalk('traders');                          // -> true
getAuthorityAttention();                      // -> 0..3
isUnlocked({ faction: 'farmers', minTier: 'trusted' });
const stop = onReputationChanged(({ actionId, changes }) => { /* ... */ });
```

These work on the shared, saved instance; `createReputation({ config, storage })`
makes an independent one (the tests use this).

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
- Procedural, seeded characters (see [Characters](#characters)) with PBR
  skin, strand-card hair, layered period clothing and idle, walk and run
  animations.

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
index.html              Page shell, HUD, hover prompt, villager menu and the How to Play / reputation panel containers
src/main.js             Entry point: checks for WebGL and starts the game
src/game.js             Renderer, camera, controls, player movement, NPCs, hover highlighting and the main loop
src/config.js           Movement constants (speeds, jump, crouch)
src/input.js            Keyboard bindings and held-key tracking
src/movement.js         Character movement: walking, running, jumping and crouching over the terrain
src/controls-panel.js   The How to Play panel (built from the key bindings)
src/reputation.js       Per-faction reputation: scores, tiers, action deltas, effect hooks and saving
src/data/reputation.json  Factions, tiers, actions and the villager menu (reputation data)
src/npc-interaction.js  Talking to villagers: the E hint, the action menu and refusals
src/reputation-panel.js The reputation panel (R)
src/character.js        Builds characters from parameters; proportions; idle, walk and run animations
src/character-params.js Seeded character parameters (body, face, skin, hair, clothing) per variant
src/character-geometry.js  Sculpted head, ears, eyes, hair cards, hands, feet, garments and patchwork
src/character-materials.js Skin (with subsurface-like shading), hair, eye and cloth textures and materials
src/lineup.js           Character lineup page (characters.html, dev server only)
src/world.js            Assembles the world: sky, fog, sun, terrain, pond, chickee, props, plants
src/sky.js              Procedural HDR sky / environment map
src/terrain.js          Height field, ground-layer weights and the splat shader
src/vegetation.js       Plant variants and instanced scattering
src/structures.js       The chickee
src/props.js            Fire pit, kettle, mortar, baskets, woodpile, canoe
src/interaction.js      Hover highlight and prompt for interactive objects
src/materials.js        Shared PBR materials and the material audit helper
src/textures.js         Procedural PBR texture sets
src/geometry.js         Geometry helpers (merging, strips, lumpy blobs)
src/noise.js            Deterministic noise functions
src/layout.js           Where things sit in the camp
src/style.css           Page, HUD, prompt, menu and panel styles
tests/                  Vitest unit tests
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
  rhythm), a walk cycle and, when sprinting, a run cycle.

Run `npm run dev` and open `/characters.html` to see the player and every
villager in a row; `/characters.html?seed=5&variant=elderWoman` shows a
single generated character.

![Character lineup](docs/screenshots/characters-lineup.jpg)

This is a game-art interpretation and has not been reviewed by Seminole
cultural advisors; that review is recommended separately.

To check that nothing in the scene uses an unlit material, call
`findNonPbrObjects(root)` from `src/materials.js`. The tests do this for the
whole scene. In the browser console, `seminole.renderer.info.render` shows
draw calls and triangles.
