// Pointer gestures on the places map: drag to pan; pinch, ctrl/⌘ + wheel
// (which is also how trackpads report a pinch) and double-click to zoom.
// Plain scrolling is left alone so the page still scrolls past the map.

const DRAG_THRESHOLD = 4; // px before a press counts as a drag, not a click
const DOUBLE_CLICK_ZOOM = 2.5;
const WHEEL_SPEED = 0.01;

const distance = ([a, b]) => Math.hypot(a.x - b.x, a.y - b.y);

/**
 * @param {HTMLElement} stage
 * @param {object} map
 * @param {() => {k:number, ux:number, uy:number}} map.view current view
 * @param {(view) => void} map.setView jump to a view
 * @param {(factor, px, py, animate) => void} map.zoomAround zoom about a point in stage fractions
 * @returns {{ wasDrag: () => boolean }} whether the last press moved the map
 */
export function attachGestures(stage, map) {
  const pointers = new Map(); // pointerId → last { x, y }
  let dragged = false;
  let pinch = null; // { distance, k } when a two-finger pinch began

  function toFraction(x, y) {
    const r = stage.getBoundingClientRect();
    return [(x - r.left) / r.width, (y - r.top) / r.height];
  }

  function pan(e, prev) {
    const dx = e.clientX - prev.x, dy = e.clientY - prev.y;
    if (!dragged && Math.hypot(dx, dy) < DRAG_THRESHOLD) return;
    if (!dragged) {
      dragged = true;
      stage.setPointerCapture(e.pointerId);
      stage.classList.add('dragging');
    }
    const { width, height } = stage.getBoundingClientRect();
    const v = map.view();
    map.setView({ k: v.k, ux: v.ux + dx / width, uy: v.uy + dy / height });
    pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
  }

  function pinchZoom(e) {
    pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    const [a, b] = [...pointers.values()];
    const [mx, my] = toFraction((a.x + b.x) / 2, (a.y + b.y) / 2);
    const targetK = (pinch.k * distance([a, b])) / pinch.distance;
    map.zoomAround(targetK / map.view().k, mx, my, false);
    dragged = true;
  }

  stage.addEventListener('pointerdown', (e) => {
    if (e.target.closest('.pin')) return;
    pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    dragged = false;
    if (pointers.size === 2) pinch = { distance: distance([...pointers.values()]), k: map.view().k };
  });

  stage.addEventListener('pointermove', (e) => {
    const prev = pointers.get(e.pointerId);
    if (!prev) return;
    if (pointers.size === 1) pan(e, prev);
    else if (pointers.size === 2 && pinch) pinchZoom(e);
  });

  const release = (e) => {
    pointers.delete(e.pointerId);
    if (pointers.size < 2) pinch = null;
    if (!pointers.size) stage.classList.remove('dragging');
  };
  stage.addEventListener('pointerup', release);
  stage.addEventListener('pointercancel', release);

  stage.addEventListener('wheel', (e) => {
    if (!e.ctrlKey && !e.metaKey) return;
    e.preventDefault();
    map.zoomAround(Math.exp(-e.deltaY * WHEEL_SPEED), ...toFraction(e.clientX, e.clientY), false);
  }, { passive: false });

  stage.addEventListener('dblclick', (e) => {
    if (e.target.closest('.pin')) return;
    map.zoomAround(e.shiftKey ? 1 / 2 : DOUBLE_CLICK_ZOOM, ...toFraction(e.clientX, e.clientY), true);
  });

  return { wasDrag: () => dragged };
}

/** Stop presses on overlays (controls, flag, groups) from starting a drag or zoom. */
export function shieldFromGestures(...elements) {
  for (const element of elements) {
    for (const type of ['pointerdown', 'dblclick']) element.addEventListener(type, (e) => e.stopPropagation());
  }
}
