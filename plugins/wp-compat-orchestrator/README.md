# WP Compat Orchestrator (MVP)

This WordPress plugin coordinates compatibility checks against a staging
WordPress instance. It exports a site bundle, uploads it to the control
plane, and displays the resulting report in wp-admin.

## Contents
- `plugin/ddns-compat.php`
- `plugin/includes/*`
- `plugin/assets/admin.js`
- `plugin/assets/admin.css`

## Usage (MVP-1)
1. Copy the `plugin` directory into `wp-content/plugins/ddns-compat`.
2. Activate **DDNS Compat Orchestrator**.
3. Go to **Settings → DDNS Compat**.
4. Configure the control plane URL + API key, then click **Connect
   staging**.
5. Click **Run compatibility check** to export the bundle, create a job,
   and fetch the report.

## Wallet + payments (MVP-3)
Wallet connection is admin-only. The plugin requests a challenge from the
control plane, signs it with the wallet, and stores a session token.
Payments are initiated from the control plane response. Miner proof can
unlock free credits.

## Notes
- The MVP uses JSON bundles (plugins, theme, and site metadata).
- Reports are returned as JSON + HTML from the control plane.
