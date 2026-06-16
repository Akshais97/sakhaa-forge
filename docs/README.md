# Project Documentation

## Product Sequence

```text
Product V0: standalone Sakhaa Forge production engine
  -> Product V1: additive maturity of the same production application
  -> Product V2: separate Sakhaa scoring, recommendation and learning product
```

Product phase numbers are local to their version. V0 Phase 1 and V2 Phase 1 are not the
same phase.

## Read Order

1. [V0/V0.md](V0/V0.md) - first product target, requirements and acceptance gates.
2. [V1/V1.md](V1/V1.md) - additive V0 maturity and deferred capabilities.
3. [V2/V2.md](V2/V2.md) - Sakhaa product documentation.
4. [Project/Guardrails/PROJECT_GUARDRAILS.md](Project/Guardrails/PROJECT_GUARDRAILS.md) -
   mandatory backend, frontend, API, database, Prisma/ORM, jobs and delivery rules.
5. [Project/Governance/PROJECT_GOVERNANCE_SOURCE_OF_TRUTH.md](Project/Governance/PROJECT_GOVERNANCE_SOURCE_OF_TRUTH.md) -
   authority and conflict order.

## Structure

| Folder | Authority |
|---|---|
| `V0/` | Standalone Sakhaa Forge product and implementation |
| `V1/` | Additive production maturity, deferred V0 capabilities and stable integration |
| `V2/` | Sakhaa scoring, research-prior evidence, recommendations, learning and SaaS |
| `Project/Architecture/` | Cross-version architecture principles, ADRs and boundaries |
| `Project/Design/` | Product identity, design system and user-facing language |
| `Project/Guardrails/` | Cross-version engineering rules |
| `Project/Operations/` | Cross-version deployment gates, SLOs, recovery and support |
| `Project/Security/` | Cross-version security, privacy, retention and rights methods |
| `Project/Governance/` | Source of truth, reviews, blocker policy and founder decisions |
| `superpowers/` | Planning and migration history; not product authority |

## Naming

- `V0_*.md`, `V1_*.md`, `V2_*.md`: owned by that product version.
- `PROJECT_*.md`: applies across product versions.
- `V0_SOURCE_*.md`: historical V0 input, not canonical.

Only executable code and passing evidence can establish implementation status.
