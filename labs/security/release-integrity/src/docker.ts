import { execFileSync } from "node:child_process";

/**
 * Returns the repo digest string for an image, e.g.:
 * "repo/name@sha256:...."
 *
 * We prefer RepoDigests[0]. If missing, we fail.
 */
export function getImageRepoDigest(imageRef: string): string {
  const out = execFileSync("docker", ["image", "inspect", imageRef, "--format", "{{json .RepoDigests}}"], {
    encoding: "utf8"
  }).trim();

  let arr: string[] = [];
  try {
    arr = JSON.parse(out);
  } catch {
    throw new Error(`failed to parse docker inspect: ${out.slice(0, 120)}`);
  }
  if (!arr || arr.length === 0) throw new Error(`no RepoDigests for image: ${imageRef} (is it pulled/tagged?)`);
  return arr[0];
}
