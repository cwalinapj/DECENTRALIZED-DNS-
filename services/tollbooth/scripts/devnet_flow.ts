import crypto from "node:crypto";
import nacl from "tweetnacl";
import bs58 from "bs58";
import fs from "node:fs";

const BASE = process.env.TOLLBOOTH_URL || "http://localhost:8788";
const WALLET_PATH =
  process.env.CLIENT_WALLET ||
  (process.env.HOME ? `${process.env.HOME}/.config/solana/id.json` : "");

function loadKeypair(path: string): { pubkey58: string; secretKey: Uint8Array } {
  const raw = JSON.parse(fs.readFileSync(path, "utf8"));
  const secretKey = Uint8Array.from(raw);
  const kp = nacl.sign.keyPair.fromSecretKey(secretKey.slice(0, 64));
  const pubkey58 = bs58.encode(kp.publicKey);
  return { pubkey58, secretKey: kp.secretKey };
}

async function getJson(url: string) {
  const r = await fetch(url);
  const t = await r.text();
  try {
    return JSON.parse(t);
  } catch {
    throw new Error(`bad_json ${r.status}: ${t}`);
  }
}

async function postJson(url: string, body: any) {
  const r = await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  const t = await r.text();
  try {
    return { status: r.status, json: JSON.parse(t) };
  } catch {
    return { status: r.status, json: { raw: t } };
  }
}

function signChallenge(wallet: string, nonce: string, secretKey: Uint8Array): string {
  const msg = new TextEncoder().encode(`DDNS_CHALLENGE:${wallet}:${nonce}`);
  const sig = nacl.sign.detached(msg, secretKey);
  return Buffer.from(sig).toString("base64");
}

async function main() {
  if (!WALLET_PATH) throw new Error("missing CLIENT_WALLET");
  const client = loadKeypair(WALLET_PATH);

  const ch = await getJson(`${BASE}/v1/challenge?wallet=${client.pubkey58}`);
  if (!ch.ok) throw new Error(`challenge failed: ${JSON.stringify(ch)}`);
  const sig = signChallenge(client.pubkey58, ch.nonce, client.secretKey);

  const desired = process.env.LABEL || `u-${client.pubkey58.slice(0, 8).toLowerCase()}`;
  const claim = await postJson(`${BASE}/v1/claim-passport`, {
    wallet_pubkey: client.pubkey58,
    desired_name: desired,
    nonce: ch.nonce,
    signature: sig,
  });
  console.log("claim_passport:", claim.status, claim.json);

  const ch2 = await getJson(`${BASE}/v1/challenge?wallet=${client.pubkey58}`);
  const sig2 = signChallenge(client.pubkey58, ch2.nonce, client.secretKey);

  const name = process.env.NAME || `${desired}.dns`;
  const dest = process.env.DEST || "https://example.com";
  const ttl = Number(process.env.TTL || 300);
  let resolvedName = name;

  const assign = await postJson(`${BASE}/v1/assign-route`, {
    wallet_pubkey: client.pubkey58,
    name,
    dest,
    ttl,
    nonce: ch2.nonce,
    signature: sig2,
  });
  console.log("assign_route:", assign.status, assign.json);

  if (assign.status !== 200 && assign.json?.error === "name_not_claimed") {
    const names = await getJson(`${BASE}/v1/names?wallet=${client.pubkey58}`);
    const fallback = Array.isArray(names?.names) ? names.names[0] : "";
    if (fallback) {
      const ch3 = await getJson(`${BASE}/v1/challenge?wallet=${client.pubkey58}`);
      const sig3 = signChallenge(client.pubkey58, ch3.nonce, client.secretKey);
      const assignRetry = await postJson(`${BASE}/v1/assign-route`, {
        wallet_pubkey: client.pubkey58,
        name: fallback,
        dest,
        ttl,
        nonce: ch3.nonce,
        signature: sig3,
      });
      console.log("assign_route_retry:", assignRetry.status, assignRetry.json);
      if (assignRetry.status === 200) {
        resolvedName = fallback;
      }
    }
  }

  const resolved = await getJson(
    `${BASE}/v1/resolve?wallet=${client.pubkey58}&name=${encodeURIComponent(resolvedName)}`
  );
  console.log("resolve:", JSON.stringify(resolved, null, 2));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
