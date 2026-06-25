# V0-B3 brand memory local verification

Date: 2026-06-24

## Scope

Slice: V0-B3 Human-approved versioned brand memory.

Contracts: `V0_BRAND_PROFILE_CONTRACT.md`, `V0_API.md`, `V0_DATA_MODELS.md`,
`V0_PRISMA_SCHEMA.md`, `V0_PERMISSIONS.md`, `V0_STATUS_ENUMS.md`,
`V0_SCREEN_AND_STATE_INVENTORY.md`.

Behaviour: Owner/Admin/Client Manager approves one exact brand profile version from
candidate evidence, records approval and rules, enforces one active approved profile per
workspace/brand, and rejects draft or superseded profile IDs from downstream production
estimate creation.

## TDD red

Command:

```text
node --test tests\integration\brand-memory-b3.test.mjs
```

Expected failure before implementation:

```text
TypeError: client.approveBrandProfile is not a function
TypeError: client.createGenerationEstimate is not a function
```

UI red command:

```text
node --test tests\e2e\web-workspace.test.mjs
```

Expected failure before UI implementation:

```text
AssertionError: /data-testid="brand-profile-approval"/
```

## Focused green

Command:

```text
node --test tests\integration\brand-memory-b3.test.mjs tests\e2e\web-workspace.test.mjs
```

Result:

```text
5 tests, 5 pass
```

Contract and schema command:

```text
node --test tests\contract\openapi-generation.test.mjs tests\unit\db-schema.test.mjs tests\integration\brand-memory-b3.test.mjs tests\e2e\web-workspace.test.mjs
```

Result:

```text
17 tests, 17 pass
```

## Evidence retained

- `POST /brands/{brand_id}/approvals` exists in generated OpenAPI and client.
- `POST /generation-estimates` rejects `BRAND_PROFILE_NOT_APPROVED` for missing or
  superseded brand profiles.
- `BrandProfile`, `BrandApproval`, `BrandRule` and `GenerationEstimate` are represented
  in Prisma schema and migration `0010_v0_b3_brand_memory`.
- Migration adds `brand_profiles_one_active_approved` partial unique index and RLS
  policies for all B3 tables.
- Web shell includes `data-testid="brand-profile-approval"` and
  `data-testid="profile-version-diff"` with active/superseded production gate states.
- Browser evidence:
  `docs/V0/Evidence/V0-B3_BRAND_PROFILE_APPROVAL_UI_2026-06-24.png`.
- HTML snapshot:
  `docs/V0/Evidence/V0-B3_BRAND_PROFILE_APPROVAL_UI_SNAPSHOT_2026-06-24.html`.

## Runtime and full verification

Command:

```text
.\pnpm.cmd verify
```

Result:

```text
V0-F0/F1/F2/F3/F4/F5/B1/B2/B3 local verification passed.
```

Runtime proof included:

```text
prisma runtime persists workspace and idempotency records in Supabase
```

B3 table/P2021 proof command:

```text
node scripts\check-b3-tables.mjs
```

Result:

```text
B3 tables exist; P2021 clear: brand_approvals, brand_profiles, brand_rules, generation_estimates
```
