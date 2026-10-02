import { Color3 } from '@babylonjs/core';
import { Color } from '../procedural/index.js';
import { collectInteractive, findInteractive, HIGHLIGHT_COLOR, HIGHLIGHT_INTENSITY } from '../interaction.js';

/** Objects further away than this (metres) cannot be pointed at. */
export const MAX_POINT_DISTANCE = 30;

/**
 * Pointing at things: the chickee, fire, mortar, canoe and every villager
 * get a subtle warm highlight and an on-screen prompt with a short
 * description while the pointer is over them.
 */
export class InteractionSystem {
  constructor(scene, sceneManager, { promptElement = null, canvas = null } = {}) {
    this.scene = scene;
    this.promptElement = promptElement;
    this.canvas = canvas;
    this.target = null;
    const linear = new Color(HIGHLIGHT_COLOR);
    this.highlight = new Color3(linear.r, linear.g, linear.b);
    /** Interactive authored roots and the Babylon meshes drawn for each. */
    this.meshes = new Map();
    this.sceneManager = sceneManager;
  }

  /** Registers the interactive objects under an authored root (world, villager). */
  register(root) {
    for (const object of collectInteractive(root)) {
      const meshes = this.sceneManager.meshesFor(object);
      for (const mesh of meshes) mesh.metadata.interactive = true;
      this.meshes.set(object, meshes);
    }
  }

  get interactive() {
    return [...this.meshes.keys()];
  }

  /** The interactive object under canvas pixel (x, y), or null. */
  pick(x, y) {
    // As before the migration, only interactive objects are tested (scenery does not occlude them).
    const hit = this.scene.pick(x, y, (mesh) => Boolean(mesh.metadata?.interactive) && mesh.isEnabled(), false);
    if (!hit?.hit || hit.distance > MAX_POINT_DISTANCE) return null;
    return findInteractive(hit.pickedMesh.metadata?.source);
  }

  /** Highlights `object` (or nothing) and updates the prompt. Returns true if the target changed. */
  setTarget(object) {
    if (object === this.target) return false;
    for (const mesh of this.meshes.get(this.target) ?? []) mesh.renderOverlay = false;
    this.target = object;
    for (const mesh of this.meshes.get(object) ?? []) {
      mesh.renderOverlay = true;
      mesh.overlayColor = this.highlight;
      mesh.overlayAlpha = HIGHLIGHT_INTENSITY;
    }
    const info = object?.userData.interactive;
    if (this.promptElement) {
      this.promptElement.textContent = info ? `${info.label}: ${info.prompt}` : '';
      this.promptElement.classList?.toggle('visible', Boolean(info));
    }
    if (this.canvas?.style) this.canvas.style.cursor = info ? 'pointer' : '';
    return true;
  }

  /** Re-targets from the pointer position (canvas pixels or null). Returns the target. */
  update(pointer) {
    this.setTarget(pointer ? this.pick(pointer.x, pointer.y) : null);
    return this.target;
  }

  dispose() {
    this.setTarget(null);
  }
}
