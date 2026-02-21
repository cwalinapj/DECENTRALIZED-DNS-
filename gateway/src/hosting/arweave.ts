import type { FetchSiteInput, FetchSiteOutput } from "./ipfs.js";

export async function fetchArweaveSite(input: Omit<FetchSiteInput, "cid"> & { tx: string }): Promise<FetchSiteOutput> {
  const base = input.gatewayBase.replace(/\/+$/, "");
  const suffix = normalizeSitePath(input.path);
  const primaryUrl = `${base}/${input.tx}${suffix}`;

  try {
    return await fetchWithLimit(primaryUrl, input.timeoutMs, input.maxBytes);
  } catch (err: any) {
    if (suffix === "/index.html" && Number(err?.statusCode || 0) === 404) {
      const fallbackUrl = `${base}/${input.tx}`;
      return fetchWithLimit(fallbackUrl, input.timeoutMs, input.maxBytes);
    }
    throw err;
  }
}

function normalizeSitePath(value: string): string {
  const trimmed = String(value || "").trim();
  if (!trimmed || trimmed === "/") return "/index.html";
  const withSlash = trimmed.startsWith("/") ? trimmed : `/${trimmed}`;
  if (withSlash.includes("..")) {
    throw Object.assign(new Error("invalid_path"), { statusCode: 400 });
  }
  if (withSlash.endsWith("/")) return `${withSlash}index.html`;
  return withSlash;
}

async function fetchWithLimit(url: string, timeoutMs: number, maxBytes: number): Promise<FetchSiteOutput> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, { signal: controller.signal });
    if (!res.ok) {
      throw Object.assign(new Error(`upstream_status_${res.status}`), { statusCode: res.status });
    }

    const contentLength = Number(res.headers.get("content-length") || "0");
    if (contentLength > maxBytes) {
      throw Object.assign(new Error("content_too_large"), { statusCode: 413 });
    }

    const body = Buffer.from(await res.arrayBuffer());
    if (body.length > maxBytes) {
      throw Object.assign(new Error("content_too_large"), { statusCode: 413 });
    }

    return {
      body,
      contentType: res.headers.get("content-type"),
      sourceUrl: url
    };
  } catch (err: any) {
    if (err?.name === "AbortError") {
      throw Object.assign(new Error("hosting_timeout"), { statusCode: 504 });
    }
    throw err;
  } finally {
    clearTimeout(timer);
  }
}
