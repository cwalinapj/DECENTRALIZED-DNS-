# Build Registry (EVM)

This contract stores a tiny on-chain mapping:

`component_id -> (version, build_hash, updated_at)`

Recommended identifiers:
- `component_id = keccak256(utf8(componentName))`
  - example names: `edge-node`, `watchdog`, `ipfs-anchor`, `miner-gui`

Recommended build hash:
- `build_hash = BLAKE3_256( UTF8(docker_repo_digest_string) )`

Where docker repo digest string looks like:
- `repo/name@sha256:...`

This lets a Raspberry Pi verify it is running an approved build by:
1) reading approved build hash from chain
2) computing local build hash from its Docker image digest
3) refusing to start if mismatch
