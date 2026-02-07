import hashlib
import hmac
import json
import os
import time
import uuid
from http.server import BaseHTTPRequestHandler, HTTPServer
from urllib.parse import urlparse

PORT = int(os.environ.get("RECEIPT_PORT", "7083"))
RECEIPT_DIR = os.environ.get("RECEIPT_DIR", "/receipts")
SECRET = os.environ.get("RECEIPT_SECRET", "local-dev-secret").encode("utf-8")


def sign_payload(payload: str) -> str:
    return hmac.new(SECRET, payload.encode("utf-8"), hashlib.sha256).hexdigest()


class ReceiptHandler(BaseHTTPRequestHandler):
    def do_POST(self):
        parsed = urlparse(self.path)
        if parsed.path != "/receipt":
            self.send_error(404, "Not Found")
            return
        length = int(self.headers.get("Content-Length", "0"))
        if length <= 0:
            self.send_error(400, "Missing payload")
            return
        try:
            body = self.rfile.read(length)
            data = json.loads(body)
        except json.JSONDecodeError:
            self.send_error(400, "Invalid JSON")
            return
        receipt_id = str(uuid.uuid4())
        receipt = {
            "id": receipt_id,
            "timestamp": int(time.time()),
            "payload": data,
        }
        payload_str = json.dumps(receipt, sort_keys=True)
        receipt["signature"] = sign_payload(payload_str)
        os.makedirs(RECEIPT_DIR, exist_ok=True)
        path = os.path.join(RECEIPT_DIR, f"receipt-{receipt_id}.json")
        with open(path, "w", encoding="utf-8") as handle:
            json.dump(receipt, handle, indent=2)
        response = json.dumps({"receipt_id": receipt_id, "path": path}).encode("utf-8")
        self.send_response(201)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(response)))
        self.end_headers()
        self.wfile.write(response)

    def log_message(self, format, *args):
        return


if __name__ == "__main__":
    server = HTTPServer(("0.0.0.0", PORT), ReceiptHandler)
    print(f"[receipt] stub listening on :{PORT}, writing to {RECEIPT_DIR}")
    server.serve_forever()
