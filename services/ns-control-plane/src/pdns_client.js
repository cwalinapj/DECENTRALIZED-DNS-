function headers(apiKey) {
  return {
    "x-api-key": apiKey,
    "content-type": "application/json"
  };
}

function zoneName(domain) {
  return `${domain}.`;
}

export function createPdnsClient(opts = {}) {
  const baseUrl = opts.baseUrl || process.env.PDNS_API_URL || "http://127.0.0.1:8081";
  const apiKey = opts.apiKey || process.env.PDNS_API_KEY || "";
  const serverId = opts.serverId || process.env.PDNS_SERVER_ID || "localhost";
  const fetchFn = opts.fetchFn || globalThis.fetch;

  async function req(path, init = {}) {
    if (!apiKey) throw new Error("missing_pdns_api_key");
    const res = await fetchFn(`${baseUrl}/api/v1/servers/${encodeURIComponent(serverId)}${path}`, {
      ...init,
      headers: {
        ...(init.headers || {}),
        ...headers(apiKey)
      }
    });
    if (!res.ok) {
      const body = await res.text();
      const err = new Error(`pdns_http_${res.status}`);
      err.body = body;
      throw err;
    }
    const text = await res.text();
    return text ? JSON.parse(text) : null;
  }

  return {
    async ensureZone(domain, nameservers = []) {
      const payload = {
        name: zoneName(domain),
        kind: "Native",
        nameservers: nameservers.map((n) => (n.endsWith(".") ? n : `${n}.`)),
        rrsets: []
      };
      try {
        await req(`/zones/${encodeURIComponent(zoneName(domain))}`);
        return { created: false };
      } catch (err) {
        if (!String(err?.message || "").includes("pdns_http_404")) throw err;
      }
      await req("/zones", {
        method: "POST",
        body: JSON.stringify(payload)
      });
      return { created: true };
    },

    async listRecords(domain) {
      const zone = await req(`/zones/${encodeURIComponent(zoneName(domain))}`);
      return (zone?.rrsets || []).map((rr) => ({
        name: rr.name,
        type: rr.type,
        ttl: rr.ttl,
        records: (rr.records || []).map((r) => r.content)
      }));
    },

    async addRecord(domain, record) {
      const fqdn = record.name.endsWith(".") ? record.name : `${record.name}.`;
      await req(`/zones/${encodeURIComponent(zoneName(domain))}`, {
        method: "PATCH",
        body: JSON.stringify({
          rrsets: [
            {
              name: fqdn,
              type: record.type,
              ttl: Number(record.ttl || 300),
              changetype: "REPLACE",
              records: [{ content: record.value, disabled: false }]
            }
          ]
        })
      });
      return { ok: true };
    },

    async deleteRecord(domain, record) {
      const fqdn = record.name.endsWith(".") ? record.name : `${record.name}.`;
      await req(`/zones/${encodeURIComponent(zoneName(domain))}`, {
        method: "PATCH",
        body: JSON.stringify({
          rrsets: [
            {
              name: fqdn,
              type: record.type,
              changetype: "DELETE",
              records: []
            }
          ]
        })
      });
      return { ok: true };
    },

    async bumpSerial() {
      return { bumped: true };
    }
  };
}
