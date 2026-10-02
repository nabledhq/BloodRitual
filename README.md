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

Controls:

- **Drag** to orbit the camera around the character
- **Scroll** to zoom in and out

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
src/game.js         Renderer, camera, controls and the main loop
src/character.js    The player character (built from simple shapes) and its idle animation
src/world.js        Lights, ground, pond, chickee, trees and sawgrass
src/style.css       Page and HUD styles
tests/              Vitest unit tests
```

All models are built procedurally from three.js primitives, so there are no
binary assets to download. The character wears a simplified patchwork
"big shirt", neckerchief and cloth turban, the clothing worn by Seminole men
in the early 1900s.
