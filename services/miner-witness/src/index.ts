import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import crypto from "node:crypto";
import express from "express";
import nacl from "tweetnacl";
import * as anchor from "@coral-xyz/anchor";
import BN from "bn.js";
import { Connection, Keypair, PublicKey, SystemProgram } from "@solana/web3.js";

type ReceiptV1 = {
  version: 1;
  name: string;
  dest: string;
  name_hash: string; // hex
  dest_hash: string; // hex
  ttl_s: number;
  observed_at_unix: number;
  wallet_pubkey: string;
  signature: string; // base64
};

type SubmitReceiptsBody = {
  receipts: ReceiptV1[];
};

type QueryReceiptV1 = {
  version: 1;
  domain: string;
  domain_hash: string; // hex32
  observed_at_unix: number;
  wallet_pubkey: string;
  signature: string; // base64
};

type SubmitQueryReceiptsBody = {
  receipts: QueryReceiptV1[];
};

const PORT = Number(process.env.PORT || 8790);

const SOLANA_RPC_URL = process.env.SOLANA_RPC_URL || "https://api.devnet.solana.com";
const MINER_KEYPAIR = process.env.MINER_KEYPAIR;
if (!MINER_KEYPAIR) {
  throw new Error("MINER_KEYPAIR is required");
}

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const DDNS_REGISTRY_PROGRAM_ID =
  process.env.DDNS_REGISTRY_PROGRAM_ID ||
  "5zg8CsxpRKyurnTg539wr2nVtS6zritQDTGy4uAUerdx";
const DDNS_QUORUM_PROGRAM_ID =
  process.env.DDNS_QUORUM_PROGRAM_ID ||
  "9gyHsemmJfujZEqH1o4VhefxvbUJFQkPko8ASAteX5YB";
const DDNS_STAKE_PROGRAM_ID =
  process.env.DDNS_STAKE_PROGRAM_ID ||
  "6gT4zHNpU4PtXL4LRv1sW8MwkFu254Z7gQM7wKqnmZYF";

const DDNS_NS_INCENTIVES_PROGRAM_ID =
  process.env.DDNS_NS_INCENTIVES_PROGRAM_ID ||
  "8mC8Kvky9Jir4Lxe5R5L6ppoexaYtDJKe8JP8xA9JUuM";

const MIN_RECEIPTS = Number(process.env.MIN_RECEIPTS || 1);
const MIN_STAKE_WEIGHT = BigInt(process.env.MIN_STAKE_WEIGHT || 0);
const MAX_RECEIPT_AGE_SECS = Number(process.env.MAX_RECEIPT_AGE_SECS || 10 * 60);
const MAX_FUTURE_SKEW_SECS = Number(process.env.MAX_FUTURE_SKEW_SECS || 60);

const BOOTSTRAP = process.env.BOOTSTRAP === "1";

function loadKeypair(p: string): Keypair {
  const raw = JSON.parse(fs.readFileSync(p, "utf8"));
  return Keypair.fromSecretKey(Uint8Array.from(raw));
}

function loadIdlOrThrow(programFileBase: string): any {
  const envDir = process.env.SOLANA_IDL_DIR;
  const candidates = [
    envDir ? path.resolve(envDir, `${programFileBase}.json`) : null,
    // When running from `services/miner-witness/`
    path.resolve(process.cwd(), "../../solana/target/idl", `${programFileBase}.json`),
    // When running from repo root (or elsewhere)
    path.resolve(__dirname, "../../../solana/target/idl", `${programFileBase}.json`),
  ].filter(Boolean) as string[];

  for (const p of candidates) {
    if (!fs.existsSync(p)) continue;
    const idl = JSON.parse(fs.readFileSync(p, "utf8"));
    if (!idl.name && idl.metadata?.name) idl.name = idl.metadata.name;
    if (!idl.version && idl.metadata?.version) idl.version = idl.metadata.version;
    return idl;
  }
  throw new Error(
    `IDL not found for ${programFileBase}. Looked in: ${candidates.join(
      ", "
    )}. Run 'anchor build' in solana/ or set SOLANA_IDL_DIR.`
  );
}

function normalizeName(name: string): string {
  let n = name.trim().toLowerCase();
  if (n.endsWith(".")) n = n.slice(0, -1);
  if (!n.endsWith(".dns")) throw new Error("name must end with .dns");
  const label = n.slice(0, -4);
  if (label.length < 3 || label.length > 32) throw new Error("label length 3..32");
  if (label.startsWith("-") || label.endsWith("-")) throw new Error("no leading/trailing -");
  for (const ch of label) {
    const ok =
      (ch >= "a" && ch <= "z") ||
      (ch >= "0" && ch <= "9") ||
      ch === "-";
    if (!ok) throw new Error("label contains invalid char");
  }
  return n;
}

function canonicalizeDest(dest: string): string {
  // MVP canonicalization: keep minimal; extend later.
  const d = dest.trim();
  return d;
}

function sha256(buf: Buffer): Buffer {
  return crypto.createHash("sha256").update(buf).digest();
}

function nameHash(nameLc: string): Buffer {
  return sha256(Buffer.from(nameLc, "utf8"));
}

function destHash(destCanonical: string): Buffer {
  return sha256(Buffer.from(destCanonical, "utf8"));
}

function parseHex32(s: string, label: string): Buffer {
  const hex = s.startsWith("0x") ? s.slice(2) : s;
  if (!/^[0-9a-fA-F]{64}$/.test(hex)) throw new Error(`${label} must be 32-byte hex`);
  return Buffer.from(hex, "hex");
}

function normalizeDomain(domain: string): string {
  let d = domain.trim().toLowerCase();
  if (d.endsWith(".")) d = d.slice(0, -1);
  if (d.length === 0 || d.length > 253) throw new Error("bad domain length");
  if (!/^[a-z0-9.-]+$/.test(d)) throw new Error("domain contains invalid chars (MVP: ascii a-z0-9.-)");
  return d;
}

function domainHash(domainLc: string): Buffer {
  return sha256(Buffer.from(domainLc, "utf8"));
}

function receiptMsgHash(r: ReceiptV1, name_hash: Buffer, dest_hash: Buffer): Buffer {
  const prefix = Buffer.from("DDNS_RECEIPT_V1", "utf8");
  const ts = Buffer.alloc(8);
  ts.writeBigInt64LE(BigInt(r.observed_at_unix));
  const ttl = Buffer.alloc(4);
  ttl.writeUInt32LE(r.ttl_s >>> 0);
  return sha256(Buffer.concat([prefix, name_hash, dest_hash, ts, ttl]));
}

function verifyReceipt(r: ReceiptV1): { name_lc: string; name_hash: Buffer; dest_c: string; dest_hash: Buffer } {
  if (r.version !== 1) throw new Error("unsupported receipt version");
  if (!Number.isFinite(r.ttl_s) || r.ttl_s <= 0) throw new Error("bad ttl_s");
  if (!Number.isFinite(r.observed_at_unix)) throw new Error("bad observed_at_unix");
  const now = Math.floor(Date.now() / 1000);
  if (r.observed_at_unix > now + MAX_FUTURE_SKEW_SECS) throw new Error("observed_at_unix too far in future");
  if (r.observed_at_unix < now - MAX_RECEIPT_AGE_SECS) throw new Error("receipt too old");
  const name_lc = normalizeName(r.name);
  const dest_c = canonicalizeDest(r.dest);
  const nh = nameHash(name_lc);
  const dh = destHash(dest_c);
  const nhProvided = parseHex32(r.name_hash, "name_hash");
  const dhProvided = parseHex32(r.dest_hash, "dest_hash");
  if (!nhProvided.equals(nh)) throw new Error("name_hash mismatch");
  if (!dhProvided.equals(dh)) throw new Error("dest_hash mismatch");

  const msg = receiptMsgHash(r, nh, dh);
  const sig = Buffer.from(r.signature, "base64");
  if (sig.length !== 64) throw new Error("bad signature length");

  const walletPk = new PublicKey(r.wallet_pubkey);
  const ok = nacl.sign.detached.verify(msg, sig, walletPk.toBytes());
  if (!ok) throw new Error("invalid signature");
  return { name_lc, name_hash: nh, dest_c, dest_hash: dh };
}

function queryReceiptMsgHash(r: QueryReceiptV1, domain_hash: Buffer): Buffer {
  const prefix = Buffer.from("DDNS_QUERY_RECEIPT_V1", "utf8");
  const ts = Buffer.alloc(8);
  ts.writeBigInt64LE(BigInt(r.observed_at_unix));
  return sha256(Buffer.concat([prefix, domain_hash, ts]));
}

function verifyQueryReceipt(r: QueryReceiptV1): { domain_lc: string; domain_hash: Buffer } {
  if (r.version !== 1) throw new Error("unsupported query receipt version");
  if (!Number.isFinite(r.observed_at_unix)) throw new Error("bad observed_at_unix");
  const now = Math.floor(Date.now() / 1000);
  if (r.observed_at_unix > now + MAX_FUTURE_SKEW_SECS) throw new Error("observed_at_unix too far in future");
  if (r.observed_at_unix < now - MAX_RECEIPT_AGE_SECS) throw new Error("receipt too old");

  const domain_lc = normalizeDomain(r.domain);
  const dh = domainHash(domain_lc);
  const dhProvided = parseHex32(r.domain_hash, "domain_hash");
  if (!dhProvided.equals(dh)) throw new Error("domain_hash mismatch");

  const msg = queryReceiptMsgHash(r, dh);
  const sig = Buffer.from(r.signature, "base64");
  if (sig.length !== 64) throw new Error("bad signature length");

  const walletPk = new PublicKey(r.wallet_pubkey);
  const ok = nacl.sign.detached.verify(msg, sig, walletPk.toBytes());
  if (!ok) throw new Error("invalid signature");

  return { domain_lc, domain_hash: dh };
}

function merkleRoot(leaves: Buffer[]): Buffer {
  if (leaves.length === 0) return Buffer.alloc(32, 0);
  let level = leaves.slice().sort(Buffer.compare);
  while (level.length > 1) {
    const next: Buffer[] = [];
    for (let i = 0; i < level.length; i += 2) {
      const a = level[i];
      const b = level[i + 1] || level[i];
      next.push(sha256(Buffer.concat([a, b])));
    }
    level = next;
  }
  return level[0];
}

async function main() {
  const miner = loadKeypair(MINER_KEYPAIR);
  const connection = new Connection(SOLANA_RPC_URL, "confirmed");
  const provider = new anchor.AnchorProvider(connection, new anchor.Wallet(miner), {
    commitment: "confirmed",
  });
  anchor.setProvider(provider);

  const registryPid = new PublicKey(DDNS_REGISTRY_PROGRAM_ID);
  const quorumPid = new PublicKey(DDNS_QUORUM_PROGRAM_ID);
  const stakePid = new PublicKey(DDNS_STAKE_PROGRAM_ID);
  const nsPid = new PublicKey(DDNS_NS_INCENTIVES_PROGRAM_ID);

  const registryIdl = loadIdlOrThrow("ddns_registry");
  const quorumIdl = loadIdlOrThrow("ddns_quorum");
  const stakeIdl = loadIdlOrThrow("ddns_stake");
  const nsIdl = loadIdlOrThrow("ddns_ns_incentives");

  const registryProgram = new anchor.Program(
    { ...(registryIdl as any), address: registryPid.toBase58() },
    provider
  );
  const quorumProgram = new anchor.Program(
    { ...(quorumIdl as any), address: quorumPid.toBase58() },
    provider
  );
  const stakeProgram = new anchor.Program(
    { ...(stakeIdl as any), address: stakePid.toBase58() },
    provider
  );
  const nsProgram = new anchor.Program(
    { ...(nsIdl as any), address: nsPid.toBase58() },
    provider
  );

  const [registryConfig] = PublicKey.findProgramAddressSync([Buffer.from("config")], registryPid);
  const [quorumAuthority] = PublicKey.findProgramAddressSync([Buffer.from("quorum_authority")], quorumPid);
  const [nsConfig] = PublicKey.findProgramAddressSync([Buffer.from("ns_config")], nsPid);

  async function getEpochLenSlotsOrDefault(defaultVal: number): Promise<number> {
    const cfg: any = await registryProgram.account.config.fetchNullable(registryConfig);
    if (!cfg) return defaultVal;
    const v = Number(cfg.epochLenSlots?.toString?.() ?? cfg.epochLenSlots);
    return Number.isFinite(v) && v > 0 ? v : defaultVal;
  }

  async function maybeBootstrap() {
    if (!BOOTSTRAP) return;

    const slot = await connection.getSlot("confirmed");
    const defaultEpochLen = Number(process.env.EPOCH_LEN_SLOTS || 100);
    const epochLenSlots = await getEpochLenSlotsOrDefault(defaultEpochLen);
    const epochId = Math.floor(slot / epochLenSlots);

    const qaInfo = await connection.getAccountInfo(quorumAuthority, "confirmed");
    if (!qaInfo) {
      const sig = await quorumProgram.methods
        .initQuorumAuthority()
        .accounts({ payer: miner.publicKey, quorumAuthority, systemProgram: SystemProgram.programId })
        .rpc();
      console.log("bootstrap:init_quorum_authority_tx", sig);
    }

    const cfgInfo = await connection.getAccountInfo(registryConfig, "confirmed");
    if (!cfgInfo) {
      const sig = await registryProgram.methods
        .initConfig(
          new BN(epochLenSlots),
          MIN_RECEIPTS,
          new BN(MIN_STAKE_WEIGHT.toString()),
          60,
          3600,
          quorumAuthority
        )
        .accounts({ authority: miner.publicKey, config: registryConfig, systemProgram: SystemProgram.programId })
        .rpc();
      console.log("bootstrap:init_registry_config_tx", sig);
    }

    const membersEnv = (process.env.VERIFIER_MEMBERS || miner.publicKey.toBase58()).split(",").map((s) => s.trim()).filter(Boolean);
    const members = membersEnv.map((s) => new PublicKey(s));

    const [verifierSet] = PublicKey.findProgramAddressSync(
      [Buffer.from("verifierset"), Buffer.from(new BN(epochId).toArrayLike(Buffer, "le", 8))],
      quorumPid
    );
    const vsInfo = await connection.getAccountInfo(verifierSet, "confirmed");
    if (!vsInfo) {
      const sig = await quorumProgram.methods
        .initVerifierSet(new BN(epochId), new BN(0), members)
        .accounts({ admin: miner.publicKey, verifierSet, systemProgram: SystemProgram.programId })
        .rpc();
      console.log("bootstrap:init_verifier_set_tx", sig);
    }
  }

  await maybeBootstrap();

  async function getStakeWeight(wallet: PublicKey): Promise<bigint> {
    try {
      const [stakePosition] = PublicKey.findProgramAddressSync(
        [Buffer.from("stake"), wallet.toBuffer()],
        stakePid
      );
      const pos: any = await stakeProgram.account.stakePosition.fetchNullable(stakePosition);
      if (!pos) return 0n;
      // Anchor BN -> string -> bigint
      return BigInt(pos.stakedAmount.toString());
    } catch {
      return 0n;
    }
  }

  const app = express();
  app.use(express.json({ limit: "2mb" }));

  app.get("/v1/health", (_req, res) => {
    res.json({
      ok: true,
      rpc: SOLANA_RPC_URL,
      miner: miner.publicKey.toBase58(),
      programs: {
        ddns_registry: registryPid.toBase58(),
        ddns_quorum: quorumPid.toBase58(),
        ddns_stake: stakePid.toBase58(),
        ddns_ns_incentives: nsPid.toBase58(),
      },
    });
  });

  app.post("/v1/submit-receipts", async (req, res) => {
    try {
      const body = req.body as SubmitReceiptsBody;
      if (!body || !Array.isArray(body.receipts) || body.receipts.length === 0) {
        return res.status(400).json({ ok: false, error: "missing receipts" });
      }

      const slot = await connection.getSlot("confirmed");
      const cfg: any = await registryProgram.account.config.fetchNullable(registryConfig);
      if (!cfg) throw new Error("ddns_registry config missing; run with BOOTSTRAP=1 once");
      const epochLenSlots = Number(cfg.epochLenSlots?.toString?.() ?? cfg.epochLenSlots);
      if (!Number.isFinite(epochLenSlots) || epochLenSlots <= 0) throw new Error("bad epoch_len_slots in config");
      const epochId = Math.floor(slot / epochLenSlots);
      const [verifierSet] = PublicKey.findProgramAddressSync(
        [Buffer.from("verifierset"), Buffer.from(new BN(epochId).toArrayLike(Buffer, "le", 8))],
        quorumPid
      );
      const vsInfo = await connection.getAccountInfo(verifierSet, "confirmed");
      if (!vsInfo) {
        const membersEnv = (process.env.VERIFIER_MEMBERS || miner.publicKey.toBase58())
          .split(",")
          .map((s) => s.trim())
          .filter(Boolean);
        const members = membersEnv.map((s) => new PublicKey(s));
        const sig = await quorumProgram.methods
          .initVerifierSet(new BN(epochId), new BN(0), members)
          .accounts({ admin: miner.publicKey, verifierSet, systemProgram: SystemProgram.programId })
          .rpc();
        console.log("tx_init_verifier_set", sig);
      }

      // Group receipts by (name_hash, dest_hash) for this epoch.
      type GroupKey = string; // hex(name_hash)||hex(dest_hash)
      const groups = new Map<GroupKey, { name_hash: Buffer; dest_hash: Buffer; ttl_s: number; receipts: ReceiptV1[] }>();

      for (const r of body.receipts) {
        const verified = verifyReceipt(r);
        const k = verified.name_hash.toString("hex") + ":" + verified.dest_hash.toString("hex");
        const g = groups.get(k);
        if (!g) {
          groups.set(k, { name_hash: verified.name_hash, dest_hash: verified.dest_hash, ttl_s: r.ttl_s, receipts: [r] });
        } else {
          g.receipts.push(r);
        }
      }

      const results: any[] = [];

      for (const g of groups.values()) {
        // Deduplicate by (wallet_pubkey, name_hash) within this batch.
        const seen = new Set<string>();
        const leaves: Buffer[] = [];
        let receiptCount = 0;
        let stakeWeight = 0n;

        for (const r of g.receipts) {
          const dedupeKey = r.wallet_pubkey + ":" + g.name_hash.toString("hex");
          if (seen.has(dedupeKey)) continue;
          seen.add(dedupeKey);
          receiptCount += 1;

          const msg = receiptMsgHash(r, g.name_hash, g.dest_hash);
          const sig = Buffer.from(r.signature, "base64");
          const leaf = sha256(
            Buffer.concat([
              new PublicKey(r.wallet_pubkey).toBuffer(),
              g.name_hash,
              g.dest_hash,
              Buffer.from(msg), // commits to canonical receipt bytes indirectly
              sig,
            ])
          );
          leaves.push(leaf);

          stakeWeight += await getStakeWeight(new PublicKey(r.wallet_pubkey));
        }

        const receiptsRoot = merkleRoot(leaves);

        const [agg] = PublicKey.findProgramAddressSync(
          [
            Buffer.from("agg"),
            Buffer.from(new BN(epochId).toArrayLike(Buffer, "le", 8)),
            g.name_hash,
            miner.publicKey.toBuffer(),
          ],
          quorumPid
        );

        // Submit stake snapshot (MVP: dummy root; total stake read from stake_config if available).
        let totalStake = 0n;
        try {
          const [stakeConfig] = PublicKey.findProgramAddressSync([Buffer.from("stake_config")], stakePid);
          const cfg: any = await stakeProgram.account.stakeConfig.fetchNullable(stakeConfig);
          if (cfg) totalStake = BigInt(cfg.totalStake.toString());
        } catch {
          totalStake = 0n;
        }

        const [stakeSnapshot] = PublicKey.findProgramAddressSync(
          [Buffer.from("stake_snapshot"), Buffer.from(new BN(epochId).toArrayLike(Buffer, "le", 8))],
          quorumPid
        );

        const snapInfo = await connection.getAccountInfo(stakeSnapshot, "confirmed");
        if (!snapInfo) {
          const sig = await quorumProgram.methods
            .submitStakeSnapshot(
              new BN(epochId),
              Array.from(Buffer.alloc(32, 0)),
              new BN(totalStake.toString())
            )
            .accounts({
              submitter: miner.publicKey,
              registryConfig,
              ddnsRegistryProgram: registryPid,
              verifierSet,
              stakeSnapshot,
              systemProgram: SystemProgram.programId,
            })
            .rpc();
          console.log("tx_submit_stake_snapshot", sig);
        }

        const sigAgg = await quorumProgram.methods
          .submitAggregate(
            new BN(epochId),
            Array.from(g.name_hash),
            Array.from(g.dest_hash),
            g.ttl_s,
            receiptCount,
            new BN(stakeWeight.toString()),
            Array.from(receiptsRoot)
          )
          .accounts({
            submitter: miner.publicKey,
            registryConfig,
            ddnsRegistryProgram: registryPid,
            verifierSet,
            aggregate: agg,
            systemProgram: SystemProgram.programId,
          })
          .rpc();
        console.log("tx_submit_aggregate", sigAgg);

        const [canonicalRoute] = PublicKey.findProgramAddressSync(
          [Buffer.from("canonical"), g.name_hash],
          registryPid
        );

        // Finalize if quorum thresholds met.
        const sigFin = await quorumProgram.methods
          .finalizeIfQuorum(
            new BN(epochId),
            Array.from(g.name_hash),
            Array.from(g.dest_hash),
            g.ttl_s
          )
          .accounts({
            payer: miner.publicKey,
            registryConfig,
            verifierSet,
            aggregate: agg,
            quorumAuthority,
            canonicalRoute,
            ddnsRegistryProgram: registryPid,
            systemProgram: SystemProgram.programId,
          })
          .rpc();
        console.log("tx_finalize_if_quorum", sigFin);

        const route: any = await registryProgram.account.canonicalRoute.fetchNullable(canonicalRoute);

        results.push({
          epoch_id: epochId,
          name_hash: g.name_hash.toString("hex"),
          dest_hash: g.dest_hash.toString("hex"),
          receipt_count: receiptCount,
          stake_weight: stakeWeight.toString(),
          receipts_root: receiptsRoot.toString("hex"),
          aggregate_pda: agg.toBase58(),
          canonical_route_pda: canonicalRoute.toBase58(),
          tx: { submit_aggregate: sigAgg, finalize: sigFin },
          canonical: route
            ? {
                version: route.version.toString(),
                updated_at_slot: route.updatedAtSlot.toString(),
                last_aggregate: route.lastAggregate.toBase58?.() ?? String(route.lastAggregate),
              }
            : null,
        });
      }

      res.json({ ok: true, results });
    } catch (e: any) {
      console.error("submit-receipts error:", e);
      res.status(400).json({ ok: false, error: e?.message || "bad_request" });
    }
  });

  app.post("/v1/submit-dns-query-receipts", async (req, res) => {
    try {
      const body = req.body as SubmitQueryReceiptsBody;
      if (!body || !Array.isArray(body.receipts) || body.receipts.length === 0) {
        return res.status(400).json({ ok: false, error: "missing receipts" });
      }

      const nsCfg: any = await nsProgram.account.nsConfig.fetchNullable(nsConfig);
      if (!nsCfg) throw new Error("ddns_ns_incentives config missing (init-config first)");
      const epochLenSlots = BigInt(nsCfg.epochLenSlots.toString());

      const slot = BigInt(await connection.getSlot("confirmed"));
      const epochId = slot / epochLenSlots;

      // Group by domain_hash.
      type GroupKey = string; // hex(domain_hash)
      const groups = new Map<GroupKey, { domain_hash: Buffer; receipts: QueryReceiptV1[] }>();

      for (const r of body.receipts) {
        const verified = verifyQueryReceipt(r);
        const k = verified.domain_hash.toString("hex");
        const g = groups.get(k);
        if (!g) groups.set(k, { domain_hash: verified.domain_hash, receipts: [r] });
        else g.receipts.push(r);
      }

      const results: any[] = [];

      for (const g of groups.values()) {
        // Deduplicate by wallet_pubkey for this domain+epoch.
        const seen = new Set<string>();
        const leaves: Buffer[] = [];
        let queryCount = 0n;

        for (const r of g.receipts) {
          if (seen.has(r.wallet_pubkey)) continue;
          seen.add(r.wallet_pubkey);
          queryCount += 1n;

          const msg = queryReceiptMsgHash(r, g.domain_hash);
          const sig = Buffer.from(r.signature, "base64");
          const leaf = sha256(
            Buffer.concat([new PublicKey(r.wallet_pubkey).toBuffer(), g.domain_hash, msg, sig])
          );
          leaves.push(leaf);
        }

        const receiptsRoot = merkleRoot(leaves);

        const [nsClaim] = PublicKey.findProgramAddressSync(
          [Buffer.from("ns_claim"), g.domain_hash],
          nsPid
        );
        const claimInfo = await connection.getAccountInfo(nsClaim, "confirmed");
        if (!claimInfo) {
          results.push({
            domain_hash: g.domain_hash.toString("hex"),
            skipped: true,
            reason: "no ns_claim",
          });
          continue;
        }

        const [epochUsage] = PublicKey.findProgramAddressSync(
          [
            Buffer.from("ns_usage"),
            g.domain_hash,
            Buffer.from(new BN(epochId.toString()).toArrayLike(Buffer, "le", 8)),
          ],
          nsPid
        );

        const sig = await nsProgram.methods
          .submitUsageAggregate(
            Array.from(g.domain_hash),
            new BN(epochId.toString()),
            new BN(queryCount.toString()),
            Array.from(receiptsRoot),
            new BN(slot.toString())
          )
          .accounts({
            nsConfig,
            nsClaim,
            epochUsage,
            attestor: miner.publicKey,
            systemProgram: SystemProgram.programId,
          })
          .rpc();

        results.push({
          epoch_id: epochId.toString(),
          domain_hash: g.domain_hash.toString("hex"),
          query_count: queryCount.toString(),
          receipts_root: receiptsRoot.toString("hex"),
          ns_claim_pda: nsClaim.toBase58(),
          epoch_usage_pda: epochUsage.toBase58(),
          tx_submit_usage_aggregate: sig,
        });
      }

      res.json({ ok: true, results });
    } catch (e: any) {
      console.error("submit-dns-query-receipts error:", e);
      res.status(400).json({ ok: false, error: e?.message || "bad_request" });
    }
  });

  app.listen(PORT, () => {
    console.log(`miner-witness listening on ${PORT}`);
    console.log("miner_pubkey", miner.publicKey.toBase58());
  });
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
