import * as THREE from 'three';

/**
 * Keeps interactive objects identifiable: objects whose `userData.interactive`
 * is set ({ label, prompt }) get a subtle warm highlight and an on-screen
 * prompt when the pointer targets them.
 */

export const HIGHLIGHT_COLOR = new THREE.Color(0xffb460);
export const HIGHLIGHT_INTENSITY = 0.22;

/** Walks up from `object` to the nearest ancestor flagged as interactive. */
export function findInteractive(object) {
  let o = object;
  while (o) {
    if (o.userData?.interactive) return o;
    o = o.parent;
  }
  return null;
}

/** Every interactive root under `root`. */
export function collectInteractive(root) {
  const found = [];
  root.traverse((o) => {
    if (o.userData?.interactive) found.push(o);
  });
  return found;
}

export class Highlighter {
  constructor() {
    this.target = null;
    this.originals = new Map();
    this.clones = new Map();
  }

  highlightMaterial(material) {
    if (!this.clones.has(material)) {
      const clone = material.clone();
      if (clone.emissive) {
        // Add a warm glow on top of whatever emission the material already has.
        const base = material.emissive.clone().multiplyScalar(material.emissiveIntensity ?? 1);
        clone.emissive.copy(base).add(HIGHLIGHT_COLOR.clone().multiplyScalar(HIGHLIGHT_INTENSITY));
        clone.emissiveIntensity = 1;
      }
      clone.userData.isHighlight = true;
      this.clones.set(material, clone);
    }
    return this.clones.get(material);
  }

  /** Highlights `object` (or clears the highlight when null). Returns true if the target changed. */
  setTarget(object) {
    if (object === this.target) return false;
    this.clear();
    if (!object) return true;
    this.target = object;
    object.traverse((o) => {
      if (!o.isMesh) return;
      this.originals.set(o, o.material);
      o.material = Array.isArray(o.material) ? o.material.map((m) => this.highlightMaterial(m)) : this.highlightMaterial(o.material);
    });
    return true;
  }

  clear() {
    for (const [mesh, material] of this.originals) mesh.material = material;
    this.originals.clear();
    this.target = null;
  }

  dispose() {
    this.clear();
    for (const clone of this.clones.values()) clone.dispose();
    this.clones.clear();
  }
}

/**
 * Picks the interactive object under normalised device coordinates `ndc`
 * (x and y in [-1, 1]). Only objects within `maxDistance` count.
 */
export function pickInteractive(raycaster, camera, ndc, candidates, maxDistance = 30) {
  raycaster.setFromCamera(ndc, camera);
  raycaster.far = maxDistance;
  const hits = raycaster.intersectObjects(candidates, true);
  for (const hit of hits) {
    const target = findInteractive(hit.object);
    if (target) return target;
  }
  return null;
}
