// The interactive places map: base map, pins, numbered groups, zoom buttons
// and the flag. Owns the current view; the list beside it drives it through
// the returned API (highlight, showNearby, openPlace).

import { el, replayClass } from '../../lib/dom.js';
import { viewBoxAttr } from '../../lib/geo.js';
import { tween, easeOut } from '../../lib/motion.js';
import {
  HOME, MAX_ZOOM, clampView, centreOn, zoomAround, fitPoints, visibleFrame,
  interpolateView, isZoomedIn, isAtMaxZoom,
} from '../../lib/map-view.js';
import { placeOnScreen, onStage } from '../../lib/map-pins.js';
import { drawBaseMap } from '../../components/basemap.js';
import { pinButton } from '../../components/map-pin.js';
import { createFlag } from '../../components/map-flag.js';
import { findClusters } from './clusters.js';
import { attachGestures, shieldFromGestures } from './gestures.js';

const NEARBY_ZOOM = 4; // gentle zoom for list hover: shows the area around a place
const QUICK_FLIGHT = 260; // ms, for moves started from the list
const FLIGHT = 380; // ms, for zoom buttons, groups and double-clicks
const PIN_MARGIN = 20; // px; pins this far off-stage are hidden

/** Animate from one view to another, calling onFrame(view) every frame. */
const animateView = (from, to, duration, onFrame) =>
  tween(duration, (t) => onFrame(interpolateView(from, to, easeOut(t))));

/** A square map button that doesn't let its click reach the map. */
function mapButton(label, text, action, className = '') {
  const button = el('button', { className, title: label, ariaLabel: label }, text);
  button.addEventListener('click', (e) => { e.stopPropagation(); action(); });
  return button;
}

/** +, − and "all of Iceland" buttons, disabled when they can't do anything. */
function zoomControls({ zoomIn, zoomOut, reset }) {
  const inButton = mapButton('Zoom in', '+', zoomIn);
  const outButton = mapButton('Zoom out', '−', zoomOut);
  const resetButton = mapButton('Show all of Iceland', '⤢', reset);
  return {
    element: el('div', { className: 'map-controls' }, inButton, outButton, resetButton),
    update(view) {
      inButton.disabled = isAtMaxZoom(view);
      outButton.disabled = resetButton.disabled = !isZoomedIn(view);
    },
  };
}

/** A numbered circle for a group of pins, sized by how many it holds. */
function groupButton(group, onClick) {
  const n = group.members.length;
  const size = `${Math.round(20 + 5 * Math.sqrt(n))}px`;
  const button = mapButton(`${n} places, zoom in`, String(n), onClick, 'cluster');
  button.title = `${n} places — click to zoom in`;
  Object.assign(button.style, { left: `${group.x}px`, top: `${group.y}px`, width: size, height: size });
  return button;
}

/** The groups to draw: none at full zoom, where every pin is shown on its own. */
const groupsFor = (pins, view, size, highlighted) => (isAtMaxZoom(view)
  ? { groups: [], grouped: new Set() }
  : findClusters(pins, { ...size, keep: highlighted }));

/** Move each pin's button to its place, hiding grouped and off-stage pins. */
function showPins(pins, view, grouped, { width, height }) {
  const fanOut = isAtMaxZoom(view); // shared coordinates spread out only at full zoom
  for (const p of pins) {
    p.el.hidden = grouped.has(p) || !onStage(p, width, height, PIN_MARGIN);
    p.el.style.left = `${p.sx + (fanOut ? p.dx : 0)}px`;
    p.el.style.top = `${p.sy + (fanOut ? p.dy : 0)}px`;
  }
}

/** The empty stage, shaped like the map frame. */
function stageElement(frame) {
  const stage = el('div', { className: 'places-stage' });
  stage.style.aspectRatio = `${frame.w} / ${frame.h}`;
  stage.style.setProperty('--ratio', frame.w / frame.h);
  return stage;
}

/**
 * @param {object} base the parsed data/iceland.geojson
 * @param {{ x, y, w, h }} frame the whole map, in map units
 * @param {object[]} pins from layoutPins; each gets its button as .el
 */
export function createPlacesStage(base, frame, pins) {
  const stage = stageElement(frame);
  const svg = drawBaseMap(base, frame);
  const groupLayer = el('div', { className: 'cluster-layer' });
  const flag = createFlag(stage);
  let view = HOME;
  let highlighted = null; // shown as its own pin even inside a group
  let animation = { cancel() {} };

  const setView = (next) => { animation.cancel(); view = clampView(next); draw(); };
  function flyTo(target, duration = FLIGHT) {
    animation.cancel();
    animation = animateView(view, clampView(target), duration, (v) => { view = v; draw(); });
    return animation.done;
  }
  const zoomAboutPoint = (factor, px, py, animate) => {
    const next = zoomAround(view, factor, px, py);
    return animate ? flyTo(next) : setView(next);
  };
  const openGroup = (group) => { flag.close(); flyTo(fitPoints(group.members)); };

  const controls = zoomControls({
    zoomIn: () => zoomAboutPoint(2, 0.5, 0.5, true),
    zoomOut: () => zoomAboutPoint(1 / 2, 0.5, 0.5, true),
    reset: () => flyTo(HOME),
  });

  function draw() {
    const { width, height } = stage.getBoundingClientRect();
    if (!width) return;
    svg.setAttribute('viewBox', viewBoxAttr(visibleFrame(view, frame)));
    placeOnScreen(pins, view, width, height);
    const { groups, grouped } = groupsFor(pins, view, { width, height }, highlighted);
    showPins(pins, view, grouped, { width, height });
    groupLayer.replaceChildren(...groups.map((g) => groupButton(g, () => openGroup(g))));
    stage.classList.toggle('zoomed', isZoomedIn(view));
    stage.style.touchAction = isZoomedIn(view) ? 'none' : 'pan-y'; // let the page scroll until zoomed
    controls.update(view);
    flag.follow();
  }

  for (const p of pins) p.el = pinButton(p, () => flag.toggle(p));
  stage.append(svg, ...pins.map((p) => p.el), groupLayer, flag.element, controls.element);
  shieldFromGestures(controls.element, flag.element, groupLayer);
  const gestures = attachGestures(stage, { view: () => view, setView, zoomAround: zoomAboutPoint });
  stage.addEventListener('click', () => { if (!gestures.wasDrag()) flag.close(); });
  stage.addEventListener('keydown', (e) => { if (e.key === 'Escape') flag.close({ returnFocus: true }); });
  new ResizeObserver(draw).observe(stage);

  return {
    element: stage,
    isHighlighted: (p) => highlighted === p,
    /** Colour, wiggle and ungroup a pin. */
    highlight(p) {
      if (highlighted && highlighted !== p) highlighted.el.classList.remove('highlight');
      highlighted = p;
      draw();
      replayClass(p.el, 'highlight');
    },
    unhighlight(p) {
      if (highlighted !== p) return;
      p.el.classList.remove('highlight');
      highlighted = null;
      draw();
    },
    /** Fly gently to a place, keeping its surroundings in view. */
    showNearby: (p) => flyTo(centreOn(p.fx, p.fy, Math.max(view.k, NEARBY_ZOOM)), QUICK_FLIGHT),
    /** Fly all the way in to a place and open its flag. */
    async openPlace(p) {
      await flyTo(centreOn(p.fx, p.fy, MAX_ZOOM), QUICK_FLIGHT);
      if (!flag.isOpenOn(p)) flag.open(p);
    },
  };
}
