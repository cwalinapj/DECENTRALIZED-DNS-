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
  const name = process.env.NAME || `${desired}.dns`;
  const dest = process.env.DEST || "https://example.com";
  const ttl = Number(process.env.TTL || 300);
  let resolvedName = name.toLowerCase().replace(/\.+$/, "");

  const before = await getJson(`${BASE}/v1/names?wallet=${client.pubkey58}`);
  const beforeNames = Array.isArray(before?.names) ? before.names : [];

  // Idempotent path:
  // - If the desired name is already owned, skip claiming.
  // - If any name is owned, use the first owned name for routing.
  // - Otherwise claim passport and use the newly claimed name.
  if (beforeNames.includes(resolvedName)) {
    console.log("claim_passport: skipped (already owns desired name)", resolvedName);
  } else if (beforeNames.length > 0) {
    resolvedName = beforeNames[0];
    console.log("claim_passport: skipped (passport exists); using owned name", resolvedName);
  } else {
    const claim = await postJson(`${BASE}/v1/claim-passport`, {
      wallet_pubkey: client.pubkey58,
      desired_name: desired,
      nonce: ch.nonce,
      signature: sig,
    });
    console.log("claim_passport:", claim.status, claim.json);
    if (claim.status !== 200) {
      throw new Error(`claim_failed:${claim.status}:${JSON.stringify(claim.json)}`);
    }
    const label = String(claim.json?.label || desired).toLowerCase();
    resolvedName = label.endsWith(".dns") ? label : `${label}.dns`;
  }

  // Validate final name against on-chain ownership list before assign.
  const after = await getJson(`${BASE}/v1/names?wallet=${client.pubkey58}`);
  const ownedNames = Array.isArray(after?.names) ? after.names : [];
  if (!ownedNames.includes(resolvedName)) {
    if (ownedNames.length === 0) {
      throw new Error(`no_owned_names_after_claim`);
    }
    resolvedName = ownedNames[0];
    console.log("using_first_owned_name:", resolvedName);
  }

  const ch2 = await getJson(`${BASE}/v1/challenge?wallet=${client.pubkey58}`);
  const sig2 = signChallenge(client.pubkey58, ch2.nonce, client.secretKey);
  const assign = await postJson(`${BASE}/v1/assign-route`, {
    wallet_pubkey: client.pubkey58,
    name: resolvedName,
    dest,
    ttl,
    nonce: ch2.nonce,
    signature: sig2,
  });
  console.log("assign_route:", assign.status, assign.json);
  if (assign.status !== 200) {
    throw new Error(`assign_failed:${assign.status}:${JSON.stringify(assign.json)}`);
  }

  const resolved = await getJson(
    `${BASE}/v1/resolve?wallet=${client.pubkey58}&name=${encodeURIComponent(resolvedName)}`
  );
  if (!resolved?.ok) {
    throw new Error(`resolve_failed:${JSON.stringify(resolved)}`);
  }
  console.log("resolve:", JSON.stringify(resolved, null, 2));
  console.log("resolved_name:", resolvedName);
  console.log("resolved_dest:", resolved?.dest ?? null);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
