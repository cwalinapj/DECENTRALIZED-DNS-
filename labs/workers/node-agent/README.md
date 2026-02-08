# Node Agent (Rust)

This is the Linux node agent daemon for the edge network.

## Build
```bash
cargo build --release
```

## Init
```bash
./target/release/ddns-node init --config ./config.local.json
```

## Run
```bash
./target/release/ddns-node run --config ./config.local.json
```

## Docs
See `docs/NODE_AGENT_LINUX.md`.
