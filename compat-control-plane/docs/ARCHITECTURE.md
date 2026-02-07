# Compat Control Plane Architecture

## Components
- Site registry
- Upload intake
- Job runner
- Report storage

## Flow
1. Site registers and receives a site token.
2. Client uploads a bundle zip.
3. Job runner executes compatibility checks (Docker).
4. Reports are stored and served for review.
