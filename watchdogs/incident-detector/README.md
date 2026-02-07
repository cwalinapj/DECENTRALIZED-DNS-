# Incident Detector (Attack Mode Signals)

The incident detector aggregates signals across:
- multiple backends degrading simultaneously
- global timeout spikes
- edge overload indicators (if available)

Purpose:
- recommend raising or lowering incident level
- provide inputs for Attack Mode triggers (policy-controlled)

Attack Mode actions (examples):
- tighter admission gating
- cache-first / cache-only modes for certain patterns
- increased rewards for resilient edges/anycast/scrubbing operators

Related:
- Watchdogs: `docs/03-watchdogs-and-fallback.md`
- Resilience tokenomics: `docs/06-resilience-tokenomics.md`
