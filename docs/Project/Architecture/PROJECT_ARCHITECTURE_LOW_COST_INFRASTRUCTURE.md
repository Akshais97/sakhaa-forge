# Low-Cost Infrastructure Methodology

**Research date:** 2026-06-15

## Principle

Optimize for cost per completed internal decision, not theoretical requests per second.
Keep the control plane small and move GPU work to interruptible, usage-metered execution.
Do not reserve continuous GPU capacity until measured queue demand justifies it.

## Recommended Pilot Shape

| Component | Pilot approach | Cost control |
|---|---|---|
| Web/API | Small India-region NestJS service | Scale API independently from queue worker |
| PostgreSQL/Auth | Supabase | Bound connections; PostgreSQL remains canonical |
| Redis/BullMQ | Managed fixed-capacity Redis | Persistence, `noeviction`, no canonical state |
| Object storage | Backblaze B2 private buckets | Lifecycle scratch data; measure cross-region transfer |
| GPU inference | Shut-down pod or serverless GPU | One job at a time; persistent cache only if cheaper |
| Training | Scheduled rented GPU session | Budget, checkpoint, stop when idle |
| Registry | MLflow metadata in PostgreSQL, artifacts in object storage | No separate platform initially |
| Observability | OpenTelemetry plus provider logs/metrics | Short diagnostic retention; durable audit only |

## GPU Selection Procedure

1. Measure actual peak VRAM and runtime on A5000/L4-class 24 GB hardware.
2. If it does not fit, test A40/A6000-class 48 GB hardware.
3. Use A100/H100 only when memory, runtime, or engineering cost proves cheaper overall.
4. Benchmark cold start, model load, stage runtime, GPU utilization, failure rate, and
   total billed seconds on representative short, medium, and long videos.
5. Select by cost per successfully scored video minute, not hourly rate alone.

Runpod's published pod rates currently include examples such as RTX A5000 at $0.27/hour,
L4 at $0.39/hour, A40 at $0.44/hour, and RTX A6000 at $0.49/hour. These are comparison
inputs, not guaranteed project costs. Source: https://www.runpod.io/pricing

Modal's Starter plan currently lists $30/month in included compute and usage-based,
autoscaling execution. It is a useful serverless comparison for bursty workloads.
Source: https://modal.com/pricing

## Storage Procedure

Use lifecycle classes:

- scratch/cache: hours or days;
- uploaded/generated media: workspace policy;
- immutable reports/manifests: longer retention;
- model/dataset artifacts: governance policy.

Backblaze B2 currently provides an initial free storage allowance, then usage-based
storage and transfer pricing. Use three private buckets and monitor retained bytes,
transactions and egress. The free allowance is a pilot aid, not a permanent zero-cost
assumption. B2 has no India region, so measure the complete India-to-B2 path.
Source: https://www.backblaze.com/cloud-storage/pricing

## Database Procedure

Use Supabase PostgreSQL with separately bounded API and queue-worker pools. Always-on
services use the appropriate pooled connection mode; Prisma migrations use a dedicated
migration connection and owner role. Track database size, compute, connection pressure,
backup needs and Realtime usage against the selected Supabase plan.
Source: https://supabase.com/pricing

## Required Cost Experiment

For at least 30 representative jobs record:

- video duration and modality availability;
- GPU model, cold/warm state, billed seconds, VRAM, and utilization;
- storage reads/writes and retained bytes;
- API/worker CPU time;
- Redis commands, memory and queue retention;
- India-to-B2 transfer bytes and latency;
- V0-reported creator-credit cost and generated duration;
- retries, failures, and duplicate-prevention outcome;
- manual intervention time;
- total cost per successful scored minute and approved revision.

Only measured results may populate the production budget. Provider price pages are
planning references and must be refreshed before procurement.

## Cost Gates

- No always-on GPU for Phase 1 without measured queue saturation.
- No GPU class upgrade without a recorded bottleneck.
- V2 does not initiate paid generation directly; V1 enforces estimate, confirmation,
  creator-credit reservation, and ledger entry.
- No training run without dataset readiness, budget, checkpoint plan, and stop condition.
- No external pricing until cost distribution and support burden are observed.
