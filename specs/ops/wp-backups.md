# WordPress Backups Spec (B2 default + optional IPFS redundancy)

**Path:** `specs/ops/wp-backups.md`  
**Status:** Draft (MVP-ready)  
**Goal:** Define a single canonical backup artifact that can be:
- stored cheaply and reliably on **Backblaze B2** (default),
- optionally pinned/replicated to **IPFS/Filecoin** (premium),
- verified via hashes, and optionally committed onchain (minimal footprint).

---

## 1) Design principles

1. **One canonical encrypted blob** per snapshot.
   - The exact same encrypted bytes are uploaded to B2 and (optionally) pinned to IPFS.
2. **No secrets in WordPress**
   - WordPress plugin creates snapshot locally and uploads to Control Plane.
   - Control Plane holds storage credentials and encryption keys (MVP).
3. **Restore is verifiable**
   - Snapshot includes manifest + hashes.
   - Control Plane verifies before restore.
4. **Storage is pluggable**
   - Primary backend: B2 (S3-compatible API).
   - Secondary backend: IPFS (pinning service or self-hosted pinner).

---

## 2) Snapshot artifact format

Each snapshot produces an encrypted file:

- `snapshot.tar.zst.enc`  (AES-256-GCM encrypted)
- `manifest.json`         (stored inside the tarball; also optionally stored alongside for index/search)

### 2.1 Archive structure (inside tar.zst before encryption)
