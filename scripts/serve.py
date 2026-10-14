"""Local web server for Coco · French (localhost only).

Serves the app with the right file types for the offline speech recognizer
(.mjs, .wasm) and disables caching so app updates show up immediately.
Usage: python3 scripts/serve.py [port]
"""
import http.server
import os
import sys
from functools import partial


CSP = ("default-src 'self'; img-src 'self' data: blob:; media-src 'self' blob:; style-src 'self' 'unsafe-inline'; "
       "script-src 'self' 'wasm-unsafe-eval'; worker-src 'self'; connect-src 'self'")


class Handler(http.server.SimpleHTTPRequestHandler):
    extensions_map = {**http.server.SimpleHTTPRequestHandler.extensions_map,
                      ".mjs": "text/javascript", ".wasm": "application/wasm", ".m4a": "audio/mp4"}

    def end_headers(self):
        self.send_header("Cache-Control", "no-cache")
        # Same policy as index.html, sent as a header so it also covers the speech worker.
        self.send_header("Content-Security-Policy", CSP)
        super().end_headers()

    def send_head(self):
        if any(part.startswith(".") for part in self.path.split("?")[0].split("/") if part):
            self.send_error(404)  # never serve .git and other dotfiles
            return None
        return super().send_head()

    def log_message(self, *args):
        pass


if __name__ == "__main__":
    port = int(sys.argv[1]) if len(sys.argv) > 1 else 8642
    root = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    server = http.server.ThreadingHTTPServer(("127.0.0.1", port), partial(Handler, directory=root))
    print(f"Serving on http://127.0.0.1:{port}")
    server.serve_forever()
