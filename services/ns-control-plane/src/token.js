import crypto from "node:crypto";

export function createVerificationToken(domain) {
  const rand = crypto.randomBytes(16).toString("hex");
  const hash = crypto.createHash("sha256").update(`${domain}:${rand}`).digest("hex");
  return hash.slice(0, 32);
}
