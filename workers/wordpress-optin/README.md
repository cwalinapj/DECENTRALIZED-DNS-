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
