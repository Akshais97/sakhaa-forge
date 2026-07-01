# App UI design spec

Status: foundation spec for authenticated Sakhaa Forge V0 UI.

## Product stance

The authenticated app is a production control surface, not a marketing dashboard. It must prioritise exact state, tenant context, irreversible-action clarity, retained evidence and recovery.

## Shell

- Workspace slug/name visible at all times.
- Primary navigation follows the V0 production journey: Home, Brands, Blueprints, Scripts, Generate, Review, Calendar, Activity.
- Credits is a persistent wallet affordance for Owner/Admin/Client Manager.
- Operations and Settings are separated lower-nav destinations for Owner/Admin.

## Screen patterns

- List screens: bounded filters, cursor pagination, empty state with one permitted next action.
- Detail screens: title, status, exact object identity, last update, current blocking action, evidence inspector.
- Async screens: skeleton for initial loads, job card for running work, unknown state for uncertain providers.
- Media screens: 9:16 player, caption controls, content hash, version, lineage trail and self-healing signed URL handling.
- Irreversible screens: confirmation names exact object/version/account/cost and waits for server truth.

## Required UI behaviours

- No optimistic UI for paid generation, credit capture, publication, scheduling or verification.
- UI status mapping must fail when a backend enum lacks presentation.
- Cross-workspace hidden resources use the same not-found surface.
- Signed URLs, object keys, provider payloads, request hashes and consent evidence never render in copy, DOM attributes, errors or analytics.

## Product-specific components

- Brand source-of-truth panel, candidate evidence table, profile version diff, viral candidate card, rights warning banner, blueprint stage spine, formula slot map, director prompt readout, script tournament comparison, avatar eligibility card, estimate and authorisation panel, provider operation card, AE plan validator, review decision binder, calendar post editor, publication verification checklist, lineage graph and performance snapshot archive.

