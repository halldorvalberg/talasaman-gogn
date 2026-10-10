// The Places page: favourite places as pins on a map of Iceland (coastline,
// glaciers, lakes, large rivers), with a linked list beside it, the places
// that couldn't be mapped, and the raw rows.
// Base map: LMÍ IS 50V (data/iceland.geojson).

import { el } from '../../lib/dom.js';
import { loadJsonOnce } from '../../lib/data.js';
import { contains, frameOf } from '../../lib/geo.js';
import { legend } from '../../components/legend.js';
import { tableToggle } from '../../components/table.js';
import { layoutPins } from '../../lib/map-pins.js';
import { mapBox } from '../../components/basemap.js';
import { createPlacesStage } from './stage.js';
import { createPlaceList } from './list.js';
import { offMapList } from './offmap.js';

const HOW_TO = 'Hover a place in the list to fly to it, or click a numbered group to zoom in. ' +
  'Drag to move around; pinch, ctrl + scroll or double-click to zoom.';

const LEGEND = [
  { swatch: 'key-glacier', label: 'Glacier' },
  { swatch: 'key-water', label: 'Lakes and rivers' },
  { swatch: 'key-pin', label: 'Place' },
  { swatch: 'key-cluster', label: 'Group of places', mark: '3' },
];

export async function renderPlaces(rows) {
  const base = await loadJsonOnce('data/iceland.geojson');
  const box = mapBox(base);
  const onMap = rows.filter((r) => contains(box, r));
  const offMap = rows.filter((r) => !contains(box, r));

  const pins = layoutPins(onMap, frameOf(box));
  const map = createPlacesStage(base, frameOf(box), pins);

  return el('div', { className: 'viz' },
    el('p', { className: 'caption' }, `${onMap.length} places on the map. ${HOW_TO}`),
    legend(LEGEND),
    el('div', { className: 'places-layout' }, map.element, createPlaceList(pins, map)),
    ...(offMap.length ? [offMapList(offMap)] : []),
    el('p', { className: 'caption' }, 'Kortagrunnur: IS 50V, Landmælingar Íslands.'),
    tableToggle(rows));
}
