import type { Adapter } from "./adapter.js";

function unimplemented(kind: any): Adapter {
  return {
    kind,
    resolve: async () => {
      throw new Error(`ADAPTER_NOT_IMPLEMENTED:${String(kind)}`);
    }
  };
}

export function handshakeAdapterStub(): Adapter {
  return unimplemented("handshake");
}

export function filecoinAdapterStub(): Adapter {
  return unimplemented("filecoin");
}

export function arweaveAdapterStub(): Adapter {
  return unimplemented("arweave");
}
