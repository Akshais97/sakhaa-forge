# Product V0 Jobs

## Job Types

```text
brand_crawl
brand_asset_validate
viral_candidate_search
media_acquire
thumbnail_decipher
scene_detect
transcribe
keyframe_extract
vision_analyze
ocr_extract
blueprint_merge
formula_derive
director_prompt_generate
script_tournament
provider_generate
ae_plan_validate
ae_render
review_notify
publish_post
verify_post
send_notification
performance_collect
reconcile_provider
reconcile_credit
reconcile_publishing
```

## Canonical State

```text
created -> queued -> leased -> running -> succeeded
                     |          |-> retry_wait -> queued
                     |          |-> failed
                     |          |-> cancel_requested -> cancelled
                     |-> expired -> queued
```

PostgreSQL owns jobs, attempts, dependencies and leases. BullMQ carries opaque wake-ups.
Outbox relay may fail while Redis is unavailable; that failure does not change canonical
job state. The same pending outbox row must relay later without duplicating completion.

## Paid Provider State

```text
created -> submitting -> accepted -> processing -> completed
               |            |             |-> failed
               |            |-> unknown -> reconciled
               |-> unknown
```

Persist the operation and reserve credits before network I/O. A timeout after submission
becomes `unknown`; reconciliation queries by external ID, request hash or original
idempotency key. Blind resubmission is prohibited.

## Pipeline Rules

- Brand approval is a dependency for every production script/generation job.
- Formula derivation requires a valid blueprint or the approved default formula.
- Generation requires a selected script, avatar/route and active credit reservation.
- AE rendering requires a validated plan.
- Review approval requires the exact final-video version.
- Publishing requires approval and schedule/account authorization.
- Completion notification requires audience verification.

## Capacity and Resource Controls

- Concurrency, timeout, retry and maximum payload settings are versioned configuration
  per job type and resource class.
- HeyGen submission respects the configured account limit and `Retry-After`; the current
  pay-as-you-go reference limit is 10 concurrent asynchronous jobs.
- AE rendering defaults to one job per compatible licensed worker until load evidence
  supports a higher value.
- CPU, GPU and AE jobs use separate queues so one resource class cannot starve another.
- Queue-age and oldest-runnable-job metrics alert before the user-facing SLO is breached.

## Failure Handling

- Retry only classified transient errors with bounded exponential backoff and jitter.
- Invalid media, policy failure and insufficient credits are non-retryable.
- Lease expiry allows recovery but never two active workers.
- A stale worker lease cannot complete or fail a requeued job.
- Cancellation stops new children; uncertain provider operations reconcile first.
- Unreferenced artifacts are lifecycle-cleaned.
- Exhausted or non-retryable jobs move to `failed`, retain `last_error_code`, emit
  `job.dead_lettered` and remain visible with an Owner/Admin action and audit trail.
