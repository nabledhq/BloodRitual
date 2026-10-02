import {
  Vector3,
  Quaternion,
  TransformNode,
  PhysicsBody,
  PhysicsMotionType,
  PhysicsShapeBox,
  PhysicsShapeCylinder,
  PhysicsShapeMesh,
  PhysicsCharacterController,
  PhysicsRaycastResult,
  HavokPlugin,
} from '@babylonjs/core';
import HavokPhysics from '@babylonjs/havok';

/** Collision filter groups (bit masks). */
export const GROUP = Object.freeze({ OBSTACLE: 1, TERRAIN: 2, NPC: 4, PLAYER: 8 });

/** Cylinder radius and height of the character collider; it floats this far above the ground. */
export const CHARACTER_SHAPE = Object.freeze({ radius: 0.3, height: 1.5, lift: 0.08 });

const UNSUPPORTED = Object.freeze({
  isSurfaceDynamic: false,
  supportedState: 0,
  averageSurfaceNormal: new Vector3(0, 1, 0),
  averageSurfaceVelocity: new Vector3(0, 0, 0),
  averageAngularSurfaceVelocity: new Vector3(0, 0, 0),
});

/**
 * Havok physics for collision: static bodies for terrain, buildings, trees
 * and props (simplified invisible colliders, see src/colliders.js),
 * animated bodies for villagers, and Havok character controllers that slide
 * characters along whatever blocks them. The ground height itself comes from
 * the analytic terrain function (exact and cheap), so character controllers
 * only collide with obstacles and villagers; the terrain mesh is a body for
 * camera collision.
 */
export class PhysicsManager {
  /** Loads the Havok WebAssembly module and enables physics on `scene`. */
  static async create(scene, havokOptions = undefined) {
    const havok = await HavokPhysics(havokOptions);
    return new PhysicsManager(scene, havok);
  }

  constructor(scene, havok) {
    this.scene = scene;
    this.plugin = new HavokPlugin(true, havok);
    scene.enablePhysics(new Vector3(0, -9.81, 0), this.plugin);
    this.engine = scene.getPhysicsEngine();
    this.bodies = [];
    this.raycastResult = new PhysicsRaycastResult();
  }

  body(node, motionType, shape, membership, collideWith = 0xffffffff) {
    shape.filterMembershipMask = membership;
    shape.filterCollideMask = collideWith;
    const body = new PhysicsBody(node, motionType, false, this.scene);
    body.shape = shape;
    if (motionType !== PhysicsMotionType.DYNAMIC) body.disablePreStep = motionType === PhysicsMotionType.STATIC;
    this.bodies.push(body);
    return body;
  }

  /**
   * Adds the colliders from `collectColliders(world)`. `meshFor(node)`
   * returns the Babylon mesh(es) built for a world node (roof, terrain).
   */
  addColliders(colliders, meshFor) {
    for (const c of colliders) {
      if (c.kind === 'cylinder') {
        const node = new TransformNode(`collider-${c.name}`, this.scene);
        node.position.set(c.x, 0, c.z);
        const shape = new PhysicsShapeCylinder(new Vector3(0, c.y0, 0), new Vector3(0, c.y1, 0), c.radius, this.scene);
        this.body(node, PhysicsMotionType.STATIC, shape, GROUP.OBSTACLE);
      } else if (c.kind === 'box') {
        const node = new TransformNode(`collider-${c.name}`, this.scene);
        node.position.set(c.centre.x, c.centre.y, c.centre.z);
        node.rotationQuaternion = Quaternion.RotationAxis(Vector3.Up(), c.yaw);
        const shape = new PhysicsShapeBox(Vector3.Zero(), Quaternion.Identity(), new Vector3(c.size.x, c.size.y, c.size.z), this.scene);
        this.body(node, PhysicsMotionType.STATIC, shape, GROUP.OBSTACLE);
      } else {
        const group = c.kind === 'terrain' ? GROUP.TERRAIN : GROUP.OBSTACLE;
        for (const mesh of meshFor(c.node)) {
          mesh.computeWorldMatrix(true);
          this.body(mesh, PhysicsMotionType.STATIC, new PhysicsShapeMesh(mesh, this.scene), group);
        }
      }
    }
  }

  /** An animated (moved by code) cylinder that blocks the player, for a villager. */
  addNpcBody(node) {
    const { radius, height } = CHARACTER_SHAPE;
    const shape = new PhysicsShapeCylinder(new Vector3(0, 0.1, 0), new Vector3(0, height, 0), radius * 0.9, this.scene);
    const body = this.body(node, PhysicsMotionType.ANIMATED, shape, GROUP.NPC);
    body.disablePreStep = false;
    return body;
  }

  /** A character controller whose collider stands with its base at `position`. */
  createCharacterController(position) {
    const { radius, height, lift } = CHARACTER_SHAPE;
    const shape = new PhysicsShapeCylinder(new Vector3(0, -height / 2, 0), new Vector3(0, height / 2, 0), radius, this.scene);
    shape.filterMembershipMask = GROUP.PLAYER;
    shape.filterCollideMask = GROUP.OBSTACLE | GROUP.NPC;
    const centre = new Vector3(position.x, position.y + lift + height / 2, position.z);
    const controller = new PhysicsCharacterController(centre, { shape }, this.scene);
    controller.keepDistance = 0.02;
    return controller;
  }

  /**
   * Moves `controller` horizontally by (dx, dz) over `dt` seconds, sliding
   * along obstacles, at base height `y`. Returns the reached { x, z }.
   */
  moveCharacter(controller, dx, dz, y, dt) {
    const { height, lift } = CHARACTER_SHAPE;
    const current = controller.getPosition();
    controller.setPosition(new Vector3(current.x, y + lift + height / 2, current.z));
    if (dt > 0) {
      controller.setVelocity(new Vector3(dx / dt, 0, dz / dt));
      controller.integrate(dt, UNSUPPORTED, Vector3.ZeroReadOnly);
    }
    const p = controller.getPosition();
    return { x: p.x, z: p.z };
  }

  /** Places a controller (e.g. after clamping to the world boundary). */
  placeCharacter(controller, x, y, z) {
    const { height, lift } = CHARACTER_SHAPE;
    controller.setPosition(new Vector3(x, y + lift + height / 2, z));
  }

  /**
   * Casts a ray from `from` to `to` against terrain and obstacles. Returns
   * the hit distance from `from`, or null.
   */
  raycast(from, to, mask = GROUP.OBSTACLE | GROUP.TERRAIN) {
    this.engine.raycastToRef(from, to, this.raycastResult, { collideWith: mask });
    return this.raycastResult.hasHit ? Vector3.Distance(from, this.raycastResult.hitPointWorld) : null;
  }

  dispose() {
    for (const body of this.bodies) body.dispose();
    this.bodies = [];
    this.scene.disablePhysicsEngine();
  }
}
