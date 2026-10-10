// A map pin: a round head on a thin stem, whose foot marks the place. The
// Places map uses it as a button that opens its flag (map-flag.js); the
// location zoom uses a plain marker, with the name written under it.

import { el } from '../lib/dom.js';

/** The pin's head and stem. */
const pinParts = () => [el('span', { className: 'pin-head' }), el('span', { className: 'pin-stem' })];

/**
 * A pin button for a pin from layoutPins (lib/map-pins.js), named after its
 * place. Clicks don't reach the map underneath (that would close the flag).
 */
export function pinButton(pin, onClick) {
  const button = el('button', { className: 'pin', ariaLabel: pin.row.place, title: pin.row.place }, ...pinParts());
  button.setAttribute('aria-expanded', 'false');
  button.addEventListener('click', (e) => { e.stopPropagation(); onClick(); });
  return button;
}

/** A pin that only marks a place (no button); screen readers skip it. */
export function pinMarker() {
  const marker = el('span', { className: 'pin pin-marker' }, ...pinParts());
  marker.setAttribute('aria-hidden', 'true');
  return marker;
}
