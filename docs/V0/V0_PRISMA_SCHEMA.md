# Product V0 Prisma Schema Specification

## Relationship to the Domain Model

`V0_DATA_MODELS.md` defines business meaning. This document defines the required Prisma
mapping. The executable `schema.prisma` must link back to both documents and may split
models across Prisma schema files if the chosen Prisma version supports it.

## Generator and Datasource

```prisma
generator client {
  provider = "prisma-client-js"
}

datasource db {
  provider = "postgresql"
  url      = env("DATABASE_URL")
}
```

Use `DIRECT_DATABASE_URL` for migrations and a restricted pooled runtime URL for the
application. Prisma is the sole migration owner.

## Core Enums

```prisma
enum MembershipRole { OWNER ADMIN CLIENT_MANAGER REVIEWER }
enum RecordStatus { ACTIVE ARCHIVED DELETED }
enum ApprovalDecision { APPROVE REJECT REQUEST_CHANGES }
enum JobStatus { CREATED QUEUED LEASED RUNNING RETRY_WAIT SUCCEEDED FAILED CANCEL_REQUESTED CANCELLED EXPIRED }
enum ProviderOperationStatus { CREATED SUBMITTING ACCEPTED UNKNOWN PROCESSING COMPLETED REJECTED FAILED CANCELLED }
enum CreditLedgerType { PURCHASE RESERVE CAPTURE RELEASE ADJUSTMENT REFUND }
enum AssetTrustStatus { QUARANTINED VALIDATING CLEAN REJECTED DELETED }
enum PublishStatus { DRAFT SCHEDULED SUBMITTING ACCEPTED PUBLISHED_UNVERIFIED PUBLISHED_VERIFIED FAILED CANCELLED }
enum VerificationStatus { PENDING CHECKING PROCESSING_WAIT RETRY_SCHEDULED VERIFIED FAILED IDENTITY_MISMATCH VISIBILITY_RESTRICTED MANUAL_URL_REQUIRED }
```

## Model Groups

The executable schema must implement these models with UUID/ULID-style string IDs,
`workspaceId`, timezone-aware timestamps and explicit relations:

```text
Identity:
  User, Workspace, Membership, ServiceCredential, WorkspaceCapability

Brand:
  BrandProfile, BrandCrawlRun, BrandCandidate, BrandAsset, BrandApproval, BrandRule

Discovery/Blueprint:
  ViralCandidate, MetricSnapshot, MediaAcquisition, ThumbnailBlueprint,
  VideoBlueprint, BlueprintScene, FormulaDerivation, DirectorPrompt,
  BlueprintLibraryEntry, BlueprintRequest

Scripts:
  ScriptTournament, ScriptVariant, ScriptEvaluation, SelectedScript

Generation/Composition:
  AvatarProfile, AvatarConsent, GenerationEstimate, GenerationJob,
  ProviderOperation, GeneratedSegment, GeneratedAsset, CompositionInstruction,
  AePlan, RenderAttempt, FinalVideo

Billing:
  CreditWallet, CreditPurchase, CreditReservation, CreditLedgerEntry,
  ProviderPriceVersion

Review/Publishing:
  ReviewItem, ReviewComment, ReviewDecision, CalendarPost, PublishOperation,
  PostVerification, Notification

Lineage/Operations:
  PerformanceSnapshot, CreativeLineage, Artifact, AuditEvent, IdempotencyRecord,
  OutboxEvent, InboxEvent, Job, JobAttempt, JobDependency, JobEvent
```

## Representative Models

```prisma
model Workspace {
  id          String       @id @default(uuid()) @db.Uuid
  name        String
  createdAt   DateTime     @default(now()) @db.Timestamptz(6)
  updatedAt   DateTime     @updatedAt @db.Timestamptz(6)
  memberships Membership[]
  wallets     CreditWallet[]
  jobs        Job[]
  @@map("workspaces")
}

model WorkspaceCapability {
  id              String    @id @default(uuid()) @db.Uuid
  workspaceId     String    @db.Uuid
  capability      String    @db.VarChar(120)
  enabled         Boolean   @default(true)
  disabledReason  String?   @db.VarChar(500)
  updatedByUserId String    @db.Uuid
  createdAt       DateTime  @default(now()) @db.Timestamptz(6)
  updatedAt       DateTime  @updatedAt @db.Timestamptz(6)
  workspace       Workspace @relation(fields: [workspaceId], references: [id])
  updatedBy       User      @relation(fields: [updatedByUserId], references: [id])
  @@unique([workspaceId, capability])
  @@index([workspaceId, enabled])
  @@map("workspace_capabilities")
}

model ServiceCredential {
  id              String   @id @default(uuid()) @db.Uuid
  workspaceId     String   @db.Uuid
  provider        String   @db.VarChar(120)
  purpose         String   @db.VarChar(120)
  environment     String   @db.VarChar(80)
  secretRef       String   @db.VarChar(300)
  rotationStatus  String   @db.VarChar(80)
  updatedByUserId String?  @db.Uuid
  lastRotatedAt   DateTime? @db.Timestamptz(6)
  createdAt       DateTime @default(now()) @db.Timestamptz(6)
  updatedAt       DateTime @updatedAt @db.Timestamptz(6)
  workspace       Workspace @relation(fields: [workspaceId], references: [id])
  updatedBy       User?     @relation(fields: [updatedByUserId], references: [id])
  @@index([workspaceId, provider, environment])
  @@map("service_credentials")
}

model BrandCrawlRun {
  id                 String    @id @default(uuid()) @db.Uuid
  workspaceId        String    @db.Uuid
  sourceUrl          String    @db.VarChar(1000)
  normalizedUrl      String    @db.VarChar(500)
  status             JobStatus @default(QUEUED)
  rightsAcknowledged Boolean
  crawlScope         Json
  robotsPolicy       Json?
  jobId              String?   @db.Uuid
  createdAt          DateTime  @default(now()) @db.Timestamptz(6)
  updatedAt          DateTime  @updatedAt @db.Timestamptz(6)
  workspace          Workspace @relation(fields: [workspaceId], references: [id])
  brandAssets        BrandAsset[]
  @@index([workspaceId, status, createdAt])
  @@map("brand_crawl_runs")
}

model BrandAsset {
  id           String        @id @default(uuid()) @db.Uuid
  workspaceId  String        @db.Uuid
  crawlRunId   String        @db.Uuid
  artifactId   String        @db.Uuid
  rightsBasis  String        @db.VarChar(240)
  permittedUse String        @db.VarChar(240)
  status       RecordStatus  @default(ACTIVE)
  workspace    Workspace     @relation(fields: [workspaceId], references: [id])
  crawlRun     BrandCrawlRun @relation(fields: [crawlRunId], references: [id])
  artifact     Artifact      @relation(fields: [artifactId], references: [id])
  @@unique([workspaceId, artifactId, crawlRunId])
  @@index([workspaceId, status, createdAt])
  @@map("brand_assets")
}

model BrandCandidate {
  id                String   @id @default(uuid()) @db.Uuid
  workspaceId       String   @db.Uuid
  crawlRunId        String   @db.Uuid
  fieldType         String   @db.VarChar(120)
  value             Json
  confidence        Decimal  @db.Decimal(4, 3)
  decision          String   @default("candidate") @db.VarChar(80)
  extractionState   String   @db.VarChar(80)
  sourceEvidence    Json
  conflict          Boolean  @default(false)
  sourceFingerprint String   @db.Char(64)
  @@unique([workspaceId, crawlRunId, fieldType, sourceFingerprint])
  @@index([workspaceId, crawlRunId, fieldType])
  @@map("brand_candidates")
}

model BrandProfile {
  id               String @id @default(uuid()) @db.Uuid
  workspaceId      String @db.Uuid
  brandId          String @db.Uuid
  crawlRunId       String @db.Uuid
  schemaVersion    String @db.VarChar(80)
  version          Int
  status           String @db.VarChar(40)
  active           Boolean @default(false)
  profile          Json
  sourceSummary    Json
  approvedByUserId String @db.Uuid
  approvedAt       DateTime @db.Timestamptz(6)
  @@unique([workspaceId, brandId, version])
  @@index([workspaceId, brandId, status, active])
  @@map("brand_profiles")
}

model BrandApproval {
  id             String @id @default(uuid()) @db.Uuid
  workspaceId    String @db.Uuid
  brandProfileId String @db.Uuid
  brandId        String @db.Uuid
  actorUserId    String @db.Uuid
  decision       String @db.VarChar(40)
  reason         String? @db.VarChar(500)
  @@index([workspaceId, brandId, createdAt])
  @@map("brand_approvals")
}

model BrandRule {
  id             String @id @default(uuid()) @db.Uuid
  workspaceId    String @db.Uuid
  brandProfileId String @db.Uuid
  brandId        String @db.Uuid
  type           String @db.VarChar(80)
  value          String @db.VarChar(500)
  severity       String @db.VarChar(40)
  rationale      String @db.VarChar(500)
  status         RecordStatus @default(ACTIVE)
  @@unique([workspaceId, brandProfileId, type, value])
  @@index([workspaceId, brandId, status])
  @@map("brand_rules")
}

model GenerationEstimate {
  id                     String @id @default(uuid()) @db.Uuid
  workspaceId            String @db.Uuid
  brandProfileId         String @db.Uuid
  status                 String @db.VarChar(40)
  provider               String @db.VarChar(80)
  priceVersion           String @db.VarChar(80)
  maximumAuthorizedMinor BigInt
  currency               String @db.VarChar(3)
  selectedScriptId       String @db.Uuid
  avatarProfileId        String @db.Uuid
  @@index([workspaceId, brandProfileId, status])
  @@map("generation_estimates")
}

model GenerationJob {
  id               String   @id @default(uuid()) @db.Uuid
  workspaceId      String   @db.Uuid
  selectedScriptId String?  @db.Uuid
  avatarProfileId  String?  @db.Uuid
  status           JobStatus @default(CREATED)
  idempotencyKey   String
  inputHash        String
  version          Int      @default(1)
  createdAt        DateTime @default(now()) @db.Timestamptz(6)
  updatedAt        DateTime @updatedAt @db.Timestamptz(6)
  workspace        Workspace @relation(fields: [workspaceId], references: [id])
  operations       ProviderOperation[]
  reservations     CreditReservation[]
  @@unique([workspaceId, idempotencyKey])
  @@index([workspaceId, status, createdAt])
  @@map("generation_jobs")
}

model BlueprintLibraryEntry {
  id              String @id @default(uuid()) @db.Uuid
  workspaceId     String @db.Uuid
  brandProfileId  String @db.Uuid
  title           String @db.VarChar(200)
  status          String @db.VarChar(40)
  compatibility   Json
  createdByUserId String @db.Uuid
  @@index([workspaceId, status, createdAt])
  @@map("blueprint_library_entries")
}

model BlueprintRequest {
  id                      String @id @default(uuid()) @db.Uuid
  workspaceId             String @db.Uuid
  path                    String @db.VarChar(40)
  brandProfileId          String @db.Uuid
  brandProfileVersion     Int
  blueprintLibraryEntryId String? @db.Uuid
  objectiveType           String @db.VarChar(120)
  objective               String @db.VarChar(500)
  status                  String @db.VarChar(40)
  createdByUserId         String @db.Uuid
  @@index([workspaceId, status, createdAt])
  @@map("blueprint_requests")
}

model FormulaDerivation {
  id                      String @id @default(uuid()) @db.Uuid
  workspaceId             String @db.Uuid
  blueprintLibraryEntryId String @db.Uuid
  blueprintRequestId      String @db.Uuid
  status                  String @db.VarChar(40)
  formulaVersion          String @db.VarChar(80)
  slots                   Json
  replacementInstructions Json
  lineage                 Json
  @@unique([workspaceId, blueprintLibraryEntryId])
  @@index([workspaceId, status, createdAt])
  @@map("formula_derivations")
}

model DirectorPrompt {
  id                      String @id @default(uuid()) @db.Uuid
  workspaceId             String @db.Uuid
  blueprintLibraryEntryId String @db.Uuid
  formulaDerivationId     String @db.Uuid
  blueprintRequestId      String @db.Uuid
  status                  String @db.VarChar(40)
  promptVersion           String @db.VarChar(80)
  replacementSlots        Json
  prompt                  String @db.Text
  lineage                 Json
  @@unique([workspaceId, blueprintLibraryEntryId])
  @@index([workspaceId, status, createdAt])
  @@map("director_prompts")
}

model ScriptTournament {
  id                       String  @id @default(uuid()) @db.Uuid
  workspaceId              String  @db.Uuid
  blueprintRequestId       String  @db.Uuid
  blueprintLibraryEntryId  String  @db.Uuid
  formulaDerivationId      String  @db.Uuid
  directorPromptId         String  @db.Uuid
  brandProfileId           String  @db.Uuid
  brandProfileVersion      Int
  objectiveType            String  @db.VarChar(120)
  objective                String  @db.VarChar(500)
  requestedVariantCount    Int
  validVariantCount        Int
  status                   String  @db.VarChar(40)
  result                   String  @db.VarChar(40)
  promptVersion            String  @db.VarChar(80)
  modelVersion             String  @db.VarChar(80)
  telemetry                Json
  manifestArtifactId       String? @db.Uuid
  jobId                    String? @db.Uuid
  variants                 ScriptVariant[]
  evaluations              ScriptEvaluation[]
  selection                SelectedScript?
  @@index([workspaceId, status, createdAt])
  @@index([workspaceId, brandProfileId, createdAt])
  @@map("script_tournaments")
}

model ScriptVariant {
  id           String   @id @default(uuid()) @db.Uuid
  workspaceId  String   @db.Uuid
  tournamentId String   @db.Uuid
  index        Int
  status       String   @db.VarChar(40)
  hookType      String   @db.VarChar(80)
  hook          String   @db.Text
  body          String   @db.Text
  cta           String   @db.Text
  captions      String   @db.Text
  claims        Json
  cadence       Json
  formulaSlots  Json
  provenance    Json
  evaluation    ScriptEvaluation?
  selection     SelectedScript?
  @@index([workspaceId, tournamentId, index])
  @@map("script_variants")
}

model ScriptEvaluation {
  id                String  @id @default(uuid()) @db.Uuid
  workspaceId       String  @db.Uuid
  tournamentId      String  @db.Uuid
  variantId         String  @unique @db.Uuid
  status            String  @db.VarChar(40)
  hookStrength      Json
  timing            Json
  patternInterrupts Json
  cta               Json
  claims            Json
  captions          Json
  tone              Json
  formulaChecks     Json
  policyChecks      Json
  brandRuleChecks   Json
  modelScore        Float
  humanScore        Float?
  explanation       String  @db.Text
  @@map("script_evaluations")
}

model SelectedScript {
  id              String   @id @default(uuid()) @db.Uuid
  workspaceId     String   @db.Uuid
  tournamentId    String   @unique @db.Uuid
  variantId       String   @unique @db.Uuid
  approverUserId  String   @db.Uuid
  version         Int
  humanOverride   Boolean
  workspace       Workspace @relation(fields: [workspaceId], references: [id])
  tournament      ScriptTournament @relation(fields: [tournamentId], references: [id])
  variant         ScriptVariant @relation(fields: [variantId], references: [id])
  approver        User @relation("SelectedScriptApprover", fields: [approverUserId], references: [id])
  @@index([workspaceId, createdAt])
  @@map("selected_scripts")
}

The `approverUserId` foreign key to `users(id)` (migration
`0018_v0_s2_selected_script_approver_fk`) enforces actor lineage integrity: every
selected script records a real approving user. The unique `tournamentId` and
`variantId` constraints enforce one selection per tournament and one selection per
variant; changes require a new tournament and a new selection.

model ViralCandidate {
  id                 String @id @default(uuid()) @db.Uuid
  workspaceId        String @db.Uuid
  blueprintRequestId String @db.Uuid
  provider           String @db.VarChar(80)
  sourceIdentity     String @db.VarChar(240)
  sourceUrl          String @db.VarChar(1000)
  title              String @db.VarChar(240)
  creatorHandle      String @db.VarChar(160)
  niche              String @db.VarChar(240)
  market             String @db.VarChar(120)
  objectiveType      String @db.VarChar(120)
  rank               Int
  score              Int
  selectionState     String @db.VarChar(40)
  rightsWarnings     Json
  metadata           Json
  provenance         Json
  sourceHash         String @db.Char(64)
  @@unique([workspaceId, blueprintRequestId, sourceHash])
  @@index([workspaceId, blueprintRequestId, rank])
  @@map("viral_candidates")
}

model MetricSnapshot {
  id               String @id @default(uuid()) @db.Uuid
  workspaceId      String @db.Uuid
  viralCandidateId String @db.Uuid
  provider         String @db.VarChar(80)
  observedAt       DateTime @db.Timestamptz(6)
  metrics          Json
  sourceHash       String @db.Char(64)
  immutable        Boolean @default(true)
  @@unique([workspaceId, viralCandidateId, sourceHash])
  @@index([workspaceId, observedAt, id])
  @@map("metric_snapshots")
}

model MediaAcquisition {
  id               String @id @default(uuid()) @db.Uuid
  workspaceId      String @db.Uuid
  viralCandidateId String @db.Uuid
  artifactId       String? @db.Uuid
  status           String @db.VarChar(40)
  retrievalPolicy  String @db.VarChar(80)
  acquisitionMode  String @db.VarChar(80)
  rightsDecision   Json
  sourceHash       String @db.Char(64)
  blockedReason    String? @db.VarChar(160)
  @@index([workspaceId, viralCandidateId, createdAt])
  @@map("media_acquisitions")
}

model ThumbnailBlueprint {
  id                 String @id @default(uuid()) @db.Uuid
  workspaceId        String @db.Uuid
  viralCandidateId   String @db.Uuid
  mediaAcquisitionId String @db.Uuid
  artifactId         String? @db.Uuid
  status             String @db.VarChar(40)
  ocr                Json
  composition        Json
  hookHypothesis     String @db.VarChar(500)
  directorGuidance   Json
  quality            Json
  sourceHash         String @db.Char(64)
  @@index([workspaceId, viralCandidateId, createdAt])
  @@map("thumbnail_blueprints")
}

model VideoBlueprint {
  id                   String @id @default(uuid()) @db.Uuid
  workspaceId          String @db.Uuid
  viralCandidateId     String @db.Uuid
  mediaAcquisitionId   String @db.Uuid
  thumbnailBlueprintId String @db.Uuid
  status               String @db.VarChar(40)
  durationMs           Int
  stageStates          Json
  stageArtifactIds     Json
  sourceHash           String @db.Char(64)
  @@index([workspaceId, viralCandidateId, createdAt])
  @@index([workspaceId, status, createdAt])
  @@map("video_blueprints")
}

model BlueprintScene {
  id               String @id @default(uuid()) @db.Uuid
  workspaceId      String @db.Uuid
  videoBlueprintId String @db.Uuid
  index            Int
  startMs          Int
  endMs            Int
  formulaSlot      String @db.VarChar(80)
  shot             Json
  motion           Json
  transcript       Json
  ocr              Json
  replacements     Json
  @@unique([workspaceId, videoBlueprintId, index])
  @@index([workspaceId, videoBlueprintId, index])
  @@map("blueprint_scenes")
}

model ProviderOperation {
  id               String @id @default(uuid()) @db.Uuid
  workspaceId      String @db.Uuid
  generationJobId  String @db.Uuid
  provider         String
  operationType    String
  status           ProviderOperationStatus @default(CREATED)
  idempotencyKey   String
  requestHash      String
  externalId       String?
  lastErrorCode    String?
  submittedAt      DateTime? @db.Timestamptz(6)
  completedAt      DateTime? @db.Timestamptz(6)
  createdAt        DateTime @default(now()) @db.Timestamptz(6)
  updatedAt        DateTime @updatedAt @db.Timestamptz(6)
  generationJob    GenerationJob @relation(fields: [generationJobId], references: [id])
  @@unique([provider, idempotencyKey])
  @@index([workspaceId, status, updatedAt])
  @@map("provider_operations")
}

model CreditLedgerEntry {
  id             String @id @default(uuid()) @db.Uuid
  workspaceId    String @db.Uuid
  walletId       String @db.Uuid
  generationJobId String? @db.Uuid
  type           CreditLedgerType
  amountMinor    BigInt
  currency       String @db.VarChar(3)
  idempotencyKey String
  effectiveAt    DateTime @default(now()) @db.Timestamptz(6)
  createdAt      DateTime @default(now()) @db.Timestamptz(6)
  wallet         CreditWallet @relation(fields: [walletId], references: [id])
  @@unique([workspaceId, idempotencyKey])
  @@index([walletId, effectiveAt, id])
  @@map("credit_ledger_entries")
}

model IdempotencyRecord {
  id             String   @id @default(uuid()) @db.Uuid
  workspaceId    String?  @map("workspace_id") @db.Uuid
  actorUserId    String   @map("actor_user_id") @db.Uuid
  operation      String   @db.VarChar(120)
  idempotencyKey String   @map("idempotency_key") @db.VarChar(200)
  requestHash    String   @map("request_hash") @db.Char(64)
  responseStatus Int      @map("response_status")
  responseBody   Json     @map("response_body")
  createdAt      DateTime @default(now()) @map("created_at") @db.Timestamptz(6)
  workspace      Workspace? @relation(fields: [workspaceId], references: [id])
  actor          User     @relation(fields: [actorUserId], references: [id])
  @@unique([workspaceId, operation, idempotencyKey])
  @@unique([actorUserId, operation, idempotencyKey])
  @@index([actorUserId, operation, createdAt])
  @@map("idempotency_records")
}

model Job {
  id             String @id @default(uuid()) @db.Uuid
  workspaceId    String @db.Uuid
  type           String
  resourceClass  String
  status         JobStatus @default(CREATED)
  priority       Int @default(0)
  inputHash      String
  input          Json
  outputArtifactId String?
  lastErrorCode  String?
  nextRunAt      DateTime? @db.Timestamptz(6)
  maxAttempts    Int @default(5)
  createdAt      DateTime @default(now()) @db.Timestamptz(6)
  updatedAt      DateTime @updatedAt @db.Timestamptz(6)
  attempts       JobAttempt[]
  parentEdges    JobDependency[] @relation("JobParent")
  childEdges     JobDependency[] @relation("JobChild")
  @@index([workspaceId, status, nextRunAt])
  @@map("jobs")
}

model OutboxEvent {
  id            String @id @default(uuid()) @db.Uuid
  workspaceId   String @db.Uuid
  eventType     String
  aggregateType String
  aggregateId   String @db.Uuid
  payload       Json
  status        String @default("PENDING")
  createdAt     DateTime @default(now()) @db.Timestamptz(6)
  publishedAt   DateTime? @db.Timestamptz(6)
  workspace     Workspace @relation(fields: [workspaceId], references: [id])
  @@index([workspaceId, status, createdAt])
  @@map("outbox_events")
}
```

## Database-Only Controls

Prisma cannot express every required PostgreSQL control. Prisma migrations must include
reviewed SQL for:

- RLS enablement and workspace policies;
- workspace capability controls with Owner/Admin write policy and tenant-scoped reads;
- service credential metadata RLS with Owner/Admin-only access and no plaintext secret
  columns;
- partial unique indexes for one active lease/reservation/approved profile;
- check constraints for positive money/duration and valid state combinations;
- append-only ledger and audit protections;
- transaction-local tenant context helpers;
- optional exclusion constraints for schedule conflicts.

These SQL additions remain Prisma migration files; they are not a second migration path.

## Index Baseline

Every high-volume tenant query starts with `workspace_id`. Required baseline indexes:

```text
(workspace_id, status, created_at)
(workspace_id, updated_at, id)
(workspace_id, generation_job_id)
(workspace_id, scheduled_at, id)
(workspace_id, provider, external_id)
unique(workspace_id, operation, idempotency_key)
unique(actor_user_id, operation, idempotency_key) for pre-workspace mutations
unique(provider, idempotency_key)
```

Additional indexes require measured query plans.

## Money and Immutability

Use integer minor units or provider-native credit micros, never floating-point money.
Published media lineage, captured ledger entries and accepted provider request hashes are
immutable. Corrections create new records.
