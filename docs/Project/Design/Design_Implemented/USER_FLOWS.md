# User flows

## Canonical brand-to-publication flow

Source: `docs/V0/V0_INFORMATION_ARCHITECTURE.md`.

1. Workspace home.
2. Create brand.
3. Crawl/upload intake.
4. Review candidates.
5. Approve exact brand profile.
6. Choose existing blueprint, new discovery or approved default formula.
7. Select candidate and inspect rights.
8. Watch extraction stages.
9. Open ready blueprint/formula/prompt.
10. Create script tournament.
11. Compare and select exact script.
12. Select eligible avatar.
13. Review estimate and reserve credits.
14. Watch generation/reconciliation.
15. Provide composition direction and render.
16. Review exact final-video version.
17. Approve.
18. Schedule or export.
19. Publish to approved account.
20. Verify audience-facing post.
21. Inspect lineage, ledger and performance snapshots.

## Role flow constraints

- Owner/Admin: all destinations including operations, settings and recovery.
- Client Manager: production workflow, wallet, approval and publishing.
- Reviewer: review and notifications only; no publishing, credits, lineage or performance.

## Recovery flows

- Unknown provider or publish state: reconcile existing operation before retry.
- Stale version: reload exact object and re-confirm.
- Capability disabled: show blocked state and direct Owner/Admin to operations when allowed.
- Cross-workspace resource: existence-hiding not-found.

