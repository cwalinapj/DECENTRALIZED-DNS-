import type { RouteAnswer } from "./types.js";

export type AdapterResolveOptions = {
  timeoutMs: number;
};

export type RouteAdapter = {
  kind: RouteAnswer["source"]["kind"];
  supports(nameOrRef: string): boolean;
  resolve(nameOrRef: string, opts: AdapterResolveOptions): Promise<RouteAnswer | null>;
};

