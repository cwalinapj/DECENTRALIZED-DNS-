import json
import os
from http.server import BaseHTTPRequestHandler, HTTPServer
from urllib.parse import parse_qs, urlparse

PORT = int(os.environ.get("CACHE_PORT", "7082"))
CACHE = {}


class CacheHandler(BaseHTTPRequestHandler):
    def do_GET(self):
        parsed = urlparse(self.path)
        if parsed.path != "/cache":
            self.send_error(404, "Not Found")
            return
        params = parse_qs(parsed.query)
        name = params.get("name", [None])[0]
        if not name or name not in CACHE:
            self.send_error(404, "Cache miss")
            return
        payload = json.dumps(CACHE[name]).encode("utf-8")
        self.send_response(200)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(payload)))
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
        CACHE[name] = record
        response = json.dumps({"cached": name}).encode("utf-8")
        self.send_response(201)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(response)))
        self.end_headers()
        self.wfile.write(response)

    def log_message(self, format, *args):
        return


if __name__ == "__main__":
    server = HTTPServer(("0.0.0.0", PORT), CacheHandler)
    print(f"[cache] rrset cache listening on :{PORT}")
    server.serve_forever()
