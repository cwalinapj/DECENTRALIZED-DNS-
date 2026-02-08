# solana

## PURPOSE
Solana Anchor programs provide on-chain PDAs for toll pass NFTs, name records, and governance lockups. This is the Solana spoke to the Base governance hub.

## INVENTORY
- `Anchor.toml`, `Cargo.toml`, `programs/ddns_anchor/src/lib.rs`
- Tests: `solana/tests/ddns_anchor.ts`
- Tooling: Anchor CLI, Rust toolchain

## RUNNABILITY CHECK
```bash
cd /Users/root1/scripts/DECENTRALIZED-DNS-/solana
anchor build
```
**Result:** build failed.

**Failures:**
- `anchor` CLI version mismatch (0.32.1 vs anchor-lang 0.29.0).
- `spl-token-2022` compilation errors (Pubkey type mismatch, missing Pack trait).
- Stack offset overflow in SBF build.

**Missing/fix:**
- Install matching Anchor CLI for `anchor-lang = 0.29.0` or bump program deps.
- Pin compatible `spl-token-2022` and `solana-program` versions.
- Reduce stack usage or refactor large stack frames.

## INTERFACE CONTRACT
- PDAs: config, toll pass, name record, lock vault.
- Inputs: admin signer, mint accounts, metadata accounts.
- Outputs: on-chain accounts and program IDs for gateway and registry.

## SECURITY + RELIABILITY PASS
- Program not buildable yet; cannot audit runtime behavior.
- Must validate PDA seeds and enforce admin-only actions.

## TESTS
- `solana/tests/ddns_anchor.ts` exists but cannot run until build succeeds.

## DOCS
- `solana/README.md` updated for build instructions.

## STATUS
- **Status:** broken (build failing)
- **Commands tried:** `anchor build`
- **Failures:** spl-token-2022 compile errors + stack overflow

## TODO (priority)
1. Align Anchor CLI + anchor-lang versions.
2. Pin `spl-token-2022` to a compatible version and import missing traits.
3. Reduce stack usage in program.
