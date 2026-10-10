# talasaman-gogn

A simple static page for browsing the open data API at [talasaman.is/gogn](https://talasaman.is/gogn).
Each button calls one endpoint and shows the JSON `data` array as a table you can collapse.

## Run

No build step, but it uses ES modules and fetches `postnumer.geojson`, so serve the folder rather than opening the file directly:

```bash
python3 -m http.server 8000
```

## Endpoints

| Endpoint | Contents |
|---|---|
| `/api/v1/circles` | Ring hierarchy with member counts |
| `/api/v1/places` | Favourite places + reasons (coords rounded ~1 km) |
| `/api/v1/islenskast` | "Hvað er íslenskast?" answers, categorised |
| `/api/v1/topics` | Discussion words by frequency |
| `/api/v1/summaries` | Table discussion summaries (+ audio where consented) |
| `/api/v1/stats` | Aggregate metrics |

CORS is open, and the limit is 120 requests/min per IP.

## Map data

`postnumer.geojson` is the póstnúmer polygon layer from Byggðastofnun/LMÍ
(WFS `byggdastofnun:postnumer` at gis.lmi.is), simplified with mapshaper:

```bash
curl -o raw.geojson "https://gis.lmi.is/geoserver/byggdastofnun/wfs?service=WFS&version=2.0.0&request=GetFeature&typeNames=byggdastofnun:postnumer&outputFormat=application/json&srsName=EPSG:4326"
npx mapshaper raw.geojson -filter-fields postnumer,stadur -simplify 6% keep-shapes -clean -o postnumer.geojson precision=0.0001
```

### Places base map

`iceland.geojson` comes from LMÍ's IS 50V map data (WFS `IS_50V:*` at gis.lmi.is), simplified with mapshaper. It has four layers, each tagged `kind`:

| kind | Source layer | Filter |
|---|---|---|
| `coast` | `strandlina_flakar` | dissolved, islands > 1 km² |
| `glacier` | `vatnafar_flakar` | `yfirbordsvatn=4`, > 1 km² |
| `lake` | `vatnafar_flakar` | `yfirbordsvatn=3`, > 2 km² |
| `river` | `vatnafar_flakar` | `yfirbordsvatn=1` (wide rivers drawn as areas), dissolved, > 1 km² |

## Themes

Both themes use talasaman.is's own colours (its `--color-*` CSS variables).
The page follows the browser's light/dark setting until someone uses the ☀/☾ toggle in the sidebar, and then remembers their choice.

- **Light:** the site itself, with dark ink text (#141a24) on the cream background (#fffdf9).
- **Dark** (`data-theme="dark"`): cream text (#ffffef) on an ink background (#141a24). talasaman.is has no dark mode, but this is how it styles its dark areas (code blocks, the video panel). Lighter text steps reuse its opacity scale, in cream instead of ink.

Categorical colours are `--accent-1` … `--accent-8` in `style.css`. They are the same in both themes. Use them in this order:

| | Name | Hex |
|---|---|---|
| 1 | blá | `#2753f5` |
| 2 | rauður | `#d64000` |
| 3 | grænn | `#1ba672` |
| 4 | amber | `#e8a04b` |
| 5 | clay | `#9e5429` |
| 6 | terracotta | `#c8743c` |
| 7 | teal | `#2f5d62` |
| 8 | gul | `#ffc60b` |

Slots 1–3 stay distinct on both cream and ink, even when any two touch, so the maps use only those.
Slots 4–8 are the brand colours as-is. They don't pass those checks, so use them with labels or a table.

## Licence

- Gögn: Samtal, félag til almannaheilla (talasaman.is), [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/)
- Póstnúmeramörk: Byggt á gögnum frá Byggðastofnun.
- Kortagrunnur: IS 50V, Landmælingar Íslands.
