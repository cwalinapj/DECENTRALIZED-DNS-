import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import http from "node:http";
import * as anchor from "@coral-xyz/anchor";
import { PublicKey, Keypair, SystemProgram } from "@solana/web3.js";

type DnsAnswer = { name: string; type: number; TTL: number; data: string };
type ReceiptLike = { name: string; name_hash: string; rrset_hash: string; colo?: string };

function loadKeypair(filePath: string): Keypair {
  return Keypair.fromSecretKey(Uint8Array.from(JSON.parse(fs.readFileSync(filePath, "utf8"))));
}

function sha256(buf: Buffer): Buffer {
  return crypto.createHash("sha256").update(buf).digest();
}

function nameHash(name: string): Buffer {
  return sha256(Buffer.from(name.trim().toLowerCase(), "utf8"));
}

function rrsetHash(answers: DnsAnswer[]): Buffer {
  const canon = answers
    .map((a) => `${a.name.toLowerCase()}|${a.type}|${a.data}|${a.TTL}`)
    .sort()
    .join("\n");
  return sha256(Buffer.from(canon, "utf8"));
}

function merkleRoot(leaves: Buffer[]): Buffer {
  if (leaves.length === 0) return Buffer.alloc(32, 0);
  let level = leaves.map((l) => sha256(l));
  while (level.length > 1) {
    const next: Buffer[] = [];
    for (let i = 0; i < level.length; i += 2) {
      const a = level[i];
      const b = i + 1 < level.length ? level[i + 1] : a;
      next.push(sha256(Buffer.concat([a, b])));
    }
    level = next;
  }
  return level[0];
}

async function dohResolve(upstream: string, name: string, qtype: string): Promise<DnsAnswer[]> {
  const u = new URL(upstream);
  u.searchParams.set("name", name);
  u.searchParams.set("type", qtype);
  const r = await fetch(u.toString(), { headers: { accept: "application/dns-json" } });
  if (!r.ok) throw new Error(`upstream_${r.status}`);
  const j: any = await r.json();
  return Array.isArray(j?.Answer) ? j.Answer : [];
}

function readProgramIdFromAnchorToml(rpcUrl: string): string | null {
  const p = path.resolve(process.cwd(), "../../solana/Anchor.toml");
  if (!fs.existsSync(p)) return null;
  const content = fs.readFileSync(p, "utf8");
  const section = /localhost|127\.0\.0\.1/.test(rpcUrl) ? "programs.localnet" : "programs.devnet";
  const re = new RegExp(`\\[${section}\\][^\\[]*?ddns_rep\\s*=\\s*\"([^\"]+)\"`, "s");
  const m = content.match(re);
  return m ? m[1] : null;
}

function loadRepIdl() {
  const p = path.resolve(process.cwd(), "../../solana/target/idl/ddns_rep.json");
  if (!fs.existsSync(p)) throw new Error(`missing idl at ${p}; run anchor build in solana/ first`);
  return JSON.parse(fs.readFileSync(p, "utf8"));
}

function leavesFromReceipts(receipts: ReceiptLike[]): { leaves: Buffer[]; uniqueNames: number; uniqueColos: number } {
  const leaves = receipts.map((r) => {
    const nh = /^[0-9a-fA-F]{64}$/.test(r.name_hash)
      ? Buffer.from(r.name_hash, "hex")
      : nameHash(r.name);
    const dh = /^[0-9a-fA-F]{64}$/.test(r.rrset_hash)
      ? Buffer.from(r.rrset_hash, "hex")
      : sha256(Buffer.from(r.rrset_hash, "utf8"));
    const colo = sha256(Buffer.from(r.colo || "unknown", "utf8"));
    return Buffer.concat([nh, dh, colo]);
  });
  const uniqueNames = new Set(receipts.map((r) => r.name_hash || r.name.toLowerCase())).size;
  const uniqueColos = new Set(receipts.map((r) => r.colo || "unknown")).size;
  return { leaves, uniqueNames, uniqueColos };
}

async function submitAward(
  program: any,
  wallet: Keypair,
  epochId: number,
  leaves: Buffer[],
  uniqueNames: number,
  uniqueColos: number,
) {
  const [configPda] = PublicKey.findProgramAddressSync([Buffer.from("rep_config")], program.programId);
  const [bondPda] = PublicKey.findProgramAddressSync([Buffer.from("rep_bond"), wallet.publicKey.toBuffer()], program.programId);
  const [repPda] = PublicKey.findProgramAddressSync([Buffer.from("miner_rep"), wallet.publicKey.toBuffer()], program.programId);
  const [capsPda] = PublicKey.findProgramAddressSync([Buffer.from("miner_caps"), wallet.publicKey.toBuffer()], program.programId);

  const root = merkleRoot(leaves);
  const sig = await program.methods
    .awardRep(new anchor.BN(epochId), [...root], leaves.length, uniqueNames, uniqueColos)
    .accounts({
      miner: wallet.publicKey,
      config: configPda,
      bond: bondPda,
      rep: repPda,
      caps: capsPda,
      systemProgram: SystemProgram.programId,
    })
    .signers([wallet])
    .rpc();

  return { sig, root: root.toString("hex"), repPda: repPda.toBase58() };
}

async function main() {
  const RPC_URL = process.env.SOLANA_RPC_URL || process.env.ANCHOR_PROVIDER_URL || "https://api.devnet.solana.com";
  const WALLET = process.env.MINER_WALLET || process.env.ANCHOR_WALLET || path.join(process.env.HOME || ".", ".config/solana/id.json");
  const PROGRAM_ID = process.env.DDNS_REP_PROGRAM_ID || readProgramIdFromAnchorToml(RPC_URL);
  const NAMES = (process.env.MINER_NAMES || "example.com,netflix.com,cloudflare.com")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  const QTYPE = process.env.MINER_QTYPE || "A";
  const COLO = process.env.MINER_COLO || "local-node";
  const DOH = (process.env.RECURSIVE_UPSTREAMS || "https://cloudflare-dns.com/dns-query,https://dns.google/resolve")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  const SERVE = process.env.MINER_HTTP === "1";
  const PORT = Number(process.env.MINER_HTTP_PORT || "8789");

  if (!PROGRAM_ID) throw new Error("missing DDNS_REP_PROGRAM_ID");

  const wallet = loadKeypair(WALLET);
  const conn = new anchor.web3.Connection(RPC_URL, "confirmed");
  const provider = new anchor.AnchorProvider(conn, new anchor.Wallet(wallet), { commitment: "confirmed" });
  anchor.setProvider(provider);
  const idl: any = loadRepIdl();
  idl.address = PROGRAM_ID;
  const program: any = new (anchor as any).Program(idl, provider);

  if (SERVE) {
    const server = http.createServer(async (req, res) => {
      if (req.method === "POST" && req.url === "/v1/submit") {
        try {
          const body = await new Promise<string>((resolve, reject) => {
            let data = "";
            req.on("data", (c) => (data += String(c)));
            req.on("end", () => resolve(data));
            req.on("error", reject);
          });
          const parsed = JSON.parse(body || "{}");
          const receipts: ReceiptLike[] = Array.isArray(parsed?.receipts) ? parsed.receipts : [];
          if (!receipts.length) {
            res.writeHead(400, { "content-type": "application/json" });
            res.end(JSON.stringify({ error: "missing receipts" }));
            return;
          }
          const { leaves, uniqueNames, uniqueColos } = leavesFromReceipts(receipts);
          const cfg: any = await program.account.repConfig.fetch(
            PublicKey.findProgramAddressSync([Buffer.from("rep_config")], program.programId)[0]
          );
          const slot = await conn.getSlot("confirmed");
          const epochId = Math.floor(slot / Number(cfg.epochLenSlots));
          const out = await submitAward(program, wallet, epochId, leaves, uniqueNames, uniqueColos);
          res.writeHead(200, { "content-type": "application/json" });
          res.end(JSON.stringify({ ok: true, epochId, ...out, receipts: receipts.length, uniqueNames, uniqueColos }));
        } catch (e: any) {
          res.writeHead(500, { "content-type": "application/json" });
          res.end(JSON.stringify({ ok: false, error: String(e?.message || e) }));
        }
        return;
      }
      res.writeHead(200, { "content-type": "application/json" });
      res.end(JSON.stringify({ ok: true, mode: "miner-node" }));
    });
    server.listen(PORT, () => {
      console.log(`miner-node relay listening on :${PORT}`);
    });
    return;
  }

  const leaves: Buffer[] = [];
  let resolved = 0;
  for (const n of NAMES) {
    for (const upstream of DOH) {
      try {
        const answers = await dohResolve(upstream, n, QTYPE);
        if (!answers.length) continue;
        leaves.push(Buffer.concat([nameHash(n), rrsetHash(answers), sha256(Buffer.from(COLO, "utf8"))]));
        resolved += 1;
        break;
      } catch {
        // try next upstream
      }
    }
  }

  if (leaves.length === 0) throw new Error("no dns observations to submit");

  const cfg: any = await program.account.repConfig.fetch(
    PublicKey.findProgramAddressSync([Buffer.from("rep_config")], program.programId)[0]
  );
  const slot = await conn.getSlot("confirmed");
  const epochId = Math.floor(slot / Number(cfg.epochLenSlots));

  const out = await submitAward(program, wallet, epochId, leaves, new Set(NAMES).size, 1);
  console.log(JSON.stringify({ tx: out.sig, epochId, root: out.root, resolved, uniqueNames: new Set(NAMES).size, uniqueColos: 1, repPda: out.repPda }, null, 2));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
