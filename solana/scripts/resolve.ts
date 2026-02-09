import yargs from "yargs";
import { hideBin } from "yargs/helpers";
import crypto from "node:crypto";
import { Connection, PublicKey } from "@solana/web3.js";

type PolicyStatus = "OK" | "WARN" | "QUARANTINE";

type RouteAnswer = {
  name: string;
  nameHashHex: string;
  dest: string;
  destHashHex: string;
  ttlS: number;
  source: {
    kind: "pkdns" | "ens" | "sns" | "handshake" | "ipfs" | "filecoin" | "arweave";
    ref: string;
    confidenceBps: number;
    policy?: { status: PolicyStatus; flags: number; penaltyBps: number; recommendedTtlCap?: number };
  };
  proof: { type: "onchain" | "merkle" | "signature" | "none"; payload: any };
};

function sha256Bytes(s: string): Buffer {
  return crypto.createHash("sha256").update(Buffer.from(s, "utf8")).digest();
}
function sha256Hex(s: string): string {
  return `0x${sha256Bytes(s).toString("hex")}`;
}
function normalizeName(name: string): string {
  return name.trim().toLowerCase().replace(/\.$/, "");
}
function normalizeDest(dest: string): string {
  return dest.trim();
}
function destHashHex(dest: string): string {
  return sha256Hex(normalizeDest(dest));
}

async function main() {
  const argv = await yargs(hideBin(process.argv))
    .option("name", { type: "string", demandOption: true })
    .option("source", { type: "string", choices: ["auto", "pkdns", "ens", "sns", "ipfs"] as const, default: "auto" })
    .option("rpc", { type: "string", default: process.env.SOLANA_RPC_URL || "https://api.devnet.solana.com" })
    .option("ddns-registry-program-id", { type: "string", default: process.env.DDNS_REGISTRY_PROGRAM_ID || "" })
    .option("ddns-watchdog-policy-program-id", { type: "string", default: process.env.DDNS_WATCHDOG_POLICY_PROGRAM_ID || "" })
    .option("evm-rpc", { type: "string", default: process.env.EVM_RPC_URL || "" })
    .option("evm-chain-id", { type: "number", default: Number(process.env.EVM_CHAIN_ID || "1") })
    .option("dest", { type: "string", describe: "optional dest string to validate against on-chain dest_hash (PKDNS)" })
    .strict()
    .parse();

  const name = normalizeName(argv.name);

  if (argv.source === "auto" && name.endsWith(".dns")) {
    const ans = await resolvePkdns(name, argv.rpc, argv["ddns-registry-program-id"], argv["ddns-watchdog-policy-program-id"], argv.dest || "");
    process.stdout.write(JSON.stringify(ans, null, 2) + "\n");
    return;
  }

  if (argv.source === "pkdns") {
    const ans = await resolvePkdns(name, argv.rpc, argv["ddns-registry-program-id"], argv["ddns-watchdog-policy-program-id"], argv.dest || "");
    process.stdout.write(JSON.stringify(ans, null, 2) + "\n");
    return;
  }

  if (argv.source === "ipfs" || (argv.source === "auto" && name.startsWith("ipfs://"))) {
    const ans = resolveIpfs(name);
    process.stdout.write(JSON.stringify(ans, null, 2) + "\n");
    return;
  }

  if (argv.source === "ens" || (argv.source === "auto" && name.endsWith(".eth"))) {
    const ans = await resolveEns(name, argv["evm-rpc"], argv["evm-chain-id"]);
    process.stdout.write(JSON.stringify(ans, null, 2) + "\n");
    return;
  }

  if (argv.source === "sns" || (argv.source === "auto" && name.endsWith(".sol"))) {
    const ans = await resolveSns(name, argv.rpc);
    process.stdout.write(JSON.stringify(ans, null, 2) + "\n");
    return;
  }

  throw new Error("NO_ADAPTER_MATCH");
}

async function resolvePkdns(
  name: string,
  rpcUrl: string,
  registryProgramIdStr: string,
  policyProgramIdStr: string,
  destOverride: string
): Promise<RouteAnswer> {
  if (!registryProgramIdStr) throw new Error("DDNS_REGISTRY_PROGRAM_ID_MISSING");
  const registryProgramId = new PublicKey(registryProgramIdStr);
  const conn = new Connection(rpcUrl, "confirmed");

  const nameHash = sha256Bytes(name);
  const [canonicalPda] = PublicKey.findProgramAddressSync([Buffer.from("canonical"), nameHash], registryProgramId);
  const ctx = await conn.getAccountInfoAndContext(canonicalPda, "confirmed");
  if (!ctx.value?.data) throw new Error("NOT_FOUND");

  const decoded = decodeCanonicalRoute(ctx.value.data);
  if (!Buffer.from(decoded.nameHash).equals(nameHash)) throw new Error("PKDNS_NAME_HASH_MISMATCH");

  let dest = "";
  if (destOverride) {
    const dh = sha256Bytes(normalizeDest(destOverride));
    if (Buffer.from(decoded.destHash).equals(dh)) dest = normalizeDest(destOverride);
  }

  const policy = policyProgramIdStr ? await tryFetchPolicy(conn, policyProgramIdStr, nameHash) : null;

  return {
    name,
    nameHashHex: sha256Hex(name),
    dest,
    destHashHex: `0x${Buffer.from(decoded.destHash).toString("hex")}`,
    ttlS: decoded.ttlS,
    source: {
      kind: "pkdns",
      ref: canonicalPda.toBase58(),
      confidenceBps: 10000,
      ...(policy ? { policy } : {})
    },
    proof: {
      type: "onchain",
      payload: {
        programId: registryProgramId.toBase58(),
        canonicalPda: canonicalPda.toBase58(),
        slot: ctx.context.slot,
        fields: {
          ttlS: decoded.ttlS,
          version: decoded.version.toString(),
          updatedAtSlot: decoded.updatedAtSlot.toString()
        }
      }
    }
  };
}

function decodeCanonicalRoute(data: Buffer | Uint8Array) {
  const buf = Buffer.from(data);
  let off = 8;
  const nameHash = buf.subarray(off, off + 32); off += 32;
  const destHash = buf.subarray(off, off + 32); off += 32;
  const ttlS = buf.readUInt32LE(off); off += 4;
  const version = buf.readBigUInt64LE(off); off += 8;
  const updatedAtSlot = buf.readBigUInt64LE(off); off += 8;
  off += 32; // last_aggregate
  off += 1; // bump
  return { nameHash, destHash, ttlS, version, updatedAtSlot };
}

async function tryFetchPolicy(conn: Connection, policyProgramIdStr: string, nameHash: Buffer) {
  const programId = new PublicKey(policyProgramIdStr);
  const [pda] = PublicKey.findProgramAddressSync([Buffer.from("name_policy"), nameHash], programId);
  const ctx = await conn.getAccountInfoAndContext(pda, "confirmed");
  if (!ctx.value?.data) return null;
  const buf = Buffer.from(ctx.value.data);
  let off = 8;
  off += 32;
  const statusU8 = buf.readUInt8(off); off += 1;
  const confidenceBps = buf.readUInt16LE(off); off += 2;
  const flags = buf.readUInt32LE(off); off += 4;
  off += 8;
  off += 8;
  off += 4;
  off += 4;
  off += 4;
  off += 2;
  const penaltyBps = buf.readUInt16LE(off); off += 2;
  const recommendedTtlCap = buf.readUInt32LE(off); off += 4;
  const status = statusU8 === 2 ? "QUARANTINE" : statusU8 === 1 ? "WARN" : "OK";
  return { status, confidenceBps, flags, penaltyBps, ...(recommendedTtlCap ? { recommendedTtlCap } : {}) };
}

function resolveIpfs(name: string): RouteAnswer {
  const cid = name.startsWith("ipfs://") ? name.slice("ipfs://".length).split(/[/?#]/)[0] : "";
  if (!cid) throw new Error("NOT_FOUND");
  const dest = `ipfs://${cid}`;
  return {
    name: `ipfs:${cid}`,
    nameHashHex: sha256Hex(`ipfs:${cid}`),
    dest,
    destHashHex: destHashHex(dest),
    ttlS: 3600,
    source: { kind: "ipfs", ref: cid, confidenceBps: 10000 },
    proof: { type: "none", payload: { cid } }
  };
}

async function resolveEns(name: string, rpcUrl: string, chainId: number): Promise<RouteAnswer> {
  if (!rpcUrl) throw new Error("EVM_RPC_URL_MISSING");
  const { Interface, namehash } = await import("ethers");
  const ENS_REGISTRY = "0x00000000000C2E074eC69A0dFb2997BA6C7d2e1e";
  const resolverIface = new Interface(["function resolver(bytes32 node) view returns (address)"]);
  const addrIface = new Interface(["function addr(bytes32 node) view returns (address)"]);
  const contentIface = new Interface(["function contenthash(bytes32 node) view returns (bytes)"]);
  const textIface = new Interface(["function text(bytes32 node, string key) view returns (string)"]);

  const node = namehash(name.toLowerCase());
  const resolverAddress = await ethCall(rpcUrl, ENS_REGISTRY, resolverIface.encodeFunctionData("resolver", [node]));
  if (!resolverAddress || resolverAddress === "0x0000000000000000000000000000000000000000") throw new Error("NOT_FOUND");

  const records: any = { resolver: resolverAddress };

  const addr = await ethCall(rpcUrl, resolverAddress, addrIface.encodeFunctionData("addr", [node]));
  const content = await ethCall(rpcUrl, resolverAddress, contentIface.encodeFunctionData("contenthash", [node]));
  let url = "";
  try {
    const raw = await ethCall(rpcUrl, resolverAddress, textIface.encodeFunctionData("text", [node, "url"]));
    url = String(textIface.decodeFunctionResult("text", raw)?.[0] || "");
  } catch {
    // ignore
  }

  const dest =
    content && content !== "0x" ? `ens:contenthash:${content}` :
      url ? url :
        addr && addr !== "0x0000000000000000000000000000000000000000" ? `eip155:${chainId}:${addr}` :
          "ens:records";

  return {
    name: name.toLowerCase(),
    nameHashHex: sha256Hex(name.toLowerCase()),
    dest,
    destHashHex: destHashHex(dest),
    ttlS: 300,
    source: { kind: "ens", ref: "eth_call", confidenceBps: 8000 },
    proof: { type: "onchain", payload: { chainId, resolver: resolverAddress, addr, contenthash: content, textUrl: url } }
  };
}

async function ethCall(rpcUrl: string, to: string, data: string): Promise<string> {
  const payload = { jsonrpc: "2.0", id: 1, method: "eth_call", params: [{ to, data }, "latest"] };
  const res = await fetch(rpcUrl, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(payload) });
  if (!res.ok) throw new Error("EVM_RPC_ERROR");
  const body = await res.json();
  if (body.error) throw new Error("EVM_RPC_ERROR");
  return body.result;
}

async function resolveSns(name: string, rpcUrl: string): Promise<RouteAnswer> {
  // MVP: read-only placeholder (gateway has a richer SNS parser).
  const dest = `sns:${name}`;
  return {
    name: name.toLowerCase(),
    nameHashHex: sha256Hex(name.toLowerCase()),
    dest,
    destHashHex: destHashHex(dest),
    ttlS: 300,
    source: { kind: "sns", ref: "rpc", confidenceBps: 1000 },
    proof: { type: "none", payload: { rpcUrl: "<configured>" } }
  };
}

main().catch((err) => {
  process.stderr.write(String(err?.message || err) + "\n");
  process.exit(1);
});
