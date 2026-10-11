#!/usr/bin/env python3
"""Refresh data/tables.json: event locations and their tables, from talasaman.is/hringir.

The open API (/api/v1/circles) has member counts per location but not tables.
The /hringir page embeds a graph of locations -> tables with member counts;
this reads ONLY that structural part (nodes + links). The page also embeds
people/membership data — that is never read or stored here.

Coordinates come from the existing data/tables.json. A new location gets none and
is reported, so it can be geocoded (e.g. Nominatim) and added by hand.
"""
import json
import re
import sys
import urllib.request

from _common import DATA, write_json

OUT = DATA / "tables.json"


def page_graph():
    """The locations -> tables graph embedded in the /hringir page: (nodes, links)."""
    html = urllib.request.urlopen("https://talasaman.is/hringir", timeout=60).read().decode()
    chunks = re.findall(r'self\.__next_f\.push\(\[1,"(.*?)"\]\)', html, re.S)
    text = "".join(json.loads('"' + c + '"') for c in chunks)
    i = text.find('"nodes":')
    if i < 0:
        sys.exit("hringir page layout changed: no graph found")
    start = text.rfind("{", 0, i)
    graph = json.loads(text[start : matching_brace(text, start) + 1])
    return graph["nodes"], graph["links"]  # nothing else is kept


def matching_brace(text, start):
    """Index of the } that closes the { at `start`."""
    depth = 0
    for j in range(start, len(text)):
        depth += {"{": 1, "}": -1}.get(text[j], 0)
        if depth == 0:
            return j
    sys.exit("hringir page layout changed: graph never closes")


def known_locations():
    """The locations already in tables.json, by name (they carry the coordinates)."""
    if not OUT.exists():
        return {}
    return {l["name"]: l for l in json.loads(OUT.read_text())["locations"]}


def table_entry(node):
    """A table node as {number, members}; the number comes from its name, 'Borð 3'."""
    m = re.search(r"Borð (\d+)", node["name"])
    return {"number": int(m.group(1)) if m else None, "members": node["memberCount"]}


def build_locations(nodes, links, known):
    """Every location with its tables, sorted by name, keeping known coordinates."""
    by_id = {n["id"]: n for n in nodes}
    locations = {}
    for n in nodes:
        if n["kind"] == "location":
            prev = known.get(n["name"], {})
            locations[n["id"]] = {
                "name": n["name"],
                "lat": prev.get("lat"),
                "lng": prev.get("lng"),
                "members": n["memberCount"],
                "tables": [],
            }
    for l in links:
        s, t = by_id[l["source"]], by_id[l["target"]]
        if s["kind"] == "location" and t["kind"] == "table":
            locations[s["id"]]["tables"].append(table_entry(t))
    for loc in locations.values():
        loc["tables"].sort(key=lambda t: (t["number"] is None, t["number"]))
    return sorted(locations.values(), key=lambda l: l["name"])


def main():
    """Read the graph, keep the coordinates already known, and write tables.json."""
    nodes, links = page_graph()
    result = build_locations(nodes, links, known_locations())
    write_json(OUT, {"source": "https://talasaman.is/hringir", "locations": result}, indent=1)
    print(f"{len(result)} locations, {sum(len(l['tables']) for l in result)} tables -> {OUT.name}")
    missing = [l["name"] for l in result if l["lat"] is None]
    if missing:
        print("No coordinates yet:", ", ".join(missing))


if __name__ == "__main__":
    main()
