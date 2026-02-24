# Infrastructure

This directory contains infra scaffolding for DDNS services. It is intentionally
minimal and designed to be filled in as environments are brought online.

## Layout
- `cloudflare/` – Cloudflare Workers/R2/D1 scaffolds
- `docker/` – container image notes and templates
- `pdns/` – PowerDNS auth server configs and zone bootstrap scripts
- `terraform/` – IaC templates (stubs)

## Usage
Start by choosing a target stack (Cloudflare or self-hosted), then expand the
Terraform or Cloudflare definitions as needed.
