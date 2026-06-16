# Sakhaa Forge Infrastructure

V0-F0 uses `infra/docker/docker-compose.local.yml` for local PostgreSQL and Redis.
Dummy local storage uses a deterministic filesystem-backed simulator rooted at
`.local/storage`. Backblaze B2 remains the authoritative production storage target.
