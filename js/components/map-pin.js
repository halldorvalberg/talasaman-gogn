// A map pin: a round head on a thin stem, whose foot marks the place. Used on
// the Places map and in the location zoom; its flag is map-flag.js.

import { el } from '../lib/dom.js';

/**
 * A pin button for a pin from layoutPins (lib/map-pins.js), named after its
 * place. Clicks don't reach the map underneath (that would close the flag).
 */
export function pinButton(pin, onClick) {
  const button = el('button', { className: 'pin', ariaLabel: pin.row.place, title: pin.row.place },
    el('span', { className: 'pin-head' }), el('span', { className: 'pin-stem' }));
  button.setAttribute('aria-expanded', 'false');
  button.addEventListener('click', (e) => { e.stopPropagation(); onClick(); });
  return button;
}
