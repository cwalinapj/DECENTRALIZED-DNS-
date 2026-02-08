import { getImageRepoDigest } from "./docker.js";
import { blake3_256, utf8, hex0x } from "./blake3.js";
import { componentIdHex } from "./ids.js";
import { getApprovedBuild, normalizeAddr } from "./evm_rpc.js";

export type VerifyImageResult = {
  component: string;
  componentId: string;
  image: string;
  repoDigest: string;
  localBuildHash: string;     // 0x..
  approvedBuildHash: string;  // 0x..
  approvedVersion: number;
  ok: boolean;
  updatedAt: number;
};

export async function verifyImageAgainstChain(opts: {
  component: string;
  image: string;
  rpcUrl: string;
  buildRegistry: string;
}): Promise<VerifyImageResult> {
  const component = opts.component;
  const componentId = componentIdHex(component);
  const repoDigest = getImageRepoDigest(opts.image);

  const local = blake3_256(utf8(repoDigest));
  const localBuildHash = hex0x(local);

  const reg = normalizeAddr(opts.buildRegistry);
  const approved = await getApprovedBuild(opts.rpcUrl, reg, componentId);

  const ok = approved.buildHash.toLowerCase() === localBuildHash.toLowerCase();

  return {
    component,
    componentId,
    image: opts.image,
    repoDigest,
    localBuildHash,
    approvedBuildHash: approved.buildHash,
    approvedVersion: approved.version,
    ok,
    updatedAt: approved.updatedAt
  };
}
