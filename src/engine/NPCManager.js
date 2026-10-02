import { Quaternion, Vector3 } from '@babylonjs/core';
import { createNpcs, walkPathPoint } from '../villagers.js';
import { terrainHeight } from '../terrain.js';
import { AnimationController } from './AnimationController.js';

const UP = Vector3.Up();

/**
 * The villagers: six standing about the camp playing their idle clip (each
 * on their own rhythm) and one walking a loop through the camp with the
 * walk clip. Each has an animated physics body, so the player cannot walk
 * through them.
 */
export class NPCManager {
  constructor(sceneManager, physics) {
    this.sceneManager = sceneManager;
    this.npcs = createNpcs().map((character) => {
      const root = sceneManager.instantiate(character, null);
      const animation = AnimationController.forCharacter(sceneManager.scene, character, sceneManager.nodes);
      physics?.addNpcBody(root);
      return { character, root, animation, behaviour: character.userData.behaviour };
    });
  }

  /** Advances the villagers to `elapsed` seconds (`dt` since the last frame). */
  update(elapsed, dt) {
    for (const npc of this.npcs) {
      const { character, root, animation } = npc;
      if (npc.behaviour === 'walk') {
        const { x, z, heading } = walkPathPoint(character.userData.path, elapsed * character.userData.speed);
        root.position.set(x, terrainHeight(x, z), z);
        root.rotationQuaternion = Quaternion.RotationAxis(UP, heading);
        animation.update(dt, { speed: character.userData.speed });
      } else {
        animation.update(dt, { speed: 0 });
      }
    }
  }

  dispose() {
    for (const npc of this.npcs) npc.animation.dispose();
  }
}
