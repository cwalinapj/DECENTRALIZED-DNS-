# contracts

## PURPOSE
This section contains the EVM/L2 control-plane smart contracts for escrow, settlement, registries, and governance. It defines the on-chain backbone for TollDNS economics and policy.

## INVENTORY
- `contracts/foundry.toml` – Foundry config (Base Sepolia endpoint).
- Modules: `escrow/`, `settlement/`, `registry/`, `governance/`, `tokens/`, `treasury/`, `staking/`, `watchdog/`.
- Tests: `contracts/tests/receipt_ingestor_operator_registry.t.sol`.

## RUNNABILITY CHECK
**Happy path (requires Foundry):**
```bash
cd /Users/root1/scripts/DECENTRALIZED-DNS-/contracts
forge install
forge test
```
**Status:** not runnable here; `forge` not installed.
**Missing:** Foundry toolchain (`forge`), `lib/` deps.

## INTERFACE CONTRACT
- Escrow: `deposit/withdraw/balanceOf/debitForSettlement`
- Voucher verifier: `submitVoucher`, nonce tracking
- Governance: `DDNSGovernor`, `DDNSTimelock`, `ParameterStore`

## SECURITY + RELIABILITY PASS
- Contracts are stubs; require audits and full ECDSA verification.
- Ensure role-based access control on settlement and registries.

## TESTS
- Foundry test exists but not executed due to missing toolchain.

## DOCS
- `contracts/README.md` already describes module layout and testing.

## STATUS
- **Status:** partial
- **Commands tried:** `forge --version` (missing)
- **Failures:** Foundry not installed

## TODO (priority)
1. Install Foundry + dependencies and run tests.
2. Implement missing modules per README.
3. Add more Foundry tests for escrow and registries.
