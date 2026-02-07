# Adapter: solana-sns-bonfida (SNS / Bonfida .sol)

This adapter resolves Solana Name Service / Bonfida names (.sol) into records and pointers, mapping them into DNS-compatible results.

Namespace:

- `SNS_SOL`

Capabilities:

- `WEB3_NAME_RESOLUTION`

Key behaviors:

- lookup SNS name accounts and supported record types
- apply conformance profile normalization and mapping rules
- support caching with conservative TTL/policy

Fallback:

- centralized RPC providers may be used temporarily under policy
- cache-only during incident conditions (policy-controlled)

Upstream references:

- Bonfida: <https://github.com/Bonfida>
- SNS SDK: <https://github.com/SolanaNameService/sns-sdk>
