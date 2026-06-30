# Product V0 Permissions

V0 uses four workspace roles:

- `OWNER`: workspace owner with all workspace, billing, recovery and export authority.
- `ADMIN`: trusted administrator for workspace settings, credentials, recovery,
  reconciliation and production support.
- `CLIENT_MANAGER`: the end-user production role. This role combines brand,
  strategy and wallet responsibilities so a customer can approve brand truth,
  run creation, authorise paid generation, manage wallet purchases, approve media and
  publish without switching roles.
- `REVIEWER`: limited review participant who can inspect assigned review context and
  submit comments.

The dedicated `OPERATOR`, `BRAND_MANAGER`, `STRATEGIST` and `FINANCE` roles are removed.
Break-glass recovery controls, provider reconciliation, credential rotation and
compensating credit adjustments are assigned to Owner/Admin because they are system
control actions, not normal client workflow actions.

| Capability | Owner | Admin | Client Manager | Reviewer |
|---|:---:|:---:|:---:|:---:|
| Manage workspace/members | Yes | Yes | No | No |
| Manage provider credentials | Yes | Yes | No | No |
| Manage workspace capabilities | Yes | Yes | No | No |
| Approve brand profile/assets | Yes | Yes | Yes | No |
| Select blueprint and run scripts | Yes | Yes | Yes | No |
| Confirm paid generation | Yes | Yes | Yes | No |
| Manage avatars/consent | Yes | Yes | Yes | No |
| Submit review comments | Yes | Yes | Yes | Yes |
| Approve/reject final video | Yes | Yes | Yes | No |
| Schedule/publish approved media | Yes | Yes | Yes | No |
| Collect performance observations | Yes | Yes | Yes | No |
| View creative lineage and performance | Yes | Yes | Yes | No |

The `schedule_publish_approved_media` permission (Owner/Admin/Client Manager; Reviewer denied)
gates the full publication path: creating and editing a calendar post (V0-U1), publishing to the
bound platform (V0-U2/V0-U3), reconciling an uncertain publish operation, and independently
verifying the audience-facing live post before it is claimed done (V0-U4
`POST /calendar-posts/{id}/verify`). A Reviewer may comment on the exact final video but cannot
publish or verify it. Audience verification requires no `Idempotency-Key`: exactly-once is the
one-`PostVerification`-row-per-post rule. The verify endpoint never reveals whether a
cross-workspace post exists: a missing or other-workspace post returns the same
`WORKSPACE_ACCESS_DENIED` (404).

The `view_lineage_and_performance` permission (Owner/Admin/Client Manager; Reviewer denied) gates
read-only inspection of the system of record after publication: exporting the complete creative
ancestry of one final video (V0-A1 `GET /lineage/{finalVideoId}`) and reading every immutable
`PerformanceSnapshot` for one calendar post (V0-A1 `GET /calendar-posts/{id}/performance`). A
Reviewer may approve the exact final video but cannot read the production lineage or observed
performance. Both reads hide a cross-workspace or missing reference behind the same
`WORKSPACE_ACCESS_DENIED` (404) so the owning workspace id never leaks.

The `schedule_publish_approved_media` permission also gates collecting a fresh observed performance
snapshot for a calendar post (V0-A1 `POST /calendar-posts/{id}/performance-collect`), which
requires an `Idempotency-Key`. Collect is a write of an immutable observation, so it stays on the
publication actor; the read of the resulting snapshots is the separate
`view_lineage_and_performance` permission.

The `manage_avatars_consent` permission (Owner/Admin/Client Manager) gates reading the
consent-safe avatar catalogue (`GET /avatars`) and recording a real consent revocation
(V0-A2 `POST /avatars/{avatarProfileId}/consent-revocation`). Revocation is a monotonic,
audited, idempotent write that immediately blocks future avatar use at the generation
estimate boundary. A missing, non-owned or cross-workspace avatar or brand profile is
hidden behind `WORKSPACE_ACCESS_DENIED` (404); the response never echoes the denied
object's identifiers.

The `manage_provider_credentials` permission (Owner/Admin only) gates storing credential
metadata (`POST /workspaces/{workspace_id}/service-credentials`) and rotating a
credential (V0-A2 `POST /workspaces/{workspace_id}/service-credentials/{credentialId}/rotate`).
Rotation marks the prior credential `REVOKED`, issues a fresh `ACTIVE` credential with a
new `secret-manager://` reference, stamps `lastRotatedAt`, and writes one
`service_credential.rotated` audit row. The prior credential's `secretRef` is never
echoed back, and a rotation input carrying a plaintext secret field is rejected with
`VALIDATION_FAILED` (422). A missing or non-owned credential is hidden behind
`WORKSPACE_ACCESS_DENIED` (404).
| Purchase credits and view wallet ledger | Yes | Yes | Yes | No |
| Adjust credits | Yes | Yes | No | No |
| View provider/financial reconciliation | Yes | Yes | No | No |
| Retry/reconcile provider jobs | Yes | Yes | No | No |
| Export/delete workspace | Yes | Yes | No | No |
| View operational traces and metrics | Yes | Yes | No | No |
| Run restore drills | Yes | Yes | No | No |
| Configure simulator modes | Yes | Yes | No | No |

V0-A2 hardening drills reuse the existing Owner/Admin capabilities and introduce no new
permission. The `run_restore_drills` capability (Owner/Admin) gates the B2 transfer
benchmark (`POST /workspaces/{workspace_id}/b2-benchmark`), the two-hour load-shaped
backlog simulation (`POST /workspaces/{workspace_id}/backlog-simulation`) and the
incident/runbook rehearsal (`POST /workspaces/{workspace_id}/incident-rehearsal`). The
`view_operations` capability (Owner/Admin) gates the read-only operational alert states
(`GET /workspaces/{workspace_id}/operations/alerts`). Each drill is workspace-scoped,
authenticated and audited (alerts is read-only and writes no audit); a missing, non-owned or
cross-workspace target is hidden behind `WORKSPACE_ACCESS_DENIED` (404) and an
unauthenticated call is rejected with 401.

Every action remains workspace-scoped and audited. Ownership does not bypass consent,
brand approval, credit, review or publication gates. Break-glass access requires a
reason, expiry and separate audit event.
