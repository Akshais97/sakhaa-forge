# V0-F0 Local Verification Evidence — 2026-06-16

## Scope

Slice: `V0-F0` runnable walking skeleton.

Behaviour verified:

- root monorepo scaffold exists for web, API, queue worker, Python worker, contracts,
  database, config, UI package, tests and infra;
- API exposes public-safe health, readiness, version and OpenAPI endpoints;
- generated client can fetch readiness through the public API contract;
- readiness reports one unavailable local dependency while liveness remains usable;
- direct `pnpm` commands resolve in PowerShell through the documented shim installer;
- the F0 storage dependency uses a deterministic filesystem-backed local simulator with
  retained quarantine, clean-media and private-artifact roots;
- no product tables beyond Prisma migration metadata are introduced.

## Red Evidence

Command:

```text
pnpm verify
```

Observed result before scaffold:

```text
The term 'pnpm' is not recognized as a name of a cmdlet, function, script file, or executable program.
```

Toolchain check:

```text
node --version
v24.15.0

pnpm --version
The term 'pnpm' is not recognized...
```

## Green Evidence

Corepack was available:

```text
corepack --version
0.34.6
```

pnpm 11 was activated through Corepack and pinned in `package.json`:

```text
corepack use pnpm@11.7.0
```

PowerShell shim install command:

```text
node scripts/install-pnpm-shim.mjs
```

Observed result:

```text
Installed pnpm shim at C:\Users\askhai\.local\bin\pnpm.cmd
```

Local storage simulator startup:

```text
pnpm services:up
```

Observed result:

```text
Local storage simulator ready.
Root: D:\Chlear Projects\Tribe V2 Based Ad Scorer and Generator\.local\storage
Quarantine: D:\Chlear Projects\Tribe V2 Based Ad Scorer and Generator\.local\storage\v0-local-quarantine
Clean media: D:\Chlear Projects\Tribe V2 Based Ad Scorer and Generator\.local\storage\v0-local-clean
Private artifacts: D:\Chlear Projects\Tribe V2 Based Ad Scorer and Generator\.local\storage\v0-local-artifacts
Run Docker Compose with infra/docker/docker-compose.local.yml to start local PostgreSQL and Redis.
Command: docker compose -f infra/docker/docker-compose.local.yml up -d
```

Verification command:

```text
pnpm verify
```

Observed result:

```text
[WARN] Unsupported engine: wanted: {"node":"22.22.1"} (current: {"node":"v24.15.0","pnpm":"11.7.0"})
Format check passed for 180 text files.
Lint passed: no obvious secrets, signed URLs or unsafe SQL patterns.
Typecheck placeholder passed: F0 workspace files and toolchain pins are present.
tests 8
pass 8
Database contract valid for V0-F0.
V0-F0 verification passed.
```

Shutdown command:

```text
pnpm services:down
```

Observed result:

```text
Run Docker Compose with infra/docker/docker-compose.local.yml to stop local PostgreSQL and Redis.
Command: docker compose -f infra/docker/docker-compose.local.yml down
Local storage simulator directories are left intact for retained evidence.
```

## Remaining Machine-Level Caveats

- The local Node runtime is `v24.15.0`; V0 implementation remains pinned to Node
  `22.22.1` in repository files.

The direct `pnpm` command path is now fixed for this workstation, but the Node runtime
warning remains real. Changing the pinned Node major/minor would require updating the
canonical V0 contracts, compatibility evidence and the rest of the toolchain files, not
only `package.json`.
