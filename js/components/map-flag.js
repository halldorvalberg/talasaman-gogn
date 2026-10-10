// The flag: a small card hanging off a pin's head like a pennant, with the
// pin's name and a line of text (on the Places map, why someone chose the
// place). One flag per map; used by the Places map and the location zoom.

import { el } from '../lib/dom.js';

// Open towards the middle of the map when the pin is near the right or top edge.
const FLIP_RIGHT = 0.62;
const FLIP_TOP = 0.35;

/** The flag's × button. */
function flagCloseButton(onClick) {
  const button = el('button', { className: 'flag-close', title: 'Close', ariaLabel: 'Close' }, '×');
  button.addEventListener('click', onClick);
  return button;
}

/** @param {HTMLElement} stage the positioned map container the flag lives in */
export function createFlag(stage) {
  const box = el('div', { className: 'flag', hidden: true, role: 'dialog' });
  let current = null; // the pin it hangs from

  function setExpanded(pin, expanded) {
    pin.el.classList.toggle('open', expanded);
    pin.el.setAttribute('aria-expanded', String(expanded));
  }

  /** Close the flag; with returnFocus, focus goes back to its pin (keyboard users). */
  function close({ returnFocus = false } = {}) {
    if (!current) return;
    const pin = current;
    box.hidden = true;
    setExpanded(pin, false);
    current = null;
    if (returnFocus && !pin.el.hidden) pin.el.focus({ preventScroll: true });
  }

  /** Open the flag on a pin; focus moves into it unless `focus` is false. */
  function open(pin, { focus = true } = {}) {
    close();
    current = pin;
    setExpanded(pin, true);
    const closeButton = flagCloseButton(() => close({ returnFocus: true }));
    box.replaceChildren(closeButton, el('h3', {}, pin.row.place), el('p', {}, pin.row.reason || '—'));
    box.setAttribute('aria-label', pin.row.place);
    box.hidden = false;
    follow();
    if (focus) closeButton.focus({ preventScroll: true });
  }

  const toggle = (pin) => (current === pin ? close() : open(pin));

  /** Keep the flag on its pin after the map moves; close it if the pin got hidden. */
  function follow() {
    if (!current) return;
    if (current.el.hidden) return close();
    const x = parseFloat(current.el.style.left), y = parseFloat(current.el.style.top);
    const { width, height } = stage.getBoundingClientRect();
    box.classList.toggle('flip-x', x / width > FLIP_RIGHT);
    box.classList.toggle('flip-y', y / height < FLIP_TOP);
    box.style.left = `${x}px`;
    box.style.top = `${y}px`;
  }

  box.addEventListener('click', (e) => e.stopPropagation()); // clicks inside don't close it

  return { element: box, open, close, toggle, follow, isOpenOn: (pin) => current === pin };
}
