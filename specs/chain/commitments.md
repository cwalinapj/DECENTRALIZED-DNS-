If a name does not use gateway delegation, the `g_*` fields are absent or zero.

### 4.2 What is committed by gateway_routes_hash?

`gateway_routes_hash` commits to a **GatewayRoutesV1** object (off-chain) that contains subdomain route rules and gateway targets.

- The chain does **not** store the rule list.
- The chain stores only `(g_seq, g_exp, gateway_routes_hash)`.

The actual `GatewayRoutesV1` blob SHOULD be distributed through:
1) your decentralized DNS network (primary)
2) optionally an IPFS anchor path (redundancy)

> Recommended: define `specs/records/GatewayRoutesV1.md` as a small signed blob with deterministic encoding, similar to `RouteSetV1`.

### 4.3 Suggested GatewayRoutesV1 semantics (high level)

A GatewayRoutesV1 blob SHOULD support:
- `parent_name_id`
- `g_seq`, `g_exp`
- a list of rules: `(pattern, gateway_set_id, flags)`
- optional “default” gateway set
- signature by the parent owner key (or zone key)

**Pattern** SHOULD be simple for routers:
- exact label match (e.g., `api`)
- wildcard label (e.g., `*`)
- suffix match (e.g., `*.svc` as label conventions)

Keep it deterministic and bounded.

### 4.4 Update rules for gateway delegation

A chain update to delegation for a given `name_id` MUST satisfy:

1. **Monotonic delegation sequence**
   - `new_g_seq > old_g_seq` (recommended strictly increasing)

2. **Delegation expiry validity**
   - `new_g_exp > now`

3. **Authorization**
   - Same authorization model as normal RouteSet updates (see §6), typically controlled by the same owner.

### 4.5 Resolution precedence (recommended)

When resolving `sub.example`:

1) Derive `name_id(sub.example)` and attempt direct RouteSet resolution.
2) If direct RouteSet is missing, stale, or untrusted:
   - derive `name_id(example)` (parent) and check if it has active delegation (`g_exp` valid).
   - fetch GatewayRoutesV1 blob and apply matching rule(s).
   - route query toward the selected gateway set(s) to obtain RouteSet for `sub.example`.

This gives you a “fallback routing mesh” that can survive localized cache compromise.

---

## 5. Optional Fields (Use Only If Needed)

These fields can be added if required, but they increase chain storage:

- `owner_pubkey` (32 bytes): if chain must explicitly enforce cryptographic ownership
- `policy_flags` (u32): per-name policy (TTL caps, max record counts)
- `anchor_hash` (bytes32): if committing to an Anchor object rather than routeset_hash

**Recommendation:** Keep these out of v1 unless you have a hard requirement.

---

## 6. Update Rules (Consensus / Contract Logic)

A chain update for a given `name_id` MUST satisfy:

1. **Monotonic sequence**
   - `new_seq > old_seq` (recommended strictly increasing)

2. **Expiry validity**
   - `new_exp > now`

3. **Authorization**
   One of the following models MUST be used:

   ### Model A (Simplest): Account-owned names (chain account controls updates)
   - The chain account that owns `name_id` submits updates.
   - Clients/watchdogs still verify RouteSet signatures off-chain for end-to-end authenticity.

   ### Model B (Cryptographic ownership): Owner pubkey stored on-chain
   - Contract stores `owner_pubkey` for each name.
   - Update tx must prove authorization (chain-native signature or explicit verification if supported).

**Note:** Even in Model A, clients/watchdogs SHOULD verify RouteSet signatures off-chain.

---

## 7. Client/Resolver Verification Procedure

Given a query for `(ns_id, name)`:

1. Normalize name and derive `name_id`
2. Read chain state for `name_id`:
   - `(seq, exp, routeset_hash)`
   - optionally `(g_seq, g_exp, gateway_routes_hash)`
3. Fetch RouteSetV1 from the decentralized network (or cache)
4. Validate:
   - RouteSet `name_id` matches
   - RouteSet `seq == chain.seq`
   - RouteSet `exp == chain.exp` (recommended strict match)
   - `BLAKE3(RouteSet_bytes) == chain.routeset_hash`
   - RouteSet signature verifies (Ed25519)

If any check fails:
- treat data as **untrusted**
- refetch from multiple peers
- optionally consult delegation path (GatewayRoutesV1) if present and valid
- watchdogs should record an incident

---

## 8. Watchdog Rules

Watchdogs SHOULD monitor for:

- **Equivocation:** same `(name_id, seq)` observed with different `routeset_hash`
- **Stale serving:** nodes serving seq < chain seq
- **Mismatch:** served RouteSet hash != chain routeset_hash
- **Expiry abuse:** exp too far in the future (policy-defined)
- **Delegation mismatch:** served GatewayRoutesV1 hash != chain gateway_routes_hash
- **Delegation equivocation:** same `(name_id, g_seq)` with different gateway_routes_hash

---

## 9. Reorg / Finality Considerations

If the chain can reorg:
- Clients SHOULD treat commitments as authoritative only after finality (policy-defined confirmations).
- Resolvers MAY serve cached data while awaiting finality, but MUST recheck once finality is reached.

---

## 10. Rationale: Why This Is Enough

Storing only `(seq, exp, routeset_hash)` (plus optional delegation commitment):

- prevents replay by requiring seq monotonicity
- prevents indefinite staleness via exp
- detects tampering via cryptographic commitment
- enables subdomain gateway routing without storing route tables on-chain
- avoids heavy on-chain storage of records, signatures, or CIDs
