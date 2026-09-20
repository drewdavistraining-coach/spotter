"""Local dev server for Spotter.

Same as `python -m http.server`, but it tells the browser never to cache. Without that, editing a file and
refreshing can still run the old copy, which makes testing lie to you.

    python tools/devserver.py [port]
"""
import sys
from functools import partial
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent


class NoCacheHandler(SimpleHTTPRequestHandler):
    def end_headers(self):
        self.send_header("Cache-Control", "no-store, max-age=0")
        super().end_headers()


def main():
    port = int(sys.argv[1]) if len(sys.argv) > 1 else 5178
    handler = partial(NoCacheHandler, directory=str(ROOT))
    with ThreadingHTTPServer(("127.0.0.1", port), handler) as server:
        print(f"Spotter dev server: http://localhost:{port} (no-cache)")
        server.serve_forever()


if __name__ == "__main__":
    main()
