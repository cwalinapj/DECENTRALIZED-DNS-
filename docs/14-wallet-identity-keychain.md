# 14 — Wallet, Identity, Keychain, and Secret Management

Repo home: https://github.com/cwalinapj/DECENTRALIZED-DNS-

TollDNS includes a wallet because users need:
- Index Unit escrow for tolls (no per-query prompts),
- native token staking for business/dev/operator roles,
- and a secure identity layer for Web3 resolution + future services.

To drive mass adoption, the wallet should also function as:
1) a **password manager / keychain** (consumer value),
2) a **SSO bridge** for Web2 sites where Web3 login is not available yet,
3) and (for developers) a **secret management** layer that reduces reliance on `.env` files.

Related:
- Adoption strategy: `docs/10-adoption-and-product-strategy.md`
- Client apps: `docs/13-client-apps-and-extensions.md`

---

## 1) Wallet as a Password Keychain (Consumer Feature)

The wallet app can include a secure keychain that:
- stores credentials (passwords, passkeys, TOTP seeds if enabled)
- checks whether passwords are:
  - compromised (known breach exposure checks)
  - duplicated across sites
  - weak (entropy/length checks)
- recommends and generates strong passwords
- supports autofill (mobile + desktop)

### 1.1 Password Safety Checks (High-Level)
Keychain should provide:
- duplicate password detection (local, privacy-preserving)
- strength analysis
- breach exposure detection using privacy-preserving lookup patterns where possible

The default should minimize data sharing and avoid sending raw passwords anywhere.

---

## 2) Web2 SSO Bridge (When Web3 Login Isn’t Available Yet)

TollDNS wallet can provide an “SSO-style” login bridge for Web2:
- the wallet becomes the user’s identity broker
- the browser extension/app can assist login flows on Web2 sites
- this provides a stepping stone until native Web3 login is widely supported

Examples of what “SSO bridge” can mean (implementation-defined):
- device-based login approvals
- signed session assertions
- passkey-based flows where sites support passkeys
- managed credential injection (autofill + session management)

**Important:** Any Web2 SSO integration must be opt-in and respect site security constraints.

---

## 3) Wallet Unlock Model: Stronger Than “Just a Password”

A core security goal is reducing single-point failure risk.

Even if someone obtains:
- the seed phrase, or
- the private key,

the wallet should still be difficult to unlock and use on a new device.

### 3.1 Revolving Passcode Unlock (Concept)
Support an unlock mechanism that requires a **revolving/rolling code** in addition to standard device security.

One model conceptually similar to “revolver-style” systems:
- a passcode changes on a schedule or via challenge/response
- reduces the value of a static password

### 3.2 Second-Layer Key (Optional)
Offer a second factor that is not just a password:
- hardware key / USB-stored secret
- secondary key shard stored offline
- “recovery pack” with backup codes

### 3.3 Backup Codes + Recovery
Recovery must be possible without turning support into a custodial backdoor:
- one-time backup codes
- social recovery (optional, governance/policy defined)
- device binding with explicit transfer flow

**Design principle:** make “new device takeover” hard, even if the seed is compromised.

---

## 4) Developer Secret Management (Replacing `.env` Files)

Developers often store secrets in `.env` files:
- API keys
- webhook tokens
- signing keys (non-wallet)
- service credentials

TollDNS can provide a system where secrets are:
- referenced on-chain,
- access-controlled by the wallet / identity layer,
- and optionally monitored/rotated by automated watchdog processes.

### 4.1 “Hashed NFT” Secret Pointers (Concept)
Store a **hashed commitment** (not the secret itself) as an NFT-like on-chain object:
- the NFT is a *pointer/commitment* to a secret
- the actual secret remains off-chain (encrypted) and retrievable only by authorized identities
- the chain stores:
  - immutable identifiers
  - version/rotation history
  - policy metadata (what should happen on rotation)
  - audit events (without leaking the secret)

This enables:
- immutable references for deployments
- verifiable “which version is active”
- automated workflows without exposing secrets publicly

### 4.2 Secret Rotation Watchdogs
Users/devs can attach a secret-NFT pointer to an active service:
- a watchdog monitors rules (expiry, breach signals, usage anomalies)
- the watchdog triggers:
  - rotation
  - revocation
  - downstream webhook updates
  - emergency disable

**Goal:** “secrets that manage themselves” under user-defined policy.

### 4.3 What Must NOT Happen
- raw secrets MUST NOT be stored on-chain
- anything stored publicly must be non-reversible (hash/commitment)
- rotation must not create a centralized custodial dependency

---

## 5) Where This Fits in the Repo

- This doc: `docs/14-wallet-identity-keychain.md`
- Client UX and extension flows: `docs/13-client-apps-and-extensions.md`
- Worker connector secrets integration: `docs/11-workers-and-edge-compute.md` (optional cross-link)

Suggested future directories:
- `/wallet/` — wallet + keychain implementation
- `/extensions/` — browser extension for autofill/SSO bridge
- `/secrets/` — secret pointer specs, encryption formats, rotation tooling
