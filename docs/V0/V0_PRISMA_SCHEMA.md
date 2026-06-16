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
enum MembershipRole { OWNER ADMIN BRAND_MANAGER STRATEGIST REVIEWER OPERATOR FINANCE }
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
  User, Workspace, Membership, ServiceCredential

Brand:
  BrandProfile, BrandCrawlRun, BrandCandidate, BrandAsset, BrandApproval, BrandRule

Discovery/Blueprint:
  ViralCandidate, MetricSnapshot, MediaAcquisition, ThumbnailBlueprint,
  VideoBlueprint, BlueprintScene, FormulaDerivation, DirectorPrompt,
  BlueprintLibraryEntry

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

model Job {
  id             String @id @default(uuid()) @db.Uuid
  workspaceId    String @db.Uuid
  type           String
  status         JobStatus @default(CREATED)
  priority       Int @default(0)
  inputHash      String
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
```

## Database-Only Controls

Prisma cannot express every required PostgreSQL control. Prisma migrations must include
reviewed SQL for:

- RLS enablement and workspace policies;
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
unique(provider, idempotency_key)
```

Additional indexes require measured query plans.

## Money and Immutability

Use integer minor units or provider-native credit micros, never floating-point money.
Published media lineage, captured ledger entries and accepted provider request hashes are
immutable. Corrections create new records.
