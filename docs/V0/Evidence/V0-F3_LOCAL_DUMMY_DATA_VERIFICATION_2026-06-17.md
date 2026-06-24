# V0-F3 Local Dummy-Data Verification Evidence - 2026-06-17

## Scope

Slice: `V0-F3` private artifact upload, quarantine and authorized retrieval.

Behaviour verified:

- workspace user initiates a brand-asset upload and receives a short-lived upload contract;
- upload creates a retained `QUARANTINED` artifact with workspace, owner-visible metadata,
  hash, producer, schema version and retention class;
- fake local validator promotes supported `image/png`, `image/jpeg` and `video/mp4`
  artifacts to `CLEAN`;
- authorized workspace user can create a download contract for a clean artifact;
- cross-workspace download returns existence-hiding `WORKSPACE_ACCESS_DENIED`;
- hash mismatch rejects substituted media with `ARTIFACT_HASH_MISMATCH`;
- unsupported file type creates retained rejected artifact with `ASSET_TYPE_UNSUPPORTED`;
- `Artifact` and `InboxEvent` schema plus RLS migration text are present.

## Decision

Runtime remains local dummy data by current project-owner direction. This evidence proves
the F3 public behaviour and contract shape in the local simulator; it does not claim B2
or live Supabase/PostgreSQL runtime acceptance.

## Red Evidence

```text
node --test tests\integration\artifacts.test.mjs
TypeError: userA.initiateBrandAssetUpload is not a function
```

```text
node --test tests\unit\artifact-schema.test.mjs
failed because AssetTrustStatus, Artifact, InboxEvent and migration 0003 were absent
```

## Green Evidence

```text
node --test tests\integration\artifacts.test.mjs
tests 3
pass 3
```

```text
node --test tests\unit\artifact-schema.test.mjs
tests 2
pass 2
```

```text
.\pnpm.cmd verify
Format check passed for 201 text files.
Lint passed: no obvious secrets, signed URLs or unsafe SQL patterns.
tests 34
pass 34
Database contract valid for V0-F3 identity, idempotency, artifacts and RLS.
V0-F0/F1/F2/F3 local verification passed.
```

## Retained Test Fixtures

- Clean path: `Aster Heights`, `logo.png`, `image/png`.
- Hash mismatch path: `Aster Heights`, `render.mp4`, `video/mp4`.
- Rejected path: `Aster Heights`, `payload.exe`, `application/x-msdownload`.
- Cross-tenant denial path: `user-b` tries to download `user-a` artifact.

## Remaining Gaps

- No browser screenshot artifact retained yet.
- No live B2 adapter fixture.
- No live PostgreSQL runtime write path or live RLS suite for `Artifact`.
- No lifecycle cleanup execution proof beyond retained metadata and local simulator root.
