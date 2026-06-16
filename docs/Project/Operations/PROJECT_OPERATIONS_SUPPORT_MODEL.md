# Support Operating Model

## Channels

- Internal pilot: dedicated team channel plus structured issue form.
- External pilot: authenticated support portal/email with workspace and trace identifiers.
- Security and privacy: separate confidential escalation path.

## Severity and Targets

| Severity | Example | Acknowledge | Update cadence |
|---|---|---:|---:|
| P0 | tenant exposure, corruption, duplicate material charge | Immediate/on-call | Every 30 minutes |
| P1 | core workflow blocked, provider outage without workaround | Same business hour | Every 2 hours |
| P2 | degraded workflow with workaround | One business day | Daily |
| P3 | request or cosmetic issue | Two business days | At prioritization |

These are operating targets, not contractual external SLAs.

## Required Evidence

Each case records workspace, impact, timeline, request/job/provider IDs, reproduction,
containment, resolution, root cause, regression test, user communication, owner, and
closure approval.

## Support Economics

Track support minutes by workspace and issue category. Include support cost in contribution
margin and identify workflows requiring repeated human rescue. Do not scale customer
acquisition while support cost per approved creative is uncontrolled.
