import { createServer } from "node:http";
import type { IncomingMessage, ServerResponse } from "node:http";
import { URL } from "node:url";
import { SpendEscrowMemory } from "./escrow.js";
import { VoucherVerifierMemory } from "./vouchers.js";

const port = Number(process.env.PORT || 8796);
const secret = process.env.VOUCHER_HMAC_SECRET || "dev-secret";

const escrow = new SpendEscrowMemory();
const verifier = new VoucherVerifierMemory({ secret });

function sendJson(res: ServerResponse, status: number, payload: unknown) {
  res.writeHead(status, { "Content-Type": "application/json" });
  res.end(JSON.stringify(payload));
}

async function readBody(req: IncomingMessage) {
  const chunks: Buffer[] = [];
  for await (const chunk of req) chunks.push(chunk as Buffer);
  const raw = Buffer.concat(chunks).toString("utf8");
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch {
    return { raw };
  }
}

const server = createServer(async (req, res) => {
  if (!req.url) return sendJson(res, 400, { error: "missing_url" });
  const url = new URL(req.url, `http://${req.headers.host || "localhost"}`);

  if (req.method === "GET" && url.pathname === "/healthz") {
    return sendJson(res, 200, { ok: true });
  }

  if (req.method === "POST" && url.pathname === "/v1/deposit") {
    const body = await readBody(req);
    escrow.deposit(String(body?.user || ""), BigInt(body?.amount || 0));
    return sendJson(res, 200, { ok: true, balance: escrow.balanceOf(String(body?.user || "")).toString() });
  }

  if (req.method === "POST" && url.pathname === "/v1/withdraw") {
    const body = await readBody(req);
    escrow.withdraw(String(body?.user || ""), BigInt(body?.amount || 0));
    return sendJson(res, 200, { ok: true, balance: escrow.balanceOf(String(body?.user || "")).toString() });
  }

  if (req.method === "POST" && url.pathname === "/v1/settle") {
    const body = await readBody(req);
    const record = escrow.debitForSettlement(
      String(body?.settler || ""),
      String(body?.user || ""),
      BigInt(body?.amount || 0),
      String(body?.settlement_id || "")
    );
    return sendJson(res, 200, { ok: true, record });
  }

  if (req.method === "POST" && url.pathname === "/v1/voucher/verify") {
    const body = await readBody(req);
    const result = verifier.verify(body);
    return sendJson(res, 200, result);
  }

  sendJson(res, 404, { error: "not_found" });
});

server.listen(port, () => {
  // eslint-disable-next-line no-console
  console.log(`escrow demo server listening on :${port}`);
});
