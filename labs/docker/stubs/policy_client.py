import json
import os
from http.server import BaseHTTPRequestHandler, HTTPServer
from urllib.parse import urlparse

CONFIG_PATH = os.environ.get("POLICY_CONFIG", "/config/policy.json")
PORT = int(os.environ.get("POLICY_PORT", "7080"))


def load_policy():
    with open(CONFIG_PATH, "r", encoding="utf-8") as handle:
        return json.load(handle)


class PolicyHandler(BaseHTTPRequestHandler):
    def do_GET(self):
        parsed = urlparse(self.path)
        if parsed.path != "/policy":
            self.send_error(404, "Not Found")
            return
        try:
            policy = load_policy()
        except (OSError, json.JSONDecodeError) as exc:
            self.send_error(500, f"Failed to load policy: {exc}")
            return
        payload = json.dumps(policy).encode("utf-8")
        self.send_response(200)
        self.send_header("Content-Type", "application/json")
        self.end_headers()
        self.wfile.write(payload)

    def log_message(self, format, *args):
        return


if __name__ == "__main__":
    server = HTTPServer(("0.0.0.0", PORT), PolicyHandler)
    print(f"[policy-client] serving policy on :{PORT} from {CONFIG_PATH}")
    server.serve_forever()
