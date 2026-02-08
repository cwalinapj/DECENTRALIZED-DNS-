# Provider Options

## Networks Supported
- Naming systems (ENS, SNS/Bonfida, Unstoppable, Handshake)
- Storage networks (IPFS, Filecoin, Arweave)
- Privacy networks (Tor ODoH)

## Optional Services
- **Caching**: providers can opt into CDN-style caching for their objects.
- **Dedicated name**: we can provision a dedicated name for the provider.
- **Email + webhook records**: optional MX/TXT/WEBHOOK records for the dedicated name.
- **Anonymous name servers**: if enabled, we serve under an anonymous NS and
  publish a Google-indexable page that 301 redirects to the provider’s primary domain.

## Indexing Flow (Anonymous NS)
- Index target is a static page with canonical metadata.
- Search engine click 301 redirects to provider’s main domain.
