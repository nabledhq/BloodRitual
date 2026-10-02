import { REPUTATION_KEY } from './input.js';
import { escapeHtml } from './controls-panel.js';

/** Markup for the reputation panel: every faction with its score, tier and a bar. */
export function renderReputationPanel(reputation) {
  const { min, max } = reputation.config.range;
  const rows = reputation.factions
    .map(({ id, label }) => {
      const score = reputation.getReputation(id);
      const tier = reputation.getTierInfo(id);
      const zero = ((0 - min) / (max - min)) * 100;
      const at = ((score - min) / (max - min)) * 100;
      const left = Math.min(zero, at).toFixed(1);
      const width = Math.abs(at - zero).toFixed(1);
      const signed = score > 0 ? `+${score}` : String(score);
      return (
        `<tr data-faction="${escapeHtml(id)}">` +
        `<th scope="row">${escapeHtml(label)}</th>` +
        `<td class="rep-score">${signed}</td>` +
        `<td class="rep-tier rep-tier-${escapeHtml(tier.id)}">${escapeHtml(tier.label)}</td>` +
        `</tr>` +
        `<tr class="rep-bar-row"><td colspan="3"><div class="rep-bar"><span class="${score < 0 ? 'negative' : 'positive'}" ` +
        `style="left:${left}%;width:${width}%"></span></div></td></tr>`
      );
    })
    .join('');
  const attention = reputation.getAuthorityAttention();
  const maxAttention = reputation.config.authorityAttention?.thresholds.length ?? 0;
  const attentionHtml = maxAttention
    ? `<p class="rep-attention">Authority attention: <strong data-attention>${attention}</strong> / ${maxAttention}</p>`
    : '';
  return (
    '<div class="controls-header">' +
    '<h2 id="reputation-title">Reputation</h2>' +
    '<button type="button" class="controls-close" data-reputation-close aria-label="Close Reputation">&times;</button>' +
    '</div>' +
    `<table class="rep-table"><tbody>${rows}</tbody></table>` +
    attentionHtml
  );
}

/**
 * The reputation panel, toggled with `R`. It re-renders whenever a score
 * changes, so it always shows the current standing.
 */
export class ReputationPanel {
  constructor(root, reputation, { target = window, visible = false } = {}) {
    this.root = root;
    this.reputation = reputation;
    this.target = target;
    this.onKeyDown = this.onKeyDown.bind(this);
    this.onClick = this.onClick.bind(this);

    root.setAttribute?.('role', 'dialog');
    root.setAttribute?.('aria-labelledby', 'reputation-title');
    root.addEventListener?.('click', this.onClick);
    target.addEventListener('keydown', this.onKeyDown);
    this.unsubscribe = reputation.onReputationChanged(() => this.render());
    this.render();
    this.root.hidden = !visible;
  }

  get visible() {
    return !this.root.hidden;
  }

  render() {
    this.root.innerHTML = renderReputationPanel(this.reputation);
  }

  show() {
    this.root.hidden = false;
  }

  hide() {
    this.root.hidden = true;
  }

  toggle() {
    this.root.hidden = !this.root.hidden;
  }

  onKeyDown(event) {
    if (event.code !== REPUTATION_KEY || event.repeat) return;
    if (event.ctrlKey || event.metaKey || event.altKey) return;
    this.toggle();
  }

  onClick(event) {
    if (event.target?.closest?.('[data-reputation-close]')) this.hide();
  }

  dispose() {
    this.target.removeEventListener('keydown', this.onKeyDown);
    this.root.removeEventListener?.('click', this.onClick);
    this.unsubscribe();
  }
}
