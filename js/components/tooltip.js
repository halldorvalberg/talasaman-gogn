// A small box that follows the pointer over a map: a bold title and one detail
// line. Append `element` inside a positioned container (position: relative).

import { el } from '../lib/dom.js';

const OFFSET = 14; // px from the pointer, down and to the right

/** A hidden tooltip; returns its `element` and show(event, title, detail) / hide(). */
export function createTooltip() {
  const box = el('div', { className: 'tooltip', hidden: true });

  /** Show `title` and `detail` next to the pointer of `event`. */
  function show(event, title, detail) {
    box.replaceChildren(el('strong', {}, title), el('br'), detail);
    box.hidden = false; // must be visible before offsetParent can be measured
    const origin = box.offsetParent.getBoundingClientRect();
    box.style.left = `${event.clientX - origin.left + OFFSET}px`;
    box.style.top = `${event.clientY - origin.top + OFFSET}px`;
  }

  const hide = () => { box.hidden = true; };

  return { element: box, show, hide };
}
