import type { RouteAnswer } from "./types.js";

export interface Adapter {
  kind: RouteAnswer["source"]["kind"];
  resolve(input: {
    name: string;
    nowUnix?: number;
    network?: string; // devnet/mainnet/chain id
    opts?: Record<string, any>;
  }): Promise<RouteAnswer | null>;
}

