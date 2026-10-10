#!/usr/bin/env python3
"""Refresh tables.json: event locations and their tables, from talasaman.is/hringir.

The open API (/api/v1/circles) has member counts per location but not tables.
The /hringir page embeds a graph of locations -> tables with member counts;
this reads ONLY that structural part (nodes + links). The page also embeds
people/membership data — that is never read or stored here.

Coordinates come from the existing tables.json. A new location gets none and
is reported, so it can be geocoded (e.g. Nominatim) and added by hand.
"""
import json
import re
import sys
import urllib.request
from pathlib import Path

OUT = Path(__file__).resolve().parent.parent / "tables.json"


def page_graph():
    html = urllib.request.urlopen("https://talasaman.is/hringir", timeout=60).read().decode()
    chunks = re.findall(r'self\.__next_f\.push\(\[1,"(.*?)"\]\)', html, re.S)
    text = "".join(json.loads('"' + c + '"') for c in chunks)
    i = text.find('"nodes":')
    if i < 0:
        sys.exit("hringir page layout changed: no graph found")
    start = text.rfind("{", 0, i)
    depth = 0
    for j in range(start, len(text)):
        depth += {"{": 1, "}": -1}.get(text[j], 0)
        if depth == 0:
            break
    graph = json.loads(text[start : j + 1])
    return graph["nodes"], graph["links"]  # nothing else is kept


def main():
    nodes, links = page_graph()
    by_id = {n["id"]: n for n in nodes}
    known = {}
    if OUT.exists():
        known = {l["name"]: l for l in json.loads(OUT.read_text())["locations"]}

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
            m = re.search(r"Borð (\d+)", t["name"])
            locations[s["id"]]["tables"].append(
                {"number": int(m.group(1)) if m else None, "members": t["memberCount"]}
            )
    for loc in locations.values():
        loc["tables"].sort(key=lambda t: (t["number"] is None, t["number"]))

    result = sorted(locations.values(), key=lambda l: l["name"])
    missing = [l["name"] for l in result if l["lat"] is None]
    OUT.write_text(json.dumps({"source": "https://talasaman.is/hringir", "locations": result},
                              ensure_ascii=False, indent=1) + "\n")
    print(f"{len(result)} locations, {sum(len(l['tables']) for l in result)} tables -> {OUT.name}")
    if missing:
        print("No coordinates yet:", ", ".join(missing))


if __name__ == "__main__":
    main()
