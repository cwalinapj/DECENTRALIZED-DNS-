# WP Compat Orchestrator (MVP)

wp-admin plugin that exports a site bundle, uploads it to the control plane,
creates a staging compatibility job, and shows results.

No public WordPress endpoints are exposed.

## Install
Copy `plugin/` into `wp-content/plugins/ddns-compat-orchestrator/`

Activate the plugin, then go to:
Settings → DDNS Compat

## Control plane
Set CONTROL_PLANE_URL (example):
https://optin.example.com (or https://api.example.com)
