// A round lens onto the map of Iceland that flies into one location: it
// starts on the whole country, zooms and pans in with an eased flight, and
// the location's pin wiggles when it lands and its name is written on the
// map under it, with a smaller line of text below. Showing another location
// hops out just far enough to see both, then in. The lens is a line map in
// the logo's black and white (the same in both themes) with a blue pin.
// Built from the same parts as the Places map: base map, projection, zoom
// maths and pin.

import { el, replayClass } from '../lib/dom.js';
import { project, polygonsOf, viewBoxAttr } from '../lib/geo.js';
import { clamp } from '../lib/math.js';
import { tween, easeInOut } from '../lib/motion.js';
import { HOME, centreOn, visibleFrame, flightPath, isZoomedIn } from '../lib/map-view.js';
import { layoutPins, placeOnScreen } from '../lib/map-pins.js';
import { drawBaseMap, featuresOf } from './basemap.js';
import { pinMarker } from './map-pin.js';

const LANDING_ZOOM = 6;   // 1 = all of Iceland; 6 shows a town and what is around it
const FLIGHT_TIME = 1800; // ms
const LENS_PAD = 1.04;    // a little sea between the coast and the rim
const LABEL_SPAN = 0.32;  // the label's middle stays this far (lens fractions) either side of centre

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

/** Put an absolutely positioned node at (x, y) px. */
function placeAt(node, x, y) {
  node.style.left = `${x}px`;
  node.style.top = `${y}px`;
}

/**
 * The name written on the map under the pin, with a smaller line of text
 * below it. Seen, not read out: the lens's status line speaks for it.
 */
function mapLabel() {
  const name = el('span', { className: 'lens-label-name' });
  const text = el('span', { className: 'lens-label-text', hidden: true });
  const element = el('div', { className: 'lens-label', hidden: true }, name, text);
  element.setAttribute('aria-hidden', 'true');
  return {
    element,
    show(location) {
      name.textContent = location.name;
      text.textContent = location.text ?? '';
      text.hidden = !location.text; // no empty line when there are no details
      element.hidden = false;
      replayClass(element, 'appear');
    },
    hide() { element.hidden = true; },
  };
}

/**
 * @param {object} base the parsed data/iceland.geojson
 * @param {object} [options]
 * @param {number} [options.zoom] how far in to fly (1 = all of Iceland, up to 24)
 * @param {number} [options.duration] ms per flight
 * @param {boolean} [options.viaAll] between two locations, fly all the way out
 *   to the whole country first (instead of only as far as both fit)
 * @returns the lens's `element` and showLocation / showAll (see below)
 */
export function createLocationZoom(base, { zoom = LANDING_ZOOM, duration = FLIGHT_TIME, viaAll = false } = {}) {
  const frame = lensFrame(base);
  const svg = drawBaseMap(base, frame);
  const pin = pinMarker();
  const label = mapLabel();
  const status = el('p', { className: 'lens-status', role: 'status' }); // read out on landing
  const lens = el('div', { className: 'location-lens' }, svg, pin, label.element);
  const stage = el('div', { className: 'location-zoom' }, lens, status);
  let view = HOME;
  let spot = null; // the location being shown, as a pin from layoutPins
  let flight = { cancel() {} };
  pin.hidden = true;

  /** Move the pin and its label to where the location is in the current view. */
  function placeMarks() {
    const { width, height } = lens.getBoundingClientRect();
    placeOnScreen([spot], view, width, height);
    placeAt(pin, spot.sx, spot.sy);
    placeAt(label.element, clamp(spot.sx, width * (0.5 - LABEL_SPAN), width * (0.5 + LABEL_SPAN)), spot.sy);
  }

  function draw() {
    if (!lens.getBoundingClientRect().width) return;
    svg.setAttribute('viewBox', viewBoxAttr(visibleFrame(view, frame)));
    if (spot) placeMarks();
  }

  /** Fly from the current view to another; resolves on landing (not if overtaken). */
  function flyTo(target) {
    flight.cancel();
    const path = flightPath(view, target);
    flight = tween(duration, (t) => { view = path(easeInOut(t)); draw(); });
    return flight.done;
  }

  new ResizeObserver(draw).observe(lens);

  return {
    element: stage,
    /** Fly to a location ({ name, text, lat, lng }); resolves when it has landed. */
    async showLocation(location) {
      label.hide();
      const landing = layoutPins([{ place: location.name, lat: location.lat, lng: location.lng }], frame)[0];
      if (viaAll && isZoomedIn(view)) {
        pin.hidden = true;
        spot = landing; // marks a newer pick, so an overtaken call stops below
        await flyTo(HOME);
        if (spot !== landing) return;
      }
      spot = landing;
      pin.hidden = false;
      draw();
      await flyTo(centreOn(spot.fx, spot.fy, zoom));
      if (spot !== landing) return;
      replayClass(pin, 'wiggle');
      label.show(location);
      status.textContent = location.text ? `${location.name}: ${location.text}` : location.name;
    },
    /** Hide the name and fly back out to the whole country. */
    showAll() {
      label.hide();
      status.textContent = 'All of Iceland';
      return flyTo(HOME);
    },
  };
}
