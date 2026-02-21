const baseUrl = process.env.GATEWAY_BASE_URL || "http://127.0.0.1:8054";
const name = process.env.NAME || "netflix.com";
const type = process.env.TYPE || "A";
const endpoint = `${baseUrl.replace(/\/$/, "")}/dns-query`;

async function main(): Promise<void> {
  const dnsPacket = (await import("../gateway/node_modules/dns-packet/index.js")).default;
  const query = dnsPacket.encode({
    type: "query",
    id: 31337,
    flags: dnsPacket.RECURSION_DESIRED,
    questions: [{ type, name, class: "IN" }]
  });

  const response = await fetch(endpoint, {
    method: "POST",
    headers: {
      "content-type": "application/dns-message",
      accept: "application/dns-message"
    },
    body: Buffer.from(query)
  });

  if (!response.ok) {
    throw new Error(`DoH request failed: ${response.status}`);
  }

  const wire = Buffer.from(await response.arrayBuffer());
  const decoded = dnsPacket.decode(wire);
  const answers = (decoded.answers || []).filter((a: any) => String(a.type).toUpperCase() === type);
  if (answers.length === 0) {
    throw new Error("No answers in DoH response");
  }

  console.log(`name=${name} type=${type} answers=${answers.length}`);
  for (const answer of answers.slice(0, 3)) {
    console.log(`${answer.type}:${answer.data}:ttl=${answer.ttl}`);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
