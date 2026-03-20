# Domain Owner Flow

This is the default hosted-product flow TollDNS should optimize for.

The target user is a domain owner who wants a more portable naming and routing layer without learning the protocol internals.

## Primary Wedge

The current wedge is:

- switch nameservers
- keep control of routing
- get clearer resolver behavior
- get continuity and recovery signals before silent domain loss

Everything else is secondary.

## Hosted Flow

### Step 1. Connect domain

The user enters:

- domain name
- contact email
- optional current provider/origin

The system returns:

- TollDNS nameservers
- expected verification steps
- a clear "what changes / what does not change" summary

### Step 2. Verify ownership

The user proves control through one of:

- nameserver change propagation
- TXT record challenge
- registrar-backed verification when available

The product should emphasize:

- registrar ownership stays with the user
- nameserver switch is reversible
- no wallet or crypto setup is required

### Step 3. Route traffic

After verification, the user configures:

- A record
- CNAME
- TXT

The minimum product should make these three actions obvious and safe.

### Step 4. Observe status

The user should immediately see:

- nameserver status
- routing status
- DNS health/confidence
- continuity status
- next action if anything is incomplete

### Step 5. Stay protected

The system then becomes the ongoing control plane for:

- routing visibility
- continuity banners and grace state
- policy-based credits
- eventual recovery or hosting expansion paths

## What This Flow Should Not Lead With

Do not lead this flow with:

- miners
- tokenomics
- protocol architecture
- storage markets
- generalized decentralization claims

Those can exist in the background, but they are not the conversion path for mass adoption.

## Immediate Product Requirements

To make this flow real, the repo should prioritize:

- one clear domain-owner onboarding page
- one gateway-served domain-owner control plane page
- one nameserver switch instruction path
- one simple zone-management path
- one continuity/routing status view
- one hosted default story

Current runtime page:

- `gateway/public/domain-owner/index.html`

## Success Criteria

The flow is good when a normal domain owner can:

1. understand what TollDNS does in under 2 minutes
2. switch nameservers in under 10 minutes
3. verify routing and continuity state without reading protocol docs
4. manage basic records without touching low-level scripts
