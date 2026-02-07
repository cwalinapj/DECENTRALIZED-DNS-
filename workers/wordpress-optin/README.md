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
label used by the opt-in form.
# WordPress Opt-in Plugin (No Public WP Endpoints)

This plugin renders an opt-in form on WordPress sites and sends submissions
directly to the DECENTRALIZED-DNS worker/server API.

Public-facing:
- No WP REST endpoints are exposed.
- Form submits to your configured worker server URL.

Admin-facing:
- Configure worker endpoint URL
- Configure site_id
- Configure site_secret (HMAC signing key)
- Optional: data categories (checkboxes)

Worker API:
- POST /v1/optin/submit
