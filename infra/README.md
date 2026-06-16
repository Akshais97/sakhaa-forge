# Sakhaa Forge Infrastructure

V0-F0 uses `infra/docker/docker-compose.local.yml` for local PostgreSQL, Redis and
S3-compatible object storage. Backblaze B2 remains the authoritative production storage
target; local object storage is a deterministic simulator.
