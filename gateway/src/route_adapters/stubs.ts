import type { RouteAdapter } from "./adapter.js";

function unimplemented(kind: any): RouteAdapter {
  return {
    kind,
    supports: () => false,
    resolve: async () => {
      throw new Error(`ADAPTER_NOT_IMPLEMENTED:${String(kind)}`);
    }
  };
}

export function handshakeAdapterStub(): RouteAdapter {
  return unimplemented("handshake");
}

export function filecoinAdapterStub(): RouteAdapter {
  return unimplemented("filecoin");
}

export function arweaveAdapterStub(): RouteAdapter {
  return unimplemented("arweave");
}

