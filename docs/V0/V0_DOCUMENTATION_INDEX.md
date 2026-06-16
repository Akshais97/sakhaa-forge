# Sakhaa Forge Documentation

## Product Sequence

1. Product V0: Sakhaa Forge, the complete standalone production application.
2. Product V1: additive maturity and deferred-capability release of the same application.
3. Product V2: separate Sakhaa scoring and learning product.

## V0 Read Order

1. `V0_PRODUCT_SPECIFICATION.md`
2. `V0_ARCHITECTURE.md`
3. `V0_DATA_MODELS.md`
4. `V0_PRISMA_SCHEMA.md`
5. `V0_API.md`
6. `V0_JOBS.md`
7. `V0_SECURITY.md`
8. `V0_TESTING.md`
9. `V0_DEPLOYMENT.md`
10. `V0_VERTICAL_SLICE_DESIGN.md`
11. `V0_VERTICAL_OUTCOME_SLICES.md`
12. `Sprints/README.md`
13. `V0_IMPLEMENTATION_PLAN.md`
14. `V0_STATUS_ENUMS.md`
15. `V0_RISKS_AND_GATES.md`
16. `V0_SETUP_RUNBOOK.md`
17. `V0_PERMISSIONS.md`
18. `V0_INFORMATION_ARCHITECTURE.md`
19. `V0_SCREEN_AND_STATE_INVENTORY.md`
20. `V0_TEST_PERSONAS_AND_SEED_FIXTURES.md`
21. `V0_ERROR_CATALOG.md`
22. `V0_ANALYTICS_EVENT_TAXONOMY.md`
23. `V0_CUSTOMER_BRAND_INTAKE_TEMPLATE.md`
24. `V0_BRAND_PROFILE_CONTRACT.md`

Project-wide documents required for V0 implementation:

- `../Project/DESIGN.md`
- `../Project/Design/PROJECT_BRAND_GUIDELINES.md`
- `../Project/Design/PROJECT_CONTENT_AND_LANGUAGE_GUIDE.md`
- `../Project/Guardrails/PROJECT_DEVELOPMENT_WORKFLOW.md`
- `../Project/Operations/PROJECT_CONFIGURATION_CATALOG.md`

Supporting notes in this directory are inputs to the master specification. When they
conflict, the documents above and accepted ADRs win.

V0 acceptance explicitly requires operation with V1 and V2 absent.

## V1

Read `../V1/V1_EVOLUTION.md` only after V0 production acceptance. V1 preserves V0 and adds
template clustering, broader providers/platforms, A/B testing, quality, scale and stable
V2 exports.
