/**
 * Keeps interactive objects identifiable: objects whose `userData.interactive`
 * is set ({ label, prompt }) get a subtle warm highlight and an on-screen
 * prompt when the pointer targets them.
 */

/** Warm highlight tint (sRGB hex) and how strongly it is blended over a targeted object. */
export const HIGHLIGHT_COLOR = 0xffb460;
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

