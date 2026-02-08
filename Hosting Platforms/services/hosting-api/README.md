# Hosting API

Customer/admin API. Validates token payments and issues hosting credits.

## Token-Exchange Flow
1. POST /v1/payments/intent to create a payment intent.
2. User pays on-chain.
3. POST /v1/payments/confirm verifies the transaction and issues credits.
4. Orchestrator consumes credits via /v1/credits/consume.

See openapi.yaml for endpoints and schemas.
