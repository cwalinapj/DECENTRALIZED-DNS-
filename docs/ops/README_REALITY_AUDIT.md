# README Reality Audit (Docs Sync)

Date: 2026-02-19
Branch: `codex/readme-reality-sync`

This table records referenced paths from the prior README and how they were handled.

| Path | Exists | Action |
|---|---|---|
| `PROSPECTUS.md` | ❌ | Removed from README links (no file in repo). |
| `docs/MVP.md` | ✅ | Kept. |
| `docs/MVP_DOD.md` | ✅ | Kept. |
| `docs/MASS_ADOPTION_ROADMAP.md` | ✅ | Kept. |
| `docs/ADOPTION.md` | ✅ | Kept. |
| `docs/PROTOCOL_CACHE_WITNESS.md` | ✅ | Kept. |
| `docs/END_STATE.md` | ✅ | Kept. |
| `docs/ADAPTERS.md` | ✅ | Kept. |
| `docs/PROTOCOL_WATCHDOG_ATTESTATION.md` | ✅ | Kept. |
| `docs/THREAT_MODEL.md` | ✅ | Kept. |
| `docs/ATTACK_MODE.md` | ✅ | Kept. |
| `docs/LOCAL_TEST.md` | ❌ (before) / ✅ (now) | Added new file with local run + curl checks. |
| `docs/MERGE_QUEUE.md` | ✅ | Kept. |
| `docs/MERGE_LOG.md` | ✅ | Kept. |
| `docs/INDEX.md` | ✅ | Set as canonical docs index. |
| `docs/README.md` | ✅ | Converted to pointer to `docs/INDEX.md`. |
| `docs/STATUS.md` | ✅ | Set as canonical status source. |
| `STATUS.md` | ✅ | Converted to pointer to `docs/STATUS.md` to avoid duplicate status drift. |
| `scripts/devnet_happy_path.sh` | ❌ | Removed from README; replaced with canonical `npm run mvp:demo:devnet`. |
| `npm run mvp:demo:devnet` | ❌ (before) / ✅ (now) | Added root script mapping to solana verify + audit. |
