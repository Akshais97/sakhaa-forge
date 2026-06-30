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
enum CreditPurchaseStatus { INITIATED PENDING SUCCEEDED FAILED REFUNDED DISPUTED }
enum CreditReservationStatus { ACTIVE CAPTURED RELEASED EXPIRED ADJUSTED }
enum ProviderOperationStatus { CREATED SUBMITTING ACCEPTED UNKNOWN PROCESSING COMPLETED REJECTED FAILED CANCELLED }
enum AssetTrustStatus { QUARANTINED VALIDATING CLEAN REJECTED DELETED }
enum PublishStatus { DRAFT APPROVED SCHEDULED SUBMITTING ACCEPTED PUBLISHED_UNVERIFIED PUBLISHED_VERIFIED FAILED CANCELLED }
enum PublishOperationStatus { CREATED SUBMITTING ACCEPTED UNKNOWN PROCESSING COMPLETED REJECTED FAILED CANCELLED }
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
  // V0-G3 versioned-estimate guards: inputHash (server-side validation secret, never
  // returned), expiresAt (drives ESTIMATE_EXPIRED), version (optimistic
  // RESOURCE_VERSION_STALE guard), confirmedAt, durationSeconds (pilot cap 30).
  inputHash              String?  @db.VarChar(64)
  expiresAt              DateTime? @db.Timestamptz(6)
  version                Int      @default(1)
  confirmedAt            DateTime? @db.Timestamptz(6)
  durationSeconds        Int      @default(30)
  createdAt              DateTime @default(now()) @db.Timestamptz(6)
  updatedAt              DateTime @updatedAt @db.Timestamptz(6)
  workspace              Workspace @relation(fields: [workspaceId], references: [id])
  brandProfile           BrandProfile @relation(fields: [brandProfileId], references: [id])
  jobs                   GenerationJob[]
  @@index([workspaceId, brandProfileId, status])
  @@map("generation_estimates")
}

// V0-G3: generation job created at estimate confirmation. status is the lowercase
// V0_STATUS_ENUMS.md Generation enum stored as a string (authoritative over the
// JobStatus placeholder above) so provider-specific raw states map into the documented
// enum without merge or rename; `unknown` is preserved as a real state. V0-G3 creates
// the job in `queued`; provider submission is V0-G4. unique(workspace_id,
// idempotency_key) makes creation exactly-once.
model GenerationJob {
  id                     String   @id @default(uuid()) @db.Uuid
  workspaceId            String   @db.Uuid
  estimateId             String   @db.Uuid
  brandProfileId         String   @db.Uuid
  selectedScriptId       String?  @db.Uuid
  avatarProfileId        String?  @db.Uuid
  status                 String   @db.VarChar(40) @default("queued")
  idempotencyKey         String   @db.VarChar(200)
  inputHash              String   @db.VarChar(64)
  version                Int      @default(1)
  durationSeconds        Int      @default(30)
  maximumAuthorizedMinor BigInt
  currency               String   @db.VarChar(3)
  priceVersion           String   @db.VarChar(80)
  createdAt              DateTime @default(now()) @db.Timestamptz(6)
  updatedAt              DateTime @updatedAt @db.Timestamptz(6)
  workspace              Workspace @relation(fields: [workspaceId], references: [id])
  estimate               GenerationEstimate @relation(fields: [estimateId], references: [id])
  brandProfile           BrandProfile @relation(fields: [brandProfileId], references: [id])
  operations             ProviderOperation[]
  reservations           CreditReservation[]
  @@unique([workspaceId, idempotencyKey])
  @@index([workspaceId, status, createdAt])
  @@map("generation_jobs")
}

// V0-G3: global provider price reference (not tenant-owned, no workspace_id, no RLS).
// One effective rate per provider + priceVersion. Seeded with the deterministic
// heygen-simulator v0.local.1 INR rate.
model ProviderPriceVersion {
  id                   String   @id @default(uuid()) @db.Uuid
  provider             String   @db.VarChar(40)
  priceVersion         String   @db.VarChar(80)
  currency             String   @db.VarChar(3)
  rateMinorPerSecond   BigInt
  source               String   @db.VarChar(80)
  validFrom            DateTime @db.Timestamptz(6)
  validUntil           DateTime @db.Timestamptz(6)
  createdAt            DateTime @default(now()) @db.Timestamptz(6)
  updatedAt            DateTime @updatedAt @db.Timestamptz(6)
  @@unique([provider, priceVersion])
  @@map("provider_price_versions")
}

// V0-G3: atomic credit reservation. One active reservation per generation job; the
// partial unique index credit_reservations_one_active_per_job_idx (status = 'ACTIVE')
// is the database-side concurrency guard. amountMinor is the held amount in integer
// minor units (positive); the matching RESERVE ledger entry is the negative debit.
// Capture/release settle in V0-G5.
model CreditReservation {
  id              String                 @id @default(uuid()) @db.Uuid
  workspaceId     String                 @db.Uuid
  generationJobId String                 @db.Uuid
  walletId        String                 @db.Uuid
  status          CreditReservationStatus @default(ACTIVE)
  amountMinor     BigInt
  currency        String                 @db.VarChar(3)
  idempotencyKey  String                 @db.VarChar(200)
  expiresAt       DateTime?              @db.Timestamptz(6)
  createdAt       DateTime               @default(now()) @db.Timestamptz(6)
  updatedAt       DateTime @updatedAt @db.Timestamptz(6)
  workspace       Workspace              @relation(fields: [workspaceId], references: [id])
  generationJob   GenerationJob          @relation(fields: [generationJobId], references: [id])
  wallet          CreditWallet           @relation(fields: [walletId], references: [id])
  @@unique([workspaceId, idempotencyKey])
  @@index([workspaceId, generationJobId, status])
  @@map("credit_reservations")
}

// V0-G4 exactly-once provider operation. A durable row is persisted in CREATED/SUBMITTING
// BEFORE any provider network I/O, so a crash between persistence and the network response
// leaves a resumable operation rather than a blind duplicate. It binds the workspace,
// generation job, provider route, idempotency key and request hash; stores the provider
// external id, bound price version and estimated maximum cost; and records the
// accepted/completed/reconciled/cancelled timestamps. unique(workspace_id,
// idempotency_key) and the one-operation-per-job unique index make submission
// exactly-once. requestHash is a server-side binding secret (never returned). Provider
// payloads stay adapter-private and are never stored here. Credit capture/release is
// V0-G5. V0-G5 adds providerTotalMinor (reconciled actual provider cost, nullable until
// settlement) and settledAt (ledger settlement timestamp, not provider completion). RLS
// policy provider_operations_workspace_isolation; no BYPASSRLS.
model ProviderOperation {
  id                    String                 @id @default(uuid()) @db.Uuid
  workspaceId           String                 @db.Uuid
  generationJobId       String                 @db.Uuid
  provider              String                 @db.VarChar(40)
  operationType         String                 @db.VarChar(40)
  status                ProviderOperationStatus @default(CREATED)
  idempotencyKey        String                 @db.VarChar(200)
  requestHash           String                 @db.Char(64)
  externalId            String?                @db.VarChar(200)
  priceVersion          String                 @db.VarChar(80)
  estimatedMaximumMinor BigInt
  providerTotalMinor    BigInt?
  settledAt             DateTime?              @db.Timestamptz(6)
  currency              String                 @db.VarChar(3)
  retryAfterMs          Int?
  lastErrorCode         String?                @db.VarChar(80)
  submittedAt           DateTime?              @db.Timestamptz(6)
  acceptedAt            DateTime?              @db.Timestamptz(6)
  completedAt           DateTime?              @db.Timestamptz(6)
  reconciledAt          DateTime?              @db.Timestamptz(6)
  cancelledAt           DateTime?              @db.Timestamptz(6)
  createdAt             DateTime               @default(now()) @db.Timestamptz(6)
  updatedAt             DateTime               @updatedAt @db.Timestamptz(6)
  workspace             Workspace              @relation(fields: [workspaceId], references: [id])
  generationJob         GenerationJob          @relation(fields: [generationJobId], references: [id])
  generatedSegment      GeneratedSegment?
  creativeLineage       CreativeLineage?

  @@unique([workspaceId, idempotencyKey])
  @@unique([generationJobId])
  @@index([workspaceId, status, updatedAt])
  @@index([workspaceId, generationJobId, status])
  @@map("provider_operations")
}

// V0-G5 retained generated media and settled credits. Completed provider media is copied
// into private V0 storage through the adapter only, quarantined, validated and hashed, then
// bound to a GeneratedSegment, a versioned GeneratedAsset and a CreativeLineage row. The
// transient provider URL is never stored. unique(workspace_id, generation_job_id,
// segment_index) makes retention exactly-once per job index; RLS policy
// generated_segments_workspace_isolation; no BYPASSRLS.
model GeneratedSegment {
  id                  String   @id @default(uuid()) @db.Uuid
  workspaceId         String   @db.Uuid
  generationJobId     String   @db.Uuid
  providerOperationId String   @db.Uuid
  provider            String   @db.VarChar(40)
  externalId          String?  @db.VarChar(200)
  segmentIndex        Int      @default(0)
  durationSeconds     Int
  contentType         String   @db.VarChar(120)
  byteSize            Int
  sha256              String   @db.Char(64)
  artifactId          String   @db.Uuid
  sourceFetchedAt     DateTime @default(now()) @db.Timestamptz(6)
  createdAt           DateTime @default(now()) @db.Timestamptz(6)
  updatedAt           DateTime @updatedAt @db.Timestamptz(6)
  workspace           Workspace         @relation(fields: [workspaceId], references: [id])
  generationJob       GenerationJob     @relation(fields: [generationJobId], references: [id])
  providerOperation   ProviderOperation @relation(fields: [providerOperationId], references: [id])
  artifact            Artifact          @relation(fields: [artifactId], references: [id])
  generatedAsset      GeneratedAsset?

  @@unique([workspaceId, generationJobId, segmentIndex])
  @@index([workspaceId, generationJobId])
  @@map("generated_segments")
}

// V0-G5 versioned generated asset bound to a clean retained Artifact. kind is provider_video
// for V0-G5 (assembled/rendered kinds are later sprints). status is the UPPERCASE
// AssetTrustStatus contract (CLEAN/REJECTED/SUPERSEDED, default CLEAN).
// unique(workspace_id, generation_job_id, version) makes asset creation exactly-once per
// version per job. RLS policy generated_assets_workspace_isolation; no BYPASSRLS.
model GeneratedAsset {
  id              String   @id @default(uuid()) @db.Uuid
  workspaceId     String   @db.Uuid
  generationJobId String   @db.Uuid
  segmentId       String   @db.Uuid
  artifactId      String   @db.Uuid
  version         Int      @default(1)
  kind            String   @default("provider_video") @db.VarChar(40)
  durationSeconds Int
  contentType     String   @db.VarChar(120)
  sha256          String   @db.Char(64)
  status          String   @default("CLEAN") @db.VarChar(40)
  createdAt       DateTime @default(now()) @db.Timestamptz(6)
  updatedAt       DateTime @updatedAt @db.Timestamptz(6)
  workspace       Workspace         @relation(fields: [workspaceId], references: [id])
  generationJob   GenerationJob     @relation(fields: [generationJobId], references: [id])
  segment         GeneratedSegment  @relation(fields: [segmentId], references: [id])
  artifact        Artifact          @relation(fields: [artifactId], references: [id])
  creativeLineage CreativeLineage?

  @@unique([workspaceId, generationJobId, version])
  @@index([workspaceId, generationJobId])
  @@map("generated_assets")
}

// V0-G5 / V0-C2 creative lineage: immutable ancestry of a retained media object. A
// generation-job lineage row (generationJobId set, finalVideoId null) ties a generated asset
// back through the approved brand profile, selected script (nullable, no FK), consent-safe
// avatar, estimate, provider operation and price version; unique(workspace_id,
// generation_job_id). A V0-C2 render-level lineage row (generationJobId null, finalVideoId set)
// ties a final video back through the composition instruction, AE plan and render attempt that
// produced it, copying the G5 generated-asset ancestry in-row (brandProfileId, estimateId,
// provider, providerOperationId, priceVersion are always present because the referenced asset
// was generated and settled in V0-G5); unique(workspace_id, final_video_id). SQL NULLs are
// distinct, so each unique constraint scopes only its non-null row kind. Append-only; a
// revision creates a new render-level row and never overwrites the prior row. RLS policy
// creative_lineage_workspace_isolation; no BYPASSRLS.
model CreativeLineage {
  id                       String   @id @default(uuid()) @db.Uuid
  workspaceId              String   @db.Uuid
  generationJobId          String?  @db.Uuid
  compositionInstructionId String?  @db.Uuid
  aePlanId                 String?  @db.Uuid
  renderAttemptId          String?  @db.Uuid
  finalVideoId             String?  @db.Uuid
  brandProfileId           String   @db.Uuid
  selectedScriptId         String?  @db.Uuid
  avatarProfileId          String?  @db.Uuid
  estimateId               String   @db.Uuid
  provider                 String   @db.VarChar(40)
  providerOperationId      String   @db.Uuid
  priceVersion             String   @db.VarChar(80)
  generatedAssetId         String   @db.Uuid
  createdAt                DateTime @default(now()) @db.Timestamptz(6)
  updatedAt                DateTime @updatedAt @db.Timestamptz(6)
  workspace                Workspace              @relation(fields: [workspaceId], references: [id])
  generationJob            GenerationJob?        @relation(fields: [generationJobId], references: [id])
  compositionInstruction   CompositionInstruction? @relation(fields: [compositionInstructionId], references: [id])
  aePlan                   AePlan?                @relation(fields: [aePlanId], references: [id])
  renderAttempt            RenderAttempt?         @relation(fields: [renderAttemptId], references: [id])
  finalVideo               FinalVideo?            @relation(fields: [finalVideoId], references: [id])
  brandProfile             BrandProfile           @relation(fields: [brandProfileId], references: [id])
  avatarProfile            AvatarProfile?         @relation(fields: [avatarProfileId], references: [id])
  estimate                 GenerationEstimate     @relation(fields: [estimateId], references: [id])
  providerOperation        ProviderOperation     @relation(fields: [providerOperationId], references: [id])
  generatedAsset           GeneratedAsset         @relation(fields: [generatedAssetId], references: [id])

  @@unique([workspaceId, generationJobId], map: "creative_lineage_workspace_job_idx")
  @@unique([workspaceId, finalVideoId], map: "creative_lineage_one_final_video_idx")
  @@index([workspaceId, generatedAssetId])
  @@index([workspaceId, finalVideoId])
  @@map("creative_lineage")
}

enum CompositionStatus {
  DRAFT
  PLANNING
  VALIDATION_FAILED
  VALIDATED
  RENDERING
  RENDERED
  FAILED
  SUPERSEDED

  @@map("composition_status")
}

// V0-C1 composition instruction: user direction bound to a retained generated asset. The
// raw direction is internal context, never returned to the browser. generationAssetId is a
// plain UUID, not a FK: the application layer (resolveAsset) is the sole validator of asset
// existence, workspace ownership and CLEAN status, and a validation_failed plan for a
// missing or cross-workspace asset must still be retained (a FK would leak existence and
// block recording failed attempts). C1 reaches PLANNING/VALIDATION_FAILED/VALIDATED;
// RENDERING/RENDERED/FAILED/SUPERSEDED are owned by later composition sprints.
model CompositionInstruction {
  id                 String           @id @default(uuid()) @db.Uuid
  workspaceId         String           @map("workspace_id") @db.Uuid
  actorUserId         String           @map("actor_user_id") @db.Uuid
  generationAssetId   String           @map("generation_asset_id") @db.Uuid
  inputMode           String           @map("input_mode") @db.VarChar(40)
  rawDirection        String?          @map("raw_direction") @db.VarChar(2000)
  status             CompositionStatus @default(PLANNING)
  version            Int              @default(1)
  createdAt          DateTime         @default(now()) @map("created_at") @db.Timestamptz(6)
  updatedAt          DateTime         @updatedAt @map("updated_at") @db.Timestamptz(6)
  workspace           Workspace        @relation(fields: [workspaceId], references: [id])
  aePlans             AePlan[]
  renderAttempts      RenderAttempt[]
  finalVideos         FinalVideo[]
  creativeLineages    CreativeLineage[]

  @@index([workspaceId, status, createdAt])
  @@index([workspaceId, updatedAt, id])
  @@map("composition_instructions")
}

// V0-C1 AE plan: a versioned timeline JSON validated against the deterministic AE
// capability registry. A valid plan is VALIDATED with a CLEAN plan artifact (application/json,
// retention class plan-artifact); a malformed plan or capability mismatch is
// VALIDATION_FAILED with every unsupported item explained in unsupportedItems. The timeline
// JSON, plan artifact sha256 and referenced asset ids are retained server-side only.
model AePlan {
  id                       String           @id @default(uuid()) @db.Uuid
  workspaceId              String           @map("workspace_id") @db.Uuid
  compositionInstructionId String           @map("composition_instruction_id") @db.Uuid
  version                  Int              @default(1)
  capabilityVersion        String           @map("capability_version") @db.VarChar(80)
  schemaVersion            String           @map("schema_version") @db.VarChar(80)
  timeline                 Json
  status                   CompositionStatus @default(PLANNING)
  unsupportedItems         Json             @map("unsupported_items") @default("[]")
  planArtifactId           String?          @map("plan_artifact_id") @db.Uuid
  validatedAt              DateTime?        @map("validated_at") @db.Timestamptz(6)
  createdAt                DateTime         @default(now()) @map("created_at") @db.Timestamptz(6)
  updatedAt                DateTime         @updatedAt @map("updated_at") @db.Timestamptz(6)
  workspace                Workspace        @relation(fields: [workspaceId], references: [id])
  compositionInstruction   CompositionInstruction @relation(fields: [compositionInstructionId], references: [id])
  planArtifact             Artifact?       @relation(fields: [planArtifactId], references: [id])
  renderAttempts           RenderAttempt[]
  creativeLineages         CreativeLineage[]

  @@index([workspaceId, compositionInstructionId, version])
  @@index([workspaceId, status, createdAt])
  @@map("ae_plans")
}

// V0-C2 render attempt status. The render is a costly worker mutation producing retained
// artifacts, so a RenderAttempt is persisted RUNNING before the AE worker runs and moves to
// SUCCEEDED (final media retained) or FAILED (capability drift, incompatible output, crash
// that could not recover). The public mapper lowercases the value.
enum RenderAttemptStatus {
  RUNNING
  SUCCEEDED
  FAILED

  @@map("render_attempt_status")
}

// V0-C2 final video revision status. Exactly one CURRENT final video exists per composition
// instruction; a new revision supersedes the prior CURRENT row (set to SUPERSEDED) without
// overwriting it, preserving the immutable revision lineage. The public mapper lowercases.
enum FinalVideoStatus {
  CURRENT
  SUPERSEDED

  @@map("final_video_status")
}

// V0-C2 render attempt: the durable record of one AE render of a validated plan. Persisted
// RUNNING before the AE worker runs, then SUCCEEDED with the retained final-video output hash
// or FAILED. inputHash is the plan canonical timeline hash and inputAssetHashes are the
// referenced generated-asset sha256s; both are server-side validation bindings.
// idempotencyInputHash is the sha256 of the canonical render request
// (compositionInstructionId, aePlanId, planCanonicalHash, inputAssetHashes, capabilityVersion)
// and binds render idempotency to the full input, not just the key: the same Idempotency-Key
// replays or resumes only when it hashes to the same input for the same composition, and the
// same key against a different composition, plan, input assets or capability version returns
// IDEMPOTENCY_INPUT_CONFLICT (409). logsArtifactId is the CLEAN render-logs Artifact. One RUNNING
// attempt per composition instruction (partial unique index) and one attempt per idempotency
// key are enforced by partial unique indexes.
model RenderAttempt {
  id                       String             @id @default(uuid()) @db.Uuid
  workspaceId              String             @map("workspace_id") @db.Uuid
  compositionInstructionId String             @map("composition_instruction_id") @db.Uuid
  aePlanId                 String             @map("ae_plan_id") @db.Uuid
  version                  Int                @default(1)
  renderer                 String             @db.VarChar(80)
  inputHash                String             @map("input_hash") @db.Char(64)
  inputAssetHashes         Json               @map("input_asset_hashes")
  workerCapabilityVersion  String             @map("worker_capability_version") @db.VarChar(80)
  idempotencyInputHash     String?            @map("idempotency_input_hash") @db.Char(64)
  outputHash               String?            @map("output_hash") @db.Char(64)
  status                   RenderAttemptStatus @default(RUNNING)
  logsArtifactId           String?            @map("logs_artifact_id") @db.Uuid
  costMinor                Int                @default(0) @map("cost_minor")
  idempotencyKey           String             @map("idempotency_key") @db.VarChar(120)
  startedAt                DateTime           @default(now()) @map("started_at") @db.Timestamptz(6)
  completedAt              DateTime?          @map("completed_at") @db.Timestamptz(6)
  createdAt                DateTime           @default(now()) @map("created_at") @db.Timestamptz(6)
  updatedAt                DateTime           @updatedAt @map("updated_at") @db.Timestamptz(6)
  workspace                Workspace          @relation(fields: [workspaceId], references: [id])
  compositionInstruction   CompositionInstruction @relation(fields: [compositionInstructionId], references: [id])
  aePlan                   AePlan             @relation(fields: [aePlanId], references: [id])
  logsArtifact             Artifact?          @relation(fields: [logsArtifactId], references: [id])
  finalVideos              FinalVideo[]
  creativeLineages         CreativeLineage[]

  @@unique([workspaceId, idempotencyKey])
  @@index([workspaceId, compositionInstructionId, version])
  @@index([workspaceId, status, createdAt])
  @@map("render_attempts")
}

// V0-C2 final video: the approved production object retained from a succeeded render, with
// thumbnail, captions and a media fingerprint (sha256). Versioned per composition instruction;
// exactly one CURRENT final video per instruction (partial unique index). The sha256 is the
// deterministic golden render hash for the plan. The artifact ids bind the retained CLEAN
// final-video, thumbnail and captions media.
model FinalVideo {
  id                       String           @id @default(uuid()) @db.Uuid
  workspaceId              String           @map("workspace_id") @db.Uuid
  compositionInstructionId String           @map("composition_instruction_id") @db.Uuid
  renderAttemptId          String           @map("render_attempt_id") @db.Uuid
  version                  Int              @default(1)
  status                   FinalVideoStatus @default(CURRENT)
  finalVideoArtifactId     String           @map("final_video_artifact_id") @db.Uuid
  thumbnailArtifactId      String           @map("thumbnail_artifact_id") @db.Uuid
  captionsArtifactId       String           @map("captions_artifact_id") @db.Uuid
  durationSeconds          Int              @map("duration_seconds")
  resolution               String           @db.VarChar(20)
  codec                    String           @db.VarChar(40)
  sha256                   String           @db.Char(64)
  byteSize                 Int              @map("byte_size")
  capabilityVersion        String           @map("capability_version") @db.VarChar(80)
  schemaVersion            String           @map("schema_version") @db.VarChar(80)
  createdAt                DateTime         @default(now()) @map("created_at") @db.Timestamptz(6)
  updatedAt                DateTime         @updatedAt @map("updated_at") @db.Timestamptz(6)
  workspace                Workspace        @relation(fields: [workspaceId], references: [id])
  compositionInstruction   CompositionInstruction @relation(fields: [compositionInstructionId], references: [id])
  renderAttempt            RenderAttempt    @relation(fields: [renderAttemptId], references: [id])
  finalVideoArtifact       Artifact         @relation("FinalVideoFinalVideoArtifact", fields: [finalVideoArtifactId], references: [id])
  thumbnailArtifact        Artifact         @relation("FinalVideoThumbnailArtifact", fields: [thumbnailArtifactId], references: [id])
  captionsArtifact         Artifact         @relation("FinalVideoCaptionsArtifact", fields: [captionsArtifactId], references: [id])
  creativeLineages         CreativeLineage[]

  @@unique([workspaceId, compositionInstructionId, version])
  @@index([workspaceId, status, createdAt])
  @@map("final_videos")
}

model CalendarPost {
  id                  String        @id @default(uuid()) @db.Uuid
  workspaceId         String        @map("workspace_id") @db.Uuid
  platform            String        @db.VarChar(40)
  account             String        @db.VarChar(240)
  caption             String        @db.VarChar(2000)
  finalVideoId        String        @map("final_video_id") @db.Uuid
  finalVideoSha256    String        @map("final_video_sha256") @db.Char(64)
  finalVideoVersion   Int           @map("final_video_version")
  approvalToken       String        @map("approval_token") @db.Char(64)
  scheduledAt         DateTime?     @map("scheduled_at") @db.Timestamptz(6)
  timezone            String        @db.VarChar(60)
  manualExport        Boolean       @default(false) @map("manual_export")
  manualLiveUrl       String?       @map("manual_live_url") @db.VarChar(500)
  manualUrlProvidedAt DateTime?     @map("manual_url_provided_at") @db.Timestamptz(6)
  exportArtifactId    String?       @map("export_artifact_id") @db.Uuid
  status              PublishStatus @default(APPROVED) @map("status")
  createdByUserId     String        @map("created_by_user_id") @db.Uuid
  version             Int           @default(1)
  createdAt           DateTime      @default(now()) @map("created_at") @db.Timestamptz(6)
  updatedAt           DateTime      @updatedAt @map("updated_at") @db.Timestamptz(6)
  workspace           Workspace     @relation(fields: [workspaceId], references: [id])
  finalVideo          FinalVideo    @relation(fields: [finalVideoId], references: [id])
  exportArtifact      Artifact?     @relation("CalendarPostExportArtifact", fields: [exportArtifactId], references: [id])
  publishOperations   PublishOperation[]

  @@index([workspaceId, status, createdAt])
  @@index([workspaceId, scheduledAt, id])
  @@index([workspaceId, platform, account, scheduledAt])
  @@map("calendar_posts")
}

// V0-U1 edit: `version` (Int @default(1)) backs optimistic-concurrency edits via
// `PATCH /calendar-posts/{id}` (caller supplies `expectedVersion`); a successful edit increments
// `version`. No migration was required for the edit route. The 60-second schedule-conflict window
// has no exclusion constraint; instead both create and edit acquire a transaction-scoped
// `pg_advisory_xact_lock(hashtext('{workspaceId}:{platform}:{account}'))` inside the RLS
// transaction so the app-level window check is authoritative under concurrency (the lock is never
// persisted and adds no schema object). The edit path additionally locks on the post id so the
// version check cannot race a concurrent edit.

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

model AvatarProfile {
  id                     String   @id @default(uuid()) @db.Uuid
  workspaceId            String   @map("workspace_id") @db.Uuid
  brandProfileId         String   @map("brand_profile_id") @db.Uuid
  kind                   String   @db.VarChar(40)
  displayName            String   @map("display_name") @db.VarChar(160)
  likenessScope          String   @map("likeness_scope") @db.VarChar(40)
  voiceScope             String   @map("voice_scope") @db.VarChar(40)
  serviceFulfillmentState String   @map("service_fulfillment_state") @db.VarChar(40)
  workspace              Workspace @relation(fields: [workspaceId], references: [id])
  brandProfile           BrandProfile @relation(fields: [brandProfileId], references: [id])
  consent                AvatarConsent?
  @@unique([workspaceId, brandProfileId, displayName])
  @@index([workspaceId, brandProfileId, createdAt])
  @@map("avatar_profiles")
}

model AvatarConsent {
  id              String   @id @default(uuid()) @db.Uuid
  workspaceId     String   @map("workspace_id") @db.Uuid
  avatarProfileId String   @unique @map("avatar_profile_id") @db.Uuid
  evidenceRef     String   @map("evidence_ref") @db.VarChar(300)
  likenessScope   String   @map("likeness_scope") @db.VarChar(40)
  voiceScope      String   @map("voice_scope") @db.VarChar(40)
  expiresAt       DateTime? @map("expires_at") @db.Timestamptz(6)
  revokedAt       DateTime? @map("revoked_at") @db.Timestamptz(6)
  revokedByUserId String?   @map("revoked_by_user_id") @db.Uuid
  workspace       Workspace @relation(fields: [workspaceId], references: [id])
  avatarProfile   AvatarProfile @relation(fields: [avatarProfileId], references: [id])
  @@index([workspaceId, avatarProfileId])
  @@map("avatar_consents")
}

`AvatarProfile` is bound to one approved `BrandProfile`. Eligibility is derived from
the one-to-one `AvatarConsent` (evidence, expiry, revocation) and the avatar's
`serviceFulfillmentState`; it is never stored as a separate enum. `evidenceRef` is a
secret-manager style reference and never reaches public responses or analytics.
Migration `0019_v0_g1_consent_safe_avatar_selection` creates both tables with
workspace-isolation RLS policies, `kind`/`scope`/`service_fulfillment_state` CHECK
constraints and a non-empty `evidence_ref` CHECK constraint.

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

// V0-U2/V0-U3: one idempotent publish operation per calendar post. The provider is derived
// server-side from CalendarPost.platform (meta -> meta-simulator, youtube-shorts ->
// youtube-simulator) and stored in this VarChar(40) (no enum, so a new platform needs no
// migration). The requestHash is a server-side binding secret (never returned); the externalId
// is bound on acceptance and the publicUrl only on completion. retryAfterMs is set on a
// quota-exhausted refusal. acceptedAt/completedAt/reconciledAt record the lifecycle; a YouTube
// upload that is accepted but still processing uses the PROCESSING status while the post stays
// accepted. Publishing is not a
// V0 credit op, so there is no price/currency/estimatedMaximum/settledAt.
model PublishOperation {
  id              String                 @id @default(uuid()) @db.Uuid
  workspaceId     String                 @map("workspace_id") @db.Uuid
  calendarPostId  String                 @map("calendar_post_id") @db.Uuid
  provider        String                 @db.VarChar(40)
  operationType   String                 @db.VarChar(40)
  status          PublishOperationStatus @default(CREATED)
  idempotencyKey  String                 @db.VarChar(200)
  requestHash     String                 @db.Char(64)
  externalId      String?                @db.VarChar(200)
  publicUrl       String?                @db.VarChar(500)
  retryAfterMs    Int?
  lastErrorCode   String?                @db.VarChar(80)
  submittedAt     DateTime?              @db.Timestamptz(6)
  acceptedAt      DateTime?              @db.Timestamptz(6)
  completedAt     DateTime?              @db.Timestamptz(6)
  reconciledAt    DateTime?              @db.Timestamptz(6)
  cancelledAt     DateTime?              @db.Timestamptz(6)
  createdAt       DateTime               @default(now()) @map("created_at") @db.Timestamptz(6)
  updatedAt       DateTime               @updatedAt @map("updated_at") @db.Timestamptz(6)
  workspace       Workspace              @relation(fields: [workspaceId], references: [id])
  calendarPost    CalendarPost           @relation(fields: [calendarPostId], references: [id])

  @@unique([workspaceId, idempotencyKey])
  @@unique([calendarPostId])
  @@index([workspaceId, status, updatedAt])
  @@index([workspaceId, calendarPostId, status])
  @@map("publish_operations")
}

// V0-U4: the audience-facing verification record for one calendar post, exactly one row per post
// (unique(calendarPostId)). The provider is derived server-side (`verify-simulator`) and stored in
// this VarChar(40). status is the uppercase VerificationStatus DB enum; the public API lowercases it
// at the mapper boundary. The match flags are Boolean? (null while PROCESSING_WAIT). The observed
// identity (observedAccount, observedMediaSha256, observedCaption, observedPublishedAt),
// propagationDelayMs and lastErrorCode are server-private and never returned by the public mapper.
// evidenceArtifactId binds the immutable audience-evidence Artifact (a public sha256 fingerprint;
// the object key is never surfaced). verifiedAt is set only on VERIFIED. The new table inherits
// workspace-isolation RLS keyed on app.current_workspace_id; no role is granted an RLS bypass.
model PostVerification {
  id                   String             @id @default(uuid()) @db.Uuid
  workspaceId          String             @map("workspace_id") @db.Uuid
  calendarPostId       String             @map("calendar_post_id") @db.Uuid
  evidenceArtifactId   String?            @map("evidence_artifact_id") @db.Uuid
  provider             String             @db.VarChar(40)
  status               VerificationStatus @default(PENDING) @map("status")
  attempts             Int                @default(0) @map("attempts")
  accountMatched       Boolean?           @map("account_matched")
  mediaSha256Matched   Boolean?           @map("media_sha256_matched")
  captionMatched       Boolean?           @map("caption_matched")
  visibility           String?            @db.VarChar(40)
  observedAccount      String?            @map("observed_account") @db.VarChar(240)
  observedMediaSha256  String?            @map("observed_media_sha256") @db.Char(64)
  observedCaption      String?            @map("observed_caption") @db.VarChar(2000)
  observedPublishedAt  DateTime?          @map("observed_published_at") @db.Timestamptz(6)
  propagationDelayMs   Int?               @map("propagation_delay_ms")
  lastErrorCode        String?            @map("last_error_code") @db.VarChar(80)
  verifiedAt           DateTime?          @map("verified_at") @db.Timestamptz(6)
  createdAt            DateTime           @default(now()) @map("created_at") @db.Timestamptz(6)
  updatedAt            DateTime           @updatedAt @map("updated_at") @db.Timestamptz(6)
  workspace            Workspace          @relation(fields: [workspaceId], references: [id])
  calendarPost         CalendarPost       @relation(fields: [calendarPostId], references: [id])
  evidenceArtifact     Artifact?          @relation("PostVerificationEvidenceArtifact", fields: [evidenceArtifactId], references: [id])

  @@unique([calendarPostId], map: "post_verifications_one_per_post_idx")
  @@index([workspaceId, status, updatedAt])
  @@index([workspaceId, calendarPostId, status])
  @@map("post_verifications")
}

// V0-U1/V0-R1/V0-U4: one logical notification per (workspaceId, payloadHash). The payloadHash is a
// server-side binding secret (sha256 over the stable workspaceId+calendarPostId/reviewItemId+
// notificationType+recipientUserId tuple; never returned). reviewItemId is set for review-channel
// notifications and calendarPostId for V0-U4 publish-completion notifications (both nullable).
// recipientUserId is a storage secret and never appears in the API response or rendered UI. status
// is the uppercase NotificationStatus DB enum. The new table inherits workspace-isolation RLS keyed
// on app.current_workspace_id; no role is granted an RLS bypass.
model Notification {
  id               String             @id @default(uuid()) @db.Uuid
  workspaceId       String             @map("workspace_id") @db.Uuid
  reviewItemId      String?            @map("review_item_id") @db.Uuid
  calendarPostId    String?            @map("calendar_post_id") @db.Uuid
  notificationType  String             @map("notification_type") @db.VarChar(80)
  channel           String             @db.VarChar(40)
  recipientUserId   String             @map("recipient_user_id") @db.Uuid
  payloadHash       String             @map("payload_hash") @db.Char(64)
  status            NotificationStatus @default(PENDING)
  createdAt         DateTime           @default(now()) @map("created_at") @db.Timestamptz(6)
  sentAt            DateTime?          @map("sent_at") @db.Timestamptz(6)
  workspace         Workspace          @relation(fields: [workspaceId], references: [id])
  reviewItem        ReviewItem?        @relation(fields: [reviewItemId], references: [id])
  calendarPost      CalendarPost?      @relation(fields: [calendarPostId], references: [id])

  @@unique([workspaceId, payloadHash], map: "notifications_one_logical_per_payload_idx")
  @@index([workspaceId, recipientUserId, createdAt])
  @@index([workspaceId, calendarPostId, createdAt])
  @@map("notifications")
}

// V0-U4 initial performance observation; V0-A1 owns performance_collect as a synchronous,
// idempotent API write (POST /calendar-posts/{id}/performance-collect), not a queued job. One
// immutable PerformanceSnapshot anchors the observation window at audience-verification time with
// platform and source provenance. Later observations create new rows rather than editing existing
// metric evidence (metric snapshots are immutable). The initial snapshot carries an empty metrics
// object and a zero-width observation window bounded by the verification instant; the V0-A1
// collect write appends a fresh snapshot (source performance_collect_simulator, observation
// simulated, a widened window and populated observed metrics) and never mutates the initial row;
// a same-Idempotency-Key replay returns the same row with replay: true. The public mapper carries
// id, calendarPostId, platform, source, observation (derived from source: simulated for a
// collect-simulator snapshot, null for the initial snapshot — the table has no observation column),
// observationWindowStart, observationWindowEnd, a read-time stale flag (true when the post is no
// longer published_verified) and the observed metrics (views, likes, comments, shares, saves); the
// server-side sourceHash and any platform account id stay private. The metrics are observations of
// past platform state only, never a prediction of reach, virality, conversion or causal performance.
// The table inherits workspace-isolation RLS keyed on app.current_workspace_id; no role is granted
// an RLS bypass.
model PerformanceSnapshot {
  id                    String   @id @default(uuid()) @db.Uuid
  workspaceId           String   @map("workspace_id") @db.Uuid
  calendarPostId        String   @map("calendar_post_id") @db.Uuid
  platform              String   @db.VarChar(40)
  source                String   @db.VarChar(40)
  observationWindowStart DateTime @map("observation_window_start") @db.Timestamptz(6)
  observationWindowEnd  DateTime @map("observation_window_end") @db.Timestamptz(6)
  metrics               Json     @default("{}") @map("metrics")
  sourceHash            String   @map("source_hash") @db.Char(64)
  createdAt             DateTime @default(now()) @map("created_at") @db.Timestamptz(6)
  workspace             Workspace @relation(fields: [workspaceId], references: [id])
  calendarPost          CalendarPost @relation(fields: [calendarPostId], references: [id])

  @@index([workspaceId, calendarPostId, createdAt])
  @@map("performance_snapshots")
}

// V0-G2: one workspace wallet per currency. balanceMinor is integer minor units,
// derived from the ledger and cached. Payment instrument details are never stored.
model CreditWallet {
  id           String   @id @default(uuid()) @db.Uuid
  workspaceId  String   @map("workspace_id") @db.Uuid
  currency     String   @db.VarChar(3)
  balanceMinor BigInt   @map("balance_minor")
  createdAt    DateTime @default(now()) @map("created_at") @db.Timestamptz(6)
  updatedAt    DateTime @updatedAt @map("updated_at") @db.Timestamptz(6)
  workspace    Workspace @relation(fields: [workspaceId], references: [id])
  purchases    CreditPurchase[]
  ledgerEntries CreditLedgerEntry[]

  @@unique([workspaceId, currency])
  @@index([workspaceId, updatedAt, id])
  @@map("credit_wallets")
}

// V0-G2: Razorpay (India, INR) or Stripe (international) purchase state and provider
// references. Status is the uppercase DB enum; the public API normalizes it to the
// lowercase V0_STATUS_ENUMS.md contract at the mapper boundary.
model CreditPurchase {
  id               String              @id @default(uuid()) @db.Uuid
  workspaceId      String              @map("workspace_id") @db.Uuid
  walletId         String              @map("wallet_id") @db.Uuid
  provider         String              @db.VarChar(40)
  providerReference String             @map("provider_reference") @db.VarChar(200)
  status           CreditPurchaseStatus @default(INITIATED)
  amountMinor      BigInt              @map("amount_minor")
  currency         String              @db.VarChar(3)
  idempotencyKey   String              @map("idempotency_key") @db.VarChar(200)
  createdAt        DateTime            @default(now()) @map("created_at") @db.Timestamptz(6)
  updatedAt        DateTime            @updatedAt @map("updated_at") @db.Timestamptz(6)
  workspace        Workspace           @relation(fields: [workspaceId], references: [id])
  wallet           CreditWallet        @relation(fields: [walletId], references: [id])

  @@unique([workspaceId, idempotencyKey])
  @@unique([workspaceId, provider, providerReference])
  @@index([workspaceId, status, updatedAt])
  @@map("credit_purchases")
}

// V0-G2 append-only ledger entry. Ledger entries, not mutable balances, are financial
// truth; corrections are compensating entries. V0-G3 writes the RESERVE type as a
// negative signed debit that binds the generation_job_id at estimate confirmation;
// CAPTURE and RELEASE are reserved for V0-G5 settlement. unique(workspace_id,
// idempotency_key) makes every credit movement exactly-once.
model CreditLedgerEntry {
  id              String @id @default(uuid()) @db.Uuid
  workspaceId     String @map("workspace_id") @db.Uuid
  walletId        String @map("wallet_id") @db.Uuid
  generationJobId String? @map("generation_job_id") @db.Uuid
  type            CreditLedgerType
  amountMinor     BigInt  @map("amount_minor")
  currency        String @db.VarChar(3)
  idempotencyKey  String @map("idempotency_key") @db.VarChar(200)
  reason          String? @db.VarChar(500)
  effectiveAt     DateTime @default(now()) @map("effective_at") @db.Timestamptz(6)
  createdAt       DateTime @default(now()) @map("created_at") @db.Timestamptz(6)
  workspace       Workspace @relation(fields: [workspaceId], references: [id])
  wallet          CreditWallet @relation(fields: [walletId], references: [id])
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
