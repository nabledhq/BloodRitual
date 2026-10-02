import './style.css';
import { Game } from './engine/Game.js';
import { ControlsPanel } from './controls-panel.js';

function isWebGLAvailable() {
  try {
    const canvas = document.createElement('canvas');
    return Boolean(window.WebGLRenderingContext && (canvas.getContext('webgl2') || canvas.getContext('webgl')));
  } catch {
    return false;
  }
}

const container = document.getElementById('game');

if (isWebGLAvailable()) {
  // Shown on start so first-time players see the controls; H toggles it.
  const controlsPanel = new ControlsPanel(document.getElementById('controls-panel'));
  window.seminoleControls = controlsPanel;
  Game.create(container, { promptElement: document.getElementById('prompt') }).then((game) => {
    game.start();
    // Exposed for debugging from the browser console.
    window.seminole = game;
  });
} else {
  const message = document.createElement('div');
  message.className = 'error';
  message.textContent = 'Seminole needs WebGL to run. Please use a browser with WebGL enabled.';
  document.body.appendChild(message);
}
