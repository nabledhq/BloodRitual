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
your character standing in a camp in the Florida Everglades next to a chickee.
A **How to Play** panel listing the controls is shown when the game starts;
press `H` to hide or show it again.

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

Walk speed, the run multiplier, jump strength and crouch speed are set in
`src/config.js`. Key bindings are set in `src/input.js`.

## Scripts

| Command           | What it does                                   |
| ----------------- | ---------------------------------------------- |
| `npm run dev`     | Start the dev server with hot reload           |
| `npm run build`   | Build a static production bundle into `dist/`  |
| `npm run preview` | Serve the production build locally             |
| `npm test`        | Run the unit tests with Vitest                 |

## Project layout

```
index.html              Page shell, HUD and the How to Play panel container
src/main.js             Entry point: checks for WebGL and starts the game
src/game.js             Renderer, camera, controls and the main loop
src/config.js           Movement constants (speeds, jump, crouch)
src/input.js            Keyboard bindings and held-key tracking
src/movement.js         Character movement: walking, running, jumping and crouching
src/controls-panel.js   The How to Play panel (built from the key bindings)
src/character.js        The player character (built from simple shapes) and its idle animation
src/world.js            Lights, ground, pond, chickee, trees and sawgrass
src/style.css           Page, HUD and panel styles
tests/                  Vitest unit tests
```

All models are built procedurally from three.js primitives, so there are no
binary assets to download. The character wears a simplified patchwork
"big shirt", neckerchief and cloth turban, the clothing worn by Seminole men
in the early 1900s.
