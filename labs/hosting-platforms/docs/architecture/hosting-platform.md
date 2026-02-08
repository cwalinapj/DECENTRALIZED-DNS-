# Hosting Platform (Token-Exchange First)

## Goals
- All hosting actions are tied to token exchange.
- Support Web3 DNS integrations and toll credits.
- Keep infra modular: orchestration, API, and sandboxing split.

## Core Services
- hosting-orchestrator: provisions sites, sandboxes, routing, certs.
- hosting-api: customer/admin API and token exchange hooks.
- sandbox-orchestrator: snapshot cloning and job execution.

## Token Exchange Flow
- User submits payment intent (native token or stable).
- API validates payment and issues a hosting credit.
- Orchestrator consumes credits to provision workloads.

## Integrations
- DNS resolver integration for .dns and .free namespaces.
- Toll gate checks for higher-tier features.

## Deployment Targets
- Kubernetes or Docker Swarm.
- Storage: ZFS/Ceph-backed volumes.
