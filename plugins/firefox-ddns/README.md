# Firefox DDNS DoH Helper

This is a UX helper extension for Firefox TRR configuration.

- It does **not** resolve DNS itself.
- It does **not** bypass browser CAPTCHA/account creation flows.
- It cannot write `network.trr.*` prefs directly; it provides copy/paste blocks.

## Load in Firefox

1. Open `about:debugging#/runtime/this-firefox`
2. Click **Load Temporary Add-on**
3. Select `plugins/firefox-ddns/manifest.json`

## Use

1. Open the extension popup.
2. Keep endpoint as `http://127.0.0.1:8054/dns-query` or set your gateway URL.
3. Click **Copy “Enable DDNS DoH”** and apply values in `about:config`.
4. Verify with `bash scripts/firefox_doh_verify.sh`.

## Disable

Use **Copy “Disable DDNS DoH”** and set the copied values in `about:config`.
