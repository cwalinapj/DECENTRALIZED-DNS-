# 13 — Client Apps & Extensions (iOS/Android/macOS/Windows + Browser Plugins)

Repo home: https://github.com/cwalinapj/DECENTRALIZED-DNS-

Mass adoption requires consumer-grade software. TollDNS clients provide:
- secure DNS (DoH/DoT) configuration with minimal friction
- Index Unit spend escrow UX (no per-query prompts)
- safety controls (limits, allow/deny)
- Web3 resolution and gateway UX (optional)
- extension ecosystem for web3/login and developer tooling

Related:
- Adoption strategy: `docs/10-adoption-and-product-strategy.md`
- Tokenomics: `docs/05-tokenomics.md`
- Architecture: `docs/01-architecture-overview.md`

---

## 1) Platforms

Planned first-class clients:
- iOS
- Android
- macOS
- Windows

Optional later:
- Linux desktop
- router-mode integrations (OpenWrt-class, see miner roadmap)

---

## 2) Core Client Responsibilities

### 2.1 DNS Integration (DoH/DoT)
- configure system-level secure DNS where possible
- provide “always-on” gateway selection (policy-aware)
- support automatic fallback behavior as signaled by policy

### 2.2 Wallet + Spend Escrow (Index Units)
- hold Index Units for usage/tolls
- create and sign vouchers for micro-spends
- enforce local user safety rules:
  - max spend/day
  - emergency stop
  - allow/deny lists
  - “business mode” identification (where applicable)

**Important:** usage is priced in Index Units.

### 2.3 Privacy Controls
- minimal telemetry by default
- coarse region hints only when needed
- controls for web3 namespace resolution preferences

---

## 3) Role-Based Requirements (Business / Dev / End User)

- end users (consumer): Index tolls; typically no required native stake
- business users: Index tolls + required native stake
- developers: native stake + permissions for adapters/gateways/connectors
- miners/operators: native stake and receipt signing

Client UX must make these distinctions clear without overwhelming users.

---

## 4) Browser Extensions (Web3 UX + Developer Tools)

Extensions can:
- provide Web3 resolution UX (name → pointer → gateway)
- enable Web3-native login primitives and session identity tools
- expose worker templates and connector setup helpers
- allow per-site routing preferences (privacy/performance) where policy permits

Extensions should be:
- opt-in
- transparent about permissions
- strict on data handling

---

## 5) “Light Mining” in Extensions (Optional, Careful)

Browser-based mining is risky for trust and device health.
If supported at all:
- opt-in only
- strict resource caps
- clear UI and accounting
- prefer non-invasive contributions (e.g., lightweight probing, cache assistance) over CPU-intensive work

---

## 6) App Distribution & Onboarding

Key onboarding goals:
- “one tap” secure DNS enablement (where OS allows)
- clear explanation of Index Unit usage pricing
- simple wallet top-up and limits
- easy enable/disable per network (Wi-Fi vs cellular)
- smooth migration path for web3 gateways and static hosting users

---

## 7) Where This Fits in the Repo

Suggested future structure:
- `/client/ios/`
- `/client/android/`
- `/client/desktop/` (macOS/Windows)
- `/extensions/` (browser extensions)
- `/sdk/` (developer SDK for vouchers, policies, web3 resolution helpers)

Docs:
- This file: `docs/13-client-apps-and-extensions.md`
