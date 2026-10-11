"""Shared pieces of the data scripts: where the data files live, the
talasaman.is summaries endpoint, and writing a data file.

Not run by itself. The scripts import it as `_common`: Python puts a script's
own folder first on the import path, so `python3 scripts/<name>.py` (or
`.venv/bin/python scripts/<name>.py`) finds it from any working directory.
"""
import json
import urllib.request
from datetime import datetime, timezone
from pathlib import Path

DATA = Path(__file__).resolve().parent.parent / "data"
SUMMARIES_URL = "https://talasaman.is/api/v1/summaries"


def fetch_summary_rows():
    """Every row of /api/v1/summaries, as the API gives it."""
    with urllib.request.urlopen(SUMMARIES_URL, timeout=60) as response:
        return json.load(response)["data"]


def utc_now():
    """The time now in UTC, to the second, as written in a file's generatedAt."""
    return datetime.now(timezone.utc).isoformat(timespec="seconds")


def write_json(path, data, indent=None):
    """Write `data` to `path` as UTF-8 JSON ending in a newline: compact, or indented by `indent`."""
    separators = None if indent else (",", ":")
    path.write_text(json.dumps(data, ensure_ascii=False, indent=indent, separators=separators) + "\n")
