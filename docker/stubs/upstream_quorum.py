import json
import os
from http.server import BaseHTTPRequestHandler, HTTPServer
from urllib.parse import parse_qs, urlparse

RAW_UPSTREAM_LIST = os.environ.get("UPSTREAMS", "cloudflare,google").split(",")
UPSTREAMS = [item.strip() for item in RAW_UPSTREAM_LIST if item.strip()]
DEFAULT_RECORD = os.environ.get("UPSTREAM_RECORD", "203.0.113.10")
DEFAULT_TTL = int(os.environ.get("UPSTREAM_TTL", "60"))
QUORUM_REQUIRED_ENV = os.environ.get("QUORUM_REQUIRED")


def default_quorum() -> int:
    return max(1, (len(UPSTREAMS) // 2) + 1)


QUORUM_REQUIRED = int(QUORUM_REQUIRED_ENV) if QUORUM_REQUIRED_ENV is not None else default_quorum()
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
        self.end_headers()
        self.wfile.write(payload)

    def log_message(self, format, *args):
        return


if __name__ == "__main__":
    server = HTTPServer(("0.0.0.0", PORT), UpstreamHandler)
    print(f"[upstream-quorum] listening on :{PORT} with {len(UPSTREAMS)} upstream(s)")
    server.serve_forever()
