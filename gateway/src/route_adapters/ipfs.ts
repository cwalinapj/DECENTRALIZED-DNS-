import type { Adapter } from "./adapter.js";
import type { RouteAnswer } from "./types.js";
import { destHashHex, sha256Hex } from "./types.js";

type IpfsConfig = {
  httpGatewayBaseUrl: string; // e.g. https://ipfs.io/ipfs
};

export function ipfsAdapter(config: IpfsConfig): Adapter {
  return {
    kind: "ipfs",
    resolve: async (input) => {
      const name = input?.name ?? "";
      if (!name) return null;
      if (!isIpfsRef(name)) return null;
      return resolveIpfs(name, config);
    }
  };
}

function resolveIpfs(ref: string, config: IpfsConfig): RouteAnswer | null {
  const trimmed = ref.trim();
  const cid = extractCid(trimmed);
  if (!cid) return null;

  const name = `ipfs:${cid}`;
  const dest = `ipfs://${cid}`;
  const httpUrl = `${config.httpGatewayBaseUrl.replace(/\/$/, "")}/${cid}`;

  return {
    name,
    nameHashHex: sha256Hex(name),
    dest,
    destHashHex: destHashHex(dest),
    ttlS: 3600,
    source: {
      kind: "ipfs",
      ref: cid,
      confidenceBps: 10000
    },
    proof: {
      type: "none",
      payload: {
        cid,
        httpGatewayUrl: httpUrl
      }
    }
  };
}

function isIpfsRef(ref: string): boolean {
  return !!extractCid(ref.trim());
}

function extractCid(ref: string): string | null {
  if (ref.startsWith("ipfs://")) {
    const rest = ref.slice("ipfs://".length);
    const cid = rest.split(/[/?#]/)[0];
    return isCidLike(cid) ? cid : null;
  }
  // bare CID
  if (isCidLike(ref)) return ref;
  return null;
}

function isCidLike(s: string): boolean {
  // MVP: accept CIDv1 base32 (bafy...) and CIDv0 base58 (Qm...).
  if (/^bafy[0-9a-z]{20,}$/i.test(s)) return true;
  if (/^Qm[1-9A-HJ-NP-Za-km-z]{40,}$/i.test(s)) return true;
  return false;
}
