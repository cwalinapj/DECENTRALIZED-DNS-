.PHONY: test-contracts test-solana

test-contracts:
	cd /Users/root1/scripts/DECENTRALIZED-DNS-/contracts && forge test

test-solana:
	cd /Users/root1/scripts/DECENTRALIZED-DNS-/solana && anchor test --provider.cluster devnet --provider.wallet ./devnet-wallet.json
