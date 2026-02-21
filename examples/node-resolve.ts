import { resolveOrThrow } from "../packages/sdk/src/index.ts";

async function main(): Promise<void> {
  const baseUrl = process.env.GATEWAY_BASE_URL || "http://127.0.0.1:8054";
  const name = process.env.NAME || "netflix.com";
  const type = (process.env.TYPE as "A" | "AAAA" | undefined) || "A";

  const out = await resolveOrThrow({ baseUrl, name, type });
  console.log(`name=${out.name} type=${out.type}`);
  console.log(`confidence=${out.confidence}`);
  console.log(`rrset_hash=${out.rrset_hash}`);
  console.log(`answers=${out.answers.length}`);
  console.log(`upstreams_used=${(out.upstreams_used || []).length}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
