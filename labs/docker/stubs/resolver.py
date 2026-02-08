import json
import os
import socketserver
import threading
import time
import urllib.error
import urllib.parse
import urllib.request
from http.server import BaseHTTPRequestHandler, HTTPServer
from urllib.parse import parse_qs, urlparse

POLICY_URL = os.environ.get("POLICY_URL", "http://policy-client:7080/policy")
UPSTREAM_URL = os.environ.get("UPSTREAM_URL", "http://upstream-quorum:7081/query")
CACHE_URL = os.environ.get("CACHE_URL", "http://cache:7082/cache")
RECEIPT_URL = os.environ.get("RECEIPT_URL", "http://receipt-stub:7083/receipt")
DOH_PORT = int(os.environ.get("DOH_PORT", "8053"))
DOT_PORT = int(os.environ.get("DOT_PORT", "8853"))


def fetch_json(url: str):
    try:
        with urllib.request.urlopen(url, timeout=2) as response:
            return json.load(response)
    except (urllib.error.URLError, json.JSONDecodeError):
        return None


def post_json(url: str, payload: dict):
    data = json.dumps(payload).encode("utf-8")
    request = urllib.request.Request(
        url,
        data=data,
        headers={"Content-Type": "application/json"},
        method="POST",
    )
    try:
        with urllib.request.urlopen(request, timeout=2) as response:
            return json.load(response)
    except (urllib.error.URLError, json.JSONDecodeError):
        return None


def cache_lookup(name: str):
    query = urllib.parse.urlencode({"name": name})
    url = f"{CACHE_URL}?{query}"
    try:
        with urllib.request.urlopen(url, timeout=2) as response:
            return json.load(response)
    except urllib.error.HTTPError:
        return None
    except (urllib.error.URLError, json.JSONDecodeError):
        return None


def cache_store(name: str, record: dict):
    payload = {"name": name, "record": record}
    post_json(CACHE_URL, payload)


def load_policy():
    policy = fetch_json(POLICY_URL)
    return policy or {"state": "UNKNOWN"}


class ResolverHandler(BaseHTTPRequestHandler):
    def do_GET(self):
        parsed = urlparse(self.path)
        if parsed.path not in ("/resolve", "/dns-query"):
            self.send_error(404, "Not Found")
            return
        params = parse_qs(parsed.query)
        name = params.get("name", ["example.com"])[0]
        policy = load_policy()
        record = cache_lookup(name)
        source = "cache" if record is not None else None
        if record is None:
            query = urllib.parse.urlencode({"name": name})
            upstream = fetch_json(f"{UPSTREAM_URL}?{query}")
            if upstream:
                record = upstream
                cache_store(name, upstream)
                source = "upstream-quorum"
        if record is None:
            self.send_error(502, "Upstream unavailable")
            return
        response = {
            "name": name,
            "policy": policy,
            "answer": record,
            "source": source,
        }
        receipt_response = post_json(RECEIPT_URL, response)
        if receipt_response is None:
            print("[resolver] warning: receipt stub unavailable")
        payload = json.dumps(response).encode("utf-8")
        self.send_response(200)
        self.send_header("Content-Type", "application/json")
        self.end_headers()
        self.wfile.write(payload)

    def log_message(self, format, *args):
        return


class DotHandler(socketserver.BaseRequestHandler):
    def handle(self):
        data = self.request.recv(1024)
        if not data:
            return
        payload = json.dumps({"protocol": "dot", "bytes": len(data), "timestamp": int(time.time())}).encode("utf-8")
        self.request.sendall(payload + b"\n")


class ReusableTCPServer(socketserver.ThreadingTCPServer):
    allow_reuse_address = True


def start_dot_server():
    with ReusableTCPServer(("0.0.0.0", DOT_PORT), DotHandler) as server:
        print(f"[resolver] DoT stub listening on :{DOT_PORT}")
        server.serve_forever()


if __name__ == "__main__":
    thread = threading.Thread(target=start_dot_server, daemon=True)
    thread.start()
    server = HTTPServer(("0.0.0.0", DOH_PORT), ResolverHandler)
    print(f"[resolver] DoH stub listening on :{DOH_PORT}")
    server.serve_forever()
