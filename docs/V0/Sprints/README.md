# Product V0 Slice Sprints

These files convert `../V0_VERTICAL_OUTCOME_SLICES.md` into sprint-ready execution
plans. Each sprint is one vertical slice. A slice may be broken into smaller
implementation tasks, but it remains incomplete until its sprint evidence is retained.

## Rules

- Start with `V0-F0`; do not skip predecessor evidence.
- Use TDD for every behaviour and observe red before green.
- Use generated OpenAPI clients and contract tests for public behaviour.
- Use Prisma as the only schema and migration owner.
- Keep provider and worker behaviour behind adapters and deterministic simulators by
  default.
- Never expose secrets, signed URLs, raw provider payloads or cross-tenant existence.
- Never claim paid, generated or published success before the owning verification passes.
- Keep V1, V2, Sakhaa, TRIBEv2, HCP, A-Q, automated A/B testing and excluded providers
  outside V0.

## Sprint Files

1. [V0-F0 Runnable Walking Skeleton](V0-F0_RUNNABLE_WALKING_SKELETON_SPRINT.md)
2. [V0-F1 Tenant-Safe Sign-In And Workspace Selection](V0-F1_TENANT_SAFE_SIGN_IN_AND_WORKSPACE_SELECTION_SPRINT.md)
3. [V0-F2 Executable Contracts, Errors And Idempotency](V0-F2_EXECUTABLE_CONTRACTS_ERRORS_AND_IDEMPOTENCY_SPRINT.md)
4. [V0-F3 Private Artifact Upload, Quarantine And Authorized Retrieval](V0-F3_PRIVATE_ARTIFACT_UPLOAD_QUARANTINE_AND_AUTHORIZED_RETRIEVAL_SPRINT.md)
5. [V0-F4 Durable Job, Outbox And Private Worker Round Trip](V0-F4_DURABLE_JOB_OUTBOX_AND_PRIVATE_WORKER_ROUND_TRIP_SPRINT.md)
6. [V0-F5 Traceable Operations, Restore And Feature Capability Control](V0-F5_TRACEABLE_OPERATIONS_RESTORE_AND_FEATURE_CAPABILITY_CONTROL_SPRINT.md)
7. [V0-B1 Safe Brand Intake](V0-B1_SAFE_BRAND_INTAKE_SPRINT.md)
8. [V0-B2 Evidence-Backed Brand Candidate Extraction](V0-B2_EVIDENCE_BACKED_BRAND_CANDIDATE_EXTRACTION_SPRINT.md)
9. [V0-B3 Human-Approved Versioned Brand Memory](V0-B3_HUMAN_APPROVED_VERSIONED_BRAND_MEMORY_SPRINT.md)
10. [V0-P1 Explicit Blueprint Path Selection](V0-P1_EXPLICIT_BLUEPRINT_PATH_SELECTION_SPRINT.md)
11. [V0-P2 Viral Candidate Discovery And Immutable Metrics](V0-P2_VIRAL_CANDIDATE_DISCOVERY_AND_IMMUTABLE_METRICS_SPRINT.md)
12. [V0-P3 Rights-Aware Media Acquisition And Thumbnail Blueprint](V0-P3_RIGHTS_AWARE_MEDIA_ACQUISITION_AND_THUMBNAIL_BLUEPRINT_SPRINT.md)
13. [V0-P4 Multimodal Scene Blueprint](V0-P4_MULTIMODAL_SCENE_BLUEPRINT_SPRINT.md)
14. [V0-P5 Immutable Blueprint, Formula And Director Prompt](V0-P5_IMMUTABLE_BLUEPRINT_FORMULA_AND_DIRECTOR_PROMPT_SPRINT.md)
15. [V0-S1 Auditable Script Tournament](V0-S1_AUDITABLE_SCRIPT_TOURNAMENT_SPRINT.md)
16. [V0-S2 Immutable Selected Script](V0-S2_IMMUTABLE_SELECTED_SCRIPT_SPRINT.md)
17. [V0-G1 Consent-Safe Avatar Selection](V0-G1_CONSENT_SAFE_AVATAR_SELECTION_SPRINT.md)
18. [V0-G2 Creator Wallet And Verified Credit Purchase](V0-G2_CREATOR_WALLET_AND_VERIFIED_CREDIT_PURCHASE_SPRINT.md)
19. [V0-G3 Versioned Generation Estimate And Atomic Reservation](V0-G3_VERSIONED_GENERATION_ESTIMATE_AND_ATOMIC_RESERVATION_SPRINT.md)
20. [V0-G4 Exactly-Once HeyGen Submission](V0-G4_EXACTLY_ONCE_HEYGEN_SUBMISSION_SPRINT.md)
21. [V0-G5 Retained Generated Media And Settled Credits](V0-G5_RETAINED_GENERATED_MEDIA_AND_SETTLED_CREDITS_SPRINT.md)
22. [V0-C1 Validated Composition Intent And AE Plan](V0-C1_VALIDATED_COMPOSITION_INTENT_AND_AE_PLAN_SPRINT.md)
23. [V0-C2 Reproducible Final Branded Render](V0-C2_REPRODUCIBLE_FINAL_BRANDED_RENDER_SPRINT.md)
24. [V0-R1 Exact-Version Review And Comments](V0-R1_EXACT_VERSION_REVIEW_AND_COMMENTS_SPRINT.md)
25. [V0-R2 Auditable Approval Bound To Final Media](V0-R2_AUDITABLE_APPROVAL_BOUND_TO_FINAL_MEDIA_SPRINT.md)
26. [V0-U1 Approved Calendar And Manual Export Fallback](V0-U1_APPROVED_CALENDAR_AND_MANUAL_EXPORT_FALLBACK_SPRINT.md)
27. [V0-U2 Idempotent Meta Publication](V0-U2_IDEMPOTENT_META_PUBLICATION_SPRINT.md)
28. [V0-U3 Idempotent YouTube Shorts Publication](V0-U3_IDEMPOTENT_YOUTUBE_SHORTS_PUBLICATION_SPRINT.md)
29. [V0-U4 Audience-Facing Verification And One Completion Notification](V0-U4_AUDIENCE_FACING_VERIFICATION_AND_ONE_COMPLETION_NOTIFICATION_SPRINT.md)
30. [V0-A1 Complete Creative Lineage And Performance Snapshot](V0-A1_COMPLETE_CREATIVE_LINEAGE_AND_PERFORMANCE_SNAPSHOT_SPRINT.md)
31. [V0-A2 Security, Recovery And Load-Shaped Hardening](V0-A2_SECURITY_RECOVERY_AND_LOAD_SHAPED_HARDENING_SPRINT.md)
32. [V0-A3 Standalone Real-Estate Reference Journey](V0-A3_STANDALONE_REAL_ESTATE_REFERENCE_JOURNEY_SPRINT.md)

## Required Sources

Every sprint plan inherits the canonical contracts in `../V0.md`,
`../V0_VERTICAL_OUTCOME_SLICES.md`, `../V0_VERTICAL_SLICE_DESIGN.md`,
`../V0_API.md`, `../V0_DATA_MODELS.md`, `../V0_PRISMA_SCHEMA.md`,
`../V0_JOBS.md`, `../V0_STATUS_ENUMS.md`, `../V0_PERMISSIONS.md`,
`../V0_SECURITY.md`, `../V0_ERROR_CATALOG.md`,
`../V0_SCREEN_AND_STATE_INVENTORY.md`, `../V0_ANALYTICS_EVENT_TAXONOMY.md`,
and the Project guardrails, design, development workflow, security and operations
documents under `../../Project/`.
