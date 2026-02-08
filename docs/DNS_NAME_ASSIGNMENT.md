# .dns Name Assignment

## Rules
- User-chosen name
- Length: 4-13
- Lowercase letters, digits, hyphen
- No leading/trailing hyphen
- Reserved words blocked

## Assignment Flow
1. User selects name.
2. Program checks availability (PDA does not exist).
3. Mint Toll Pass NFT + create NameRecord.
4. Name resolves via the name registry + resolver.

## Fallback
- Private: name.dns
- Public fallback: name.dns.rail.golf
