# V0-F5 Local Dummy Data Verification

Date: 2026-06-24  
Slice: V0-F5 traceable operations, restore and feature capability control

## Scope

This evidence covers local deterministic F5 controls needed before product-domain slices:

- job trace propagation across API-created job, outbox, worker attempts, job events and
  retained artifacts;
- queue/retry/lease/dead-letter/artifact metrics;
- protected dead-letter recovery;
- service credential metadata without plaintext secrets;
- workspace capability disable;
- local simulator modes;
- restore drill evidence;
- secret and signed-URL redaction scan.

## Red Evidence

- `node --test tests\contract\openapi-generation.test.mjs`
  - Failed while F5 operations paths and generated client methods were absent.
- `node --test tests\unit\db-schema.test.mjs`
  - Failed while `0007_v0_f5_service_credentials` was absent.
- `node --test tests\integration\operations-f5.test.mjs`
  - Failed while generated F5 client methods were absent.

## Green Evidence

- `node --test tests\contract\openapi-generation.test.mjs`
- `node --test tests\unit\db-schema.test.mjs tests\unit\permissions.test.mjs`
- `node --test tests\integration\operations-f5.test.mjs`

## Behaviour Evidence

- Failed job trace includes `requestId`, outbox payload, worker attempt, job events and
  artifact lineage fields.
- Dead-letter metrics report failed jobs from canonical job state.
- Recovery requeues only a failed job without an output artifact and records recovery
  events.
- Service credential endpoint rejects `secretValue`, `apiKey` and `plaintext` fields.
- Simulator modes accept `success`, `timeout`, `duplicate`, `malformed` and
  `bad_signature` only in local/test/staging.
- Restore drill response verifies RLS preservation and artifact-reference lookup.
- Redaction scan removes API-key and signed-URL signature material from sample logs.

## Remaining Product Scope

V0-F5 closes the foundation gate locally. Product-domain slices still need their own
slice evidence before they can use these operational controls.
