# Wallet SDK Interface

## Purpose
- Base wallet used by browser extension and other clients.
- Other wallets can plug in through adapters.

## Interfaces
- connect()
- signMessage(message)
- signTransaction(tx)
- getAddress()
- getChain()
- getSessionToken()

## DNS Hooks
- enableDns()
- disableDns()
- setResolver(url)
- setTrustBundle(certBundle)
