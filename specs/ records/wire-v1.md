# Wire Protocol v1 (Router-Friendly)

**Status:** Draft  
**Version:** 1  
**Purpose:** Define a compact request/response protocol suitable for routers, Raspberry Pi agents, and ASIC-friendly implementations.

This is **not DNS wire format**. A gateway can translate RouteSets to classic DNS answers for LAN clients.

---

## 1. Transport

- Default: UDP
- TCP fallback: for large payloads
- Port: TBD

---

## 2. Encoding Rules

- Integers are **little-endian**
- Packets are **length-delimited** (header includes `payload_len`)
- Reject packets if `payload_len` exceeds local limits

---

## 3. Fixed Header (24 bytes)

| Field        | Size | Type  | Description |
|-------------|-----:|-------|-------------|
| magic       | 4    | bytes | ASCII `DDNS` |
| version     | 1    | u8    | `0x01` |
| msg_type    | 1    | u8    | see §4 |
| flags       | 2    | u16   | see §3.1 |
| req_id      | 4    | u32   | request id |
| ns_id       | 4    | u32   | namespace id |
| payload_len | 4    | u32   | bytes after header |
| reserved    | 4    | u32   | must be zero |

### 3.1 Flags (u16)
- bit 0: `F_WANT_ANCHOR` (prefer AnchorV1 response if available)
- bit 1: `F_NO_CACHE` (bypass cache if possible)
- bit 2: `F_TRUNCATED` (response truncated; retry via TCP)
- others: reserved (0)

---

## 4. Message Types

| Type | Name | Direction | Purpose |
|---:|------|-----------|---------|
| 1 | QRY | C→N | Query for a name |
| 2 | ANS | N→C | Full RouteSet answer |
| 3 | ANC | N→C | Anchor-only answer |
| 4 | NOT | N→C | Negative response / error |
| 5 | GSP | N↔N | Gossip announcement |
| 6 | GET | C/N→N | Fetch RouteSet by (name_id, seq) or hash |
| 7 | PUT | C/N→N | Publish RouteSet (optional) |

---

## 5. Payloads

### 5.1 QRY (msg_type=1)
| Field   | Size | Type  | Description |
|--------|-----:|-------|-------------|
| name_id| 32   | bytes | derived identifier |
| qtype  | 2    | u16   | 0=ANY or DNS type code |
| min_seq| 8    | u64   | 0 or minimum acceptable sequence |

### 5.2 ANS (msg_type=2)
| Field        | Size | Type | Description |
|-------------|-----:|------|-------------|
| status      | 1    | u8   | 0=OK else error |
| routeset_len| 4    | u32  | bytes length |
| routeset    | var  | bytes| canonical RouteSetV1 bytes |

### 5.3 ANC (msg_type=3)
| Field      | Size | Type | Description |
|-----------|-----:|------|-------------|
| status    | 1    | u8   | 0=OK else error |
| anchor_len| 4    | u32  | bytes length |
| anchor    | var  | bytes| canonical AnchorV1 bytes |

### 5.4 NOT (msg_type=4)
| Field   | Size | Type | Description |
|--------|-----:|------|-------------|
| code   | 2    | u16  | error code |
| retry  | 4    | u32  | seconds to wait (0 unknown) |
| msg_len| 2    | u16  | optional UTF-8 msg length |
| msg    | var  | bytes| optional UTF-8 message |

Suggested codes:
- 1 NOT_FOUND
- 2 EXPIRED
- 3 BAD_REQUEST
- 4 INTERNAL
- 5 TRY_TCP

### 5.5 GSP (msg_type=5)
| Field         | Size | Type  | Description |
|--------------|-----:|-------|-------------|
| name_id      | 32   | bytes | identifier |
| seq          | 8    | u64   | latest sequence |
| exp          | 8    | u64   | expiry |
| routeset_hash| 32   | bytes | commitment |
| hops         | 1    | u8    | hop limit |
| reserved     | 7    | bytes | zero |

### 5.6 GET (msg_type=6)
| Field     | Size | Type  | Description |
|----------|-----:|-------|-------------|
| mode     | 1    | u8    | 1=(name_id,seq), 2=hash |
| reserved | 7    | bytes | zero |
| name_id  | 32   | bytes | if mode=1 |
| seq      | 8    | u64   | if mode=1 |
| hash     | 32   | bytes | if mode=2 |

### 5.7 PUT (msg_type=7) (optional)
| Field        | Size | Type | Description |
|-------------|-----:|------|-------------|
| routeset_len| 4    | u32  | bytes length |
| routeset    | var  | bytes| canonical RouteSetV1 bytes |

PUT SHOULD be policy-gated (trusted publishers) and always verified before propagation.

---

## 6. Verification Modes (Recommended)

- Verify RouteSet signature (Ed25519)
- Verify `routeset_hash` matches chain commitment
- Optionally verify AnchorV1 hash/signature for redundancy

Lightweight routers may delegate verification to a local agent.

---

## 7. UDP Size Handling

If response does not fit safely in UDP:
- set header flag `F_TRUNCATED`
- optionally send NOT with code `TRY_TCP`
- client retries via TCP
