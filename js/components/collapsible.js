// A section that folds open and shut: a <details> with a one-line summary.

import { el } from '../lib/dom.js';

/**
 * @param {string|Node|Array<string|Node>} summary the always-visible line
 * @param {Node} content shown when open
 * @param {{ className?: string, open?: boolean }} [options]
 */
export function collapsible(summary, content, { className = '', open = false } = {}) {
  return el('details', { className, open }, el('summary', {}, ...[summary].flat()), content);
}
