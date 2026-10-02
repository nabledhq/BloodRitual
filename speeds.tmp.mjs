import fs from 'node:fs';
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { captureRig, retargetClip } from './src/npc/retarget.js';
const parse = (file) => new Promise((res, rej) => { const b = fs.readFileSync(file); const l = new GLTFLoader(); l.register(() => ({ name: 'stub', loadTexture: () => Promise.resolve(new THREE.Texture()) })); l.parse(b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength), '', res, rej); });
const chars = await parse('public/models/npc/npc-characters.glb');
const anims = await parse('public/models/npc/npc-animations.glb');
const src = captureRig(anims.scene);
for (const sceneName of ['man', 'woman']) {
  const model = chars.scenes.find((s) => s.name === sceneName);
  model.traverse((o) => { if (o.userData.name) o.name = o.userData.name; });
  const tgt = captureRig(model);
  for (const name of ['Walk_Loop', 'Jog_Fwd_Loop', 'Sprint_Loop', 'Crouch_Fwd_Loop', 'Walk_Carry_Loop', 'Zombie_Walk_Fwd_Loop', 'Idle_Loop']) {
    const clip = retargetClip(anims.animations.find((a) => a.name === name), src, tgt);
    const mixer = new THREE.AnimationMixer(model);
    const action = mixer.clipAction(clip).play();
    const foot = model.getObjectByName('foot_l'); const pelvis = model.getObjectByName('pelvis');
    const N = 240; const samples = [];
    for (let i = 0; i <= N; i++) { action.time = clip.duration * i / N; mixer.update(0); model.updateMatrixWorld(true); const p = new THREE.Vector3().setFromMatrixPosition(foot.matrixWorld); const h = new THREE.Vector3().setFromMatrixPosition(pelvis.matrixWorld); samples.push({ p, h }); }
    const minY = Math.min(...samples.map((s) => s.p.y));
    // stance: foot within 2cm of lowest point; velocity of foot along z
    let v = [], drift = samples[N].h.clone().sub(samples[0].h);
    for (let i = 1; i <= N; i++) if (samples[i].p.y < minY + 0.008 && samples[i - 1].p.y < minY + 0.008) v.push((samples[i].p.z - samples[i - 1].p.z) / (clip.duration / N));
    const zs = samples.map((s) => s.p.z);
    console.log(sceneName, name.padEnd(22), 'dur', clip.duration.toFixed(2), 'stanceV', (v.reduce((a, b) => a + b, 0) / v.length).toFixed(2), 'zrange', (Math.max(...zs) - Math.min(...zs)).toFixed(2), 'footMinY', minY.toFixed(3), 'pelvisDrift', drift.toArray().map((x) => x.toFixed(2)).join(','), 'pelvisY', samples[0].h.y.toFixed(2));
    mixer.stopAllAction(); mixer.uncacheRoot(model);
  }
}
