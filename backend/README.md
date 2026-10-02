# 248 Works Backend

.NET 8 Web API + Azure Cosmos DB.

## Architecture

React -> .NET 8 API -> Cosmos DB

## Cosmos configuration

Set these environment variables locally or through your hosting platform:

- COSMOS_ENDPOINT
- COSMOS_KEY

Never commit the Cosmos key.

## Data migrations

Cosmos DB is document-oriented, so the project uses **versioned, idempotent data migrations** rather than relational EF schema migrations.

Migration records are stored in the existing `248Data` container using:

- `type = "migration"`
- `id = migration identifier`

A migration runs once and is marked applied only after its `UpAsync` operation succeeds.

## Running

```bash
cd backend/248.Works.Api
dotnet restore
dotnet run
```

The migration runner is available as a service and will be wired to an explicit migration command before production deployment.

## Current migration

`001_create_initial_data` seeds the initial job documents from the React MVP into Cosmos DB.

Next migrations should be additive and numbered:

`002_add_provider_fields`
`003_add_candidate_profile`
`004_add_application_entity`
...
