# Local Dev (MVP)

## One-command run
```bash
/Users/root1/dev/web3-repos/DECENTRALIZED-DNS-/scripts/dev.sh
```

## What it starts
- Name gateway on `http://localhost:8054/resolve?name=example.com`

## Windows notes
- Use Git Bash or WSL.
- Replace paths with your Windows drive equivalents.

## Manual run
```bash
cd /Users/root1/dev/web3-repos/DECENTRALIZED-DNS-/resolver
npm install
npm run build
PORT=8054 npm start
```
