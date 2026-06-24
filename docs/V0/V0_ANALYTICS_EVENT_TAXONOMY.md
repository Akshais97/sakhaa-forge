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
| `credit_purchase_started` | API | `provider`, `currency`, `amount_bucket` |
| `credit_purchase_completed` | API | `provider`, `result`, `amount_bucket`, `error_code` |
| `generation_estimate_viewed` | web | `duration_bucket`, `cost_bucket`, `price_version_age_bucket` |
| `generation_confirmed` | API | `duration_bucket`, `cost_bucket`, `avatar_type` |
| `generation_state_changed` | API | `from_status`, `to_status`, `provider`, `error_code` |
| `generation_media_retained` | API | `duration_bucket`, `resolution`, `settlement=captured|released` |

No event contains exact wallet balance or exact payment/provider identifiers.

## 11. Composition and Review Events

| Event | Trigger | Properties |
|---|---|---|
| `composition_plan_submitted` | API | `input_mode`, `capability_version` |
| `composition_plan_validated` | API | `result`, `unsupported_count_bucket`, `error_code` |
| `final_video_rendered` | API | `duration_bucket`, `render_duration_bucket`, `revision_number` |
| `review_opened` | web | `review_stage`, `reviewer_role` |
| `review_comment_added` | API | `timestamped`, `reviewer_role` |
| `review_decision_recorded` | API | `decision`, `reviewer_role`, `revision_number` |

## 12. Publishing Events

| Event | Trigger | Properties |
|---|---|---|
| `calendar_post_created` | API | `platform`, `schedule_lead_bucket`, `manual_export` |
| `publish_submitted` | API | `platform`, `account_confirmed`, `manual_export` |
| `publish_state_changed` | API | `platform`, `from_status`, `to_status`, `error_code` |
| `audience_verification_completed` | API | `platform`, `result`, `attempt_bucket`, `propagation_delay_bucket` |
| `completion_notification_sent` | API | `channel`, `notification_type` |

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
