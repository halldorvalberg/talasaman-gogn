#!/usr/bin/env python3
"""Serve the site for development, telling browsers never to cache anything.

`python3 -m http.server` sends no caching headers, so browsers guess, and
phones especially can keep running old JavaScript for hours. This sends
`Cache-Control: no-store` with every file, so a reload always gets the latest
code, on the computer and on a phone opening it by the computer's address.

    python3 scripts/serve.py            # http://localhost:8001
    python3 scripts/serve.py 8002       # another port

On a phone, open http://<this computer's address>:8001. That address isn't
https, so the browser turns off AudioWorklets and Radio sound runs without
its noise reduction and expander (everything else works).
"""
import functools
import sys
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent  # the repo


class NoCacheHandler(SimpleHTTPRequestHandler):
    """Serves files from the repo with caching switched off."""

    def end_headers(self):
        self.send_header("Cache-Control", "no-store")
        super().end_headers()


def main():
    port = int(sys.argv[1]) if len(sys.argv) > 1 else 8001
    handler = functools.partial(NoCacheHandler, directory=str(ROOT))
    with ThreadingHTTPServer(("0.0.0.0", port), handler) as server:
        print(f"Serving {ROOT} at http://localhost:{port} (no caching); Ctrl+C stops it")
        server.serve_forever()


if __name__ == "__main__":
    main()
