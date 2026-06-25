# Implemented changes: V0-B3 human-approved versioned brand memory

Date: 2026-06-24

## Slice

V0-B3 Human-approved versioned brand memory.

## Behaviour delivered

- Added `POST /brands/{brand_id}/approvals` for human approval of one exact brand profile
  version.
- Added `POST /generation-estimates` as first downstream guard that rejects missing,
  draft or superseded brand profiles with `BRAND_PROFILE_NOT_APPROVED`.
- Created immutable approved profile payloads with `BrandApproval`, `BrandRule` and
  `AuditEvent` evidence.
- Enforced optimistic version checks so stale concurrent approvals return
  `RESOURCE_VERSION_STALE`.
- Superseded the prior active approved profile when a later version is approved.
- Added B3 review/diff UI evidence surface with required and prohibited rules.

## Data and contract changes

- Added Prisma models and migration `0010_v0_b3_brand_memory`:
  `BrandProfile`, `BrandApproval`, `BrandRule`, `GenerationEstimate`.
- Added partial unique index `brand_profiles_one_active_approved`.
- Added RLS policies for all new B3 tables.
- Updated OpenAPI source, generated OpenAPI and generated client methods:
  `approveBrandProfile`, `createGenerationEstimate`.

## Red evidence

```text
node --test tests\integration\brand-memory-b3.test.mjs
```

Failed before implementation:

```text
TypeError: client.approveBrandProfile is not a function
TypeError: client.createGenerationEstimate is not a function
```

```text
node --test tests\e2e\web-workspace.test.mjs
```

Failed before UI implementation:

```text
AssertionError: /data-testid="brand-profile-approval"/
```

## Green evidence

```text
node --test tests\integration\brand-memory-b3.test.mjs tests\e2e\web-workspace.test.mjs
```

Result:

```text
5 tests, 5 pass
```

```text
node --test tests\contract\openapi-generation.test.mjs tests\unit\db-schema.test.mjs tests\integration\brand-memory-b3.test.mjs tests\e2e\web-workspace.test.mjs
```

Result:

```text
17 tests, 17 pass
```

## Closure evidence

```text
.\pnpm.cmd verify
```

Result:

```text
V0-F0/F1/F2/F3/F4/F5/B1/B2/B3 local verification passed.
```

```text
node scripts\check-b3-tables.mjs
```

Result:

```text
B3 tables exist; P2021 clear: brand_approvals, brand_profiles, brand_rules, generation_estimates
```

Screenshot:

```text
docs/V0/Evidence/V0-B3_BRAND_PROFILE_APPROVAL_UI_2026-06-24.png
```
