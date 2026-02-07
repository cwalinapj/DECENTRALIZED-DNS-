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

/
manifest.json
db/
db.sql.zst            (or db.sql.gz)
wp-content/
plugins/…
themes/…
uploads/…           (optional; can be excluded or segmented)
logs/                   (optional: small debug bundle)

### 2.2 Compression
Preferred:
- `tar + zstd` (good ratio + fast)
Fallback:
- `tar + gzip`

### 2.3 Encryption
- Algorithm: **AES-256-GCM**
- Encrypted blob layout:
  - `header` (small JSON or fixed bytes) containing:
    - version
    - nonce/iv
    - manifest hash
  - ciphertext
  - auth tag (GCM)

MVP key management:
- Control Plane stores per-site `backup_key` (32 bytes) encrypted at rest.
Future:
- user-provided passphrase or wallet-signature-derived key.

---

## 3) Snapshot identity and naming

### 3.1 Snapshot ID
- `snapshot_id`: UUIDv4 (recommended)
- `seq`: monotonically increasing per site (u64)
- `created_at`: unix seconds

### 3.2 Object key naming (B2)
Recommended:
- `wp-backups/{site_id}/{YYYY}/{MM}/{DD}/snap_{seq}_{snapshot_id}.tar.zst.enc`

Example:
- `wp-backups/site_123/2026/02/07/snap_00000042_9f6c...tar.zst.enc`

### 3.3 Optional sidecar index objects
- `wp-backups/{site_id}/manifests/snap_{seq}_{snapshot_id}.manifest.json`

This is optional if you store manifest in your DB.

---

## 4) Manifest schema

`manifest.json` (inside the archive) is canonical.

### 4.1 JSON schema (informal)

```json
{
  "manifest_version": 1,
  "site_id": "site_123",
  "snapshot_id": "uuid",
  "seq": 42,
  "created_at": 1738963200,

  "source": {
    "wp_url": "https://example.com",
    "wp_version": "6.x",
    "php_version": "8.x",
    "theme": { "name": "MyTheme", "stylesheet": "mytheme", "version": "1.2.3" },
    "plugins_active": [
      { "slug": "woocommerce/woocommerce.php", "name": "WooCommerce", "version": "9.x" }
    ]
  },

  "content": {
    "includes": {
      "db": true,
      "wp_content_plugins": true,
      "wp_content_themes": true,
      "wp_content_uploads": false
    },
    "db": {
      "format": "sql",
      "compression": "zst",
      "path": "db/db.sql.zst"
    }
  },

  "integrity": {
    "archive_sha256": "hex",          // sha256 of tar.zst (before encryption)
    "encrypted_sha256": "hex",        // sha256 of .enc bytes (uploaded bytes)
    "files": [
      { "path": "manifest.json", "sha256": "hex", "bytes": 1234 },
      { "path": "db/db.sql.zst", "sha256": "hex", "bytes": 1234567 }
    ]
  },

  "encryption": {
    "scheme": "aes-256-gcm",
    "key_ref": "cp:kms:site_123:v1",  // reference; never the key itself
    "nonce_b64": "base64",            // optional if also in header
    "aad": "ddns-wp-backup-v1"
  },

  "storage": {
    "primary": {
      "backend": "b2",
      "bucket": "your-b2-bucket",
      "key": "wp-backups/site_123/...",
      "etag": "optional",
      "uploaded_at": 1738963300
    },
    "secondary": [
      {
        "backend": "ipfs",
        "cid": "bafy...",
        "pinned_by": "pinning-service-or-self",
        "pinned_at": 1738963400
      }
    ]
  }
}
Notes:
	•	integrity.encrypted_sha256 is what you verify after download from B2/IPFS.
	•	integrity.archive_sha256 is what you verify after decrypt+decompress.

5) Control Plane responsibilities

5.1 Upload API
	•	WordPress uploads the encrypted blob to Control Plane (or to a presigned URL).
	•	Control Plane writes to B2 (primary), and optionally pins to IPFS (secondary).

5.2 Verification

Control Plane MUST:
	1.	compute sha256 of received encrypted bytes
	2.	compare to manifest.integrity.encrypted_sha256
	3.	store snapshot metadata in DB
	4.	only then mark snapshot as verified=true

5.3 Restore

Restore always starts in sandbox unless explicitly overridden:
	1.	download encrypted blob
	2.	verify encrypted_sha256
	3.	decrypt
	4.	verify archive_sha256 + file hashes
	5.	restore into sandbox WP container
	6.	run health checks + (optional) screenshots
	7.	present “Restore verified ✅” to site owner

⸻

6) IPFS as premium redundancy (upcharge)

When enabled:
	•	Control Plane pins the encrypted blob to IPFS and records CID.
	•	Optional: Filecoin deal for long-term persistence.

Important:
	•	IPFS stores the encrypted blob only.
	•	No plaintext WP data is ever pinned.

⸻

7) Optional onchain commitments (minimal)

To keep chain storage minimal, store only:
	•	site_id -> (seq, exp, snapshot_hash) where:
	•	snapshot_hash = sha256(encrypted_blob_bytes) (32 bytes)
	•	seq increments per snapshot
	•	exp sets suggested validity/retention horizon

This is consistent with your commitments pattern:
	•	chain contains pointers+hashes, storage contains the data.

⸻

8) Retention and segmentation

8.1 Retention defaults
	•	local: last 7 snapshots
	•	B2: 30–90 days (plan dependent)
	•	IPFS: pinned for plan duration

8.2 Large uploads (wp-content/uploads)

Uploads can be huge. MVP defaults:
	•	uploads excluded unless user enables
Upgrade path:
	•	segment uploads into separate blobs with their own manifests:
	•	snap_{seq}_uploads_partNN.enc
	•	keep DB+config frequent, uploads less frequent.

---

## `services/control-plane/src/storage/b2.ts` (minimal TS interface + S3-compatible B2 implementation)

> Uses AWS SDK v3 S3 client because Backblaze B2 provides an S3-compatible API. You can swap to direct REST later if you prefer.

```ts
// services/control-plane/src/storage/b2.ts
import { S3Client, PutObjectCommand, GetObjectCommand, HeadObjectCommand } from "@aws-sdk/client-s3";
import type { Readable } from "node:stream";

export type B2Config = {
  endpoint: string;          // e.g. "https://s3.us-west-004.backblazeb2.com"
  region: string;            // e.g. "us-west-004" (B2 uses region-like identifiers)
  accessKeyId: string;       // B2 keyID
  secretAccessKey: string;   // B2 applicationKey
  bucket: string;
};

export type PutResult = {
  ok: true;
  etag?: string;
  key: string;
};

export type HeadResult = {
  ok: true;
  key: string;
  exists: boolean;
  contentLength?: number;
  etag?: string;
  lastModified?: Date;
};

export interface ObjectStore {
  putObject(key: string, body: Buffer | Uint8Array | Readable, contentType?: string): Promise<PutResult>;
  headObject(key: string): Promise<HeadResult>;
  getObjectStream(key: string): Promise<Readable>;
}

/**
 * Backblaze B2 via S3-compatible API.
 * IMPORTANT:
 * - Do not place credentials in WordPress.
 * - Control-plane should load config from env/secret manager.
 */
export class B2ObjectStore implements ObjectStore {
  private s3: S3Client;
  private bucket: string;

  constructor(cfg: B2Config) {
    this.bucket = cfg.bucket;
    this.s3 = new S3Client({
      region: cfg.region,
      endpoint: cfg.endpoint,
      credentials: {
        accessKeyId: cfg.accessKeyId,
        secretAccessKey: cfg.secretAccessKey
      },
      forcePathStyle: true // generally safer for non-AWS S3 endpoints
    });
  }

  async putObject(key: string, body: Buffer | Uint8Array | Readable, contentType = "application/octet-stream"): Promise<PutResult> {
    const out = await this.s3.send(
      new PutObjectCommand({
        Bucket: this.bucket,
        Key: key,
        Body: body as any,
        ContentType: contentType
      })
    );

    return { ok: true, etag: out.ETag, key };
  }

  async headObject(key: string): Promise<HeadResult> {
    try {
      const out = await this.s3.send(
        new HeadObjectCommand({
          Bucket: this.bucket,
          Key: key
        })
      );
      return {
        ok: true,
        key,
        exists: true,
        contentLength: out.ContentLength,
        etag: out.ETag,
        lastModified: out.LastModified
      };
    } catch (e: any) {
      // Most SDKs throw for 404; treat as not found
      const msg = String(e?.name || e?.Code || e?.message || e);
      if (msg.includes("NotFound") || msg.includes("404") || msg.includes("NoSuchKey")) {
        return { ok: true, key, exists: false };
      }
      throw e;
    }
  }

  async getObjectStream(key: string): Promise<Readable> {
    const out = await this.s3.send(
      new GetObjectCommand({
        Bucket: this.bucket,
        Key: key
      })
    );

    // Body can be ReadableStream or Readable depending on runtime; in Node it’s typically Readable
    const body: any = out.Body;
    if (!body) throw new Error("b2_get_missing_body");
    return body as Readable;
  }
}

/**
 * Helper: load B2 config from env.
 * Example env:
 *  B2_ENDPOINT=https://s3.us-west-004.backblazeb2.com
 *  B2_REGION=us-west-004
 *  B2_KEY_ID=...
 *  B2_APP_KEY=...
 *  B2_BUCKET=...
 */
export function b2FromEnv(): B2ObjectStore {
  const endpoint = process.env.B2_ENDPOINT || "";
  const region = process.env.B2_REGION || "us-west-004";
  const accessKeyId = process.env.B2_KEY_ID || "";
  const secretAccessKey = process.env.B2_APP_KEY || "";
  const bucket = process.env.B2_BUCKET || "";

  if (!endpoint || !accessKeyId || !secretAccessKey || !bucket) {
    throw new Error("missing_b2_env");
  }

  return new B2ObjectStore({ endpoint, region, accessKeyId, secretAccessKey, bucket });
}
