# seminole
Seminole is a 3d game where the user is part of a Seminole tribe in the 1900s

## Unreal Engine project

The shipping game is built with **Unreal Engine 5.8** (`Seminole.uproject`,
C++ module `Seminole` under `Source/Seminole/`, content under `Content/`). The
technical foundation is documented in [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md)
and the decisions behind it in [docs/adr/](docs/adr/README.md).

The project is a bootable shell plus **part 1 of the playable vertical slice**:
it opens an empty engine map, `ASeminoleGameMode` spawns a floor, lights, a
PlayerStart, a hub stockpile, three scavenging containers and a noise listener
at runtime, and `ASeminolePlaceholderCharacter` (a capsule with a cylinder,
third-person camera, WASD / mouse look / jump / interact) is the pawn. A day
clock runs Day -> Dusk -> Night, dimming the lights, and a Canvas HUD shows the
phase, your carried supplies and the stockpile. Nothing in it has been
compiled, launched or packaged by its authors yet; the manual checklist in
[docs/VALIDATION.md](docs/VALIDATION.md) covers that.

## Getting Started

Windows is the supported development platform.

### Requirements

- **Unreal Engine 5.8**, installed through the Epic Games Launcher (the
  `.uproject` pins `EngineAssociation` to `5.8`).
- **Visual Studio 2022** with the *Game development with C++* workload
  (including the Windows 10/11 SDK and MSVC), or JetBrains **Rider**.
- **Git** and **Git LFS**.

### 1. Install Git LFS and clone

Binary assets (`.uasset`, `.umap`, textures, meshes, audio) go through Git
LFS. Install it *before* cloning so LFS files are fetched instead of pointer
stubs:

```sh
git lfs install
git clone https://github.com/nabledhq/seminole.git
cd seminole
```

If you cloned before installing LFS, run `git lfs install` and then
`git lfs pull` inside the repository.

### 2. Generate Visual Studio project files

Right-click `Seminole.uproject` in Explorer and choose **Generate Visual Studio
project files**. This creates `Seminole.sln` (ignored by Git). If the menu
entry is missing, run the Epic Games Launcher once so it registers the
`.uproject` file type, or use the Unreal Version Selector from the engine
install (`Engine\Binaries\Win64\UnrealVersionSelector.exe /projectfiles
<path>\Seminole.uproject`).

### 3. Build the editor

Open `Seminole.sln`, select **Development Editor | Win64**, set `Seminole` as
the startup project and **Build**. Rider: open the `.uproject` directly and
build the `SeminoleEditor` configuration.

### 4. Open the project

Double-click `Seminole.uproject`, or run `scripts\open-project.bat`. The script
uses `%UE_ROOT%\Engine\Binaries\Win64\UnrealEditor.exe` when the `UE_ROOT`
environment variable points at an engine install, and otherwise falls back to
the `.uproject` file association. The editor starts on the engine map
`/Engine/Maps/Entry`; it is empty until you play.

### 5. Play

Press **Play** (set *Spawn player at* to **Default Player Start** in the Play
dropdown, see Troubleshooting) or **Play > Standalone Game**. You should see a
grey 100 m x 100 m floor, a lit grey cylinder and a third-person camera.
Controls: **W/A/S/D** move, **mouse** looks, **Space** jumps, **E** interacts.

The vertical slice (part 1) loop:

1. The HUD (top left) shows `Day 8:00` counting down, your carried supplies
   and the stockpile totals. The green block 4 m ahead is the **stockpile**.
2. Walk straight ahead (the direction you face at start, +X), past the
   stockpile, about 30 m to the **scavenging area**: three brown crates in a
   row and a red sphere behind them.
3. Stand next to a crate; the prompt `[E] Search container` appears. Press
   **E**: a 2 s progress bar runs, the crate turns grey, your carried supplies
   go up, and the red sphere flashes yellow (it heard the search).
   A grey crate cannot be searched again.
4. Walk back to the stockpile and press **E** (`[E] Deposit supplies`): the
   carried counts go to zero and the stockpile totals rise.
5. After 8 minutes the HUD turns orange with a centred **DUSK** warning and
   the light turns amber; one minute later it is **NIGHT** and the scene
   goes dark. To get there faster, shorten *Day Duration Seconds* in
   **Edit > Project Settings > Game > Seminole** (all slice tunables live
   there) and press Play again.

Automation tests for these systems run from **Tools > Session Frontend >
Automation** (filter `Seminole`); see `Source/Seminole/Tests/README.md`.

### 6. Package for Windows

**Platforms > Windows > Package Project** with the **Development**
configuration. When asked for a folder, choose `Packaged` inside the
repository (it is in `.gitignore`). The result is
`Packaged\Windows\Seminole.exe`.

### 7. Run the packaged game

Launch `Packaged\Windows\Seminole.exe`, or run `scripts\run-latest-build.bat`,
which starts that executable and exits with an error (code 1) when no packaged
build exists yet.

### 8. Optional: generate a test map

`scripts/editor/create_test_map.py` creates and saves `/Game/Maps/L_TestMap`
(a floor, a directional light, a sky light and a PlayerStart) so you have an
editable map instead of the empty engine one. It needs the **Python Editor
Script Plugin** (Edit > Plugins), which is not enabled in the repository. The
file's header explains how to run it and how to point the config at the map.
The runtime fallback keeps working whether or not the script has been run,
and it spawns nothing on a map that already has those four actors. Do not
commit the generated map unless a ticket asks for it.

### Troubleshooting

- **"The following modules are missing or built with a different engine
  version" / rebuild prompt** when opening the `.uproject`: the editor DLLs
  under `Binaries/` are stale or absent. Click **No**, build **Development
  Editor | Win64** in Visual Studio or Rider, then open the project again.
  (Clicking **Yes** also works for small changes but hides compile errors.)
- **Project files out of date or Visual Studio does not list new source
  files**: regenerate them (right-click `Seminole.uproject` > *Generate Visual
  Studio project files*). Do this after adding or removing `.cpp`/`.h` files
  or editing `*.Build.cs` / `*.Target.cs`. Deleting `Binaries/`,
  `Intermediate/` and `Saved/` before regenerating gives a clean slate; they
  are all ignored by Git.
- **Wrong engine version**: if several engines are installed, right-click
  `Seminole.uproject` > *Switch Unreal Engine version...* and pick 5.8, or set
  `UE_ROOT` for `scripts\open-project.bat`.
- **Assets are tiny text files starting with `version https://git-lfs...`**:
  these are LFS pointer files, meaning Git LFS was not installed when you
  cloned. Run `git lfs install` then `git lfs pull`.
- **The character falls into darkness when pressing Play**: the editor spawned
  the pawn at the viewport camera position (its default), which in the empty
  engine map may sit below or outside the runtime floor. Use the Play dropdown
  and set *Spawn player at* to **Default Player Start**, or move the viewport
  camera above the origin.
- **`run-latest-build.bat` reports no packaged build**: package first (step
  6) and make sure the output folder is the repository's `Packaged` directory,
  so the executable ends up at `Packaged\Windows\Seminole.exe`.

The browser prototype below is a preview and design sandbox and keeps working
independently of the Unreal project.

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
Seminole.uproject       Unreal Engine 5.8 project (module Seminole; no plugins enabled yet)
Source/                 UE C++: Seminole.Target.cs, SeminoleEditor.Target.cs and the Seminole module
  Seminole/             Module (Seminole.Build.cs, Seminole.h/.cpp) and the bootstrap classes:
                        SeminoleGameMode, SeminolePlaceholderCharacter, SeminoleTestEnvironment;
                        plus one README-only folder per planned system
Content/                UE assets (AI, Characters, Environments, Items, Maps, Missions, Weapons, UI, Audio); empty for now
Config/                 UE DefaultEngine.ini (maps, game mode), DefaultGame.ini (project, packaging), DefaultInput.ini (legacy mappings)
scripts/                open-project.bat, run-latest-build.bat, editor/create_test_map.py
Packaged/               Packaged game output (ignored by Git; created by Platforms > Windows > Package Project)
docs/ARCHITECTURE.md    Technical foundation of the Unreal project
docs/VALIDATION.md      Manual build / play / package checklist (not yet executed)
docs/adr/               Architecture decision records
.gitattributes          Git LFS rules for binary assets; CRLF for .bat files

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
