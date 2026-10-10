// A round lens onto the map of Iceland that flies into one location: it
// starts on the whole country, zooms and pans in with an eased flight, and
// the location's pin wiggles when it lands and opens its flag (a name and a
// line of text). Showing another location hops out just far enough to see
// both, then in. The flag hangs from the pin over the lens's edge, so long
// text still has room. Built from the same parts as the Places map: base
// map, projection, zoom maths, pin and flag.

import { el, replayClass } from '../lib/dom.js';
import { project, polygonsOf, viewBoxAttr } from '../lib/geo.js';
import { tween, easeInOut } from '../lib/motion.js';
import { HOME, centreOn, visibleFrame, flightPath } from '../lib/map-view.js';
import { layoutPins, placeOnScreen } from '../lib/map-pins.js';
import { drawBaseMap, featuresOf } from './basemap.js';
import { pinButton } from './map-pin.js';
import { createFlag } from './map-flag.js';

const LANDING_ZOOM = 6;   // 1 = all of Iceland; 6 shows a town and what is around it
const FLIGHT_TIME = 1800; // ms
const LENS_PAD = 1.04;    // a little sea between the coast and the rim

/** Every point of the coastline's outer rings, in map units. */
function coastPoints(base) {
  return featuresOf(base, 'coast')
    .flatMap((f) => polygonsOf(f.geometry))
    .flatMap((polygon) => polygon[0].map(project));
}

/**
 * The square frame (map units) whose inscribed circle holds all of Iceland:
 * centred on the coastline's extent, as wide as its farthest point is away.
 */
function lensFrame(base) {
  const points = coastPoints(base);
  const xs = points.map(([x]) => x), ys = points.map(([, y]) => y);
  const cx = (Math.min(...xs) + Math.max(...xs)) / 2, cy = (Math.min(...ys) + Math.max(...ys)) / 2;
  const r = LENS_PAD * Math.max(...points.map(([x, y]) => Math.hypot(x - cx, y - cy)));
  return { x: cx - r, y: cy - r, w: 2 * r, h: 2 * r };
}

/** Put a pin's button where its location is on screen for the current view. */
function placePin(pin, view, lens) {
  const { width, height } = lens.getBoundingClientRect();
  placeOnScreen([pin], view, width, height);
  pin.el.style.left = `${pin.sx}px`;
  pin.el.style.top = `${pin.sy}px`;
}

/**
 * @param {object} base the parsed data/iceland.geojson
 * @param {object} [options]
 * @param {number} [options.zoom] how far in to fly (1 = all of Iceland, up to 24)
 * @param {number} [options.duration] ms per flight
 * @returns the lens's `element` and showLocation / showAll (see below)
 */
export function createLocationZoom(base, { zoom = LANDING_ZOOM, duration = FLIGHT_TIME } = {}) {
  const frame = lensFrame(base);
  const svg = drawBaseMap(base, frame);
  const lens = el('div', { className: 'location-lens' }, svg);
  const stage = el('div', { className: 'location-zoom' }, lens);
  const flag = createFlag(stage);
  let view = HOME;
  let pin = null; // the location being shown
  let flight = { cancel() {} };

  function draw() {
    if (!lens.getBoundingClientRect().width) return;
    svg.setAttribute('viewBox', viewBoxAttr(visibleFrame(view, frame)));
    if (pin) placePin(pin, view, lens);
    flag.follow();
  }

  /** Fly from the current view to another; resolves on landing (not if overtaken). */
  function flyTo(target) {
    flight.cancel();
    const path = flightPath(view, target);
    flight = tween(duration, (t) => { view = path(easeInOut(t)); draw(); });
    return flight.done;
  }

  /** Swap the pin for one on a new location; its flag opens only on landing. */
  function dropPin({ name, text, lat, lng }) {
    flag.close();
    pin?.el.remove();
    pin = layoutPins([{ place: name, reason: text, lat, lng }], frame)[0]; // the flag's row shape
    pin.el = pinButton(pin, () => flag.toggle(pin));
    lens.append(pin.el);
    draw();
  }

  stage.append(flag.element);
  stage.addEventListener('click', () => flag.close());
  stage.addEventListener('keydown', (e) => { if (e.key === 'Escape') flag.close({ returnFocus: true }); });
  new ResizeObserver(draw).observe(lens);

  return {
    element: stage,
    /** Fly to a location ({ name, text, lat, lng }); resolves when it has landed. */
    async showLocation(location) {
      dropPin(location);
      const landing = pin;
      await flyTo(centreOn(pin.fx, pin.fy, zoom));
      if (pin !== landing) return;
      replayClass(pin.el, 'wiggle');
      flag.open(pin, { focus: false }); // focus stays on whatever picked the location
    },
    /** Close the flag and fly back out to the whole country. */
    showAll() {
      flag.close();
      return flyTo(HOME);
    },
  };
}
