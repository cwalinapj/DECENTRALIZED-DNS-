import json
import os
from http.server import BaseHTTPRequestHandler, HTTPServer
from urllib.parse import parse_qs, urlparse

UPSTREAMS = [item.strip() for item in os.environ.get("UPSTREAMS", "cloudflare,google").split(",") if item.strip()]
DEFAULT_RECORD = os.environ.get("UPSTREAM_RECORD", "203.0.113.10")
DEFAULT_TTL = int(os.environ.get("UPSTREAM_TTL", "60"))
QUORUM_REQUIRED = int(os.environ.get("QUORUM_REQUIRED", str(max(1, len(UPSTREAMS)))))
PORT = int(os.environ.get("UPSTREAM_PORT", "7081"))


class UpstreamHandler(BaseHTTPRequestHandler):
    def do_GET(self):
        parsed = urlparse(self.path)
        if parsed.path != "/query":
            self.send_error(404, "Not Found")
            return
        params = parse_qs(parsed.query)
        name = params.get("name", ["example.com"])[0]
        response = {
            "name": name,
            "type": "A",
            "ttl": DEFAULT_TTL,
            "data": DEFAULT_RECORD,
            "upstreams": UPSTREAMS,
            "quorum": {
                "required": QUORUM_REQUIRED,
                "responded": len(UPSTREAMS),
            },
        }
        payload = json.dumps(response).encode("utf-8")
        self.send_response(200)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(payload)))
        self.end_headers()
        self.wfile.write(payload)

    def log_message(self, format, *args):
        return


if __name__ == "__main__":
    server = HTTPServer(("0.0.0.0", PORT), UpstreamHandler)
    print(f"[upstream-quorum] listening on :{PORT} with {len(UPSTREAMS)} upstream(s)")
    server.serve_forever()
