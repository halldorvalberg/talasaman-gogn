// Favourite places as pins on a plain map of Iceland: coastline, glaciers,
// lakes and the large rivers. Base map: LMÍ IS 50V, simplified with mapshaper.

import { project, pathFor } from './map.js';

const PAD = 0.15; // degrees around the coastline bbox
const SVG_NS = 'http://www.w3.org/2000/svg';
const DRAW_ORDER = ['coast', 'glacier', 'lake', 'river']; // land first, water and ice on top

let basePromise;
function loadBase() {
  basePromise ??= fetch('iceland.geojson').then((r) => {
    if (!r.ok) throw new Error(`iceland.geojson: HTTP ${r.status}`);
    return r.json();
  });
  return basePromise;
}

function extentOf(features) {
  let west = Infinity, east = -Infinity, south = Infinity, north = -Infinity;
  for (const f of features) {
    const polygons = f.geometry.type === 'Polygon' ? [f.geometry.coordinates] : f.geometry.coordinates;
    for (const polygon of polygons) {
      for (const [lon, lat] of polygon[0]) {
        west = Math.min(west, lon); east = Math.max(east, lon);
        south = Math.min(south, lat); north = Math.max(north, lat);
      }
    }
  }
  return { west: west - PAD, east: east + PAD, south: south - PAD, north: north + PAD };
}

const inside = (box, { lat, lng }) =>
  lat >= box.south && lat <= box.north && lng >= box.west && lng <= box.east;

function el(tag, props = {}, ...children) {
  const node = Object.assign(document.createElement(tag), props);
  node.append(...children);
  return node;
}

// Roughly Iceland and its waters: a point in here that missed the map has
// bad coordinates rather than being abroad.
const ICELAND_WATERS = { west: -26, east: -12, south: 62, north: 67.5 };

const fmtCoord = ({ lat, lng }) =>
  `${Math.abs(lat).toFixed(2)}° ${lat >= 0 ? 'N' : 'S'}, ${Math.abs(lng).toFixed(2)}° ${lng >= 0 ? 'E' : 'W'}`;

function offMapList(rows) {
  const list = el('div', { className: 'offmap-list' });
  for (const r of rows) {
    const why = inside(ICELAND_WATERS, r) ? 'Coordinates in the sea' : 'Outside Iceland';
    list.append(el('details', { className: 'offmap' },
      el('summary', {},
        el('span', { className: 'offmap-name' }, r.place),
        el('span', { className: 'offmap-coord' }, fmtCoord(r)),
        el('span', { className: 'offmap-why' }, why)),
      el('p', {}, r.reason || '—')));
  }
  return el('section', { className: 'offmap-section' },
    el('h2', {}, `Not on the map · ${rows.length}`),
    list);
}

export async function renderPlacesMap(rows, buildTable) {
  const base = await loadBase();
  const coast = base.features.filter((f) => f.properties.kind === 'coast');
  const box = extentOf(coast);
  const [x0, y0] = project([box.west, box.north]);
  const [x1, y1] = project([box.east, box.south]);
  const w = x1 - x0, h = y1 - y0;

  // ---- Base map ----
  const svg = document.createElementNS(SVG_NS, 'svg');
  svg.setAttribute('viewBox', `${x0} ${y0} ${w} ${h}`);
  svg.setAttribute('class', 'basemap');
  svg.setAttribute('role', 'img');
  svg.setAttribute('aria-label', 'Map of Iceland with glaciers, lakes and rivers');
  for (const kind of DRAW_ORDER) {
    for (const f of base.features) {
      if (f.properties.kind !== kind) continue;
      const path = document.createElementNS(SVG_NS, 'path');
      path.setAttribute('d', pathFor(f.geometry));
      path.setAttribute('class', kind);
      path.setAttribute('vector-effect', 'non-scaling-stroke');
      svg.append(path);
    }
  }

  // ---- Pins ----
  const onMap = rows.filter((r) => inside(box, r));
  const offMap = rows.filter((r) => !inside(box, r));

  // Pin positions as fractions of the stage (0–1). Places sharing a rounded
  // coordinate get a sunflower-spiral offset (px), used only at full zoom.
  const seen = new Map();
  const pins = onMap
    .map((r) => {
      const key = `${r.lat},${r.lng}`;
      const i = seen.get(key) ?? 0;
      seen.set(key, i + 1);
      const [px, py] = project([r.lng, r.lat]);
      const angle = i * 2.39996; // golden angle
      const radius = i ? 9 * Math.sqrt(i) : 0;
      return {
        row: r,
        fx: (px - x0) / w,
        fy: (py - y0) / h,
        dx: Math.cos(angle) * radius,
        dy: Math.sin(angle) * radius,
      };
    })
    .sort((a, b) => a.fy - b.fy); // southern pins on top

  const stage = el('div', { className: 'places-stage' });
  stage.style.aspectRatio = `${w} / ${h}`;
  stage.style.setProperty('--ratio', w / h);
  stage.append(svg);

  // ---- View: zoom k, pan (ux, uy) in stage fractions ----
  // screen = (k * f + u) * size
  const MAX_K = 24; // ~20 px between neighbouring 0.01° points
  const CLUSTER_PX = 18;
  const view = { k: 1, ux: 0, uy: 0 };
  const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;

  function clampView(v) {
    const k = Math.min(MAX_K, Math.max(1, v.k));
    return {
      k,
      ux: Math.min(0, Math.max(1 - k, v.ux)),
      uy: Math.min(0, Math.max(1 - k, v.uy)),
    };
  }

  let anim = 0;
  function setView(target, animate = false, { duration = 380, onDone } = {}) {
    const to = clampView(target);
    cancelAnimationFrame(anim);
    if (!animate || reduceMotion) { Object.assign(view, to); draw(); onDone?.(); return; }
    // Animate the view's centre and zoom (log space), not the raw pan offsets,
    // so the point being zoomed into stays on screen the whole way.
    const centre = (v) => [(0.5 - v.ux) / v.k, (0.5 - v.uy) / v.k];
    const [fx0, fy0] = centre(view), [fx1, fy1] = centre(to);
    const k0 = view.k;
    const t0 = performance.now();
    const step = (now) => {
      const t = Math.min(1, (now - t0) / duration);
      const e = 1 - (1 - t) ** 3;
      const k = Math.exp(Math.log(k0) + (Math.log(to.k) - Math.log(k0)) * e);
      const cx = fx0 + (fx1 - fx0) * e, cy = fy0 + (fy1 - fy0) * e;
      Object.assign(view, clampView({ k, ux: 0.5 - k * cx, uy: 0.5 - k * cy }));
      draw();
      if (t < 1) anim = requestAnimationFrame(step);
      else onDone?.();
    };
    anim = requestAnimationFrame(step);
  }

  // Zoom by factor around a point given in stage fractions.
  function zoomAt(factor, px, py, animate) {
    const k = Math.min(MAX_K, Math.max(1, view.k * factor));
    const fx = (px - view.ux) / view.k, fy = (py - view.uy) / view.k;
    setView({ k, ux: px - k * fx, uy: py - k * fy }, animate);
  }

  function fitTo(members) {
    const xs = members.map((p) => p.fx), ys = members.map((p) => p.fy);
    const minX = Math.min(...xs), maxX = Math.max(...xs);
    const minY = Math.min(...ys), maxY = Math.max(...ys);
    const k = Math.min(MAX_K, 0.7 / Math.max(maxX - minX, 1e-6), 0.7 / Math.max(maxY - minY, 1e-6));
    setView({ k, ux: 0.5 - k * (minX + maxX) / 2, uy: 0.5 - k * (minY + maxY) / 2 }, true);
  }

  // ---- Flag ----
  const flag = el('div', { className: 'flag', hidden: true, role: 'dialog' });
  let open = null; // { pin, p }

  function closeFlag() {
    flag.hidden = true;
    open?.pin.classList.remove('open');
    open?.pin.setAttribute('aria-expanded', 'false');
    open = null;
  }

  function openFlag(pin, p) {
    if (open?.pin === pin) return closeFlag();
    closeFlag();
    open = { pin, p };
    pin.classList.add('open');
    pin.setAttribute('aria-expanded', 'true');
    const close = el('button', { className: 'flag-close', title: 'Close', ariaLabel: 'Close' }, '×');
    close.addEventListener('click', closeFlag);
    flag.replaceChildren(close, el('h3', {}, p.row.place), el('p', {}, p.row.reason || '—'));
    flag.hidden = false;
    placeFlag();
    close.focus({ preventScroll: true });
  }

  // Hang the flag off the pin head; flip near the right and top edges.
  function placeFlag() {
    if (!open) return;
    if (open.pin.hidden) return closeFlag();
    const x = parseFloat(open.pin.style.left), y = parseFloat(open.pin.style.top);
    const { width, height } = stage.getBoundingClientRect();
    flag.classList.toggle('flip-x', x / width > 0.62);
    flag.classList.toggle('flip-y', y / height < 0.35);
    flag.style.left = `${x}px`;
    flag.style.top = `${y}px`;
  }

  // ---- Pins and clusters ----
  for (const p of pins) {
    const pin = el('button', { className: 'pin', ariaLabel: p.row.place, title: p.row.place });
    pin.setAttribute('aria-expanded', 'false');
    pin.append(el('span', { className: 'pin-head' }), el('span', { className: 'pin-stem' }));
    pin.addEventListener('click', (e) => { e.stopPropagation(); openFlag(pin, p); });
    p.el = pin;
    stage.append(pin);
  }
  const clusterLayer = el('div', { className: 'cluster-layer' });
  stage.append(clusterLayer, flag);

  function draw() {
    const { width: W, height: H } = stage.getBoundingClientRect();
    if (!W) return;
    const { k, ux, uy } = view;

    // Base map: show just the visible window.
    svg.setAttribute('viewBox', `${x0 + (-ux / k) * w} ${y0 + (-uy / k) * h} ${w / k} ${h / k}`);

    for (const p of pins) {
      p.sx = (k * p.fx + ux) * W;
      p.sy = (k * p.fy + uy) * H;
      p.cluster = null;
    }

    // Greedy screen-space clustering; at full zoom everything is shown and
    // shared coordinates fan out instead.
    const clusters = [];
    if (k < MAX_K - 1e-6) {
      for (const p of pins) {
        if (p.cluster || p === highlighted || p.sx < -40 || p.sy < -40 || p.sx > W + 40 || p.sy > H + 40) continue;
        const members = [p];
        for (const q of pins) {
          if (q === p || q.cluster || q === highlighted) continue;
          if (Math.abs(q.sx - p.sx) < CLUSTER_PX && Math.abs(q.sy - p.sy) < CLUSTER_PX) members.push(q);
        }
        if (members.length > 1) {
          const c = { members };
          for (const m of members) m.cluster = c;
          clusters.push(c);
        }
      }
    }

    const fan = k >= MAX_K - 1e-6;
    for (const p of pins) {
      const out = p.sx < -20 || p.sy < -20 || p.sx > W + 20 || p.sy > H + 20;
      p.el.hidden = !!p.cluster || out;
      p.el.style.left = `${p.sx + (fan ? p.dx : 0)}px`;
      p.el.style.top = `${p.sy + (fan ? p.dy : 0)}px`;
    }

    clusterLayer.replaceChildren(...clusters.map((c) => {
      const n = c.members.length;
      const cx = c.members.reduce((s, m) => s + m.sx, 0) / n;
      const cy = c.members.reduce((s, m) => s + m.sy, 0) / n;
      const size = Math.round(20 + 5 * Math.sqrt(n));
      const b = el('button', {
        className: 'cluster',
        title: `${n} places — click to zoom in`,
        ariaLabel: `${n} places, zoom in`,
      }, String(n));
      Object.assign(b.style, { left: `${cx}px`, top: `${cy}px`, width: `${size}px`, height: `${size}px` });
      b.addEventListener('click', (e) => { e.stopPropagation(); closeFlag(); fitTo(c.members); });
      return b;
    }));

    stage.classList.toggle('zoomed', k > 1.001);
    stage.style.touchAction = k > 1.001 ? 'none' : 'pan-y';
    resetButton.disabled = k <= 1.001;
    zoomOutButton.disabled = k <= 1.001;
    zoomInButton.disabled = k >= MAX_K - 1e-6;
    placeFlag();
  }

  // ---- Controls ----
  const zoomInButton = el('button', { title: 'Zoom in', ariaLabel: 'Zoom in' }, '+');
  const zoomOutButton = el('button', { title: 'Zoom out', ariaLabel: 'Zoom out' }, '−');
  const resetButton = el('button', { title: 'Show all of Iceland', ariaLabel: 'Show all of Iceland' }, '⤢');
  zoomInButton.addEventListener('click', () => zoomAt(2, 0.5, 0.5, true));
  zoomOutButton.addEventListener('click', () => zoomAt(0.5, 0.5, 0.5, true));
  resetButton.addEventListener('click', () => setView({ k: 1, ux: 0, uy: 0 }, true));
  const controls = el('div', { className: 'map-controls' }, zoomInButton, zoomOutButton, resetButton);
  for (const c of [controls, flag, clusterLayer]) {
    c.addEventListener('pointerdown', (e) => e.stopPropagation());
    c.addEventListener('dblclick', (e) => e.stopPropagation());
  }
  controls.addEventListener('click', (e) => e.stopPropagation());
  stage.append(controls);

  // ---- Gestures: drag to pan, pinch / ctrl+wheel / double-click to zoom ----
  const pointers = new Map();
  let dragged = false;
  let pinchStart = null;

  const frac = (e) => {
    const r = stage.getBoundingClientRect();
    return [(e.clientX - r.left) / r.width, (e.clientY - r.top) / r.height];
  };

  stage.addEventListener('pointerdown', (e) => {
    if (e.target.closest('.pin')) return;
    pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    dragged = false;
    if (pointers.size === 2) {
      const [a, b] = [...pointers.values()];
      pinchStart = { d: Math.hypot(a.x - b.x, a.y - b.y), k: view.k };
    }
  });

  stage.addEventListener('pointermove', (e) => {
    const prev = pointers.get(e.pointerId);
    if (!prev) return;
    const r = stage.getBoundingClientRect();
    if (pointers.size === 1) {
      const dx = e.clientX - prev.x, dy = e.clientY - prev.y;
      if (!dragged && Math.hypot(dx, dy) < 4) return;
      if (!dragged) { dragged = true; stage.setPointerCapture(e.pointerId); stage.classList.add('dragging'); }
      setView({ k: view.k, ux: view.ux + dx / r.width, uy: view.uy + dy / r.height });
      pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    } else if (pointers.size === 2 && pinchStart) {
      pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
      const [a, b] = [...pointers.values()];
      const d = Math.hypot(a.x - b.x, a.y - b.y);
      const mx = ((a.x + b.x) / 2 - r.left) / r.width, my = ((a.y + b.y) / 2 - r.top) / r.height;
      zoomAt((pinchStart.k * d / pinchStart.d) / view.k, mx, my, false);
      dragged = true;
    }
  });

  const endPointer = (e) => {
    pointers.delete(e.pointerId);
    if (pointers.size < 2) pinchStart = null;
    if (!pointers.size) stage.classList.remove('dragging');
  };
  stage.addEventListener('pointerup', endPointer);
  stage.addEventListener('pointercancel', endPointer);

  // Plain scrolling keeps scrolling the page; ctrl/⌘ + wheel (and trackpad pinch) zooms.
  stage.addEventListener('wheel', (e) => {
    if (!e.ctrlKey && !e.metaKey) return;
    e.preventDefault();
    const [px, py] = frac(e);
    zoomAt(Math.exp(-e.deltaY * 0.01), px, py, false);
  }, { passive: false });

  stage.addEventListener('dblclick', (e) => {
    if (e.target.closest('.pin')) return;
    const [px, py] = frac(e);
    zoomAt(e.shiftKey ? 0.5 : 2.5, px, py, true);
  });

  flag.addEventListener('click', (e) => e.stopPropagation());
  stage.addEventListener('click', () => { if (!dragged) closeFlag(); });
  stage.addEventListener('keydown', (e) => { if (e.key === 'Escape') closeFlag(); });

  new ResizeObserver(() => draw()).observe(stage);

  // ---- List beside the map ----
  // Hovering (or focusing) a box highlights its pin, wiggles it and zooms the
  // map to it. A short delay keeps a quick pass over the list from jumping around.
  const HOVER_K = 4; // gentle: enough to see the area, keeps the context
  let hoverTimer = 0;
  let highlighted = null;

  function zoomToPin(p) {
    const k = Math.max(view.k, HOVER_K);
    setView({ k, ux: 0.5 - k * p.fx, uy: 0.5 - k * p.fy }, true, { duration: 260 });
  }

  function highlight(p, on) {
    if (!on) {
      if (highlighted === p) { p.el.classList.remove('highlight'); p.card.classList.remove('active'); highlighted = null; draw(); }
      return;
    }
    if (highlighted && highlighted !== p) highlight(highlighted, false);
    highlighted = p;
    draw(); // pull it out of any group right away
    p.card.classList.add('active');
    p.el.classList.remove('highlight');
    void p.el.offsetWidth; // restart the wiggle
    p.el.classList.add('highlight');
  }

  const collator = new Intl.Collator('is');
  const list = el('ol', { className: 'places-list' });
  for (const p of [...pins].sort((a, b) => collator.compare(a.row.place, b.row.place))) {
    const card = el('li', {},
      el('button', { className: 'place-card' },
        el('h3', {}, p.row.place),
        el('p', {}, p.row.reason || '—')));
    p.card = card.firstChild;
    const enter = () => {
      highlight(p, true);
      clearTimeout(hoverTimer);
      hoverTimer = setTimeout(() => zoomToPin(p), 90);
    };
    const leave = () => { clearTimeout(hoverTimer); highlight(p, false); };
    p.card.addEventListener('mouseenter', enter);
    p.card.addEventListener('focus', enter);
    p.card.addEventListener('mouseleave', leave);
    p.card.addEventListener('blur', leave);
    p.card.addEventListener('click', () => {
      clearTimeout(hoverTimer);
      const k = MAX_K;
      setView({ k, ux: 0.5 - k * p.fx, uy: 0.5 - k * p.fy }, true, {
        duration: 260,
        onDone: () => { if (open?.p !== p) openFlag(p.el, p); },
      });
    });
    list.append(card);
  }
  // Pins point back at their box.
  for (const p of pins) {
    p.el.addEventListener('mouseenter', () => p.card.classList.add('active'));
    p.el.addEventListener('mouseleave', () => { if (highlighted !== p) p.card.classList.remove('active'); });
  }

  const listWrap = el('div', { className: 'places-list-wrap' },
    el('div', { className: 'places-list-head' }, `${pins.length} places`),
    list);

  // ---- Around the map ----
  const caption = el('p', { className: 'caption' },
    `${onMap.length} places on the map. Hover a place in the list to fly to it, or click a numbered group to zoom in. ` +
    'Drag to move around; pinch, ctrl + scroll or double-click to zoom.');

  const legend = el('div', { className: 'legend' },
    el('span', {}, el('span', { className: 'swatch key-glacier' }), 'Glacier'),
    el('span', {}, el('span', { className: 'swatch key-water' }), 'Lakes and rivers'),
    el('span', {}, el('span', { className: 'swatch key-pin' }), 'Place'),
    el('span', {}, el('span', { className: 'swatch key-cluster' }, '3'), 'Group of places'));

  const layout = el('div', { className: 'places-layout' }, stage, listWrap);
  const root = el('div', { className: 'viz' }, caption, legend, layout);

  if (offMap.length) root.append(offMapList(offMap));

  root.append(
    el('p', { className: 'caption' }, 'Kortagrunnur: IS 50V, Landmælingar Íslands.'),
    el('details', { className: 'table-toggle' }, el('summary', {}, 'Show table'), buildTable(rows)),
  );
  return root;
}
