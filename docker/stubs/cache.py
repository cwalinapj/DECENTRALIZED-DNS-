import json
import os
import threading
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from urllib.parse import parse_qs, urlparse

PORT = int(os.environ.get("CACHE_PORT", "7082"))
CACHE = {}
CACHE_LOCK = threading.Lock()


class CacheHandler(BaseHTTPRequestHandler):
    def do_GET(self):
        parsed = urlparse(self.path)
        if parsed.path != "/cache":
            self.send_error(404, "Not Found")
            return
        params = parse_qs(parsed.query)
        name = params.get("name", [None])[0]
        if not name:
            self.send_error(400, "Missing name")
            return
        with CACHE_LOCK:
            record = CACHE.get(name)
        if record is None:
            self.send_error(404, "Cache miss")
            return
        payload = json.dumps(record).encode("utf-8")
        self.send_response(200)
        self.send_header("Content-Type", "application/json")
        self.end_headers()
        self.wfile.write(payload)

    def do_POST(self):
        parsed = urlparse(self.path)
        if parsed.path != "/cache":
            self.send_error(404, "Not Found")
            return
        length = int(self.headers.get("Content-Length", "0"))
        if length <= 0:
            self.send_error(400, "Missing payload")
            return
        try:
            body = self.rfile.read(length)
            payload = json.loads(body)
        except json.JSONDecodeError:
            self.send_error(400, "Invalid JSON")
            return
        name = payload.get("name")
        record = payload.get("record")
        if not name or record is None:
            self.send_error(400, "Missing name or record")
            return
        with CACHE_LOCK:
            CACHE[name] = record
        response = json.dumps({"cached": name}).encode("utf-8")
        self.send_response(201)
        self.send_header("Content-Type", "application/json")
        self.end_headers()
        self.wfile.write(response)

    def log_message(self, format, *args):
        return


if __name__ == "__main__":
    server = ThreadingHTTPServer(("0.0.0.0", PORT), CacheHandler)
    print(f"[cache] RRSet cache listening on :{PORT}")
    server.serve_forever()
