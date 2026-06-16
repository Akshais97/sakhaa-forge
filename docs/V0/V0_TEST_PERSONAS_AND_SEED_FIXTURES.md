# Product V0 Test Personas and Seed Fixtures

**Status:** Canonical deterministic fixture contract  
**Scope:** Local, CI and staging simulator tests

## 1. Rules

- Fixture identities and IDs are stable across test runs.
- No fixture contains a real secret, customer, person, account or provider credential.
- Media fixtures are owned/generated for testing and include a licence manifest.
- Tests may extend fixtures locally but must not change canonical IDs or expected hashes.
- Dates use the fixed test clock `2026-06-15T10:00:00.000Z` unless the scenario controls
  time explicitly.
- Default timezone is `Asia/Kolkata`.
- Provider simulators are deterministic from scenario name plus fixture ID.

## 2. Standard Users

| Persona | User ID | Email | Primary workspace | Role | Purpose |
|---|---|---|---|---|---|
| Asha Owner | `00000000-0000-4000-8000-000000000001` | `asha.owner@example.test` | Aster | Owner | Full governance and acceptance |
| Arjun Admin | `00000000-0000-4000-8000-000000000002` | `arjun.admin@example.test` | Aster | Admin | Members, credentials, operations |
| Bhavna Brand Manager | `00000000-0000-4000-8000-000000000003` | `bhavna.brand@example.test` | Aster | Brand Manager | Brand approval and production |
| Sameer Strategist | `00000000-0000-4000-8000-000000000004` | `sameer.strategy@example.test` | Aster | Strategist | Blueprint/script/generation/calendar |
| Riya Reviewer | `00000000-0000-4000-8000-000000000005` | `riya.review@example.test` | Aster | Reviewer | Review comments only |
| Om Operator | `00000000-0000-4000-8000-000000000006` | `om.operator@example.test` | Aster | Operator | Jobs, generation and publishing |
| Farah Finance | `00000000-0000-4000-8000-000000000007` | `farah.finance@example.test` | Aster | Finance | Ledger/reconciliation/adjustments |
| Neel Other Tenant | `00000000-0000-4000-8000-000000000008` | `neel.owner@example.test` | Meridian | Owner | Cross-tenant negative tests |
| Mira No Workspace | `00000000-0000-4000-8000-000000000009` | `mira.new@example.test` | None | None | Empty onboarding |
| Dev Service Worker | `00000000-0000-4000-8000-000000000010` | None | Service identity | Worker | Internal API authentication |

Passwords are not fixture data. Local authentication uses deterministic tokens minted by
the auth simulator.

## 3. Workspaces

| Workspace | ID | Slug | Colour seed | Currency |
|---|---|---|---|---|
| Aster Realty Studio | `10000000-0000-4000-8000-000000000001` | `aster-realty` | `iris-3` | INR |
| Meridian Homes | `10000000-0000-4000-8000-000000000002` | `meridian-homes` | `cyan-2` | INR |

Every tenant isolation test creates an Aster object and attempts access with Neel/Meridian.

## 4. Golden Real-Estate Brand

### Identity

- Brand ID: `20000000-0000-4000-8000-000000000001`
- Name: `Aster Heights`
- Website: `https://aster-heights.example.test`
- Market: Bengaluru residential real estate
- Approved profile ID: `21000000-0000-4000-8000-000000000003`
- Version: `3`
- Status: `approved`

### Approved Brand Summary

- Positioning: premium, practical homes for urban professionals and families.
- Primary audience: salaried professionals aged 28-45 considering an owner-occupied home.
- Offer: schedule a site visit; pricing is shared after qualification.
- Primary CTA: `Book a site visit`.
- Tone: calm, premium, direct, informative.
- Approved claims: `RERA-registered` only when project evidence is attached.
- Prohibited claims: `guaranteed appreciation`, `best investment`, `zero risk`,
  `assured returns`.
- Competitors: `Northstar Residences`, `Lakefront Habitat`.
- Primary colour: `#173B57`.
- Secondary colour: `#D8B46A`.
- Background: `#F7F4EE`.
- Heading font: `Manrope`.
- Body font: `Source Sans 3`.

## 5. Canonical Object IDs

| Object | ID / display ID |
|---|---|
| Crawl run | `22000000-0000-4000-8000-000000000001` / `CR-0001` |
| Ready blueprint | `30000000-0000-4000-8000-000000000001` / `BP-0001` |
| Viral candidate | `31000000-0000-4000-8000-000000000001` / `VC-0001` |
| Script tournament | `40000000-0000-4000-8000-000000000001` / `ST-0001` |
| Selected script | `41000000-0000-4000-8000-000000000007` / `SC-0007` |
| Avatar | `50000000-0000-4000-8000-000000000001` / `AV-0001` |
| Wallet | `60000000-0000-4000-8000-000000000001` / `WAL-0001` |
| Generation | `70000000-0000-4000-8000-000000000001` / `GEN-0001` |
| Provider operation | `71000000-0000-4000-8000-000000000001` / `OP-0001` |
| Composition | `80000000-0000-4000-8000-000000000001` / `COMP-0001` |
| Final video | `81000000-0000-4000-8000-000000000001` / `FV-0001` |
| Review item | `90000000-0000-4000-8000-000000000001` / `RV-0001` |
| Calendar post | `a0000000-0000-4000-8000-000000000001` / `POST-0001` |

## 6. Canonical Files

Fixture files live under `tests/fixtures/v0/` when F0 scaffolds the repository.

| Fixture | Expected classification |
|---|---|
| `brand/aster/logo-primary.svg` | Clean approved candidate |
| `brand/aster/logo-dark.png` | Clean approved candidate |
| `brand/aster/guidelines.pdf` | Clean, extractable |
| `brand/aster/product-brochure.pdf` | Clean, contains approved RERA evidence |
| `brand/aster/site-copy.html` | Clean, contains tone/offer/CTA evidence |
| `media/vertical-15s.mp4` | Valid 1080x1920 H.264 |
| `media/vertical-30s.mp4` | Valid 1080x1920 H.264 |
| `media/thumbnail.jpg` | Valid image |
| `media/captions.vtt` | Valid captions |

The fixture manifest stores SHA-256, byte length, MIME type, dimensions/duration, licence
and expected artifact schema.

## 7. Malicious and Malformed Fixtures

| Fixture/scenario | Expected error |
|---|---|
| URL `http://169.254.169.254/latest/meta-data/` | `CRAWL_SSRF_BLOCKED` |
| URL resolving to `127.0.0.1` after DNS rebind | `CRAWL_SSRF_BLOCKED` |
| Redirect chain above configured maximum | `CRAWL_REDIRECT_LIMIT` |
| HTML containing prompt injection instructions | Content treated as evidence, instructions ignored |
| `active-content.svg` with script | `ASSET_ACTIVE_CONTENT_BLOCKED` |
| `polyglot.jpg` with executable payload | `ASSET_MALWARE_DETECTED` |
| `truncated.mp4` | `ASSET_MEDIA_MALFORMED` |
| `oversized.bin` | `ASSET_TOO_LARGE` |
| Declared PNG with PDF bytes | `ASSET_TYPE_MISMATCH` |
| Completion with wrong SHA-256 | `ARTIFACT_HASH_MISMATCH` |
| AI response `{not-json` | `AI_OUTPUT_SCHEMA_INVALID` |
| AI response with missing required formula slots | `BLUEPRINT_FORMULA_INVALID` |
| Review decision for superseded video | `REVIEW_VERSION_STALE` |

## 8. Provider Simulator Scenarios

Each adapter accepts a test-only scenario header/config outside production.

| Scenario | Behaviour | Expected result |
|---|---|---|
| `success` | Immediate accepted then completed callback | One completed operation |
| `delayed` | Accepted; completion after controlled clock advance | Processing then completed |
| `duplicate_callback` | Same signed callback delivered three times | One state transition |
| `bad_signature` | Invalid signature | Callback rejected, no mutation |
| `malformed_payload` | Signed invalid schema | Inbox failure, no domain transition |
| `timeout_before_acceptance` | Connection fails before request delivery | Retryable when policy permits |
| `timeout_after_acceptance` | Provider accepts but client times out | `unknown`, reconciliation only |
| `rate_limited` | `429` with `Retry-After` | Delayed bounded retry |
| `provider_failed` | Terminal provider failure | Release credits once |
| `corrupt_output` | Completed URL yields wrong/malformed media | No capture; operator-visible failure |
| `cost_mismatch` | Provider cost exceeds authorised maximum | Block settlement and escalate |

Payment simulators additionally cover refund, dispute and amount/currency mismatch.
Publishing simulators cover wrong account, wrong media, delayed propagation, restricted
visibility and quota exhaustion.

## 9. Expected Happy-Path Evidence

The full fixture journey must emit:

- one approved brand profile and approval audit;
- one ready immutable blueprint with thumbnail, scenes, formula and director prompt;
- 10-20 script variants, evaluations and one selected script;
- one eligible avatar consent record;
- wallet purchase, reservation and one capture;
- one provider operation and retained generated artifact;
- one AE plan, render attempt and immutable final-video hash;
- one exact-version approval;
- one calendar post, publish operation and verified public fixture URL;
- one notification;
- one complete creative-lineage manifest.

## 10. Reset and Isolation

- Tests create one schema/database namespace per worker where feasible.
- Fixture setup is idempotent.
- Cleanup deletes only test-owned resources with the fixture prefix.
- Time, random IDs and provider responses are controlled.
- Tests never depend on execution order.

