.PHONY: fmt lint test e2e test-contracts test-solana

fmt:
	cd gateway && npx tsc -p tsconfig.json --noEmit
	cd core && npx tsc -p tsconfig.json --noEmit

lint:
	markdownlint "**/*.md" --ignore node_modules --ignore .git --config .markdownlint.json
	cd gateway && npm run lint
	cd core && npm run build

test:
	cd core && npm ci && npm run build && npm test
	cd gateway && npm ci && npm run build && npm test
	bash tests/run_all.sh

e2e:
	bash scripts/validate-compat-mvp.sh

test-contracts:
	cd contracts && forge test

test-solana:
	cd solana && anchor test --provider.cluster devnet --provider.wallet ./devnet-wallet.json
