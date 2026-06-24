# Project Content and Language Guide

**Status:** Canonical product-language contract  
**Applies to:** Product UI, email, notifications, documentation and Admin recovery messages
**Brand authority:** `PROJECT_BRAND_GUIDELINES.md`

## 1. Voice

The product sounds like a calm, precise studio professional:

- direct without being abrupt;
- confident about the workflow, never confident about an uncertain outcome;
- specific about state, cost, identity and next action;
- respectful of the user's expertise;
- free of hype, blame, jokes during failure and decorative technical jargon.

## 2. Writing Rules

- Use sentence case for headings, labels and buttons.
- Start action labels with a verb: `Approve brand`, `Generate scripts`, `Publish post`.
- Keep one term for one concept across UI, API documentation and support.
- Prefer active voice: `We are checking with HeyGen`, not `A check is being performed`.
- State what happened before explaining why or what to do.
- Do not say `Oops`, `Something went wrong`, `Magic`, `Instant`, or `Guaranteed`.
- Do not expose provider payloads, stack traces, signed URLs or internal secrets.
- Avoid abbreviations until the full term has appeared. Approved short forms include
  `CTA`, `OCR`, `MP4`, `API`, `IST` and `INR`.

## 3. India-First English

- Use Indian English spelling: `authorise`, `cancelled`, `catalogue`, `organisation`.
- Use plain words understood across Indian business English; avoid regional slang.
- Default timezone is `Asia/Kolkata`, displayed as `IST`.
- Date: `15 Jun 2026`.
- Date and time: `15 Jun 2026, 4:30 pm IST`.
- Relative time may supplement but never replace the exact time for scheduled/published
  work.
- INR uses the symbol and Indian grouping: `₹1,25,000`.
- Other currencies use ISO plus value when ambiguity is possible: `USD 12.50`.
- Numbers below one lakh use ordinary digits: `12,500`.
- Percentages use one decimal only when it changes a decision: `82%`, `82.4%`.
- Durations use user language: `1 min 24 sec`; evidence may also show `84 s`.

## 4. Status Vocabulary

Status labels map to backend truth. Copy may explain a status but must not rename its
meaning.

| Backend meaning | UI label | Explanation |
|---|---|---|
| `draft` / `created` | Draft | Saved, not started |
| `queued` | Queued | Waiting for an available worker or provider slot |
| `leased` / `running` | Running | Work is active |
| `retry_wait` | Retrying | A temporary failure occurred; another attempt is scheduled |
| `unknown` | Unknown — checking | The provider may have accepted the request; reconciliation is in progress |
| `blocked` | Blocked | A required approval, right, input or capability is missing |
| `failed` | Failed | Work stopped and needs a new action or Admin review |
| `cancel_requested` | Cancelling | New work has stopped; submitted provider work may still reconcile |
| `cancelled` | Cancelled | Work ended without completion |
| `partial` | Partly complete | Some evidence exists, but the outcome is not ready |
| `ready` / `generated` / `rendered` | Ready | The exact artifact is available for its next step |
| `approved` | Approved | An authorised actor approved this exact version |
| `accepted` | Accepted | The provider acknowledged the request; this is not final success |
| `published_unverified` | Published — checking | The provider returned a post, but audience verification is pending |
| `published_verified` / `verified` | Published and verified | Account, media and visibility were independently confirmed |
| `superseded` | Superseded | A newer version exists; this version remains historical |
| `archived` | Archived | Retained for history and excluded from active work |
| `expired` | Expired | The authorisation, consent, estimate or lease is no longer valid |

Never use `Done` for publication before verification or for a paid operation before
settlement.

## 5. Buttons and Action Progress

| Intent | Button | In progress | Success |
|---|---|---|---|
| Save reversible edit | Save changes | Saving… | Changes saved |
| Approve brand | Approve this profile | Approving… | Brand profile approved |
| Generate scripts | Generate scripts | Generating scripts… | Scripts ready to compare |
| Reserve paid generation | Reserve credits and generate | Reserving credits… | Credits reserved · generation queued |
| Render | Render final video | Starting render… | Final video ready |
| Approve media | Approve this version | Approving… | Video version approved |
| Publish | Publish to {platform} | Submitting to {platform}… | Submitted · verification pending |
| Verify | Check live post | Checking live post… | Published and verified |

Ellipses indicate ongoing work. Do not change an irreversible button to a success label
until the server confirms the durable transition.

## 6. Payment and Cost Language

Always distinguish:

- **Estimate:** expected amount using the active price version.
- **Maximum authorisation:** highest amount the user permits for this operation.
- **Reserved:** temporarily unavailable credits held for one operation.
- **Captured:** final charge after the policy-defined successful outcome.
- **Released:** reserved credits returned without charge.
- **Adjustment:** append-only Admin correction to credit or provider reconciliation.

Required paid confirmation structure:

```text
Generate this video?

Estimated cost: ~₹420
Maximum authorisation: ₹480
Reserved now: ₹480

We capture only the final eligible cost. Unused reserved credits are released.
An uncertain provider response is checked before any retry, so you are not charged twice.
```

Never write `free`, `no charge`, or `refunded` until the ledger confirms it.

## 7. Destructive and Irreversible Confirmations

A confirmation names:

1. the action;
2. the exact affected object/version/account;
3. the irreversible or delayed consequence;
4. any recovery path;
5. the final verb.

Example:

```text
Publish Video FV-0001 to @asterheights?

This submits the approved video and caption to Meta. A provider timeout may require
reconciliation before another publish attempt.

Cancel | Publish to @asterheights
```

For workspace deletion, consent revocation and credential revocation, require typed
confirmation where specified by the screen contract.

## 8. Error-Writing Formula

User-facing errors use:

```text
Title: What failed
Body: Why, when it is safe and useful to say
Action: The one next step
Reference: Stable error code and trace reference
```

Example:

```text
We could not verify the live post
The post is visible, but its media does not match the approved video.
Check the selected account and post URL before trying again.
Reference: PUB-VERIFY-IDENTITY-MISMATCH
```

Rules:

- Do not blame the user.
- Do not promise a retry will work.
- Do not expose whether a protected cross-workspace object exists.
- Use `Try again` only for classified retryable failures.
- Use `Contact support with reference…` only when no self-service recovery exists.

## 9. Notification Tone

Notifications are quiet and specific.

| Type | Pattern |
|---|---|
| Processing | `{Object} is {state}. You can leave this page.` |
| Action required | `{Object} needs {specific action}.` |
| Failure | `{Object} failed at {safe stage}. {next action}.` |
| Unknown | `We are checking whether {provider} accepted {operation}. Do not submit again.` |
| Success | `{Exact outcome} is ready.` |
| Publication | `Published and verified on {platform} as {account}.` |

No confetti, hype or exclamation marks for paid, review or publication events.

## 10. Claim Boundary

Sakhaa Forge uses structural patterns observed in content that spread. It
does not guarantee:

- virality;
- reach, views or engagement;
- leads, sales or conversion;
- causal improvement;
- audience, brain, emotion or physiological response;
- scientific prediction.

Approved phrases:

- `Built using structural patterns observed in high-performing short-form content.`
- `Assists production; performance outcomes are not guaranteed.`
- `Observed metrics`, with source and observation time.
- `Estimated`, `directional`, `low confidence` and `unknown`, when applicable.

Prohibited phrases:

- `Go viral`
- `Guaranteed reach`
- `Predicts the winning video`
- `Scientifically proven to convert`
- `Measures attention or emotion`
- `Fully automated with no review`

## 11. Terminology Glossary

| Term | Definition |
|---|---|
| Brand candidate | Extracted value awaiting human approval |
| Brand profile | Versioned, approved brand truth |
| Blueprint | Immutable structural description of a video's scenes and timing |
| Formula | Reusable timing/function slots derived from a blueprint or approved default |
| Director prompt | Provider-neutral production instructions with replacement slots |
| Script tournament | Generation and evaluation of 10-20 script variants |
| Selected script | One immutable evaluated script approved for generation |
| Generation | HeyGen creation of avatar-led media |
| Composition | Validated AE planning and rendering of final branded media |
| Final video | Immutable rendered revision used for review/publication |
| Review item | Exact final-video version under review |
| Calendar post | Approved media, account, caption and schedule |
| Provider operation | Durable record of one external side-effect request |
| Reconciliation | Determining the outcome of an uncertain external operation |
| Audience verification | Independent confirmation of account, media and visibility |
| Artifact | Immutable file with owner, hash, producer and retention class |
| Lineage | Ancestry linking brand, blueprint, script, provider, media, approval and post |
| Creator credits | Internal unit used to reserve, capture or release variable production cost |

## 12. Content Review Checklist

- Does the copy use the canonical term?
- Does it state uncertainty honestly?
- Does it avoid a guarantee or causal claim?
- Does it distinguish provider acceptance from verified success?
- Does it identify the exact version/account/cost when irreversible?
- Does it provide a safe next action?
- Does it avoid secrets, raw payloads and protected existence?
- Is date, time, money and number formatting India-first?
