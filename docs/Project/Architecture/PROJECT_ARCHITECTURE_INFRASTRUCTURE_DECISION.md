# Pilot Infrastructure Decision

**Decision date:** 2026-06-15  
**Status:** Selected for implementation planning; procurement remains reversible.

## Selected Stack

| Capability | Selection | Rule |
|---|---|---|
| Web | Next.js | No database credentials in the browser or web server |
| Domain API | NestJS + Fastify | Sole domain API and PostgreSQL writer |
| Database/Auth | Supabase PostgreSQL + Auth | PostgreSQL is canonical; Realtime is job-progress only |
| ORM/migrations | Prisma | Sole schema and migration owner |
| Heavy SQL | Restricted `pg` adapter | Named parameterized modules only |
| Queue | BullMQ + managed Redis | Delivery only; fixed-capacity plan preferred |
| Queue consumer | Railway or Render always-on worker | Separate process/deployment from API |
| AI/video/GPU | Private Python workers | No database or Redis credentials |
| Media/artifacts | Backblaze B2 | Three private buckets with presigned PUT/GET |
| Telemetry | OpenTelemetry plus provider logs | Correlate request, job, tenant and trace IDs |

## Region

India is primary. Use Supabase Mumbai or the nearest suitable Indian region and co-locate
NestJS, Redis and the BullMQ processor. Backblaze B2 has no India region; choose its
region only after measuring representative upload, worker download, output upload and
user playback flows.

## B2 Storage Layout

- `media-quarantine`: untrusted uploads and incomplete multipart uploads.
- `media-clean`: validated immutable production media.
- `artifacts-private`: derived AI/video/model/report artifacts.

Use bucket-scoped application keys, short-lived presigned URLs, lifecycle cleanup and
database-held metadata. B2's free allowance is useful for a pilot but is not a permanent
zero-cost guarantee; storage and transfer limits must be monitored.

## Redis Operations

BullMQ requires Redis persistence and `maxmemory-policy=noeviction`. Use a managed fixed
plan rather than command-priced serverless Redis when polling cost becomes material.
Producers fail fast when Redis is unavailable; workers reconnect and shut down
gracefully.

## Selection Gate

Run representative end-to-end jobs and record:

- India-to-B2 upload and download latency;
- queue delay, retries and duplicate handling;
- successful cost per processed video minute;
- database connection and query-plan behavior;
- worker startup, GPU utilization and manual intervention.

The stack may be consolidated later, but changing database ownership, queue semantics or
storage layout requires a superseding ADR.
