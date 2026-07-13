# App master spec

## App purpose

Guide one workspace from brand intake to verified publication while retaining evidence, lineage, cost and recovery proof.

## Navigation

Primary navigation follows canonical IA: Home, Brands, Blueprints, Scripts, Generate, Review, Calendar, Activity. Credits, Settings and Operations follow role visibility rules.

## Screen composition

- Header: page title, workspace, status, primary action.
- Main: object-specific workflow and media/evidence surface.
- Right inspector: lineage, evidence, comments, cost or exact-version metadata.
- Footer/secondary area: recovery, audit or historical snapshots when relevant.

## Critical UI rules

- Server truth wins.
- Irreversible actions are never optimistic.
- Unknown remains unknown.
- Every exact artifact shows version/hash where the contract exposes it.
- Reviewer cannot see lineage/performance where permissions deny it.

