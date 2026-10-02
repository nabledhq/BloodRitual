import './style.css';
import { Game } from './game.js';

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
  const game = new Game(container, { promptElement: document.getElementById('prompt') });
  game.start();
  // Exposed for debugging from the browser console.
  window.seminole = game;
} else {
  const message = document.createElement('div');
  message.className = 'error';
  message.textContent = 'Seminole needs WebGL to run. Please use a browser with WebGL enabled.';
  document.body.appendChild(message);
}
