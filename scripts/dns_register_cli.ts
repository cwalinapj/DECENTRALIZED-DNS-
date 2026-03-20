import yargs from "yargs";
import { hideBin } from "yargs/helpers";

type JsonValue = Record<string, unknown>;

async function getJson(baseUrl: string, path: string, init?: RequestInit): Promise<{ ok: boolean; status: number; body: JsonValue }> {
  const res = await fetch(`${baseUrl.replace(/\/$/, "")}${path}`, init);
  const body = (await res.json().catch(() => ({}))) as JsonValue;
  return { ok: res.ok, status: res.status, body };
}

async function main() {
  const argv = await yargs(hideBin(process.argv))
    .scriptName("dns-register")
    .option("api", { type: "string", default: "http://localhost:8054" })
    .option("name", { type: "string", demandOption: true })
    .option("execute", { type: "boolean", default: false })
    .option("set-primary", { type: "boolean", default: true })
    .option("admin-token", { type: "string", default: "" })
    .strict()
    .parse();

  const baseUrl = String(argv.api);
  const availabilityRes = await getJson(baseUrl, `/v1/names/availability?name=${encodeURIComponent(String(argv.name))}`);
  if (!availabilityRes.ok) throw new Error(JSON.stringify(availabilityRes.body, null, 2));
  const availability = availabilityRes.body;
  process.stdout.write("Availability\n");
  process.stdout.write(`${JSON.stringify(availability, null, 2)}\n`);

  const headers: Record<string, string> = {
    "content-type": "application/json",
    accept: "application/json"
  };
  if (argv["admin-token"]) headers["x-admin-token"] = String(argv["admin-token"]);

  const registrationRes = await getJson(baseUrl, "/v1/names/register", {
    method: "POST",
    headers,
    body: JSON.stringify({
      name: String(argv.name),
      execute: Boolean(argv.execute),
      set_primary: Boolean(argv["set-primary"])
    })
  });
  const registration = registrationRes.body;

  process.stdout.write("\nRegistration\n");
  process.stdout.write(`${JSON.stringify(registration, null, 2)}\n`);
  if (argv.execute && !registrationRes.ok) {
    process.exit(1);
  }
}

main().catch((err) => {
  process.stderr.write(`${String(err?.message || err)}\n`);
  process.exit(1);
});
