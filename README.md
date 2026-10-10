# talasaman-gogn

A small site for exploring the open data from [Samtal](https://talasaman.is/gogn), a public conversation project across Iceland.

**Live:** https://halldorvalberg.github.io/talasaman-gogn/

There is one page per dataset:

| Page | What it shows |
|---|---|
| Overview | Headline numbers and an index of the datasets |
| Circles | Members per postcode on a map. A second map shows each event location with its tables and the people at each table. |
| Places | Favourite places as pins on a map of Iceland. Groups of pins zoom in when clicked, and a list beside the map flies to each place. |
| Summaries › Audio | The 24 recorded table discussions, each with a player and the facilitator's summary. Filter by topic or location, or search. An optional **Radio sound** switch cleans up the voices with classic sound processing (no AI): high-pass, spectral noise reduction, adaptive expander, de-esser, EQ, compressors and a limiter. There are three presets: **Natural**, **Clear** (the default) and **Radio**. A before/after view shows the level and spectrum. |
| Listening view (`#/listen`) | Full screen, opened from the Audio page or a link: the front-page image moves with the voice while the recordings play in turn. The address controls it and follows it: `#/listen/7` starts at recording 7, `?t=1:30` that far in, `?topic=…&location=…` only those recordings, `?preset=clear\|natural\|radio\|off` sets Radio sound, `?mood=calm` the calm chorus, `?loop=0` stops after the last. Not in the sidebar. |
| Summaries › Audio › Link builder | Explains each part of the listening view's address and builds a link from checkboxes, with Copy and Open. |
| Íslenskast, Topics, Summaries, Stats | Tables |
| Components | A playground of the site's reusable pieces, live on real data, with one player at the top that every audio demo follows. **Audio:** a progress line (click, drag or arrow keys), waveform bars like a Spotify code, and the before/after view. **The talasaman.is image:** the pulsing logo (also in the sidebar title), the front-page image as a calm and an aggressive chorus (each bubble moves with its own pitch range), and the image taken apart into its eleven bubbles. **Maps:** a round lens that flies into the venues where the tables met (a black-and-white line map, a blue pin and the venue's name written under it), and the same lens ringed by the front-page image's bubbles, which breathe while all is quiet and swell with the recording. **Data:** the filterable table. |

Every page can also show its data as a table. Long tables get a filter under each column: a dropdown for columns with a few repeated values, and a search box for free text.

## Run locally

There's no build step. The site uses ES modules and loads files from `data/`, so serve the folder rather than opening `index.html` directly:

```bash
python3 -m http.server 8001   # then open http://localhost:8001
```

Pushing to `main` deploys to GitHub Pages.

## Layout

```
index.html              page shell; sets the theme before first paint
css/
  tokens.css            every colour, for both themes
  fonts.css             self-hosted Fraunces (assets/fonts/)
  base.css              type, links, focus, reduced motion
  layout.css            sidebar, top bar, main column
  components.css        buttons, fold-outs, tables, legend, tooltip
  components/           player, map (base map, pins, flag, zoom controls, lens), talasaman.is image, listening view
  views/                one file per page
js/
  main.js               start-up and routing (#/places …; a page can follow its own address in place, like #/listen/7?t=90)
  pages.js              the page list (subpages, hidden pages, pages that take a path)
  lib/                  dom, geo (projection, boxes), map-view (zoom maths), map-pins, chorus-ring (bubbles round the lens), motion (tween, reduced motion), math, data (fetching), format, playback (following an <audio>), recordings, hash + listen-address (the listening view's address, read and written)
  audio/                radio sound: the Web Audio chain, presets, controller, noise-reduction and expander worklets
  components/           table + filters, audio player, player controls, play all, listening view, radio controls + visualiser, progress line, waveform bars, base map, map pin + flag, location zoom + its chorus, collapsible, tooltip, legend, raw links, sidebar, theme toggle
  views/
    overview.js, endpoint.js, audio.js, listen.js, link-builder.js, components.js
    circles/            postcode map, tables map + its layout
    places/             map stage, grouping, gestures, list, off-map places
data/                   map polygons and the tables snapshot
scripts/                update-tables.py
```

Pure calculations, such as zoom maths, grouping and layout, live in their own modules with no DOM code.

## Data

| Source | Used for |
|---|---|
| [talasaman.is open API](https://talasaman.is/gogn) (`/api/v1/*`) | Every page. CORS is open; limit 120 requests/min. |
| `data/postnumer.geojson` | Postcode areas, from Byggðastofnun via LMÍ (WFS `byggdastofnun:postnumer`) |
| `data/iceland.geojson` | Coastline, glaciers, lakes and wide rivers, from LMÍ IS 50V |
| `data/tables.json` | Event locations and their tables, from talasaman.is/hringir |

<details>
<summary>How the map files were made</summary>

Both map files were simplified with [mapshaper](https://mapshaper.org).

```bash
# Postcodes
curl -o raw.geojson "https://gis.lmi.is/geoserver/byggdastofnun/wfs?service=WFS&version=2.0.0&request=GetFeature&typeNames=byggdastofnun:postnumer&outputFormat=application/json&srsName=EPSG:4326"
npx mapshaper raw.geojson -filter-fields postnumer,stadur -simplify 6% keep-shapes -clean -o data/postnumer.geojson precision=0.0001
```

`iceland.geojson` combines four IS 50V layers, each tagged with `kind`:

| kind | Layer | Filter |
|---|---|---|
| `coast` | `strandlina_flakar` | dissolved, islands > 1 km² |
| `glacier` | `vatnafar_flakar` | `yfirbordsvatn=4`, > 1 km² |
| `lake` | `vatnafar_flakar` | `yfirbordsvatn=3`, > 2 km² |
| `river` | `vatnafar_flakar` | `yfirbordsvatn=1`, dissolved, > 1 km² |

</details>

**Tables snapshot.** The API has no tables, so `tables.json` is read from the graph built into the talasaman.is/hringir page:

- `scripts/update-tables.py` refreshes it, and reads **only** the page's structure. People and membership data on that page are never read or stored.
- Locations were geocoded once with OpenStreetMap Nominatim. The script keeps those coordinates; a new location has to be looked up by hand.
- The counts are people seated at tables, which differs from the API's registered member counts.

```bash
python3 scripts/update-tables.py
```

## Themes and colours

Both themes use talasaman.is's own colours. The page follows the browser's light/dark setting until someone uses the ☀/☾ toggle.

- **Light:** the site itself, ink `#141a24` on cream `#fffdf9`.
- **Dark:** cream `#ffffef` on ink. talasaman.is has no dark mode, but this is how it styles its dark areas.

All colours live in `css/tokens.css`. The categorical colours `--accent-1` … `--accent-8` are blá, rauður, grænn, amber, clay, terracotta, teal and gul, in that order.

- Only the first three stay distinct when any two touch, so the maps use only those.
- The rest need labels or a table.

## Accessibility

- **Text contrast:** at least 7:1 (WCAG AAA) in both themes.
- **Map marks and controls:** at least 3:1.
- **Typography:** body text is 16 px at weight 400, and nothing is smaller than 13 px.
- **Keyboard:** every control can be reached by keyboard and shows a visible focus outline.
- **Motion:** animations stop when the system asks for reduced motion.

Brand colours are kept as they are. Only the colours derived from them, such as the muted text greys and the darker group fill, were adjusted to pass.

## Licence

- Gögn: Samtal, félag til almannaheilla (talasaman.is), [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/)
- Póstnúmeramörk: Byggt á gögnum frá Byggðastofnun.
- Kortagrunnur: IS 50V, Landmælingar Íslands.
- Letur: [Fraunces](https://github.com/undercasetype/Fraunces), SIL Open Font License 1.1 (`assets/fonts/OFL.txt`), self-hosted.
