import { execFileSync } from "node:child_process";
import { listContainers, inspectContainer } from "./docker.js";
import { componentId, getApprovedBuild, localBuildHashFromRepoDigest } from "./evm_build_registry.js";

export type IntegrityComponentResult = {
  component: string;
  image: string;
  containerId?: string;
  state?: string;
  health?: string;
  exitCode?: number;
  repoDigest?: string;
  localBuildHash?: string;
  approvedBuildHash?: string;
  approvedVersion?: number;
  ok: boolean;
  problems: string[];
};

export type IntegritySnapshot = {
  ok: boolean;
  time: number;
  components: IntegrityComponentResult[];
};

function getRepoDigest(imageRef: string): string {
  const out = execFileSync("docker", ["image", "inspect", imageRef, "--format", "{{json .RepoDigests}}"], { encoding: "utf8" }).trim();
  const arr = JSON.parse(out);
  if (!arr?.length) throw new Error(`no RepoDigests for ${imageRef}`);
  return arr[0];
}

function findContainer(containers: any[], hint: string): any | undefined {
  return containers.find(c => (c.Names || []).some((n: string) => n.includes(`ddns-${hint}`) || n.includes(hint)));
}

export async function runIntegrityChecks(opts: {
  rpcUrl: string;
  buildRegistry: string;
  components: Array<{ component: string; image: string }>;
}): Promise<IntegritySnapshot> {
  const containers = await listContainers();
  const results: IntegrityComponentResult[] = [];

  for (const c of opts.components) {
    const problems: string[] = [];
    const r: IntegrityComponentResult = { component: c.component, image: c.image, ok: true, problems };

    // container status
    const match = findContainer(containers, c.component);
    if (!match) {
      r.ok = false;
      problems.push("container_not_found");
    } else {
      r.containerId = match.Id;
      const insp = await inspectContainer(match.Id);
      r.state = insp?.State?.Status;
      r.health = insp?.State?.Health?.Status ?? "none";
      r.exitCode = insp?.State?.ExitCode;

      if (r.state !== "running") { r.ok = false; problems.push(`state_${r.state}`); }
      if (r.health === "unhealthy") { r.ok = false; problems.push("health_unhealthy"); }
    }

    // build hash check
    try {
      const cid = componentId(c.component);
      const approved = await getApprovedBuild(opts.rpcUrl, opts.buildRegistry, cid);

      r.approvedBuildHash = approved.buildHash;
      r.approvedVersion = approved.version;

      const repoDigest = getRepoDigest(c.image);
      r.repoDigest = repoDigest;

      const localHash = localBuildHashFromRepoDigest(repoDigest);
      r.localBuildHash = localHash;

      if (approved.buildHash.toLowerCase() !== localHash.toLowerCase()) {
        r.ok = false;
        problems.push("build_hash_mismatch");
      }
    } catch (e: any) {
      r.ok = false;
      problems.push(`build_check_error:${String(e?.message || e)}`);
    }

    results.push(r);
  }

  const okAll = results.every(x => x.ok);
  return { ok: okAll, time: Math.floor(Date.now() / 1000), components: results };
}
