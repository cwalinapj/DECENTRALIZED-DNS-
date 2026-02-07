# WordPress Opt-in Worker

This worker provides a lightweight WordPress plugin for a DDNS opt-in form
that can be embedded with a shortcode.

## Contents
- plugin/ddns-optin.php
- plugin/includes/admin-settings.php
- plugin/assets/optin.js
- plugin/assets/optin.css

## Usage
1. Copy the `plugin` directory into `wp-content/plugins/ddns-optin`.
2. Activate "DDNS Opt-in" in the WordPress admin.
3. Add the `[ddns_optin]` shortcode to a page or post.

## Settings
Use Settings → DDNS Opt-in to edit the heading, placeholder, and button
label used by the opt-in form, plus the worker endpoint URL, site ID, and
optional categories for checkbox selection.
# WordPress Opt-in Plugin (No Public WP Endpoints)

This plugin renders an opt-in form on WordPress sites and sends submissions
directly to the DECENTRALIZED-DNS worker/server API.

Public-facing:
- No WP REST endpoints are exposed.
- Form submits to your configured worker server URL.

Admin-facing:
- Configure worker endpoint URL

- ## Configure endpoint (Cloudflare Workers bootstrap)

In WP Admin → Settings → DDNS Opt-in:

- Worker endpoint URL:
  `https://optin.<yourdomain>/v1/optin/submit`
- Site ID:
  `site_123` (must be registered in the Cloudflare Worker via admin API)

Admin API (run from your terminal):
- POST `https://optin.<yourdomain>/v1/admin/sites`
  with header `x-ddns-admin-key: <ADMIN_API_KEY>`
- Configure site_id
- Optional: data categories (checkboxes)

Worker API:
- POST /v1/optin/submit


Plugin moved to `/Users/root1/dev/web3-repos/web3-wp-plugins`.
