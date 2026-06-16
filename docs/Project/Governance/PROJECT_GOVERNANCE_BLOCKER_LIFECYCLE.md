# Blocker Lifecycle

## Severity

- `P0`: security, tenant leak, data loss, invalid commercial use, or corrupted scoring.
- `P1`: end-to-end workflow unavailable or model results untrustworthy.
- `P2`: degraded feature with a safe workaround.
- `P3`: localized defect or documentation gap.

## States

`reported -> triaged -> owned -> mitigating -> validating -> resolved -> closed`

Use `blocked_external` when awaiting a provider, license, or data owner. Use `reopened`
when validation fails.

## Required Fields

Title, severity, affected workspace/environment, first observed time, evidence, owner,
customer impact, workaround, root-cause hypothesis, next checkpoint, and closure proof.

## Hard Blockers

The following stop release automatically:

- unresolved cross-tenant access;
- TRIBEv2 commercial rights not established for a paid release;
- any non-HCP-MMP1 or non-A-Q artifact accepted by production;
- score lineage missing;
- model evaluation leakage;
- unsigned or unauthorized V0 integration-event trust;
- unrecoverable migration or restore failure.

## Closure

A blocker closes only after the fix is deployed, the original reproduction no longer
fails, regression coverage exists, affected data is assessed, and the owner records
evidence. P0/P1 items require a short retrospective.
