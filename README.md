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

## Accent palette

Categorical colours for future charts, defined as `--accent-1` … `--accent-8` in `style.css`.
Use them in order. They were checked against the black background for even brightness, saturation and colour-blind contrast.
For maps and scatter plots, where every colour can sit next to every other, use only the first three.

| | Name | Hex |
|---|---|---|
| 1 | Fjörður (fjord blue) | `#4f86c6` |
| 2 | Okkur (ochre) | `#b8822a` |
| 3 | Jökullón (glacier teal) | `#00978a` |
| 4 | Leir (clay) | `#cc5f45` |
| 5 | Lúpína (lupine) | `#8f7ad6` |
| 6 | Mosi (moss) | `#6a9a48` |
| 7 | Blóðberg (wild thyme) | `#c45c8c` |
| 8 | Sina (dry grass) | `#9c8f22` |

### Talasaman.is palette

The top-right button switches to talasaman.is's own colours, a cream background with dark text, and remembers the choice.
The colours are taken from the site's `--color-*` CSS variables, and the theme is in `style.css` under `:root[data-palette="talasaman"]`.
Its slots 1–3 (blá `#2753f5`, rauður `#d64000`, grænn `#1ba672`) stay distinct even when any two touch, so the map uses them.
Slots 4–8 (amber, clay, terracotta, teal, gul) are the brand colours as-is. They don't pass the checks on cream, so use them with labels or a table.

## Licence

- Gögn: Samtal, félag til almannaheilla (talasaman.is), [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/)
- Póstnúmeramörk: Byggt á gögnum frá Byggðastofnun.
- Kortagrunnur: IS 50V, Landmælingar Íslands.
