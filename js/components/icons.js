// Small SVG icons for buttons. Symbol characters (▶ ⏮ ✕ …) look different
// on every system and phones draw several of them as colour emoji, so the
// buttons use these instead. They take the text colour and are hidden from
// screen readers: the button's own label names it.

import { svgEl } from '../lib/dom.js';

/** Path data on a 24×24 grid. */
const PATHS = {
  play: 'M7 4.5v15l12.5-7.5z',
  pause: 'M6.5 4.5h4v15h-4zM13.5 4.5h4v15h-4z',
  stop: 'M5.5 5.5h13v13h-13z',
  previous: 'M5 5h2.5v14H5zM19 5v14L8.5 12z',
  next: 'M16.5 5H19v14h-2.5zM5 5v14l10.5-7z',
  close: 'M6.4 5 12 10.6 17.6 5 19 6.4 13.4 12l5.6 5.6-1.4 1.4-5.6-5.6L6.4 19 5 17.6l5.6-5.6L5 6.4z',
  expand: 'M4 4h6v2H7.4l3.8 3.8-1.4 1.4L6 7.4V10H4zM20 20h-6v-2h2.6l-3.8-3.8 1.4-1.4 3.8 3.8V14h2z',
};

/**
 * An icon as an inline SVG, sized to the text (1em).
 * @param {keyof PATHS} name
 */
export function icon(name, className = 'icon') {
  return svgEl('svg', { viewBox: '0 0 24 24', class: className, 'aria-hidden': 'true', focusable: 'false' },
    svgEl('path', { d: PATHS[name] }));
}
