import { MathUtils } from './procedural/index.js';

/**
 * Procedural poses for the characters built by character.js: a relaxed
 * idle and a walk / run cycle. They pose the character's joints directly;
 * src/engine/AnimationController.js bakes them into Babylon.js
 * AnimationGroups and blends those by weight.
 */

const TAU = Math.PI * 2;

// ---- Animation ----------------------------------------------------------------------

function setRest(rig) {
  for (const key of ['leftLeg', 'rightLeg', 'leftKnee', 'rightKnee', 'leftFoot', 'rightFoot']) rig[key].rotation.set(0, 0, 0);
}

/**
 * Relaxed idle: breathing, a slow weight shift from foot to foot, small arm
 * sway and the head looking around. A pure function of `elapsed` seconds
 * (plus the character's own phase), so the same time gives the same pose.
 */
export function updateCharacterIdle(character, elapsed) {
  const rig = character.userData.rig;
  if (!rig) return;
  const t = elapsed + character.userData.phase * 3;
  const { body, torso, garments, head, leftArm, rightArm, leftElbow, rightElbow, leftKnee, rightKnee, leftLeg, rightLeg } = rig;
  setRest(rig);
  const breath = Math.sin((t * TAU) / 4.2);
  garments.scale.set(1 + breath * 0.008, 1 + breath * 0.004, 1 + breath * 0.016);

  // Weight shift: the pelvis drifts over one foot, tilts, and the other knee softens.
  const w = Math.sin((t * TAU) / 9.5) * 0.8 + Math.sin((t * TAU) / 23) * 0.2;
  body.position.set(w * 0.016, body.userData.baseY - Math.abs(w) * 0.004, 0);
  body.rotation.set(0, w * 0.04, -w * 0.035);
  leftLeg.rotation.z = w * 0.035 - w * 0.012;
  rightLeg.rotation.z = w * 0.035 + w * 0.012;
  leftKnee.rotation.x = Math.max(0, -w) * 0.09;
  rightKnee.rotation.x = Math.max(0, w) * 0.09;
  leftLeg.rotation.x = -Math.max(0, -w) * 0.04;
  rightLeg.rotation.x = -Math.max(0, w) * 0.04;
  torso.rotation.set(torso.userData.stoop + breath * 0.008, -w * 0.03, w * 0.05);

  head.position.y = head.userData.baseY + breath * 0.002;
  head.rotation.set(
    head.userData.restX + Math.sin(t * 0.43) * 0.04,
    Math.sin(t * 0.29) * 0.3 + Math.sin(t * 0.71) * 0.05,
    -w * 0.03,
  );

  const sway = Math.sin((t * TAU) / 4.2 + 0.6) * 0.02;
  leftArm.rotation.set(sway * 0.6 + 0.03, 0, leftArm.userData.restZ - sway * 0.5 - w * 0.03);
  rightArm.rotation.set(-sway * 0.6 + 0.03, 0, rightArm.userData.restZ + sway * 0.5 - w * 0.03);
  leftArm.position.y = rightArm.position.y = leftArm.userData.baseY + breath * 0.002;
  leftElbow.rotation.x = leftElbow.userData.restX - sway;
  rightElbow.rotation.x = rightElbow.userData.restX + sway;
}

/**
 * Walk / run cycle. `distance` is how far the character has travelled in
 * metres; `run` (0..1) blends from a walk to a run (longer stride, more
 * knee lift, forward lean, bent arms). Returns the vertical bob the caller
 * may add to the character's position.
 */
export function updateCharacterWalk(character, distance, elapsed = 0, { run = 0 } = {}) {
  const rig = character.userData.rig;
  if (!rig) return 0;
  const { body, torso, garments, head, leftArm, rightArm, leftElbow, rightElbow, leftLeg, rightLeg, leftKnee, rightKnee, leftFoot, rightFoot } = rig;
  const k = MathUtils.clamp(run, 0, 1);
  const stride = character.userData.strideLength * (1 + 0.45 * k);
  const phase = (distance / stride) * TAU;
  const s = Math.sin(phase);
  const lerp = MathUtils.lerp;

  const swing = lerp(0.42, 0.7, k);
  leftLeg.rotation.set(-s * swing - k * 0.1, 0, 0);
  rightLeg.rotation.set(s * swing - k * 0.1, 0, 0);
  // Knees flex as each leg swings through, more when running.
  const kneeLift = lerp(0.65, 1.35, k);
  leftKnee.rotation.x = Math.max(0, Math.sin(phase + Math.PI * 0.5)) * kneeLift + 0.05;
  rightKnee.rotation.x = Math.max(0, Math.sin(phase - Math.PI * 0.5)) * kneeLift + 0.05;
  // Feet stay roughly parallel to the ground, with a little toe-off behind the body.
  leftFoot.rotation.x = -(leftLeg.rotation.x + leftKnee.rotation.x) * 0.85 + Math.max(0, -s) * 0.15;
  rightFoot.rotation.x = -(rightLeg.rotation.x + rightKnee.rotation.x) * 0.85 + Math.max(0, s) * 0.15;

  const armSwing = lerp(0.35, 0.7, k);
  leftArm.rotation.set(s * armSwing, 0, leftArm.userData.restZ);
  rightArm.rotation.set(-s * armSwing, 0, rightArm.userData.restZ);
  leftArm.position.y = rightArm.position.y = leftArm.userData.baseY;
  leftElbow.rotation.x = lerp(-0.3, -1.35, k) - Math.max(0, s) * 0.25;
  rightElbow.rotation.x = lerp(-0.3, -1.35, k) - Math.max(0, -s) * 0.25;

  garments.scale.set(1, 1, 1);
  body.position.set(0, body.userData.baseY, 0);
  body.rotation.set(0, s * 0.08, Math.cos(phase) * 0.02);
  torso.rotation.set(torso.userData.stoop + lerp(0.03, 0.2, k), -s * 0.1, 0);
  head.position.y = head.userData.baseY;
  head.rotation.set(head.userData.restX - lerp(0.02, 0.15, k), s * 0.05 + Math.sin(elapsed * 0.3) * 0.08, 0);
  return Math.abs(Math.cos(phase)) * lerp(0.025, 0.06, k);
}
