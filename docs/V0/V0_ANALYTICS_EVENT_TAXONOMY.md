# Product V0 Analytics Event Taxonomy

**Status:** Canonical product analytics contract  
**Boundary:** Product analytics only; technical telemetry uses OpenTelemetry

## 1. Purpose

Product analytics measures whether users complete and repeat the V0 production workflow.
It does not replace audit records, job events, billing truth, provider reconciliation or
technical observability.

## 2. Event Envelope

Every event contains:

| Field | Type | Rule |
|---|---|---|
| `event_name` | string | Lower snake case from this catalog |
| `event_version` | integer | Starts at `1`; breaking meaning increments |
| `occurred_at` | UTC timestamp | Server time for durable transitions |
| `anonymous_actor_id` | pseudonymous string | No email/name |
| `workspace_id_hash` | one-way scoped hash | No raw workspace ID in external sink |
| `session_id` | random string | Rotated; not an auth token |
| `environment` | enum | local/staging/production |
| `source` | enum | web, api, worker |
| `slice_id` | string | Owning V0 slice |
| `properties` | object | Allowlisted event-specific fields |

Server events are authoritative for successful durable transitions. Browser events may
measure view/intent but cannot declare paid, approval, publish or verification success.

## 3. Prohibited Data

Never send:

- names, emails, phone numbers or addresses;
- scripts, captions, comments, prompts or extracted website copy;
- media, thumbnails, transcripts or OCR text;
- raw URLs when they may identify a customer/source;
- provider payloads, account IDs, tokens, secrets or signed URLs;
- full database IDs, hashes or idempotency keys;
- payment instrument or transaction details;
- likeness/voice consent evidence;
- error stack traces.

## 4. Retention

- Raw product events: 90 days.
- Aggregated pilot/funnel metrics: 24 months.
- Deletion removes actor/workspace-linkable analytics unless retention is legally
  required.
- Audit, financial and security retention are governed separately.

## 5. Funnel Stages

| Stage | Definition |
|---|---|
| `activation` | User reaches a workspace and begins brand intake |
| `brand_ready` | Exact brand profile approved |
| `blueprint_ready` | Existing/default/discovered blueprint reaches ready |
| `script_ready` | Exact script selected |
| `generation_committed` | User confirms a versioned estimate and reservation |
| `media_ready` | Generated media retained and settled |
| `final_ready` | AE final video rendered |
| `approved` | Exact final version approved |
| `published` | Provider/manual post identity recorded |
| `verified` | Audience verification passes |
| `repeat` | Workspace begins another production journey |

## 6. Foundation Events

| Event | Source | Trigger | Allowed properties |
|---|---|---|---|
| `workspace_created` | API | Workspace commit | `role`, `creation_path` |
| `workspace_selected` | web | User switches workspace | `from_surface`, `role` |
| `service_readiness_viewed` | web | Status view opened | `overall_state` |
| `job_status_viewed` | web | Durable job opened | `job_type`, `status` |
| `job_recovery_requested` | API | Authorised recovery action | `job_type`, `recovery_action` |
| `artifact_upload_started` | web | Upload intent | `media_class`, `size_bucket` |
| `artifact_validation_completed` | API | Terminal validation | `media_class`, `result`, `error_code` |

## 7. Brand Events

| Event | Trigger | Properties |
|---|---|---|
| `brand_intake_started` | First URL/file submitted | `input_types`, `rights_confirmed` |
| `brand_crawl_completed` | Crawl terminal | `result`, `page_count_bucket`, `duration_bucket`, `error_code` |
| `brand_candidates_reviewed` | Review opened/completed | `candidate_count_bucket`, `low_confidence_count_bucket` |
| `brand_profile_approved` | Durable approval | `profile_version`, `source_type_count`, `required_fields_complete` |
| `brand_profile_rejected` | Durable rejection | `reason_category` |

## 8. Blueprint Events

| Event | Trigger | Properties |
|---|---|---|
| `blueprint_path_selected` | Explicit choice | `path=existing|discovery|default` |
| `viral_search_completed` | Search terminal | `result_count_bucket`, `provider_result`, `manual_fallback_used` |
| `viral_candidate_selected` | Candidate commit | `rank_bucket`, `rights_state` |
| `blueprint_stage_completed` | Stage terminal | `stage`, `result`, `duration_bucket`, `error_code` |
| `blueprint_ready` | Immutable readiness | `path`, `scene_count_bucket`, `low_confidence_present` |

## 9. Script Events

| Event | Trigger | Properties |
|---|---|---|
| `script_tournament_started` | Tournament commit | `requested_variant_bucket`, `objective_category` |
| `script_tournament_completed` | Terminal evaluation | `valid_variant_count_bucket`, `result`, `duration_bucket` |
| `script_selected` | Immutable selection | `variant_rank_bucket`, `human_overrode_top_score` |

## 10. Avatar, Credit and Generation Events

| Event | Authoritative source | Properties |
|---|---|---|
| `avatar_selected` | API | `avatar_type`, `consent_state` |

`avatar_selected` is emitted only when an eligible, consent-safe avatar enters a
generation estimate; it is retained as a durable `avatar.selected` audit row (target type
`AvatarProfile`) at estimate creation, so selection is lineage rather than local UI state.
A revoked, expired, missing-evidence or service-pending avatar emits no event and writes
no audit.

V0-A2 consent revocation emits `avatar_consent_revoked` (web surface) and retains a
durable `consent.revoked` audit row (target type `AvatarProfile`) stamped with the actor
(`revokedByUserId`) and a bounded `reason`. Revocation is monotonic and idempotent: the
first call writes the one audit row; a repeat call against an already-revoked avatar
returns the same state and writes no second audit row. No consent evidence reference,
consent URL or reason beyond the bounded field appears in the event or audit row. A
missing, non-owned or cross-workspace avatar is hidden behind `WORKSPACE_ACCESS_DENIED`
and writes no audit.

V0-A2 credential rotation emits `service_credential_rotated` (web surface) and retains a
durable `service_credential.rotated` audit row (target type `ServiceCredential`, target
id = the prior credential id) stamped with the actor (`updatedByUserId`) and a bounded
`reason`. The new `secret-manager://` reference and the prior `secretRef` never appear in
the event or audit row; only the credential ids, rotation statuses and `lastRotatedAt`
are surfaced. A missing or non-owned credential is hidden behind
`WORKSPACE_ACCESS_DENIED` and writes no audit.

V0-A2 hardening drills retain three new durable audit rows against the deterministic
simulators. The B2 transfer benchmark retains a `benchmark.b2_recorded` audit row (target
type `Workspace`) stamped with the actor and a bounded `reason`; the row records that an
Owner/Admin ran the India-to-B2 benchmark, never the simulated latency, cost or seed (those
live only in the API response). The load-shaped backlog simulation retains a
`backlog.simulation_recorded` audit row (target type `Workspace`) stamped with the actor and
a bounded `reason`; it records that the two-hour backlog drill ran, never the curve points
or invariants. The incident/runbook rehearsal retains an `incident.rehearsal_recorded` audit
row (target type `IncidentRehearsal`, target id = the run id) stamped with the actor and a
bounded `reason`; it records which owner-pinned scenario was rehearsed and its `forward` or
`rollback` recovery type, never the recovery step script or recovered entity ids. The
operational alerts endpoint is read-only and writes no audit row. A non-simulator provider
mode refuses with a 503 `*_UNAVAILABLE` problem and writes no audit; a missing, non-owned or
cross-workspace target is hidden behind `WORKSPACE_ACCESS_DENIED` and writes no audit.
| `credit_purchase_started` | API | `provider`, `currency`, `amount_bucket` |
| `credit_purchase_completed` | API | `provider`, `result`, `amount_bucket`, `error_code` |
| `credit_adjustment_recorded` | API | `direction=debit\|credit`, `reason_bucket` |
| `generation_estimate_viewed` | web | `duration_bucket`, `cost_bucket`, `price_version_age_bucket` |
| `generation_confirmed` | API | `duration_bucket`, `cost_bucket`, `avatar_type` |
| `generation_state_changed` | API | `from_status`, `to_status`, `provider`, `error_code` |
| `generation_media_retained` | API | `duration_bucket`, `resolution`, `settlement=captured\|released` |

V0-G2 retains credit purchase, refund and dispute outcomes as append-only `CreditLedgerEntry`
rows (financial truth), not as analytics events; the `credit_purchase_started` /
`credit_purchase_completed` funnel events carry only `amount_bucket`, never the exact minor
units. `credit_adjustment_recorded` is emitted as a durable `credit.adjustment.recorded`
audit row (target type `CreditWallet`) when an Owner/Admin records a compensating
adjustment; it carries `direction` and a `reason_bucket`, never the exact amount, wallet
balance, payment instrument, signature or provider reference. A forged or replayed callback
emits no event and writes no ledger row.

V0-G3 emits `generation_confirmed` as a durable `generation.confirmed` audit row (target
type `GenerationJob`) at estimate confirmation, carrying `duration_bucket`, `cost_bucket`
and `avatar_type`, never the exact minor units, input hash, signed URL or provider
payload. The atomic credit reservation is retained as one append-only `RESERVE`
`CreditLedgerEntry` (financial truth, target `GenerationJob`) and one active
`CreditReservation`, not as an analytics event; a stale, changed, insufficient, conflicting
or cross-workspace confirmation emits no event, writes no reservation and appends no
ledger row. Reservation is not provider submission; `generation_state_changed` into
`submitting`/`accepted`/`unknown` is V0-G4.

V0-G4 emits `generation_state_changed` as a durable `generation.state.changed` audit row
(target type `GenerationJob`) on each committed provider-operation transition
(`queued` → `submitting` → `accepted` → `generating`/`generated`, and `unknown`/
`cancel_requested`/`cancelled`/`failed`), carrying `to_state`, `provider_route`
(`heygen-simulator`) and `operation_state`, never the request hash, provider external id,
signed URL, raw provider payload or callback signature. The durable `ProviderOperation`
and the signature-verified, deduplicated `inbox_events` row are records of truth, not
analytics events; a `PROVIDER_RATE_LIMITED`, `PROVIDER_OUTPUT_INVALID`,
`IDEMPOTENCY_INPUT_CONFLICT` or cross-workspace submission emits no state-change event and
writes no operation. A replayed idempotent submission or a replayed verified callback
acknowledges the original transition and emits no second event. A bad-signature, stale or
malformed callback emits no event and transitions nothing. `unknown` is recorded as a real
state, never promoted to success or failure without a reconciled outcome or verified
callback.

V0-G5 emits `generation_media_retained` as a durable `generation.settled` audit row (target
type `GenerationJob`) when a terminal paid generation is settled, carrying `duration_bucket`,
`resolution` and `settlement=captured|released`, never the provider external id, transient
media URL, raw hash, signed URL, exact minor units, wallet balance or provider payload. A
`completed` operation settles to `captured` (one `CAPTURE` ledger entry, retained
`GeneratedSegment`/`GeneratedAsset`/`Artifact`/`CreativeLineage`); a failed/rejected/
cancelled operation settles to `released` (one `RELEASE` ledger entry, no retained media).
The append-only `CAPTURE`/`RELEASE` `CreditLedgerEntry` and the `captured`/`released`
`CreditReservation` are records of truth, not analytics events; the ledger entries carry
job-derived idempotency keys so a crash between media retention and ledger settlement is
recovered once. A `PROVIDER_COST_EXCEEDS_AUTHORIZATION`, `ASSET_MEDIA_MALFORMED` or
cross-workspace settlement emits no event and moves no credit; a `DEPENDENCY_UNAVAILABLE`
crash window emits no event until recovery completes. A replayed settlement (detected by
reservation status) acknowledges the original settlement and emits no second event.

No event contains exact wallet balance or exact payment/provider identifiers.

## 11. Composition and Review Events

| Event | Trigger | Properties |
|---|---|---|
| `composition_plan_submitted` | API | `input_mode`, `capability_version` |
| `composition_plan_validated` | API | `result`, `unsupported_count_bucket`, `error_code` |
| `final_video_rendered` | API | `duration_bucket`, `render_duration_bucket`, `revision_number` |
| `final_video_revision_superseded` | API | `revision_number`, `prior_revision_number` |
| `review_opened` | web | `review_stage`, `reviewer_role` |
| `review_comment_added` | API | `timestamped`, `reviewer_role` |
| `review_decision_recorded` | API | `decision`, `reviewer_role`, `revision_number` |

V0-C2 emits `final_video_rendered` as a durable `composition.render_succeeded` audit row
(target type `CompositionInstruction`) when a validated plan renders through the
deterministic AE worker and a new `current` `FinalVideo` is retained, carrying
`duration_bucket`, `render_duration_bucket` and `revision_number`, never the golden output
hash, signed URL, render log payload, provider payload or exact render cost. A new revision
emits `final_video_revision_superseded` as a durable `composition.video_superseded` audit
row (target type `CompositionInstruction`) when the prior `current` `FinalVideo` is set to
`superseded` without being overwritten, carrying `revision_number` and
`prior_revision_number`. The retained `RenderAttempt` (with `render_started` audit),
`FinalVideo` and four CLEAN artifacts (final-video, final-thumbnail, final-captions,
render-logs) are records of truth, not analytics events. A `AE_PLAN_SCHEMA_INVALID`,
`AE_CAPABILITY_UNAVAILABLE`, `AE_RENDER_FAILED` or cross-workspace render emits no
`final_video_rendered` event; a failed render is retained as a `composition.render_failed`
audit row carrying `error_code`, never the failing payload. A worker crash leaves the
attempt `running` and emits no terminal event until a same-idempotency-key resume completes;
`unknown` is preserved for an uncertain worker outcome. A replayed idempotent render
acknowledges the original render and emits no second event.

V0-R1 emits `review_opened` (web) when a comment-capable role opens a review item bound to one
exact final-video version, and `review_comment_added` (API) for each timestamped append-only
comment, carrying `review_stage`, `reviewer_role` and a `timestamped` flag. The durable records
of truth are the `review.created` audit row (target type `ReviewItem`, emitted at open) and one
`review.comment_added` audit row per comment, never the notification payload. Repeated comment
activity on one review item collapses to one logical `Notification` (unique by workspace + payload
hash); the collapse is reported per-request as a `duplicateCollapsed` flag, not as a separate
analytics event, and a key-bound idempotent replay acknowledges the original comment and emits no
second event. A comment against a superseded bound version returns `REVIEW_VERSION_STALE`, archives
the review item, emits no `review_comment_added` event and preserves prior comments. The recipient
user id, notification payload hash, object key, signed URL and any secret never appear in an
analytics event or audit row; the final-video sha256 is a public content fingerprint.

V0-R2 emits `review_decision_recorded` (API) when Owner, Admin or Client Manager records one
terminal `ReviewDecision` bound to the exact final-video version captured at open time, carrying
`decision` (`approve`/`reject`/`request_changes`), `reviewer_role` and `revision_number`. The
durable record of truth is the `review.decision_recorded` audit row (target type `ReviewItem`),
retained once per review item. Decision idempotency is key-bound: a same-key replay acknowledges
the original decision and emits no second event, and a same-key+different-input attempt returns
`IDEMPOTENCY_INPUT_CONFLICT` and emits no event. A second fresh-key decision on the same review
item returns `REVIEW_DECISION_ALREADY_RECORDED` and emits no event; one terminal decision exists
per review item. A decision whose `expectedFinalVideoVersion` does not match the captured
`finalVideoVersion`, or whose bound final video has been superseded, returns `REVIEW_VERSION_STALE`,
archives the review item idempotently, emits no `review_decision_recorded` event and records no
decision. Only `approve` mints a deterministic approval token surfaced as the `approvalReference`
for downstream scheduling; `reject` and `request_changes` mint no token. The approval token is a
public deterministic reference, never a signed URL or provider payload. The decided-by user id and
the approval token object key never appear in an analytics event or audit row as copyable leaks.

## 12. Publishing Events

| Event | Trigger | Properties |
|---|---|---|
| `calendar_post_created` | API | `platform`, `schedule_lead_bucket`, `manual_export` |
| `calendar_post_updated` | API | `platform`, `manual_export`, `changed_fields` |
| `publish_submitted` | API | `platform`, `account_confirmed`, `manual_export` |
| `publish_state_changed` | API | `platform`, `from_status`, `to_status`, `error_code` |
| `audience_verification_completed` | API | `platform`, `result`, `attempt_bucket`, `propagation_delay_bucket` |
| `completion_notification_sent` | API | `channel`, `notification_type` |
| `performance_observation_collected` | API | `platform`, `source`, `observation`, `metric_count_bucket` |
| `creative_lineage_exported` | API | `status`, `entry_count_bucket`, `has_cost` |

V0-U1 emits `calendar_post_created` (API) when Owner, Admin or Client Manager creates one
`CalendarPost` bound to one approved exact final-video version, carrying `platform`,
`schedule_lead_bucket` and `manual_export`. The durable record of truth is the
`calendar.post_created` audit row (target type `CalendarPost`, reason `scheduled` or
`manual_export`), retained once per post. Create idempotency is key-bound: a same-key replay
acknowledges the original post and emits no second event, and a same-key+different-input attempt
returns `IDEMPOTENCY_INPUT_CONFLICT` and emits no event. A superseded bound version returns
`PUBLISH_MEDIA_STALE`, a missing approval returns `REVIEW_APPROVAL_REQUIRED`, and a past, malformed,
offset-less or conflicting schedule returns `PUBLISH_SCHEDULE_INVALID`; each rejected path emits no
event and records no post. The bound final-video sha256 and the approval token are public
references; the export artifact object key and the created-by user id never appear in an analytics
event or audit row as copyable leaks.

V0-U1 emits `calendar_post_updated` (API) when Owner, Admin or Client Manager edits an existing
pre-submit `CalendarPost` via `PATCH /calendar-posts/{id}`, carrying `platform`, `manual_export`
and `changed_fields` (a comma-joined list of the changed fields, or `no_change` for an idempotent
no-op edit). The durable record of truth is the `calendar.post_updated` audit row (target type
`CalendarPost`, reason the same changed-field list or `no_change`), retained once per successful
edit; the post's `version` is incremented. A locked post returns `PUBLISH_POST_LOCKED`, a stale
`expectedVersion` returns `RESOURCE_VERSION_STALE`, a superseded bound version returns
`PUBLISH_MEDIA_STALE`, and an invalid or conflicting merged schedule returns `PUBLISH_SCHEDULE_INVALID`;
each rejected path emits no event and records no edit. Edit idempotency is key-bound exactly as
create: a same-key replay acknowledges the original edit and emits no second event, and a
same-key+different-input attempt returns `IDEMPOTENCY_INPUT_CONFLICT` and emits no event. No
secret, signed URL, object key or raw provider payload appears in the event or audit row.

V0-U2 emits `publish_state_changed` (API) when Owner, Admin or Client Manager publishes an approved
scheduled calendar post to the provider bound to its platform (`meta` or `youtube-shorts`) and the
operation advances to `accepted`, carrying `platform`, `from_status`, `to_status` and `error_code`.
V0-U3 reuses the same event for the YouTube Shorts route, including the `processing` advance when a
YouTube upload is accepted but still being processed. The durable record of truth is the
`publish.state_changed` audit row (target type `CalendarPost`, reason `accepted`), retained once per
accepted publish. The durable `PublishOperation` is persisted `SUBMITTING` before the provider
network I/O so a crash leaves a resumable operation, never a blind duplicate; a same-key replay
acknowledges the existing operation and emits no second event. A wrong-account publish returns
`PUBLISH_ACCOUNT_MISMATCH`, a manual-export publish returns `PUBLISH_NOT_SUBMITTABLE`, an
unsupported platform returns `PUBLISH_PLATFORM_UNSUPPORTED`, and a malformed provider response
returns `PROVIDER_OUTPUT_INVALID`; each rejected path emits no event and records no operation. An
exhausted platform upload quota (`PUBLISH_QUOTA_EXHAUSTED`) is a pre-flight refusal: it emits no
event, writes no operation, and carries only the `retryAfterMs`. A timeout after possible acceptance
is `unknown`, emits no `publish_state_changed` to a terminal state, and is reconciled before any
retry (the `reconciledAt` timestamp records reconciliation, not a separate event). The request hash,
the external provider account id, the signed callback signature and the raw provider payload never
appear in an analytics event or audit row; the public post URL is the only URL surfaced and only once
the post is live.

V0-U4 emits `audience_verification_completed` (API) when an authorised Owner, Admin or Client Manager
independently verifies the audience-facing live post and the observation is `verified`, carrying
`platform`, `result`, `attempt_bucket` and `propagation_delay_bucket`. The durable record of truth
is the `calendar.verification_completed` audit row (target type `CalendarPost`, reason `verified`),
retained once per post; a same-post replay acknowledges the existing `PostVerification` and emits no
second event. A `processing_wait` observation emits no `audience_verification_completed` event (the
post is not yet verified) and writes no audit row; an `identity_mismatch` or `visibility_restricted`
observation emits no completion event and retains the `calendar.verification_failed` audit row
(reason `identity_mismatch` or `visibility_restricted`) instead. The raw observed account, observed
media sha256, observed caption, observed published at, propagation delay, evidence object key and
verifier provider payload never appear in the analytics event or audit row; the audience-evidence
sha256 is a public content fingerprint and is retained on the immutable evidence `Artifact`, not in
the analytics event.

V0-U4 emits `completion_notification_sent` (API) when the one logical `publish_completed` `in_app`
notification is sent to the production user who created the calendar post, carrying `channel` and
`notification_type`. Exactly one logical notification per `(workspaceId, payloadHash)` is sent: a
second verify of the same post collapses into the existing notification (`duplicateCollapsed: true`)
and emits no second `completion_notification_sent` event. `identity_mismatch`, `visibility_restricted`
and `VERIFY_MANUAL_URL_REQUIRED` paths send no notification and emit no event. The recipient user id
and the notification payload hash are storage secrets and never appear in the analytics event; the
event carries only the channel and notification type. V0-U4 also anchors an initial immutable
`PerformanceSnapshot` (source `audience_verification_initial`, empty metrics, zero-width window) at
the verified instant; V0-A1 owns the `performance_collect` job that later populates the metrics
object as fresh immutable rows.

V0-A1 emits `performance_observation_collected` (API) when an authorised Owner, Admin or Client
Manager collects a fresh observed `PerformanceSnapshot` for one `CalendarPost` via
`POST /calendar-posts/{id}/performance-collect`, carrying `platform`, `source`
(`performance_collect_simulator`), `observation` (`simulated`) and a coarse `metric_count_bucket`
over the observed metrics (views, likes, comments, shares, saves). Collect idempotency is
key-bound: a same-key replay returns the same snapshot with `replay: true` and emits no second
event; a same-key+different-input attempt returns `IDEMPOTENCY_INPUT_CONFLICT` and emits no event.
A not-yet-`published_verified` post returns `PERFORMANCE_NOT_OBSERVABLE` and emits no event; a
`processing_wait` observation returns `PERFORMANCE_PROCESSING_WAIT` (202) and emits no event. The
observed metric values, the snapshot id, the source hash and any platform account id never appear in
the analytics event; only the coarse bucket and the source/observation labels are carried. The
metrics are observations of past platform state only, never a prediction, forecast or promise of
reach, virality, conversion or causal performance.

V0-A1 emits `creative_lineage_exported` (API) when an authorised Owner, Admin or Client Manager
exports the complete creative ancestry of one final video via `GET /lineage/{finalVideoId}`,
carrying `status` (`complete`/`incomplete`/`blocked`/`unknown`), an `entry_count_bucket` over the
bounded entry list and a boolean `has_cost`. A cross-workspace or missing final video returns
`WORKSPACE_ACCESS_DENIED` (404) and emits no event. The manifest sha256, the individual ancestry
ids, the cost minor-unit totals, the provider timestamps, the object keys and any raw provider
payload never appear in the analytics event; only the status, the coarse entry-count bucket and the
cost-presence flag are carried. The export is a record of what was produced, not a prediction of
reach, virality, conversion or causal performance.

## 13. Pilot Metrics

| Metric | Definition |
|---|---|
| Time to first approved brand | Workspace created to first brand approval |
| Time to first selected script | Brand approval to script selection |
| Time to first approved video | Workspace created to exact video approval |
| Time to verified post | Approval to audience verification |
| Funnel completion rate | Workspaces reaching each stage from activation |
| Revision rate | Number of final-video revisions before approval |
| Provider unknown rate | Unknown operations / provider submissions |
| Generation failure rate | Failed generation jobs / confirmed generations |
| Admin recovery intervention rate | Journeys needing protected recovery action |
| Cost per verified post | Settled variable cost / verified posts |
| Repeat production rate | Workspaces starting another journey within 30 days |
| Approval rate | Approved review items / terminal review decisions |

Willingness to pay is collected through commercial/pilot records, not inferred from
behavioural analytics alone.

## 14. Event Governance

- New events require an owner, purpose, retention and allowed-property review.
- Event meaning cannot be changed in place; increment `event_version`.
- Successful paid/approval/publish events come from committed server state.
- Analytics delivery failure never blocks the product transaction.
- CI validates event names and property allowlists.
- Test environments use a capture sink and assert prohibited fields are absent.
