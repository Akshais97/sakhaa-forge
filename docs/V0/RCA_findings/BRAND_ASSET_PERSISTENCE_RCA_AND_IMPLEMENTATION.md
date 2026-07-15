# Sakhaa Forge Brand Asset Persistence and Retrieval  
## Root Cause Analysis, Architecture Decision, and Implementation Plan

---

## 1. Document Purpose

This document defines the root cause of the current brand-asset persistence failure in the `Akshais97/sakhaa-forge` codebase and provides the complete implementation mechanism required to:

- Persist Firecrawl crawl results beyond the current process lifetime.
- Store actual crawled brand asset files durably.
- Organize all data brandwise.
- Retrieve stored assets later through a Brand Assets tab.
- Reuse approved brand assets in downstream video-generation workflows.
- Avoid storing large media binaries inside PostgreSQL.
- Use the infrastructure already available: Supabase PostgreSQL and Backblaze B2.

This document is intended to act as the implementation source of truth for the backend, worker, database, API, and frontend work required to complete this feature.

---

# 2. Current Functional Goal

The intended product workflow is:

1. A user submits a brand website URL.
2. Firecrawl crawls the website.
3. The system extracts brand information and media candidates.
4. The system downloads and validates relevant assets.
5. Assets and extracted information are saved under a persistent Brand record.
6. The user can return later and select the same brand.
7. The user can view all stored assets in a Brand Assets tab.
8. The user can approve, reject, classify, or upload additional assets.
9. Approved assets can be selected later for video generation.
10. Video-generation workers can retrieve the exact approved asset bytes reliably.

The current codebase completes parts of steps 1 through 4, but persistence and retrieval are incomplete or configured in a way that makes data temporary.

---

# 3. Executive Architecture Decision

Use a dual-storage architecture.

## 3.1 Supabase PostgreSQL

Supabase PostgreSQL must store the searchable application and domain records:

- Workspaces
- Brands
- Crawl runs
- Crawl jobs
- Firecrawl provider status
- Extracted candidates
- Artifact metadata
- Brand-asset relationships
- Source evidence
- Classification
- Rights and usage restrictions
- Approval state
- Brand profiles
- Profile versions
- Primary asset selections
- Video-generation asset references

PostgreSQL must be the authoritative catalogue and source of truth.

## 3.2 Backblaze B2

Backblaze B2 must store the actual binary files:

- Logos
- Product images
- Brand photography
- Screenshots
- Videos
- PDFs
- SVGs
- Fonts
- Documents
- Crawl evidence bundles
- Normalized JSON outputs
- Generated derivatives and thumbnails

Backblaze B2 must remain private. Asset access must occur through backend authorization and short-lived signed URLs or server-side object downloads.

## 3.3 Google Drive Decision

Google Drive must not be introduced for this workflow.

It would add an unnecessary third storage system and is not the appropriate primary object store for:

- Stable machine-generated object keys
- Worker-to-worker retrieval
- Content-addressed storage
- SHA-256 verification
- Presigned upload and download access
- Deduplication
- Quarantine and clean-media promotion
- Automated video-generation pipelines
- High-volume programmatic asset access

The correct combination is:

```text
Supabase PostgreSQL = searchable metadata and application truth
Backblaze B2        = durable private file storage
```

---

# 4. Root Cause Analysis

## RCA-1: The application can default to an in-memory data store

### Observed behavior

The runtime store selection uses Prisma only when the relevant runtime setting explicitly selects Prisma. Otherwise, the application uses an in-memory implementation backed by JavaScript `Map` objects.

### Consequence

The following records can disappear when the API process restarts:

- Crawl runs
- Extracted candidates
- Brand assets
- Artifact metadata
- Profiles
- Jobs
- Job events
- Approval state

This can create the impression that Firecrawl extraction succeeded but nothing was saved.

### Root cause

Database credentials being present are not sufficient when the runtime store factory still selects the in-memory implementation.

### Required fix

Configure the application to use the Prisma-backed store in every non-test persistent environment.

```env
V0_RUNTIME_DB=prisma
DATABASE_URL=<Supabase PostgreSQL runtime connection>
DIRECT_DATABASE_URL=<Supabase PostgreSQL migration connection>
```

The application must fail startup in staging and production when:

- `V0_RUNTIME_DB` is not `prisma`.
- `DATABASE_URL` is missing.
- Prisma cannot connect.
- Required migrations are not present.

Silent fallback to an in-memory store must not be permitted in production.

---

## RCA-2: Crawled asset bytes are written to local worker storage

### Observed behavior

The current asset-acquisition flow writes downloaded assets using local filesystem operations under a configurable local storage root.

A conceptual current path resembles:

```text
LOCAL_STORAGE_ROOT/
  clean-media/
    {workspaceId}/
      brand-crawl/
        {crawlRunId}/
          ...
```

### Consequence

The file exists only on the worker or container that performed the crawl.

The asset can become unavailable after:

- Container restart
- Cloud redeployment
- Worker replacement
- Local cleanup
- Horizontal scaling
- API and queue worker separation
- Video generation running on a different machine
- Moving workloads to Railway, Vast.ai, or another worker host

Database metadata may still exist while the referenced local file no longer exists.

### Root cause

The local filesystem simulator is being used as the actual retention layer, while the Backblaze B2 object-storage adapter is not implemented or not connected to the crawl-acquisition flow.

### Required fix

Replace direct filesystem persistence in the Firecrawl asset-retention path with a storage abstraction.

Required interface:

```ts
interface ObjectStorage {
  putObject(input: PutObjectInput): Promise<StoredObject>;
  headObject(input: HeadObjectInput): Promise<ObjectMetadata>;
  getObject(input: GetObjectInput): Promise<ReadableStream>;
  copyObject(input: CopyObjectInput): Promise<void>;
  deleteObject(input: DeleteObjectInput): Promise<void>;
  createSignedUploadUrl(input: SignedUploadInput): Promise<SignedUrl>;
  createSignedDownloadUrl(input: SignedDownloadInput): Promise<SignedUrl>;
}
```

Required implementations:

```text
LocalFilesystemObjectStore
B2ObjectStore
```

Required runtime selection:

```env
OBJECT_STORAGE_PROVIDER=local-filesystem
```

or:

```env
OBJECT_STORAGE_PROVIDER=b2
```

Development may use the local adapter. Staging and production must use the B2 adapter.

---

## RCA-3: The domain model is crawl-run-centric instead of brand-centric

### Observed behavior

The codebase already contains several useful records, including concepts equivalent to:

- Brand crawl run
- Brand asset
- Brand candidate
- Brand profile
- Brand approval
- Brand rule
- Artifact

However, the complete domain requires a clear first-class `Brand` aggregate that permanently groups all crawl runs, assets, profiles, approvals, and downstream use.

### Consequence

It becomes difficult to answer:

```text
Show every asset belonging to this brand.
```

```text
Show the latest approved brand profile.
```

```text
Show assets gathered across all crawl runs for Surya Developers.
```

```text
Give the video worker all approved product images for this brand.
```

If assets are primarily attached to crawl runs, the frontend must reconstruct brand ownership indirectly and may lose access when transient crawl state is reset.

### Root cause

The persistence structure has many brand-related tables but lacks a sufficiently enforced relational root for durable brandwise retrieval.

### Required fix

Add or complete a first-class `Brand` model.

Conceptual Prisma model:

```prisma
model Brand {
  id              String       @id @default(uuid()) @db.Uuid
  workspaceId     String       @map("workspace_id") @db.Uuid
  name            String       @db.VarChar(200)
  slug            String       @db.VarChar(220)
  websiteUrl      String?      @map("website_url") @db.VarChar(1000)
  status          RecordStatus @default(ACTIVE)
  activeProfileId String?      @map("active_profile_id") @db.Uuid
  createdAt       DateTime     @default(now()) @map("created_at")
  updatedAt       DateTime     @updatedAt @map("updated_at")

  crawlRuns       BrandCrawlRun[]
  assets          BrandAsset[]
  profiles        BrandProfile[]

  @@unique([workspaceId, slug])
  @@index([workspaceId, status])
  @@map("brands")
}
```

Every relevant record must contain or resolve a stable `brandId`.

At minimum:

- `BrandCrawlRun.brandId`
- `BrandAsset.brandId`
- `BrandProfile.brandId`
- Downstream video-generation records must reference `brandId`
- `BrandCandidate.brandId` is recommended for efficient filtering and traceability

The durable relationship must be:

```text
Workspace
└── Brand
    ├── Crawl Run 1
    │   ├── Extracted Candidates
    │   ├── Evidence
    │   └── Assets
    ├── Crawl Run 2
    │   ├── Extracted Candidates
    │   ├── Evidence
    │   └── Assets
    ├── Brand Profile v1
    ├── Brand Profile v2
    ├── Approval History
    └── Brand Asset Library
```

---

## RCA-4: The object-storage configuration exists conceptually but is not completing the real B2 workflow

### Observed behavior

The repository already contains object-storage configuration concepts and B2 bucket naming, but the current worker path does not complete a real S3-compatible Backblaze B2 implementation.

### Consequence

Configured B2 endpoint and credentials may exist without any asset bytes actually reaching B2.

### Root cause

The object-storage module acts as a local filesystem simulator or incomplete adapter rather than a production S3-compatible client.

### Required fix

Implement Backblaze B2 through its S3-compatible API using an S3 client library.

Required operations:

- `PutObject`
- `HeadObject`
- `GetObject`
- `CopyObject`
- `DeleteObject`
- Presigned `PUT`
- Presigned `GET`

The B2 adapter must use:

```env
OBJECT_STORAGE_ENDPOINT=https://s3.<region>.backblazeb2.com
OBJECT_STORAGE_REGION=<region>
OBJECT_STORAGE_KEY_ID=<key-id>
OBJECT_STORAGE_APPLICATION_KEY=<application-key>
```

The endpoint must be passed explicitly to the S3 client.

---

## RCA-5: The frontend stores active brand and crawl data in temporary React state

### Observed behavior

The brand-intake UI keeps the active brand, crawl run, extracted candidate data, and asset pack in local component state.

The brand list supplied to navigation is empty or not populated from a persistent brand-list API.

State is reset when the locally selected brand changes.

### Consequence

The UI behaves like a one-session crawl interface instead of a persistent brand library.

After refresh or navigation:

- Previously crawled brands may not be listed.
- Existing assets may not be restored.
- The Brand Assets tab has no durable source.
- Crawl state and asset state can be lost.
- The user cannot reliably return to an existing brand.

### Root cause

The frontend is coupled to transient crawl-response state rather than stable URL-based brand identity and server-fetched records.

### Required fix

Use persistent routing and data fetching.

Required brand route:

```text
/workspaces/{workspaceId}/brands/{brandId}
```

Required assets route:

```text
/workspaces/{workspaceId}/brands/{brandId}/assets
```

The selected brand must come from:

```text
GET /workspaces/{workspaceId}/brands
```

The Brand Assets tab must come from:

```text
GET /brands/{brandId}/assets
```

React state may hold UI filters and temporary selections, but it must not be the source of truth for stored brands or assets.

---

## RCA-6: The browser upload flow can complete metadata without uploading actual bytes

### Observed behavior

The current upload sequence appears to:

1. Initiate an upload.
2. Receive an artifact ID or upload record.
3. Call the completion endpoint.

The required intermediate upload of the actual browser `File` bytes to object storage is missing or incomplete.

### Consequence

The application can create an artifact record while no corresponding object exists in storage.

### Root cause

Upload initiation and upload completion are implemented, but the actual presigned `PUT` request is not enforced between them.

### Required fix

The complete upload workflow must be:

```text
POST initiate upload
→ API creates quarantined artifact record
→ API returns artifactId and presigned B2 PUT URL

PUT actual file bytes to B2
→ Browser sends exact Content-Type
→ Browser sends the exact file body

POST complete upload
→ API performs HeadObject
→ API verifies object existence
→ API verifies byte size
→ API verifies declared content type
→ API optionally verifies checksum
→ API validates media
→ API promotes quarantine object to clean-media
→ API marks artifact CLEAN
```

The completion endpoint must fail if `HeadObject` proves that the object does not exist.

---

# 5. Target Storage Model

## 5.1 PostgreSQL responsibilities

PostgreSQL must store structured metadata only.

### Brand

```text
id
workspaceId
name
slug
websiteUrl
status
activeProfileId
createdAt
updatedAt
```

### BrandCrawlRun

```text
id
workspaceId
brandId
sourceUrl
status
provider
providerJobId
crawlConfiguration
detectedVertical
selectedVertical
startedAt
completedAt
warningCount
errorCode
errorMessage
createdAt
updatedAt
```

### Artifact

```text
id
workspaceId
objectKey
bucketClass
contentType
byteSize
sha256
originalFileName
storageStatus
trustStatus
producer
schemaVersion
createdAt
updatedAt
```

### BrandAsset

```text
id
workspaceId
brandId
crawlRunId
artifactId
category
sourceType
sourceUrl
evidenceLocator
approvalStatus
rightsBasis
permittedUse
isPrimary
width
height
durationMs
metadata
createdAt
updatedAt
```

### BrandCandidate

```text
id
workspaceId
brandId
crawlRunId
candidateType
value
confidence
sourceEvidence
status
createdAt
updatedAt
```

### BrandProfile

```text
id
workspaceId
brandId
version
status
profileData
approvedBy
approvedAt
createdAt
updatedAt
```

## 5.2 Binary data rule

Do not store the following directly in PostgreSQL:

- Image bytes
- Video bytes
- PDF bytes
- Font files
- Base64 image strings
- Large screenshots
- Large Firecrawl response blobs

PostgreSQL may store small normalized JSON metadata and references to B2 objects.

---

# 6. Backblaze B2 Bucket Responsibilities

Use separate private storage classes or buckets.

## 6.1 Quarantine bucket

Environment variable:

```env
B2_BUCKET_QUARANTINE=sakhaa-quarantine
```

Purpose:

- Newly uploaded files
- Newly downloaded crawl assets
- Untrusted provider output
- Objects awaiting validation
- Objects awaiting type and size verification

Nothing in quarantine is eligible for video generation.

## 6.2 Clean media bucket

Environment variable:

```env
B2_BUCKET_CLEAN_MEDIA=sakhaa-clean-media
```

Purpose:

- Validated logos
- Validated product images
- Approved screenshots
- Validated videos
- Validated fonts
- Production-eligible media
- Generated thumbnails and derivatives

Only clean objects may become generation-eligible.

## 6.3 Private artifacts bucket

Environment variable:

```env
B2_BUCKET_PRIVATE_ARTIFACTS=sakhaa-private-artifacts
```

Purpose:

- Normalized Firecrawl outputs
- Evidence manifests
- Crawl summaries
- Page inventories
- Media inventories
- Readiness reports
- Lineage documents
- Internal JSON bundles
- Processing manifests

---

# 7. Object-Key Design

Object keys must contain stable workspace and brand identity.

## 7.1 Crawled assets

```text
workspaces/{workspaceId}/brands/{brandId}/runs/{crawlRunId}/assets/{artifactId}/{sha256}.{extension}
```

Example:

```text
workspaces/
  19c77d2a-.../
    brands/
      80f92f38-.../
        runs/
          6ac16b9c-.../
            assets/
              c721ab3b-.../
                a8c913ef0c....webp
```

## 7.2 Manual uploads

```text
workspaces/{workspaceId}/brands/{brandId}/uploads/{artifactId}/{sha256}.{extension}
```

## 7.3 Evidence documents

```text
workspaces/{workspaceId}/brands/{brandId}/runs/{crawlRunId}/evidence/universal-output.json
workspaces/{workspaceId}/brands/{brandId}/runs/{crawlRunId}/evidence/vertical-output.json
workspaces/{workspaceId}/brands/{brandId}/runs/{crawlRunId}/evidence/page-inventory.json
workspaces/{workspaceId}/brands/{brandId}/runs/{crawlRunId}/evidence/media-inventory.json
workspaces/{workspaceId}/brands/{brandId}/runs/{crawlRunId}/evidence/readiness-report.json
```

## 7.4 Important rule

B2 folder naming must not become the query mechanism.

The application must query PostgreSQL by `workspaceId`, `brandId`, status, category, and approval state. PostgreSQL then supplies the immutable B2 `objectKey`.

---

# 8. End-to-End Firecrawl Persistence Flow

## Step 1: Resolve or create the Brand

When a user submits a website:

1. Normalize the website URL.
2. Resolve an existing brand in the workspace by approved matching rules.
3. Otherwise create a new Brand.
4. Return a stable `brandId`.

Avoid identifying a brand solely through its display name.

## Step 2: Create durable crawl records before calling Firecrawl

In one PostgreSQL transaction:

1. Create `BrandCrawlRun`.
2. Create queue `Job`.
3. Create an outbox event or enqueue intent.
4. Commit the transaction.

The crawl request must already have:

```text
workspaceId
brandId
crawlRunId
jobId
```

before Firecrawl is invoked.

## Step 3: Execute Firecrawl

The queue worker:

1. Receives stable identifiers.
2. Calls Firecrawl.
3. Polls or receives completion.
4. Normalizes provider output into owned application schemas.
5. Preserves provider telemetry separately.
6. Does not make raw provider JSON the application domain model.

## Step 4: Process each discovered asset

For every potential asset:

1. Resolve and validate the source URL.
2. Enforce allowed protocols.
3. Protect against server-side request forgery.
4. Validate redirect destinations.
5. Stream the file with a maximum-byte limit.
6. Determine actual MIME type.
7. Reject HTML error pages masquerading as images.
8. Calculate SHA-256.
9. Check for duplicate objects.
10. Create an Artifact record with quarantined state.
11. Upload bytes to B2 quarantine.
12. Perform `HeadObject`.
13. Validate image, video, PDF, SVG, or font structure.
14. Generate safe derivatives when required.
15. Copy valid bytes to the clean-media bucket.
16. Delete the quarantine object after successful promotion.
17. Mark the Artifact clean.
18. Create the BrandAsset relationship.
19. Preserve the original source and evidence.
20. Record warnings for skipped assets.

## Step 5: Persist normalized crawl outputs

Persist:

- Brand candidates
- Asset records
- Artifact metadata
- Crawl evidence
- Detected brand properties
- Crawl warnings
- Skipped asset reasons
- Provider usage
- Provider identifiers
- Completion status

## Step 6: Finalize crawl status

The crawl must be marked:

```text
SUCCEEDED
```

only when required persistence operations complete.

When optional assets fail while the usable crawl output is retained, use a status equivalent to:

```text
SUCCEEDED_WITH_WARNINGS
```

When critical persistence fails, use:

```text
FAILED
```

Do not mark a crawl successful merely because Firecrawl returned data.

---

# 9. Transaction and Consistency Rules

PostgreSQL and B2 do not provide one shared atomic transaction. The implementation must use an explicit state machine and idempotency.

## 9.1 Recommended Artifact states

```text
PENDING_UPLOAD
QUARANTINED
VALIDATING
CLEAN
REJECTED
MISSING
DELETED
```

## 9.2 Idempotency

Every acquisition operation must have a stable idempotency key based on:

```text
workspaceId + brandId + crawlRunId + normalizedSourceUrl
```

or a stable artifact ingestion identifier.

Retries must not create duplicate BrandAsset records.

## 9.3 Compensating actions

Examples:

- B2 upload succeeds, database update fails:
  - Retry database finalization.
  - Reconciliation job detects orphaned B2 object.
- Database artifact record exists, upload fails:
  - Mark artifact `MISSING` or `REJECTED`.
  - Retry according to policy.
- Promotion succeeds, quarantine deletion fails:
  - Keep clean object authoritative.
  - Schedule quarantine cleanup.

## 9.4 Reconciliation worker

Create a scheduled reconciliation process that detects:

- Database artifacts whose B2 objects are missing.
- B2 objects with no database record.
- Artifacts stuck in transitional states.
- Expired quarantine objects.
- Duplicate hashes.
- Failed promotions.

---

# 10. Brand Assets API

## 10.1 Brand endpoints

```text
POST /workspaces/{workspaceId}/brands
GET  /workspaces/{workspaceId}/brands

GET   /brands/{brandId}
PATCH /brands/{brandId}
```

## 10.2 Crawl endpoints

```text
POST /brands/{brandId}/crawl-runs
GET  /brands/{brandId}/crawl-runs
GET  /brands/{brandId}/crawl-runs/{crawlRunId}
```

## 10.3 Asset endpoints

```text
GET   /brands/{brandId}/assets
GET   /brands/{brandId}/assets/{brandAssetId}
PATCH /brands/{brandId}/assets/{brandAssetId}

POST /brands/{brandId}/assets/{brandAssetId}/approve
POST /brands/{brandId}/assets/{brandAssetId}/reject
POST /brands/{brandId}/assets/{brandAssetId}/set-primary
```

## 10.4 Upload endpoints

```text
POST /brands/{brandId}/assets/uploads/initiate
POST /brands/{brandId}/assets/uploads/{artifactId}/complete
POST /brands/{brandId}/assets/uploads/{artifactId}/abort
```

## 10.5 Download endpoint

```text
POST /artifacts/{artifactId}/downloads
```

The download endpoint must:

1. Authenticate the user.
2. Verify workspace membership.
3. Verify brand access.
4. Verify artifact status.
5. Verify permitted use.
6. Create a short-lived presigned B2 GET URL.
7. Return the URL and expiration.

Permanent public B2 URLs must not be stored or returned.

---

# 11. Asset API Response Contract

A Brand Assets listing should return metadata, not raw bytes.

Example:

```json
{
  "items": [
    {
      "id": "brand-asset-id",
      "artifactId": "artifact-id",
      "brandId": "brand-id",
      "crawlRunId": "crawl-run-id",
      "category": "product_image",
      "fileName": "tower-exterior.webp",
      "contentType": "image/webp",
      "byteSize": 482910,
      "width": 1920,
      "height": 1080,
      "sha256": "immutable-sha256",
      "rightsBasis": "public website crawl evidence",
      "permittedUse": "candidate_review",
      "approvalStatus": "approved",
      "storageStatus": "clean",
      "isPrimary": false,
      "sourceUrl": "https://brand.example/image.webp",
      "createdAt": "2026-07-13T10:30:00.000Z"
    }
  ],
  "nextCursor": null
}
```

Preview URLs should either:

- Be minted separately in a batch signed-URL endpoint, or
- Be returned as short-lived URLs with explicit expiry.

Do not persist signed URLs in PostgreSQL.

---

# 12. Brand Assets Tab

The Brand Assets tab must be a persistent library, not a visualization of the current crawl response.

## 12.1 Data source

```text
GET /brands/{brandId}/assets
```

## 12.2 Required filtering

- All
- Logos
- Product assets
- Brand photography
- Website screenshots
- Videos
- Documents
- Fonts
- Approved
- Pending review
- Rejected
- Clean
- Missing
- Crawl run
- Upload source

## 12.3 Required asset-card information

- Preview
- File name
- Category
- Source URL or upload source
- Crawl run
- File type
- Dimensions or duration
- Byte size
- Approval state
- Rights state
- Production eligibility
- Primary/alternate state
- Creation date
- Asset details action

## 12.4 Required asset actions

- Approve
- Reject
- Reclassify
- Mark as primary
- Edit rights status
- Download
- Delete or archive
- View source evidence
- Select for video generation
- Upload replacement
- Compare duplicates

## 12.5 Routing

Use stable route identity:

```text
/workspaces/{workspaceId}/brands/{brandId}/assets
```

Refreshing the page must restore the same brand and the same server-backed asset library.

---

# 13. Correct Browser Upload Flow

## Step 1: Initiate

Frontend sends:

```http
POST /brands/{brandId}/assets/uploads/initiate
```

Payload:

```json
{
  "fileName": "logo.svg",
  "contentType": "image/svg+xml",
  "byteSize": 18420,
  "category": "logo"
}
```

Backend returns:

```json
{
  "artifactId": "artifact-id",
  "uploadUrl": "short-lived-presigned-put-url",
  "expiresAt": "..."
}
```

## Step 2: Upload bytes

Frontend performs:

```http
PUT <uploadUrl>
Content-Type: image/svg+xml
```

Request body must be the actual browser `File`.

## Step 3: Complete

Frontend sends:

```http
POST /brands/{brandId}/assets/uploads/{artifactId}/complete
```

Backend must:

- Perform `HeadObject`.
- Verify the object exists.
- Verify expected size.
- Validate content.
- Promote to clean media.
- Create or finalize BrandAsset.
- Return the saved asset.

The backend must reject completion when no object was uploaded.

---

# 14. Downstream Video-Generation Contract

Video-generation requests must reference stable database IDs.

Correct request shape:

```json
{
  "brandId": "brand-id",
  "brandProfileId": "approved-profile-id",
  "brandAssetIds": [
    "approved-brand-asset-id-1",
    "approved-brand-asset-id-2"
  ]
}
```

Do not use:

- Raw Firecrawl URLs
- Browser-local objects
- Local filesystem paths
- Long-lived public B2 URLs
- Expired presigned URLs
- Unapproved asset IDs
- Artifact IDs without brand ownership checks

## 14.1 Video worker resolution flow

The worker must:

1. Resolve `brandId`.
2. Resolve the approved BrandProfile.
3. Resolve every BrandAsset.
4. Verify every asset belongs to the same workspace and brand.
5. Verify every artifact is `CLEAN`.
6. Verify every BrandAsset is approved.
7. Verify permitted use includes generation.
8. Resolve the B2 object key.
9. Download server-side or mint an internal signed URL.
10. Verify SHA-256 after download when practical.
11. Use the immutable bytes.
12. Record used asset IDs and hashes in the generation manifest.

This makes video generation reproducible and auditable.

---

# 15. Security Requirements

## 15.1 B2 privacy

All buckets must be private.

## 15.2 Authorization

Every asset operation must verify:

- Authenticated user
- Workspace membership
- Brand membership
- Required role or permission
- Artifact ownership
- Allowed operation

## 15.3 Signed URLs

Recommended defaults:

```env
SIGNED_UPLOAD_TTL_SECONDS=900
SIGNED_DOWNLOAD_TTL_SECONDS=300
```

Signed URLs must be short-lived and scoped to one object.

## 15.4 SSRF protection for crawled URLs

The asset downloader must block:

- `localhost`
- Loopback addresses
- Private network ranges
- Link-local addresses
- Cloud metadata endpoints
- Unsupported protocols
- Redirects into blocked networks

## 15.5 File validation

Validate:

- Maximum size
- Actual MIME signature
- Declared content type
- Image dimensions
- SVG safety
- PDF structure
- Video probe result
- Extension mismatch
- Decompression bombs
- Malformed files

## 15.6 Integrity

Store SHA-256 for every retained object.

Use SHA-256 for:

- Integrity checks
- Duplicate detection
- Reproducibility
- Generation manifests
- Reconciliation

---

# 16. Environment Configuration

Recommended production configuration:

```env
# Persistent runtime store
V0_RUNTIME_DB=prisma

# Supabase PostgreSQL
DATABASE_URL=<runtime-connection-url>
DIRECT_DATABASE_URL=<migration-connection-url>

# Object storage
OBJECT_STORAGE_PROVIDER=b2
OBJECT_STORAGE_ENDPOINT=https://s3.<region>.backblazeb2.com
OBJECT_STORAGE_REGION=<b2-region>
OBJECT_STORAGE_KEY_ID=<b2-key-id>
OBJECT_STORAGE_APPLICATION_KEY=<b2-application-key>

# Buckets
B2_BUCKET_QUARANTINE=sakhaa-quarantine
B2_BUCKET_CLEAN_MEDIA=sakhaa-clean-media
B2_BUCKET_PRIVATE_ARTIFACTS=sakhaa-private-artifacts

# Signed URL lifetimes
SIGNED_UPLOAD_TTL_SECONDS=900
SIGNED_DOWNLOAD_TTL_SECONDS=300

# Limits
MAX_UPLOAD_BYTES=104857600
MAX_CRAWLED_ASSET_BYTES=52428800

# Optional local development
LOCAL_STORAGE_ROOT=.local-storage
```

## 16.1 Startup validation

Production startup must fail when:

- Prisma mode is not enabled.
- Database connectivity fails.
- B2 provider is selected but credentials are missing.
- Required B2 buckets are missing.
- Required migrations are pending.
- Signed URL TTLs are unsafe.
- Byte limits are undefined.

---

# 17. Implementation Plan

## Phase 1: Stop data loss

1. Set `V0_RUNTIME_DB=prisma`.
2. Verify Supabase PostgreSQL connectivity.
3. Apply existing Prisma migrations.
4. Remove production fallback to in-memory storage.
5. Add startup health checks.
6. Confirm crawl runs survive API restart.
7. Confirm candidates and asset metadata survive restart.

## Phase 2: Complete the Brand aggregate

1. Add the `Brand` model.
2. Add `brandId` to crawl runs.
3. Add `brandId` to BrandAsset.
4. Connect BrandProfile relationally.
5. Add appropriate indexes and unique constraints.
6. Backfill existing test or development data.
7. Update repository interfaces.
8. Update Prisma store implementation.
9. Update in-memory test implementation to match the same contract.

## Phase 3: Implement real Backblaze B2 storage

1. Create shared `ObjectStorage` interface.
2. Retain local filesystem implementation for development.
3. Implement `B2ObjectStore`.
4. Configure the S3-compatible endpoint.
5. Implement put, head, get, copy, delete.
6. Implement presigned upload and download URLs.
7. Add bucket availability health checks.
8. Add integration tests against a B2 test bucket or compatible local emulator.

## Phase 4: Replace local crawl-asset writes

1. Refactor the Firecrawl asset-acquisition module.
2. Stream downloaded bytes instead of buffering unlimited files.
3. Upload to quarantine.
4. Validate the stored object.
5. Promote to clean-media.
6. Persist Artifact and BrandAsset records.
7. Add idempotency.
8. Add retry behavior.
9. Add warning reporting.
10. Add reconciliation.

## Phase 5: Complete upload flow

1. Implement upload initiation.
2. Return presigned B2 PUT URL.
3. Upload actual browser bytes.
4. Implement object verification.
5. Implement promotion.
6. Reject false completion.
7. Add progress, retry, and abort states.

## Phase 6: Add brandwise retrieval APIs

1. Add brand list.
2. Add brand detail.
3. Add brand crawl history.
4. Add brand asset list.
5. Add filtering and pagination.
6. Add approval actions.
7. Add signed download endpoint.
8. Add authorization checks.

## Phase 7: Build the persistent Brand Assets tab

1. Populate the brand switcher from the API.
2. Route using `brandId`.
3. Load assets from the server.
4. Add filters.
5. Add approval states.
6. Add primary asset selection.
7. Add manual upload.
8. Add error and empty states.
9. Restore state after refresh.
10. Remove dependency on transient crawl-response state.

## Phase 8: Integrate video generation

1. Update generation requests to use `brandAssetIds`.
2. Validate brand and workspace ownership.
3. Resolve clean B2 objects server-side.
4. Enforce approval and rights state.
5. Download assets in the worker.
6. Record exact asset IDs and hashes in generation manifests.
7. Add failure handling for missing objects.

---

# 18. Database Migration Considerations

## 18.1 Adding Brand to existing data

When current crawl runs have no Brand:

1. Normalize each crawl source hostname.
2. Group records by workspace and normalized website.
3. Create one Brand per valid group.
4. Attach crawl runs.
5. Attach BrandAssets.
6. Attach BrandProfiles.
7. Review ambiguous groups manually.
8. Enforce `brandId` as non-null only after backfill.

## 18.2 Constraints

Recommended constraints:

```text
Brand: unique(workspaceId, slug)
BrandAsset: unique(brandId, artifactId)
BrandProfile: unique(brandId, version)
Artifact: index(workspaceId, sha256)
BrandCrawlRun: index(brandId, createdAt)
BrandAsset: index(brandId, category, approvalStatus)
```

Do not globally deduplicate by SHA-256 without retaining workspace and rights boundaries.

---

# 19. Testing Requirements

## 19.1 Persistence tests

- Create brand, restart API, retrieve brand.
- Complete crawl, restart API, retrieve crawl.
- Save candidates, restart API, retrieve candidates.
- Save assets, restart API, retrieve assets.
- Verify in-memory store cannot be selected in production.

## 19.2 B2 tests

- Upload quarantine object.
- Verify with `HeadObject`.
- Copy to clean bucket.
- Delete quarantine object.
- Mint signed GET URL.
- Confirm expired URL fails.
- Confirm unauthorized user cannot mint URL.
- Confirm object metadata matches database metadata.

## 19.3 Crawl tests

- Valid image retained.
- Oversized image rejected.
- HTML response rejected.
- Redirect to private IP blocked.
- Duplicate URL is idempotent.
- Duplicate hash is handled.
- Partial asset failure produces warnings.
- Critical database failure prevents success status.

## 19.4 Upload tests

- Actual file upload succeeds.
- Completion without bytes fails.
- Size mismatch fails.
- MIME mismatch fails.
- Malformed SVG fails.
- Retry does not duplicate asset.
- Aborted upload is cleaned.

## 19.5 Frontend tests

- Brand list survives refresh.
- Brand Assets tab survives refresh.
- Switching brand loads the correct assets.
- Filters work.
- Signed previews refresh after expiration.
- Failed image preview does not break the page.
- Asset approval persists.
- Primary asset selection persists.

## 19.6 Video-generation tests

- Approved clean asset resolves.
- Rejected asset fails validation.
- Quarantined asset fails validation.
- Cross-brand asset reference fails.
- Cross-workspace asset reference fails.
- Missing B2 object produces an explicit error.
- Generation manifest records asset ID and hash.

---

# 20. Observability Requirements

Track:

- Crawl count
- Crawl success rate
- Crawl warning rate
- Asset download failures
- Asset validation failures
- B2 upload failures
- B2 promotion failures
- Database write failures
- Objects stuck in quarantine
- Missing-object reconciliation count
- Presigned URL generation failures
- Brand Assets API latency
- Video worker asset-resolution failures

Every log entry in this flow should contain applicable identifiers:

```text
workspaceId
brandId
crawlRunId
jobId
artifactId
brandAssetId
providerJobId
```

Do not log secrets or signed URLs.

---

# 21. Failure Handling

## Firecrawl succeeds but database persistence fails

- Mark crawl failed or persistence-failed.
- Retain provider response reference when safe.
- Retry persistence idempotently.
- Do not show the crawl as fully saved.

## B2 upload fails

- Mark Artifact rejected or upload-failed.
- Record the error.
- Retry according to policy.
- Continue other optional assets where possible.

## Database succeeds but B2 object is missing

- Mark Artifact missing.
- Prevent generation use.
- Surface repair state in Brand Assets.
- Re-run acquisition or manual replacement.

## B2 succeeds but database finalization fails

- Retry finalization.
- Reconciliation identifies orphaned objects.
- Delete only after a safe retention period if no record can be restored.

## Signed URL expires

- Frontend requests a new signed URL.
- Do not store the expired URL as durable state.

---

# 22. Acceptance Criteria

The implementation is complete only when all of the following are true:

1. A Firecrawl crawl creates a persistent Brand.
2. A crawl run remains available after API restart.
3. Extracted candidates remain available after restart.
4. Actual asset bytes are stored in private Backblaze B2.
5. No production asset depends on queue-worker local disk.
6. Artifact metadata is stored in Supabase PostgreSQL.
7. Every BrandAsset has a stable `brandId`.
8. The user can list all brands in a workspace.
9. The user can reopen a brand later.
10. The Brand Assets tab loads assets across historical crawl runs.
11. The Brand Assets tab survives browser refresh.
12. Users can approve, reject, classify, and upload assets.
13. Browser uploads send actual bytes before completion.
14. Asset previews use short-lived signed URLs.
15. Video-generation requests use stable BrandAsset IDs.
16. Video workers can retrieve exact approved files from B2.
17. Generation fails for rejected, quarantined, missing, or unauthorized assets.
18. Every generated video records the exact asset IDs and hashes used.
19. Production cannot silently fall back to in-memory persistence.
20. Reconciliation detects missing or orphaned objects.

---

# 23. Final Target Architecture

```text
User
  │
  ▼
Web Application
  │
  ├── Brand list
  ├── Brand detail
  ├── Crawl workflow
  └── Brand Assets tab
  │
  ▼
NestJS API
  │
  ├── Authentication and authorization
  ├── Brand domain services
  ├── Crawl orchestration
  ├── Asset metadata APIs
  ├── Signed URL issuance
  └── Video-generation validation
  │
  ├──────────────────────────────┐
  ▼                              ▼
Supabase PostgreSQL          Queue Worker
  │                              │
  ├── Brands                     ├── Firecrawl execution
  ├── Crawl runs                 ├── Asset download
  ├── Candidates                 ├── Validation
  ├── Artifacts                  ├── Hashing
  ├── Brand assets               ├── B2 upload
  ├── Profiles                   └── Persistence completion
  ├── Approvals
  └── Generation references
                                  │
                                  ▼
                            Backblaze B2
                                  │
                                  ├── Quarantine
                                  ├── Clean media
                                  └── Private artifacts
```

---

# 24. Final Decision

The existing problem is not that Firecrawl cannot extract brand assets. The extraction path is ahead of the persistence path.

The primary root causes are:

1. The application may be using an in-memory store instead of Prisma.
2. Crawled files are retained on local worker disk instead of Backblaze B2.
3. Brand data is not fully organized around a first-class persistent Brand aggregate.
4. The frontend relies on temporary React state instead of durable brand and asset APIs.
5. The manual upload flow does not reliably enforce upload of the actual bytes.
6. Downstream generation does not yet consume stable approved BrandAsset references.

The implementation must therefore use:

```text
Supabase PostgreSQL for structured, searchable, brandwise domain records.
Backblaze B2 for durable private binary files and processing artifacts.
Stable Brand IDs and BrandAsset IDs for all later retrieval and video generation.
```

This mechanism reuses the infrastructure already available, avoids unnecessary Google Drive integration, preserves assets across restarts and deployments, and creates the correct foundation for a persistent Brand Assets tab and downstream video generation.
