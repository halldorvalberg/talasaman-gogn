// The list of places beside the map. Hovering or focusing a place highlights
// its pin and flies the map there; clicking opens its flag. Hovering a pin
// marks its place in the list.

import { el } from '../../lib/dom.js';
import { compareIcelandic } from '../../lib/format.js';

const HOVER_DELAY = 90; // ms; a quick pass over the list doesn't jerk the map around

/**
 * @param {object[]} pins pins from layoutPins, each with its .el button
 * @param {ReturnType<import('./stage.js').createPlacesStage>} map
 */
export function createPlaceList(pins, map) {
  let timer = 0;

  function placeItem(p) {
    const card = el('button', { className: 'place-card' },
      el('span', { className: 'place-name' }, p.row.place),
      el('span', { className: 'place-reason' }, p.row.reason || '—'));

    const enter = () => {
      card.classList.add('active');
      map.highlight(p);
      clearTimeout(timer);
      timer = setTimeout(() => map.showNearby(p), HOVER_DELAY);
    };
    const leave = () => {
      clearTimeout(timer);
      card.classList.remove('active');
      map.unhighlight(p);
    };
    card.addEventListener('mouseenter', enter);
    card.addEventListener('focus', enter);
    card.addEventListener('mouseleave', leave);
    card.addEventListener('blur', leave);
    card.addEventListener('click', () => { clearTimeout(timer); map.openPlace(p); });

    p.el.addEventListener('mouseenter', () => card.classList.add('active'));
    p.el.addEventListener('mouseleave', () => { if (!map.isHighlighted(p)) card.classList.remove('active'); });
    return el('li', {}, card);
  }

  const sorted = [...pins].sort((a, b) => compareIcelandic(a.row.place, b.row.place));
  return el('div', { className: 'places-list-wrap' },
    el('div', { className: 'places-list-head' }, `${pins.length} places`),
    el('ol', { className: 'places-list', ariaLabel: 'Places on the map' }, ...sorted.map(placeItem)));
}
