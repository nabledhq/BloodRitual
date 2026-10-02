/**
 * Debug overlay: a simple FPS counter and, when an NPC is selected, its
 * role, task, current animation state and the last crossfade. Toggled with
 * `DEBUG_KEYS.overlay`; shown automatically when the NPC debug keys are used.
 */
export class DebugOverlay {
  constructor(element = null, { sampleSeconds = 0.5 } = {}) {
    this.element = element;
    this.sampleSeconds = sampleSeconds;
    this.visible = false;
    this.frames = 0;
    this.elapsed = 0;
    this.fps = 0;
    this.message = '';
    if (element) element.hidden = true;
  }

  toggle(visible = !this.visible) {
    this.visible = visible;
    if (this.element) this.element.hidden = !visible;
  }

  /** Shows a one-line note under the stats (e.g. the action just played). */
  note(message) {
    this.message = message;
  }

  /** Counts a frame of `delta` seconds; refreshes the text a few times a second. */
  update(delta, npc = null) {
    this.frames++;
    this.elapsed += delta;
    if (this.elapsed < this.sampleSeconds) return;
    this.fps = this.frames / this.elapsed;
    this.frames = 0;
    this.elapsed = 0;
    if (this.visible && this.element) this.element.textContent = this.text(npc);
  }

  text(npc) {
    const lines = [`FPS ${this.fps.toFixed(0)}`];
    if (npc) {
      const c = npc.controller;
      const last = c.history[c.history.length - 1];
      lines.push(
        `${npc.name} (${npc.roleName})`,
        `task: ${npc.debugAction ? 'debug' : npc.currentTask?.do ?? '-'}  cycles: ${npc.cycles}`,
        `posture: ${c.posture}  gait: ${c.gait}  speed: ${npc.speed.toFixed(2)} m/s`,
        `playing: ${c.currentAction}`,
      );
      if (last) lines.push(`last blend: ${last.from} -> ${last.to} (${last.duration.toFixed(2)} s)`);
    }
    if (this.message) lines.push(this.message);
    return lines.join('\n');
  }
}
