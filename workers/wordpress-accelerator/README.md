# WordPress Accelerator Worker

This module provides a WordPress admin wizard that connects a site to GitHub
and Cloudflare so caching workers can be installed and site assets are synced
straight to a repository (no zip archives).

## Contents

- `plugin/ddns-accelerator.php`
- `plugin/includes/*.php`
- `plugin/assets/admin.js`
- `plugin/assets/admin.css`

## Usage

1. Copy `plugin` into `wp-content/plugins/ddns-accelerator`.
2. Activate **DDNS Accelerator** in WordPress.
3. Open **DDNS Accelerator** in WP Admin and follow the step-by-step wizard.

## Wizard steps

1. **Connect GitHub + Cloudflare**
   - Enter the worker control-plane endpoint URL.
   - Enter GitHub org/user + repo for this site.
   - Enter a fine-grained GitHub PAT (repo contents write access).
   - Enter a Cloudflare API token with Zone → Zone → Read, Zone → DNS → Edit,
     and Account → Cloudflare Pages → Edit permissions (scoped to this domain +
     account).
2. **Select Cloudflare zone**
   - Fetch zones, pick the zone for this site, and save.
3. **Choose sync directories**
   - Select uploads/themes/plugins to mirror to GitHub.
   - Enable auto-sync to push changes within a minute of updates.
4. **Install caching worker**
   - Sends site, repo, and token details to your control-plane to provision
     the caching worker.
5. **Run snapshot**
   - Pushes changed files directly to GitHub and purges Cloudflare caches for
     changed assets.

## Pages deployment (next)

For MVP, create/update a Pages project and upload the built dist/ bundle via
the Pages deployment API. Direct Upload requires Account → Cloudflare Pages →
Edit permissions.

Choose the path you want:

- Direct Upload API (no GitHub needed)
- GitHub-connected Pages (deploy on push)

## GitHub linkage

The GitHub repository becomes the source of truth for automations. Every sync
writes files under `site/` with paths relative to the WordPress root, so GitHub
Actions can react immediately to content changes.

## Reality check

Workers can do a lot at the edge (caching, security headers, rewriting, bot
protection), but they cannot execute PHP or replace WordPress core server-side
logic. The goal is to move as much as possible to the edge: caching, routing,
security, asset optimization, backup triggers, and automation.
