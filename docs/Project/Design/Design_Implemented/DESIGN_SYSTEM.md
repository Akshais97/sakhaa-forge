# Sakhaa Forge design system

Status: foundation design specification. It extends, but does not replace, `docs/Project/DESIGN.md`.

## Thesis

Sakhaa Forge V0 is a calm system of record for an expensive creative workflow. The design must make the video feel creative, while making brand truth, consent, credits, approvals, provider uncertainty, publication verification and lineage feel precise.

## Visual identity

- Base: warm graphite, Iris primary, Ember creative accent, semantic status palette from `DESIGN.md`.
- Landing page may carry more cinematic contrast and premium energy. Authenticated UI stays restrained and task-first.
- Media surfaces use neutral surrounds so video colour is not biased.
- Evidence surfaces use compact chips, hashes, timestamps, source labels and confidence markers.

## Typography

- Product UI: one tuned sans family is acceptable; mono is reserved for IDs, hashes, money, timestamps and short evidence labels.
- Landing page: may use a stronger display voice, but must keep body copy readable at 65-75ch and display letter spacing no tighter than `-0.04em`.
- Use sentence case. Avoid repeating tiny all-caps kickers on every section.

## Layout

- Desktop app shell: left navigation, top workspace/status bar, central task area, optional right inspector for evidence, lineage or comments.
- Mobile app: bottom nav, one-column deep screens, sticky current-step actions, media-first review.
- Landing page: proof-first hero, visual product evidence, workflow narrative, trust/rights layer, cost/lineage proof and one focused CTA path.

## Surfaces

- Use cards for repeated items and framed tools only.
- Avoid page sections styled as floating cards.
- Use glass layers sparingly for hero/dashboard composites; authenticated forms and tables need solid contrast.
- Radius: app cards 8-16px, media 16-24px, pills only for chips/buttons.

## Status and evidence

- Backend truth drives status labels. Unknown is real and uses distinct hatch/dashed treatment.
- Every AI-derived value needs evidence access: source, confidence, observation time and approval state.
- Paid, publishing and verification states are never optimistic.

## Component families

- Workspace shell, status chip, job card, evidence popover, lineage trail, 9:16 media player, brand profile diff, viral candidate card, blueprint stage spine, script comparison table, avatar eligibility card, estimate/reservation panel, review decision panel, calendar post card, verification checklist and performance snapshot table.

