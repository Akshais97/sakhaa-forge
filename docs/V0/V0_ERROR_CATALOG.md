# Product V0 Error Catalog

**Status:** Canonical stable error registry  
**Transport:** RFC 9457 problem details

## 1. Error Shape

```json
{
  "type": "https://errors.example.invalid/v0/BRAND_APPROVAL_REQUIRED",
  "title": "Brand approval required",
  "status": 409,
  "code": "BRAND_APPROVAL_REQUIRED",
  "detail": "Approve an exact brand profile before continuing.",
  "trace_id": "public-safe-trace-reference",
  "retryable": false
}
```

Provider payloads, secrets, internal paths and protected resource existence are excluded.

## 2. Logging Levels

- `info`: expected user/business conflict.
- `warn`: malformed, unauthorised, transient or policy-blocked request.
- `error`: internal failure requiring Admin investigation.
- `critical`: zero-tolerance security, duplicate paid work, wrong publication or data
  integrity incident.

## 3. Foundation, Auth and Contract Errors

| Code | HTTP | User message | Retry | Admin action | Log | Hide existence |
|---|---:|---|---|---|---|:---:|
| `AUTH_REQUIRED` | 401 | Sign in to continue. | After sign-in | None | info | No |
| `AUTH_TOKEN_INVALID` | 401 | Your session is not valid. Sign in again. | Yes | Investigate spikes | warn | No |
| `WORKSPACE_ACCESS_DENIED` | 404 | We could not find that item. | No | Review audit if reported | warn | Yes |
| `PERMISSION_DENIED` | 403 | Your role cannot perform this action. | No | Membership review | info | No |
| `MEMBERSHIP_STALE` | 409 | Your workspace access changed. Refresh and try again. | Yes | None | info | No |
| `VALIDATION_FAILED` | 422 | Check the highlighted fields. | No | None | info | No |
| `IDEMPOTENCY_KEY_REQUIRED` | 400 | This action needs a request identity. Refresh and try again. | Yes | Client defect review | warn | No |
| `IDEMPOTENCY_INPUT_CONFLICT` | 409 | This request identity was already used with different details. | No | Investigate client | warn | No |
| `RESOURCE_VERSION_STALE` | 409 | This item changed after you opened it. Review the latest version. | No | None | info | No |
| `CAPABILITY_DISABLED` | 404 | We could not find that page. | No | None | info | Yes |
| `DEPENDENCY_UNAVAILABLE` | 503 | This service is temporarily unavailable. | Yes | Dependency incident | error | No |
| `INTERNAL_ERROR` | 500 | We could not complete this action. Use the reference if you contact support. | Conditional | Trace/root cause | error | No |

## 4. Artifact and Crawl Errors

| Code | HTTP | User message | Retry | Admin action | Log | Hide |
|---|---:|---|---|---|---|:---:|
| `UPLOAD_URL_EXPIRED` | 410 | This upload link expired. Start the upload again. | Yes | None | info | No |
| `ASSET_TOO_LARGE` | 413 | This file is larger than the allowed limit. | No | None | info | No |
| `ASSET_TYPE_UNSUPPORTED` | 415 | This file type is not supported. | No | None | info | No |
| `ASSET_TYPE_MISMATCH` | 422 | The file contents do not match its type. | No | Security review if repeated | warn | No |
| `ASSET_ACTIVE_CONTENT_BLOCKED` | 422 | This file contains active content and cannot be used. | No | Security evidence | warn | No |
| `ASSET_MALWARE_DETECTED` | 422 | This file failed the security scan and was blocked. | No | Security incident review | critical | No |
| `ASSET_MEDIA_MALFORMED` | 422 | We could not read this media file. Export it again and re-upload. | No | Fixture/codec review | warn | No |
| `ARTIFACT_HASH_MISMATCH` | 409 | The file did not match the expected content. It was not accepted. | No | Integrity incident | critical | No |
| `CRAWL_URL_INVALID` | 422 | Enter a valid public website URL. | No | None | info | No |
| `CRAWL_SSRF_BLOCKED` | 422 | This address cannot be crawled. | No | Security review | critical | No |
| `CRAWL_REDIRECT_LIMIT` | 422 | The website redirected too many times. | Conditional | Inspect source | warn | No |
| `CRAWL_POLICY_BLOCKED` | 409 | This page cannot be processed under the current crawl policy. | No | Rights/policy review | warn | No |
| `CRAWL_TIMEOUT` | 504 | The website did not respond in time. | Yes | Provider/network review | warn | No |

## 5. Brand and Blueprint Errors

| Code | HTTP | User message | Retry | Admin action | Log |
|---|---:|---|---|---|---|
| `BRAND_APPROVAL_REQUIRED` | 409 | Approve an exact brand profile before continuing. | No | None | info |
| `BRAND_PROFILE_CONFLICT` | 409 | Another profile version is already active. Review the latest profile. | No | Investigate constraint only if unexpected | warn |
| `BRAND_REQUIRED_FIELD_MISSING` | 422 | Complete the required brand fields before approval. | No | None | info |
| `BRAND_SOURCE_CONFLICT` | 409 | Brand sources disagree. Resolve the highlighted values before approval. | No | None | info |
| `BRAND_ASSET_NOT_APPROVED` | 409 | This asset is not approved for production use. | No | None | info |
| `DISCOVERY_PROVIDER_UNAVAILABLE` | 503 | Viral discovery is unavailable. Add a candidate manually or try later. | Yes | Provider incident | warn |
| `SOURCE_RIGHTS_REQUIRED` | 409 | Confirm the permitted source use before extraction. | No | Rights review | warn |
| `MEDIA_ACQUISITION_BLOCKED` | 409 | This source media cannot be acquired under the current policy. | No | Rights/provider review | warn |
| `BLUEPRINT_STAGE_INCOMPLETE` | 409 | The blueprint is not ready. Review the incomplete stages. | No | None | info |
| `BLUEPRINT_STAGE_FAILED` | 422 | A blueprint stage failed. Review the stage evidence before retrying. | Conditional | Inspect job | warn |
| `BLUEPRINT_FORMULA_INVALID` | 422 | The blueprint formula is incomplete or inconsistent. | No | Prompt/schema review | error |
| `BLUEPRINT_INCOMPATIBLE` | 409 | This blueprint is not compatible with the selected brand or objective. | No | None | info |

## 6. AI and Script Errors

| Code | HTTP | User message | Retry | Admin action | Log |
|---|---:|---|---|---|---|
| `AI_OUTPUT_EMPTY` | 422 | The AI service returned no usable result. | Conditional | Provider/model review | warn |
| `AI_OUTPUT_SCHEMA_INVALID` | 422 | The AI result did not match the required structure. | Conditional | Prompt/schema review | error |
| `AI_REQUEST_REFUSED` | 422 | The requested content could not be generated under the current policy. | No | Policy review if unexpected | warn |
| `SCRIPT_VARIANT_COUNT_INSUFFICIENT` | 409 | There are not enough valid scripts to compare. | Conditional | Model/prompt review | warn |
| `SCRIPT_POLICY_VIOLATION` | 422 | A script conflicts with approved brand or claim rules. | No | None | info |
| `SCRIPT_SELECTION_INVALID` | 409 | Select an evaluated, eligible script. | No | None | info |
| `SCRIPT_ALREADY_SELECTED` | 409 | This tournament already has a selected script. | No | None | info |

## 7. Avatar, Payment and Generation Errors

| Code | HTTP | User message | Retry | Admin action | Log |
|---|---:|---|---|---|---|
| `AVATAR_CONSENT_REQUIRED` | 409 | Valid likeness and voice consent is required. | No | Consent review | warn |
| `AVATAR_CONSENT_EXPIRED` | 409 | This avatar consent expired. Renew it before generation. | No | None | info |
| `AVATAR_CONSENT_REVOKED` | 409 | This avatar can no longer be used. | No | Audit future-use block | critical if bypass attempted |
| `PAYMENT_SIGNATURE_INVALID` | 401 | The payment update could not be verified. | No | Payment/security incident | critical |
| `PAYMENT_AMOUNT_MISMATCH` | 409 | The payment amount or currency did not match the purchase. | No | Admin reconciliation | critical |
| `PAYMENT_PENDING` | 202 | Payment confirmation is still pending. | Yes later | Reconcile ageing purchase | info |
| `CREDIT_BALANCE_INSUFFICIENT` | 409 | Add creator credits before generating this video. | No | None | info |
| `CREDIT_RESERVATION_CONFLICT` | 409 | Credits are already reserved for this generation. | No | Reconcile if inconsistent | warn |
| `ESTIMATE_EXPIRED` | 409 | This estimate expired. Request a new estimate. | Yes | None | info |
| `ESTIMATE_INPUT_CHANGED` | 409 | The script, avatar or settings changed. Request a new estimate. | Yes | None | info |
| `PROVIDER_RATE_LIMITED` | 429 | The provider is busy. This job will retry at the shown time. | Automatic | Monitor backlog | warn |
| `PROVIDER_SUBMISSION_UNKNOWN` | 202 | We are checking whether the provider accepted this request. Do not submit again. | No manual retry | Reconcile | warn |
| `PROVIDER_CALLBACK_INVALID` | 401 | The provider update could not be verified. | No | Security/provider incident | critical |
| `PROVIDER_OUTPUT_INVALID` | 422 | The generated media failed validation and was not accepted. | Conditional | Inspect provider/artifact | error |
| `PROVIDER_COST_EXCEEDS_AUTHORIZATION` | 409 | The provider cost exceeded the authorised maximum. Settlement is blocked. | No | Admin/provider escalation | critical |
| `GENERATION_CANCEL_UNCERTAIN` | 202 | Cancellation is requested. We must check the submitted provider operation first. | No manual retry | Reconcile | warn |
| `GENERATION_JOB_NOT_SUBMITTABLE` | 409 | This generation cannot be submitted, cancelled or settled in its current state. | No | Reconcile the provider operation | warn |

## 8. Composition and Review Errors

| Code | HTTP | User message | Retry | Admin action | Log |
|---|---:|---|---|---|---|
| `AE_PLAN_SCHEMA_INVALID` | 422 | The composition plan is not valid. | Conditional | Planner/schema review | error |
| `AE_ASSET_MISSING` | 422 | A referenced media asset is missing or unavailable. | No | Restore/reselect asset | warn |
| `AE_CAPABILITY_UNAVAILABLE` | 409 | The required template, font, plugin or codec is unavailable. | No | Fix worker capability | error |
| `AE_TIMELINE_INVALID` | 422 | The timeline contains invalid timing or overlaps. | No | None | info |
| `AE_RENDER_FAILED` | 422 | The final render failed. Review the render details before retrying. | Conditional | Inspect worker | error |
| `REVIEW_VERSION_STALE` | 409 | A newer video version exists. Review the latest version. | No | None | info |
| `REVIEW_DECISION_ALREADY_RECORDED` | 409 | A decision is already recorded for this review version. | No | Audit if conflict | warn |
| `REVIEW_APPROVAL_REQUIRED` | 409 | Approve this exact video version before scheduling. | No | None | info |

## 9. Publishing and Verification Errors

| Code | HTTP | User message | Retry | Admin action | Log |
|---|---:|---|---|---|---|
| `PUBLISH_ACCOUNT_UNAUTHORISED` | 409 | Reconnect or select an authorised publishing account. | No | Credential review | warn |
| `PUBLISH_SCHEDULE_INVALID` | 422 | Choose a valid future date and time. | No | None | info |
| `PUBLISH_MEDIA_STALE` | 409 | The scheduled media is no longer the approved current version. | No | None | warn |
| `PUBLISH_OPERATION_UNKNOWN` | 202 | We are checking whether the platform accepted this post. Do not publish again. | No manual retry | Reconcile | warn |
| `PUBLISH_DUPLICATE_BLOCKED` | 409 | This post already has a publishing operation. | No | Reconcile if needed | warn |
| `PUBLISH_QUOTA_EXHAUSTED` | 429 | The platform quota is exhausted. Choose the shown retry time or export manually. | Later | Provider/quota review | warn |
| `VERIFY_PROCESSING_WAIT` | 202 | The platform is still processing the post. We will check again. | Automatic | Monitor ageing | info |
| `VERIFY_IDENTITY_MISMATCH` | 409 | The live post does not match the approved account or media. | No | Wrong-publication incident | critical |
| `VERIFY_VISIBILITY_RESTRICTED` | 409 | The post is not visible to the required audience. | After correction | Account/privacy review | warn |
| `VERIFY_MANUAL_URL_REQUIRED` | 409 | Add the live post URL before verification. | After input | None | info |
| `NOTIFICATION_DUPLICATE_BLOCKED` | 409 | This notification was already sent. | No | None | info |

## 10. Admin Recovery Rules

- Retry only when `retryable=true` and the owning policy permits it.
- `unknown` paid/publishing operations reconcile; they are not manually resubmitted.
- Critical errors open an incident and preserve raw evidence in protected storage.
- User messages remain stable within `/api/v0`; wording changes that alter meaning require
  contract review and UI tests.
