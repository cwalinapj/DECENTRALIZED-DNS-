# Firefox DDNS DoH Helper

An onboarding and verification helper extension for Firefox TRR (Trusted Recursive Resolver) over HTTPS using a local TollDNS gateway.

## What it can do

- Copy a ready-to-use `about:config` checklist that enables Firefox TRR pointing at the local HTTPS DoH proxy (`https://127.0.0.1:8443/dns-query`, mode=3, `allow-rfc1918`, `bootstrapAddress`).
- Open a verification tab (`/v1/resolve?name=netflix.com&type=A`) to confirm the gateway is responding.
- Copy a `bash scripts/firefox_doh_verify.sh` command for terminal-level verification.
- Copy "Disable TRR" values to revert Firefox to its default resolver.

## What it cannot do

- It **cannot** write `network.trr.*` prefs directly — Firefox does not expose a WebExtension API for this. All changes must be applied manually in `about:config`.
- It **cannot** bypass browser CAPTCHA or account creation flows.
- It does **not** resolve DNS itself; it only configures Firefox to use your local gateway.

## Prerequisites

Start the local DoH gateway before using this extension:

```bash
npm --prefix gateway run start
# or
node gateway/dist/server.js
```

The gateway listens on `https://127.0.0.1:8443` by default.

## Install as a temporary add-on

1. Open `about:debugging#/runtime/this-firefox` in Firefox.
2. Click **Load Temporary Add-on…**
3. Select `plugins/firefox-ddns/manifest.json`.

The extension icon will appear in the toolbar. Temporary add-ons are removed when Firefox restarts.

## Usage

### Configure TRR

1. Open the extension popup.
2. Select **Local (8443)** (default) or **Custom** and enter your base URL (for example `https://mygateway.example.com`).
3. Click **Copy TRR prefs (about:config checklist)**.
4. Open `about:config` in a new tab.
5. For each line in the copied checklist, search for the pref name and set its value.

Prefs that will be set:

| Pref | Value |
|------|-------|
| `network.trr.mode` | `3` (TRR-only) |
| `network.trr.uri` | `https://127.0.0.1:8443/dns-query` |
| `network.trr.custom_uri` | `https://127.0.0.1:8443/dns-query` |
| `network.trr.allow-rfc1918` | `true` |
| `network.trr.bootstrapAddress` | `127.0.0.1` |

### Verify

**Option A — browser tab:**
Click **Verify — open /v1/resolve tab**. The gateway JSON response for `netflix.com A` will appear in the new tab.

Expected response shape:

```json
{
  "answers": [...],
  "confidence": "high",
  "rrset_hash": "..."
}
```

**Option B — terminal:**
Click **Copy verify curl command**, then paste into your terminal:

```bash
bash scripts/firefox_doh_verify.sh --url https://127.0.0.1:8443 --name netflix.com --type A --insecure
```

A successful run prints `✅ firefox DoH verify passed`.

### Disable TRR

1. Open the extension popup.
2. Click **Copy "Disable TRR" values**.
3. Open `about:config`, search for each pref, and set its value as shown.
