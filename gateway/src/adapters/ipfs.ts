import type { Adapter } from "./shim.js";
import type { RouteAnswer } from "./types.js";
import { destHashHex, nameHashHex, normalizeDest, sha256Hex } from "./types.js";

export type IpfsAdapterConfig = {
  httpGateways: string[]; // base urls like https://ipfs.io/ipfs
};

export function createIpfsAdapter(cfg: IpfsAdapterConfig): Adapter {
  return {
    kind: "ipfs",
    async resolve(input) {
      const name = input?.name ?? "";
      const cid = extractCid(name.trim());
      if (!cid) return null;

      const dest = `ipfs://${cid}`;
      const proof: any = { cid, gateways: cfg.httpGateways };

      const doHead = !!input?.opts?.ipfsHead;
      if (doHead) {
        proof.head = await headAny(cfg.httpGateways, cid, Number(input?.opts?.timeoutMs ?? 5000));
      }

      return {
        name: `ipfs:${cid}`,
        nameHashHex: sha256Hex(`ipfs:${cid}`),
        dest,
        destHashHex: destHashHex(dest),
        ttlS: Number(input?.opts?.ttlS ?? 3600),
        source: { kind: "ipfs", ref: cid, confidenceBps: 10000 },
        proof: { type: "none", payload: proof }
      };
    }
  };
}

function extractCid(ref: string): string | null {
  if (ref.startsWith("ipfs://")) {
    const rest = ref.slice("ipfs://".length);
    const cid = rest.split(/[/?#]/)[0];
    return isCidLike(cid) ? cid : null;
  }
  if (isCidLike(ref)) return ref;
  return null;
}

function isCidLike(s: string): boolean {
  if (/^bafy[0-9a-z]{20,}$/i.test(s)) return true;
  if (/^Qm[1-9A-HJ-NP-Za-km-z]{40,}$/i.test(s)) return true;
  return false;
}

async function headAny(gateways: string[], cid: string, timeoutMs: number) {
  const results: any[] = [];
  for (const base of gateways) {
    const url = `${base.replace(/\/$/, "")}/${cid}`;
    try {
      const controller = new AbortController();
      const t = setTimeout(() => controller.abort(), timeoutMs);
      try {
        const res = await fetch(url, { method: "HEAD", signal: controller.signal });
        results.push({ url, ok: res.ok, status: res.status, headers: { "content-length": res.headers.get("content-length") } });
        if (res.ok) return { selected: url, results };
      } finally {
        clearTimeout(t);
      }
    } catch (err: any) {
      results.push({ url, ok: false, error: String(err?.message || err) });
    }
  }
  return { selected: null, results };
}

