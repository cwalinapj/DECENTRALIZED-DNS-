# Certificates (DNS + Hosting)

## Public ICANN Names
- Use ACME (DNS-01) to issue public certificates.
- Works for name.dns.rail.golf and other ICANN subdomains.

## Private .dns Names
- Public CAs will not issue for private TLDs.
- Use an internal CA for name.dns.
- Wallet plugin or client app installs trust bundle.

## Security
- Bind certificates to the Toll Pass owner.
- Rotate on ownership changes or key rotation.
