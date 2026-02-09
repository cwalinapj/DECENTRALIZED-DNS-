import type { RouteAnswer } from "./types.js";

export type AdapterResolveInput = {
  name: string;
  nowUnix?: number;
  network?: string; // devnet/mainnet/chain id
  opts?: Record<string, any>;
};

export interface Adapter {
  kind: RouteAnswer["source"]["kind"];
  resolve(input: AdapterResolveInput): Promise<RouteAnswer | null>;
}
