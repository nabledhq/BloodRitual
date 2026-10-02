import { Vector3 } from './procedural/index.js';

/**
 * Simplified, invisible collision shapes for the solid things in the camp,
 * derived from the world description: upright cylinders for posts, trunks
 * and round props, yaw-oriented boxes for the platform, woodpile and canoe,
 * and the exact roof and terrain meshes (which the camera must not pass
 * through). src/engine/PhysicsManager.js turns these into Havok bodies.
 */

/** Node name -> collider kind. Children of `posts` are each a cylinder. */
export const SOLIDS = Object.freeze({
  posts: 'cylinders',
  platform: 'box',
  roof: 'mesh',
  firePit: 'cylinder',
  mortar: 'cylinder',
  woodpile: 'box',
  hull: 'box',
  basket1: 'cylinder',
  basket2: 'cylinder',
  basket3: 'cylinder',
  stumpSeat: 'cylinder',
  ground: 'terrain',
});

/** Trunk radius (before instance scale) of each tree type. */
export const TRUNK_RADIUS = Object.freeze({ cypress: 0.38, cabbagePalm: 0.24 });
/** How tall a trunk collider is; enough to stop the player and frame the camera. */
const TRUNK_HEIGHT = 4;
/** The fire pit blocks only its stone ring, not the full length of the spoke logs. */
const FIRE_RADIUS = 0.85;

function worldYaw(node) {
  let yaw = 0;
  for (let o = node; o; o = o.parent) yaw += o.rotation.y;
  return yaw;
}

/** World-space bounds of `node` measured in a frame turned by `yaw` about Y. */
export function orientedBounds(node, yaw = worldYaw(node)) {
  node.updateWorldFromRoot();
  node.updateMatrixWorld();
  const min = new Vector3(Infinity, Infinity, Infinity);
  const max = new Vector3(-Infinity, -Infinity, -Infinity);
  const v = new Vector3();
  const c = Math.cos(-yaw);
  const s = Math.sin(-yaw);
  node.traverse((o) => {
    if (!o.isMesh) return;
    const pos = o.geometry.attributes.position;
    for (let i = 0; i < pos.count; i++) {
      v.fromBufferAttribute(pos, i).applyMatrix4(o.matrixWorld);
      v.set(v.x * c + v.z * s, v.y, -v.x * s + v.z * c);
      min.min(v);
      max.max(v);
    }
  });
  const local = min.clone().add(max).multiplyScalar(0.5);
  // Back from the turned frame to world space.
  const centre = new Vector3(local.x * Math.cos(yaw) + local.z * Math.sin(yaw), local.y, -local.x * Math.sin(yaw) + local.z * Math.cos(yaw));
  return { centre, size: max.clone().sub(min), yaw, min, max };
}

function cylinderFor(name, node, radius = null) {
  const b = orientedBounds(node, 0);
  return { name, kind: 'cylinder', x: b.centre.x, z: b.centre.z, y0: b.min.y, y1: b.max.y, radius: radius ?? Math.max(b.size.x, b.size.z) / 2 };
}

/** Every collider in `world` (the group returned by `createWorld`). */
export function collectColliders(world) {
  const colliders = [];
  for (const [name, kind] of Object.entries(SOLIDS)) {
    const node = world.getObjectByName(name);
    if (!node) continue;
    if (kind === 'cylinders') {
      for (const child of node.children) colliders.push(cylinderFor(child.name, child));
    } else if (kind === 'cylinder') {
      colliders.push(cylinderFor(name, node, name === 'firePit' ? FIRE_RADIUS : null));
    } else if (kind === 'box') {
      const b = orientedBounds(node);
      colliders.push({ name, kind: 'box', centre: b.centre, size: b.size, yaw: b.yaw });
    } else {
      colliders.push({ name, kind, node });
    }
  }
  const trees = world.getObjectByName('trees');
  trees?.traverse((group) => {
    const radius = TRUNK_RADIUS[group.userData?.type];
    if (!radius || !group.userData.instances) return;
    group.userData.instances.forEach((p, i) => {
      colliders.push({ name: `${group.name}${i}`, kind: 'cylinder', x: p.x, z: p.z, y0: p.y - 0.5, y1: p.y + TRUNK_HEIGHT * p.scale, radius: radius * p.scale });
    });
  });
  return colliders;
}
