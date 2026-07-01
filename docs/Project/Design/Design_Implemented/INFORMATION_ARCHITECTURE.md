# Information architecture

This document mirrors the canonical V0 IA for design planning. `docs/V0/V0_INFORMATION_ARCHITECTURE.md` remains authoritative.

## Navigation model

Primary:

1. Home
2. Brands
3. Blueprints
4. Scripts
5. Generate
6. Review
7. Calendar
8. Activity

Secondary:

- Credits for Owner/Admin/Client Manager.
- Avatars under Generate until catalogue size justifies primary placement.
- Settings and Operations separated for Owner/Admin.

## Object hierarchy

Workspace owns:

- Brands, crawl runs, brand profiles, assets, rules.
- Blueprint requests, candidates, acquisitions, blueprints, formulas and prompts.
- Script tournaments and selected scripts.
- Avatars, estimates, generation jobs, provider operations and generated assets.
- Composition plans, render attempts and final videos.
- Review items, comments and decisions.
- Calendar posts, publish operations, verifications and notifications.
- Lineage exports and performance snapshots.
- Credits, wallet, ledger, service credentials, jobs, audit and operations.

## URL principles

- Workspace slug in every authenticated product URL.
- Stable detail URL for every durable object.
- IDs authoritative; slugs decorative.
- Query params for filters, cursors and selected tabs.
- Refresh never resubmits mutation.
- Signed URLs never enter routes.

