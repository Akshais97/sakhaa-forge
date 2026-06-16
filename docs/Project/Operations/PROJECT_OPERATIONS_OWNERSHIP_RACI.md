# Operational Ownership RACI

Roles may be held by the same person during Phase 1, but accountability cannot be blank.

| Activity | Accountable | Responsible | Consulted | Informed |
|---|---|---|---|---|
| Product scope and pilot outcome | Product owner | Product owner | CEO, creative lead | Team |
| Security and access review | Security owner | Engineering owner | Privacy owner | CEO |
| Rights and data policy | Privacy/rights owner | Privacy/rights owner | Legal, ML owner | Product |
| Application release and rollback | Engineering owner | Engineering owner | Security, product | Support |
| GPU/provider operation | Engineering owner | ML owner | Finance | Product |
| Dataset freeze and model evaluation | ML owner | ML owner | Data science, privacy | Product |
| Model promotion | Product owner | ML owner | Security, privacy, data science | Support |
| Cost budget and reconciliation | Finance owner | Engineering owner | Product | CEO |
| Incident communication | Support owner | Incident commander | Security, engineering | Affected users |
| Backup and restore exercise | Engineering owner | Engineering owner | Security | Product |

## Assignment Gate

Before internal pilot, every accountable role has a named primary, backup, contact path,
and handover note. Before external launch, on-call coverage and escalation authority are
tested in an incident exercise.
