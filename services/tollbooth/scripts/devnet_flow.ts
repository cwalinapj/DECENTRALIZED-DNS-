import crypto from "node:crypto";
import nacl from "tweetnacl";
import bs58 from "bs58";
import fs from "node:fs";
import path from "node:path";
import { Keypair, PublicKey } from "@solana/web3.js";
import {
  createClient,
  ensureInitialized,
  ensureProgramExists,
  issuePassport,
  setRoute,
} from "../src/solana.js";

const BASE = process.env.TOLLBOOTH_URL || "http://localhost:8788";
const WALLET_PATH =
  process.env.CLIENT_WALLET ||
  (process.env.HOME ? `${process.env.HOME}/.config/solana/id.json` : "");
const SOLANA_RPC_URL = process.env.SOLANA_RPC_URL || "https://api.devnet.solana.com";
const DDNS_PROGRAM_ID = process.env.DDNS_PROGRAM_ID || "EJVVNdwBdZiEpA4QjVaeV79WPsoUpa4zLA4mqpxWxXi5";
const DDNS_IDL_PATH =
  process.env.DDNS_IDL_PATH || path.resolve("..", "..", "solana", "target", "idl", "ddns_anchor.json");
const TOLLBOOTH_KEYPAIR =
  process.env.TOLLBOOTH_KEYPAIR || (process.env.HOME ? `${process.env.HOME}/.config/solana/id.json` : "");

function loadKeypair(path: string): { pubkey58: string; secretKey: Uint8Array; keypair: Keypair } {
  const raw = JSON.parse(fs.readFileSync(path, "utf8"));
  const keypair = Keypair.fromSecretKey(Uint8Array.from(raw));
  const secretKey = Uint8Array.from(raw);
  const kp = nacl.sign.keyPair.fromSecretKey(secretKey.slice(0, 64));
  const pubkey58 = bs58.encode(kp.publicKey);
  return { pubkey58, secretKey: kp.secretKey, keypair };
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

function accountNotSigner(err: string): boolean {
  return /AccountNotSigner|Error Code:\s*AccountNotSigner/i.test(err);
}

async function directClaimAndAssign(
  owner: Keypair,
  desired: string,
  resolvedName: string,
  dest: string,
  ttl: number
): Promise<void> {
  const ddns = createClient({
    rpcUrl: SOLANA_RPC_URL,
    programId: DDNS_PROGRAM_ID,
    idlPath: DDNS_IDL_PATH,
    authorityKeypairPath: TOLLBOOTH_KEYPAIR,
  });
  await ensureProgramExists(ddns);
  await ensureInitialized(ddns);
  const ownerWallet = owner.publicKey;
  const label = desired.toLowerCase().replace(/\.dns$/, "");
  const claim = await issuePassport(ddns, {
    ownerWallet,
    ownerSigner: owner,
    labelLower: label,
  });
  console.log("claim_passport:", 200, {
    ok: true,
    passport_mint: claim.mint.toBase58(),
    toll_pass_pda: claim.tollPassPda.toBase58(),
    record_pda: claim.nameRecordPda.toBase58(),
    label,
    name_hash_hex: Buffer.from(claim.nameHash).toString("hex"),
    tx: claim.tx || null,
    mode: "direct_fallback",
  });

  const assign = await setRoute(ddns, {
    ownerWallet,
    ownerSigner: owner,
    fullNameLower: resolvedName,
    dest,
    ttl,
  });
  console.log("assign_route:", 200, {
    ok: true,
    tx: assign.tx,
    slot: assign.slot,
    route_record_pda: assign.routeRecordPda.toBase58(),
    name_record_pda: assign.nameRecordPda.toBase58(),
    mode: "direct_fallback",
  });
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
  let claimedNow = false;

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
    if (claim.status !== 200 && accountNotSigner(JSON.stringify(claim.json))) {
      console.log("claim_passport_fallback:", "direct_onchain_signer");
      await directClaimAndAssign(client.keypair, desired, resolvedName, dest, ttl);
      const resolved = await getJson(
        `${BASE}/v1/resolve?wallet=${client.pubkey58}&name=${encodeURIComponent(resolvedName)}`
      );
      if (!resolved?.ok) {
        throw new Error(`resolve_failed:${JSON.stringify(resolved)}`);
      }
      console.log("resolve:", JSON.stringify(resolved, null, 2));
      console.log("resolved_name:", resolvedName);
      console.log("resolved_dest:", resolved?.dest ?? null);
      return;
    }
    console.log("claim_passport:", claim.status, claim.json);
    if (claim.status !== 200) {
      throw new Error(`claim_failed:${claim.status}:${JSON.stringify(claim.json)}`);
    }
    claimedNow = true;
    const label = String(claim.json?.label || desired).toLowerCase();
    resolvedName = label.endsWith(".dns") ? label : `${label}.dns`;
  }

  // Validate final name against ownership list only when we did not just claim.
  // Some deployed program/layout combinations can return a stale/empty names list
  // immediately after a successful claim tx simulation.
  if (!claimedNow) {
    const after = await getJson(`${BASE}/v1/names?wallet=${client.pubkey58}`);
    const ownedNames = Array.isArray(after?.names) ? after.names : [];
    if (!ownedNames.includes(resolvedName)) {
      if (ownedNames.length === 0) {
        throw new Error(`no_owned_names_available`);
      }
      resolvedName = ownedNames[0];
      console.log("using_first_owned_name:", resolvedName);
    }
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
