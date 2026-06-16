# V0-F0 Local Verification Evidence — 2026-06-16

## Scope

Slice: `V0-F0` runnable walking skeleton.

Behaviour verified:

- root monorepo scaffold exists for web, API, queue worker, Python worker, contracts,
  database, config, UI package, tests and infra;
- API exposes public-safe health, readiness, version and OpenAPI endpoints;
- generated client can fetch readiness through the public API contract;
- readiness reports one unavailable local dependency while liveness remains usable;
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

Verification command:

```text
corepack pnpm verify
```

Observed result:

```text
Format check passed for 175 text files.
Lint passed: no obvious secrets, signed URLs or unsafe SQL patterns.
Typecheck placeholder passed: F0 workspace files and toolchain pins are present.
tests 6
pass 6
Database contract valid for V0-F0.
V0-F0 verification passed.
```

## Remaining Machine-Level Caveats

- Direct `pnpm verify` still fails in this Windows shell because no `pnpm` shim is visible
  on `PATH`.
- `corepack enable` attempted to create shims under `C:\Program Files\nodejs` and failed
  with `EPERM`.
- The local Node runtime is `v24.15.0`; V0 implementation remains pinned to Node
  `22.22.1` in repository files.

These caveats are environment setup items. They do not change the committed F0 scaffold,
but they must be resolved before claiming clean-machine startup evidence.
