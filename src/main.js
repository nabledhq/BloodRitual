import './style.css';
import { Game } from './game.js';
import { ControlsPanel } from './controls-panel.js';
import { ReputationPanel } from './reputation-panel.js';
import { getDefaultReputation } from './reputation.js';

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
  // Saved to localStorage, so reputation survives a reload.
  const reputation = getDefaultReputation();
  const game = new Game(container, {
    promptElement: document.getElementById('prompt'),
    menuElement: document.getElementById('npc-menu'),
    reputation,
  });
  game.start();
  // Shown on start so first-time players see the controls; H toggles it.
  const controlsPanel = new ControlsPanel(document.getElementById('controls-panel'));
  // Hidden on start; R toggles it.
  const reputationPanel = new ReputationPanel(document.getElementById('reputation-panel'), reputation);
  // Exposed for debugging from the browser console.
  window.seminole = game;
  window.seminoleControls = controlsPanel;
  window.seminoleReputation = reputation;
  window.seminoleReputationPanel = reputationPanel;
} else {
  const message = document.createElement('div');
  message.className = 'error';
  message.textContent = 'Seminole needs WebGL to run. Please use a browser with WebGL enabled.';
  document.body.appendChild(message);
}
