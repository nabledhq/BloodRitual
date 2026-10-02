import * as THREE from 'three';
import { AnimationController } from './animation-controller.js';
import { NPC_MOVEMENT, ROLE_CONFIG, resolvePlace, resolveSeat } from './roles.js';
import { createBasket } from '../props.js';

/**
 * One NPC: a premade, rigged body driven by an AnimationController, and the
 * role's looping task list (walk somewhere, work, sit and eat, ...). Movement
 * is straight lines between waypoints over the terrain; the controller picks
 * and blends the clips from the resulting speed and posture.
 */

const flat = () => 0;
const handL = new THREE.Vector3();
const handR = new THREE.Vector3();

function angleTo(from, to) {
  return Math.atan2(to.x - from.x, to.z - from.z);
}

function wrapAngle(a) {
  return Math.atan2(Math.sin(a), Math.cos(a));
}

export class Npc {
  constructor({
    name,
    roleName,
    role,
    body,
    library,
    at = [0, 0],
    startTask = 0,
    prompt = null,
    groundAt = flat,
    rng = Math.random,
    movement = NPC_MOVEMENT,
    config = ROLE_CONFIG,
    log = null,
  }) {
    this.name = name;
    this.roleName = roleName;
    this.role = role;
    this.body = body;
    this.groundAt = groundAt;
    this.rng = rng;
    this.movement = movement;
    this.config = config;

    this.group = new THREE.Group();
    this.group.name = name;
    this.group.add(body);
    this.group.userData.interactive = { label: role.label, prompt: prompt ?? role.prompt };
    this.group.userData.role = roleName;
    this.group.userData.npc = this;
    // A basket held between the hands while carrying.
    this.carried = createBasket(0.16, 0.2, 'carriedBasket');
    this.carried.visible = false;
    this.group.add(this.carried);
    this.hands = [body.getObjectByName('hand_l'), body.getObjectByName('hand_r')];

    this.position = new THREE.Vector3(at[0], groundAt(at[0], at[1]), at[1]);
    this.heading = 0;
    this.speed = 0;
    this.controller = new AnimationController(body, library, {
      idleVariants: library.idleVariants(role.idleSet),
      rng,
      log,
    });

    this.taskIndex = startTask % role.tasks.length;
    this.completedTasks = 0;
    this.taskLog = [];
    this.chat = null;
    this.chatCooldown = 0;
    this.debugAction = null;
    this.startTask(this.taskIndex);
    this.syncGroup();
  }

  /** Full passes through the role's task list. */
  get cycles() {
    return Math.floor(this.completedTasks / this.role.tasks.length);
  }

  get currentTask() {
    return this.task?.def ?? null;
  }

  startTask(index) {
    const def = this.role.tasks[index];
    const task = { def, time: 0, stage: 'start', path: [], done: false };
    this.task = task;
    this.controller.stop();
    this.faceTarget = def.face ? resolvePlace(def.face, this.config) : null;
    switch (def.do) {
      case 'walk':
        task.path = [...(def.via ?? []), def.to].map((p) => resolvePlace(p, this.config));
        this.controller.setPosture(def.posture ?? 'stand');
        break;
      case 'work':
        this.controller.setPosture('stand');
        this.controller.play(this.role.workClip, { duration: def.seconds, onDone: () => (task.done = true) });
        break;
      case 'play':
        this.controller.setPosture('stand');
        this.controller.play(def.action, { duration: def.seconds ?? null, onDone: () => (task.done = true) });
        break;
      case 'idle':
        this.controller.setPosture('stand');
        if (def.variant) this.controller.playIdleVariant(def.variant, Math.min(def.seconds, 4));
        break;
      case 'sit': {
        const seat = resolveSeat(def.seat, this.config);
        // The sitting clip puts the hips behind the feet; stand that far in front of the seat.
        const toFace = Math.atan2(seat.face.x - seat.x, seat.face.z - seat.z);
        const offset = this.movement.seatOffset;
        task.path = [{ x: seat.x + Math.sin(toFace) * offset, z: seat.z + Math.cos(toFace) * offset }];
        task.seat = seat;
        this.faceTarget = seat.face;
        this.controller.setPosture('stand');
        break;
      }
      case 'crouch':
        this.controller.setPosture('crouch');
        break;
      default:
        task.done = true;
    }
  }

  finishTask() {
    this.taskLog.push(this.task.def.do);
    if (this.taskLog.length > 40) this.taskLog.shift();
    this.completedTasks++;
    this.taskIndex = (this.taskIndex + 1) % this.role.tasks.length;
    this.startTask(this.taskIndex);
  }

  /** Walks along `task.path`; returns true on arrival at its last point. */
  followPath(task, delta, pace = 'walk') {
    const cruise = (pace === 'run' ? this.movement.runSpeed : this.movement.walkSpeed) * this.role.walkSpeed;
    while (task.path.length) {
      const target = task.path[0];
      const dx = target.x - this.position.x;
      const dz = target.z - this.position.z;
      const distance = Math.hypot(dx, dz);
      const last = task.path.length === 1;
      if (distance <= this.movement.arriveDistance || (!last && distance < 0.4)) {
        task.path.shift();
        continue;
      }
      // Ease in, and slow down before the final point so run -> walk -> stop blends naturally.
      const wanted = last ? Math.min(cruise, Math.sqrt(2 * this.movement.acceleration * distance) + 0.05) : cruise;
      const step = this.movement.acceleration * delta;
      this.speed += THREE.MathUtils.clamp(wanted - this.speed, -step * 2, step);
      const move = Math.min(distance, this.speed * delta);
      this.position.x += (dx / distance) * move;
      this.position.z += (dz / distance) * move;
      this.turnTowards(Math.atan2(dx, dz), delta);
      return false;
    }
    this.speed = 0;
    return true;
  }

  /** Turns towards `heading`; returns true once facing it. */
  turnTowards(heading, delta) {
    const diff = wrapAngle(heading - this.heading);
    const step = this.movement.turnSpeed * delta;
    this.heading = wrapAngle(this.heading + THREE.MathUtils.clamp(diff, -step, step));
    return Math.abs(diff) <= step + 1e-3;
  }

  runTask(delta) {
    const task = this.task;
    const def = task.def;
    task.time += delta;
    if (this.faceTarget && def.do !== 'walk' && !(def.do === 'sit' && task.stage === 'start')) {
      this.turnTowards(angleTo(this.position, this.faceTarget), delta);
    }
    switch (def.do) {
      case 'walk':
        if (this.followPath(task, delta, def.pace)) task.done = true;
        break;
      case 'idle':
        if (task.time >= def.seconds && !this.chat) task.done = true;
        break;
      case 'crouch':
        if (task.time >= def.seconds) {
          this.controller.setPosture('stand');
          task.done = true;
        }
        break;
      case 'sit':
        this.runSit(task, delta);
        break;
      default:
        break;
    }
    if (task.done && this.task === task) this.finishTask();
  }

  runSit(task, delta) {
    const def = task.def;
    if (task.stage === 'start') {
      if (this.followPath(task, delta)) task.stage = 'turn';
    } else if (task.stage === 'turn') {
      if (this.turnTowards(angleTo(this.position, task.seat.face), delta)) {
        this.controller.setPosture('sit');
        task.stage = 'sitting';
        task.time = 0;
      }
    } else if (task.stage === 'sitting') {
      if (def.action && !this.controller.transient && !this.controller.task && task.time < def.seconds) {
        this.controller.play(def.action, { duration: def.seconds - task.time, layer: 'upper' });
      }
      if (task.time >= def.seconds) {
        this.controller.stop();
        this.controller.setPosture('stand');
        task.stage = 'standing';
      }
    } else if (task.stage === 'standing' && !this.controller.transient) {
      task.done = true;
    }
  }

  /** True when this NPC is idling and free to start a conversation. */
  canChat() {
    return !this.debugAction && !this.chat && this.chatCooldown <= 0 && this.task?.def.do === 'idle' && !this.controller.task;
  }

  startChat(partner, seconds) {
    this.chat = { partner, remaining: seconds };
    this.controller.play('talk', { duration: seconds });
  }

  endChat(cooldown) {
    this.chat = null;
    this.chatCooldown = cooldown;
    this.controller.stop();
  }

  /** Debug: stop the schedule and play `action` (loops until the next one). */
  debugPlay(action) {
    this.debugAction = action;
    if (this.chat) this.chat.partner.endChat(0);
    this.chat = null;
    this.speed = 0;
    this.controller.stop();
    this.controller.setPosture('stand');
    this.controller.transient = null;
    this.controller.play(action, { duration: 1e9 });
  }

  /** Debug: go back to the schedule. */
  resume() {
    this.debugAction = null;
    this.controller.stop();
    this.startTask(this.taskIndex);
  }

  update(delta) {
    this.chatCooldown = Math.max(0, this.chatCooldown - delta);
    if (this.debugAction) {
      this.speed = 0;
    } else if (this.chat) {
      this.chat.remaining -= delta;
      this.turnTowards(angleTo(this.position, this.chat.partner.position), delta);
      if (this.chat.remaining <= 0) this.endChat(this.config.social.cooldownSeconds);
      this.task.time += delta;
    } else {
      this.runTask(delta);
    }
    this.controller.setSpeed(this.speed);
    this.controller.update(delta);
    this.syncGroup();
  }

  syncGroup() {
    this.position.y = this.groundAt(this.position.x, this.position.z);
    this.group.position.copy(this.position);
    this.group.rotation.y = this.heading;
    const carrying = this.controller.posture === 'carry' && !this.debugAction;
    this.carried.visible = carrying;
    if (carrying) {
      this.group.updateMatrixWorld(true);
      handL.setFromMatrixPosition(this.hands[0].matrixWorld);
      handR.setFromMatrixPosition(this.hands[1].matrixWorld);
      this.carried.position.copy(handL.add(handR).multiplyScalar(0.5));
      this.group.worldToLocal(this.carried.position);
      this.carried.position.y -= 0.12;
    }
  }

  dispose() {
    this.controller.dispose();
  }
}
