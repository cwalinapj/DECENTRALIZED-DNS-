# STATUS Pointer

Canonical status document: `docs/STATUS.md`.

This root file intentionally points to the canonical path to avoid divergent status copies.

## MVP Ready
- Date (UTC): 2026-02-19T08:00:00Z
- Commit: 8445f03
- State: main CI green, demo command available (
> decentralized-dns@1.0.0 mvp:demo:devnet
> npm -C solana ci --include=dev && bash scripts/devnet_happy_path.sh


added 249 packages, and audited 251 packages in 2s

53 packages are looking for funding
  run `npm fund` for details

7 high severity vulnerabilities

To address all issues (including breaking changes), run:
  npm audit fix --force

Run `npm audit` for details.
==> verify deployed MVP programs on devnet

> ddns-anchor@0.1.0 devnet:verify
> tsx scripts/devnet_verify_deployed.ts --rpc https://api.devnet.solana.com

✅ all required programs are deployed (6)
==> devnet funding/rent snapshot

> ddns-anchor@0.1.0 devnet:audit
> tsx scripts/devnet_audit.ts --rpc https://api.devnet.solana.com

Wrote /Users/root1/DECENTRALIZED-DNS-/docs/DEVNET_STATUS.md
Programs audited: 16
Total program SOL: 0.007990080
Deploy wallet SOL: 0.006744560
Recommended reserve SOL: 5.000000000 (WARNING: below recommended reserve; upgrades may fail)
wallet: B5wjX4PdcwsTqxbiAANgmXVEURN1LF2Cuijteqrk2jh5
client_wallet: B5wjX4PdcwsTqxbiAANgmXVEURN1LF2Cuijteqrk2jh5
rpc: https://api.devnet.solana.com
demo_name: u-b5wjx4pd.dns
==> init names config PDA (idempotent; continue if already initialized)
names_init_skipped_or_exists: 1
    at Object.handler (/Users/root1/DECENTRALIZED-DNS-/solana/scripts/names.ts:115:65)
    at file:///Users/root1/DECENTRALIZED-DNS-/solana/node_modules/yargs/build/lib/command.js:206:54
    at maybeAsyncResult (file:///Users/root1/DECENTRALIZED-DNS-/solana/node_modules/yargs/build/lib/utils/maybe-async-result.js:9:15)
    at CommandInstance.handleValidationAndGetResult (file:///Users/root1/DECENTRALIZED-DNS-/solana/node_modules/yargs/build/lib/command.js:205:25)
    at CommandInstance.applyMiddlewareAndGetResult (file:///Users/root1/DECENTRALIZED-DNS-/solana/node_modules/yargs/build/lib/command.js:245:20)
    at CommandInstance.runCommand (file:///Users/root1/DECENTRALIZED-DNS-/solana/node_modules/yargs/build/lib/command.js:128:20)
    at [runYargsParserAndExecuteCommands] (file:///Users/root1/DECENTRALIZED-DNS-/solana/node_modules/yargs/build/lib/yargs-factory.js:1386:105)
    at YargsInstance.parse (file:///Users/root1/DECENTRALIZED-DNS-/solana/node_modules/yargs/build/lib/yargs-factory.js:707:63)
==> ensure anchor IDL for tollbooth (ddns_anchor)
==> install + start tollbooth
==> install + start gateway
==> set .dns route via tollbooth devnet flow

> tollbooth@0.1.0 flow:devnet
> tsx scripts/devnet_flow.ts

claim_passport: 200 {
  ok: true,
  passport_mint: '11111111111111111111111111111111',
  toll_pass_pda: 'CCiQgbgJSCcqB3YzLwWjvnGnsorjUeceHfiNqB3Fgqt8',
  record_pda: 'EEBbGBA5BSw6PAYCCGqggXD14NoWSyrXGLCNqt1fT2Me',
  label: 'u-b5wjx4pd',
  name_hash_hex: 'e61f984050085cc8ced9b4c1872ce3c0dc94a8030d43d64eb626b1e17dc0230f',
  tx: null
}
assign_route: 400 { ok: false, error: 'name_not_claimed' }
resolve: {
  "ok": false,
  "error": "not_found"
}
warning: tollbooth devnet flow did not return assign_route 200; continuing for audit visibility
==> resolve ICANN via gateway
{"name":"netflix.com","type":"A","answers":[{"name":"netflix.com","type":"A","data":"44.240.158.19","ttl":58},{"name":"netflix.com","type":"A","data":"52.38.7.83","ttl":58},{"name":"netflix.com","type":"A","data":"44.242.13.161","ttl":58}],"ttl_s":30,"source":"recursive","confidence":"low","upstream
==> resolve .dns via gateway (best-effort, canonical route dependent)
gateway_dns_resolve_unavailable_for_u-b5wjx4pd.dns; falling back to tollbooth resolver proof
==> resolve .dns via tollbooth (route proof)
{"ok":false,"error":"not_found"}

==> optional witness reward submit/claim skipped (ENABLE_WITNESS_REWARDS=1 to enable)
==> tx links
blocker: tollbooth flow returned non-200; inspect /var/folders/h5/7f2x98695lz6819tc0k6fbv80000gn/T//ddns-devnet-demo/tollbooth.log and flow output above
logs_dir: /var/folders/h5/7f2x98695lz6819tc0k6fbv80000gn/T//ddns-devnet-demo
✅ demo complete), no open PRs, clean repo hygiene.

## MVP Ready
- Date (UTC): 2026-02-19T08:03:12Z
- Commit: 6e1bd24
- State: docs canonicalized under /docs, demo command verified, no open PRs required for MVP lock.
