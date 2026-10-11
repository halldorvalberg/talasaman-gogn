// A small box that follows the pointer over a map or chart: a bold title and
// one detail line. Append `element` inside a positioned container
// (position: relative).

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

/**
 * Keep a shown tooltip inside `container`: shift it left when it would run
 * past the right edge (it is placed to the right of the pointer).
 */
export function keepInside(box, container) {
  const room = container.clientWidth - box.offsetWidth;
  if (box.offsetLeft > room) box.style.left = `${Math.max(0, room)}px`;
}
