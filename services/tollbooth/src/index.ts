import path from "node:path";
import express from "express";
import { PublicKey } from "@solana/web3.js";

import {
  createClient,
  ensureInitialized,
  ensureProgramExists,
  getPassportIfExists,
  issuePassport,
  normalizeFullName,
  normalizeLabel,
  setRoute,
  validateLabel,
  fetchRouteRecord,
  listOwnedNames,
  nameHashFromFullName,
  pdaNameRecord,
  pdaRouteRecord,
  sha25632Str,
} from "./solana.js";
import {
  createInMemoryChallengeStore,
  verifySignedChallenge,
} from "./auth.js";
import {
  ensureDbDirs,
  readRoute,
  writePassport,
  writeRoute,
} from "./store.js";

const PORT = Number(process.env.PORT || 8788);
const SOLANA_RPC_URL = process.env.SOLANA_RPC_URL || "https://api.devnet.solana.com";
const DDNS_PROGRAM_ID =
  process.env.DDNS_PROGRAM_ID || "EJVVNdwBdZiEpA4QjVaeV79WPsoUpa4zLA4mqpxWxXi5";
const ALLOW_LOCAL_FALLBACK = process.env.ALLOW_LOCAL_FALLBACK === "1";
const DDNS_IDL_PATH =
  process.env.DDNS_IDL_PATH || path.resolve("..", "..", "solana", "target", "idl", "ddns_anchor.json");
const TOLLBOOTH_KEYPAIR =
  process.env.TOLLBOOTH_KEYPAIR || path.join(process.env.HOME || ".", ".config/solana/id.json");

const DB_DIR = path.resolve("tollbooth-db");
ensureDbDirs(DB_DIR);

const challenges = createInMemoryChallengeStore(5 * 60_000);

const ddns = createClient({
  rpcUrl: SOLANA_RPC_URL,
  programId: DDNS_PROGRAM_ID,
  idlPath: DDNS_IDL_PATH,
  authorityKeypairPath: TOLLBOOTH_KEYPAIR,
});

const app = express();
app.use(express.json({ limit: "1mb" }));

function httpError(res: any, code: number, msg: string) {
  return res.status(code).json({ ok: false, error: msg });
}

function supportsLocalRouteFallback(msg: string): boolean {
  if (!ALLOW_LOCAL_FALLBACK) return false;
  return /InstructionFallbackNotFound|DeclaredProgramIdMismatch|custom program error: 0x65|custom program error: 0x1004/i.test(
    msg
  );
}

app.get("/v1/challenge", (req, res) => {
  const wallet = String(req.query.wallet || "");
  try {
    // basic pubkey validation
    // eslint-disable-next-line no-new
    new PublicKey(wallet);
  } catch {
    return httpError(res, 400, "invalid wallet");
  }
  const ch = challenges.create(wallet);
  return res.json({ ok: true, nonce: ch.nonce, expires_at: ch.expiresAtMs });
});

app.post("/v1/claim-passport", async (req, res) => {
  try {
    const wallet_pubkey = String(req.body.wallet_pubkey || "");
    const desired_name = req.body.desired_name ? String(req.body.desired_name) : undefined;
    const nonce = String(req.body.nonce || "");
    const signature = String(req.body.signature || "");

    const consumed = challenges.consume(wallet_pubkey, nonce);
    if (!consumed) return httpError(res, 401, "invalid_or_expired_nonce");
    if (!verifySignedChallenge({ wallet: wallet_pubkey, nonce, signature })) {
      return httpError(res, 401, "invalid_signature");
    }

    await ensureProgramExists(ddns);
    await ensureInitialized(ddns);

    const ownerWallet = new PublicKey(wallet_pubkey);

    let label = desired_name ? normalizeLabel(desired_name) : "";
    if (label.endsWith(".dns")) label = label.slice(0, -4);
    if (!label) {
      label = `u-${wallet_pubkey.slice(0, 8).toLowerCase()}`;
    }
    validateLabel(label);

    const result = await issuePassport(ddns, {
      ownerWallet,
      labelLower: label,
    });

    writePassport(DB_DIR, {
      wallet_pubkey,
      passport_mint: result.mint.toBase58(),
      toll_pass_pda: result.tollPassPda.toBase58(),
      name_record_pda: result.nameRecordPda.toBase58(),
      label,
      name_hash_hex: Buffer.from(result.nameHash).toString("hex"),
      tx: result.tx || undefined,
      created_at: Date.now(),
    });

    return res.json({
      ok: true,
      passport_mint: result.mint.toBase58(),
      toll_pass_pda: result.tollPassPda.toBase58(),
      record_pda: result.nameRecordPda.toBase58(),
      label,
      name_hash_hex: Buffer.from(result.nameHash).toString("hex"),
      tx: result.tx || null,
    });
  } catch (e: any) {
    const msg = e?.message || "server_error";
    const taken = /already in use|custom program error|0x0/.test(msg);
    return httpError(res, taken ? 409 : 500, msg);
  }
});

app.post("/v1/assign-route", async (req, res) => {
  try {
    const wallet_pubkey = String(req.body.wallet_pubkey || "");
    const name = String(req.body.name || "");
    const dest = String(req.body.dest || "");
    const ttl = Number(req.body.ttl);
    const nonce = String(req.body.nonce || "");
    const signature = String(req.body.signature || "");

    if (!name || !dest || !Number.isFinite(ttl) || ttl <= 0) {
      return httpError(res, 400, "invalid_input");
    }

    const consumed = challenges.consume(wallet_pubkey, nonce);
    if (!consumed) return httpError(res, 401, "invalid_or_expired_nonce");
    if (!verifySignedChallenge({ wallet: wallet_pubkey, nonce, signature })) {
      return httpError(res, 401, "invalid_signature");
    }

    await ensureProgramExists(ddns);
    await ensureInitialized(ddns);

    const ownerWallet = new PublicKey(wallet_pubkey);

    // Require a passport exists.
    const passport = await getPassportIfExists(ddns, ownerWallet);
    if (!passport) return httpError(res, 403, "passport_required");

    const fullName = normalizeFullName(name);
    const nameHash = nameHashFromFullName(fullName);
    const nameRecordPda = pdaNameRecord(ddns.programId, nameHash);
    const routeRecordPda = pdaRouteRecord(ddns.programId, ownerWallet, nameHash);

    let r:
      | {
          tx: string;
          slot: number;
          routeRecordPda: PublicKey;
          nameRecordPda: PublicKey;
          nameHash: Uint8Array;
          destHash: Uint8Array;
        }
      | undefined;
    let localFallback = false;
    try {
      r = await setRoute(ddns, {
        ownerWallet,
        fullNameLower: fullName,
        dest,
        ttl,
      });
    } catch (e: any) {
      const msg = e?.message || String(e);
      if (!supportsLocalRouteFallback(msg)) throw e;
      localFallback = true;
    }

    writeRoute(DB_DIR, {
      wallet_pubkey,
      name: fullName,
      name_hash_hex: Buffer.from(nameHash).toString("hex"),
      route_record_pda: routeRecordPda.toBase58(),
      dest,
      dest_hash_hex: Buffer.from(sha25632Str(dest)).toString("hex"),
      ttl,
      tx: r?.tx ?? null,
      slot: r?.slot ?? null,
      updated_at: Date.now(),
    });

    return res.json({
      ok: true,
      tx: r?.tx ?? null,
      slot: r?.slot ?? null,
      route_record_pda: routeRecordPda.toBase58(),
      name_record_pda: nameRecordPda.toBase58(),
      name_hash_hex: Buffer.from(nameHash).toString("hex"),
      mode: localFallback ? "local_fallback" : "onchain",
      allow_local_fallback: ALLOW_LOCAL_FALLBACK,
    });
  } catch (e: any) {
    return httpError(res, 500, e?.message || "server_error");
  }
});

app.get("/v1/resolve", async (req, res) => {
  try {
    const wallet = String(req.query.wallet || "");
    const name = String(req.query.name || "");
    if (!wallet || !name) return httpError(res, 400, "missing_query");

    const ownerWallet = new PublicKey(wallet);
    const fullName = normalizeFullName(name);
    const nameHash = nameHashFromFullName(fullName);
    const nameHashHex = Buffer.from(nameHash).toString("hex");

    const fetched = await fetchRouteRecord(ddns, { ownerWallet, fullNameLower: fullName });
    const local = readRoute(DB_DIR, wallet, nameHashHex);
    if (!fetched && !local) return httpError(res, 404, "not_found");
    if (!fetched && local) {
      return res.json({
        ok: true,
        name: fullName,
        wallet,
        dest: local.dest,
        ttl: local.ttl,
        dest_hash_hex: local.dest_hash_hex,
        proof: {
          program_id: ddns.programId.toBase58(),
          record_pda: pdaRouteRecord(ddns.programId, ownerWallet, nameHash).toBase58(),
          slot: null,
          signature: local?.tx ?? null,
          mode: "local_fallback",
        },
      });
    }

    const decodedDestHash: Uint8Array = fetched.record.destHash ?? fetched.record.dest_hash;
    const decodedTtl: number = fetched.record.ttl;
    let dest: string | null = null;
    if (local) {
      const check = sha25632Str(local.dest);
      const checkHex = Buffer.from(check).toString("hex");
      const onchainHex = Buffer.from(decodedDestHash).toString("hex");
      if (checkHex === onchainHex) dest = local.dest;
    }

    return res.json({
      ok: true,
      name: fullName,
      wallet,
      dest,
      ttl: decodedTtl,
      dest_hash_hex: Buffer.from(decodedDestHash).toString("hex"),
      proof: {
        program_id: ddns.programId.toBase58(),
        record_pda: fetched.pda.toBase58(),
        slot: fetched.slot,
        signature: local?.tx ?? null,
      },
    });
  } catch (e: any) {
    return httpError(res, 500, e?.message || "server_error");
  }
});

app.get("/v1/names", async (req, res) => {
  try {
    const wallet = String(req.query.wallet || "");
    if (!wallet) return httpError(res, 400, "missing_wallet");
    const ownerWallet = new PublicKey(wallet);
    await ensureProgramExists(ddns);
    const names = await listOwnedNames(ddns, ownerWallet);
    return res.json({ ok: true, wallet, names });
  } catch (e: any) {
    return httpError(res, 500, e?.message || "server_error");
  }
});

app.listen(PORT, () => {
  console.log("tollbooth_port:", PORT);
  console.log("solana_rpc_url:", SOLANA_RPC_URL);
  console.log("ddns_program_id:", DDNS_PROGRAM_ID);
  console.log("ddns_idl_path:", DDNS_IDL_PATH);
  console.log("authority_pubkey:", ddns.authority.publicKey.toBase58());
});
