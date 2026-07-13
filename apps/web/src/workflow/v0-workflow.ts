export type WorkspaceRole = "OWNER" | "ADMIN" | "CLIENT_MANAGER" | "REVIEWER";

export type WorkflowStepKey =
  | "brand-intake"
  | "brand-candidates"
  | "brand-approval"
  | "blueprint-path"
  | "blueprint-library"
  | "blueprint-discovery"
  | "blueprint-acquisition"
  | "blueprint-scene"
  | "blueprint-ready"
  | "scripts-tournament"
  | "scripts-selection"
  | "avatars"
  | "generation-estimate"
  | "generation-job"
  | "composition-plan"
  | "composition-render"
  | "review"
  | "calendar"
  | "publish"
  | "verify"
  | "lineage";

export type StepAccess = "current" | "complete" | "read_only" | "locked" | "blocked" | "failed" | "unknown";

export interface WorkflowStep {
  key: WorkflowStepKey;
  group: string;
  title: string;
  route: string;
  apiSurface: string;
  requiredTruth: string;
  userOutcome: string;
  primaryAction: string;
  evidence: string;
  lockedCopy: string;
}

export interface WorkspaceSurface {
  key: string;
  title: string;
  route: string;
  group: string;
  purpose: string;
  contract: string;
  evidence: string[];
}

export interface WorkflowGateSnapshot {
  workspaceName: string;
  role: WorkspaceRole;
  currentStepKey: WorkflowStepKey;
  completedStepKeys: WorkflowStepKey[];
  blockedStepKeys: WorkflowStepKey[];
  failedStepKeys: WorkflowStepKey[];
  unknownStepKeys: WorkflowStepKey[];
  statusTruth: {
    brandProfile: "draft" | "candidates_ready" | "approved" | "rejected" | "unknown";
    generationProvider: "draft" | "accepted" | "unknown" | "generated" | "failed";
    reviewItem: "internal_review" | "client_review" | "approved" | "rejected" | "change_requested";
    calendarPost: "draft" | "approved" | "scheduled" | "submitting" | "accepted" | "published_unverified" | "published_verified" | "failed" | "cancelled";
  };
}

export const WORKFLOW_STEPS: WorkflowStep[] = [
  {
    key: "brand-intake",
    group: "Brand truth",
    title: "Submit brand sources",
    route: "/brand/intake",
    apiSurface: "POST /brands/crawl-runs · POST /brands/assets/uploads",
    requiredTruth: "Workspace membership and permitted customer URL or clean uploaded assets.",
    userOutcome: "Start brand intake from a URL, guideline files, logos or product images.",
    primaryAction: "Start brand intake",
    evidence: "Crawl run id, uploaded artifact ids, source list and safety outcome.",
    lockedCopy: "Create or select a workspace before brand intake can start.",
  },
  {
    key: "brand-candidates",
    group: "Brand truth",
    title: "Review extracted candidates",
    route: "/brand/candidates",
    apiSurface: "GET /brands/crawl-runs/{id}/candidates",
    requiredTruth: "Brand crawl has retained candidate evidence.",
    userOutcome: "Inspect extracted logo, colour, tone, offer, CTA and prohibited-claim candidates.",
    primaryAction: "Review candidates",
    evidence: "Candidate ids with source evidence, confidence and safe provenance.",
    lockedCopy: "Brand candidates open after the crawl run stores evidence.",
  },
  {
    key: "brand-approval",
    group: "Brand truth",
    title: "Approve brand profile",
    route: "/brand/approval",
    apiSurface: "POST /brands/{brand_id}/approvals",
    requiredTruth: "Extracted candidates are visible and the actor can approve brand truth.",
    userOutcome: "Approve one exact versioned brand profile for production use.",
    primaryAction: "Approve this profile",
    evidence: "Brand approval audit, actor, version and selected candidate evidence.",
    lockedCopy: "Approval opens only after candidate evidence is ready.",
  },
  {
    key: "blueprint-path",
    group: "Blueprint",
    title: "Choose blueprint path",
    route: "/blueprint/path",
    apiSurface: "GET /blueprints · POST /blueprint-requests",
    requiredTruth: "Approved brand profile.",
    userOutcome: "Choose between an approved library blueprint or a new viral extraction.",
    primaryAction: "Choose blueprint path",
    evidence: "Blueprint request id or selected reusable blueprint id.",
    lockedCopy: "Blueprint work requires an approved brand profile.",
  },
  {
    key: "blueprint-library",
    group: "Blueprint",
    title: "Select reusable blueprint",
    route: "/blueprint/library",
    apiSurface: "GET /blueprints",
    requiredTruth: "Approved brand profile and compatible library entries.",
    userOutcome: "Select an existing blueprint that can feed scripts without new acquisition.",
    primaryAction: "Use selected blueprint",
    evidence: "Library entry id, compatibility metadata and active brand profile version.",
    lockedCopy: "Reusable blueprints open after the blueprint path is chosen.",
  },
  {
    key: "blueprint-discovery",
    group: "Blueprint",
    title: "Discover viral candidate",
    route: "/blueprint/discovery",
    apiSurface: "POST /viral-candidates/search",
    requiredTruth: "New discovery path selected.",
    userOutcome: "Search and select a candidate with immutable metric snapshots and rights warnings.",
    primaryAction: "Select candidate",
    evidence: "Candidate id, metric snapshot, source warning and selection audit.",
    lockedCopy: "Discovery opens only when the new extraction path is selected.",
  },
  {
    key: "blueprint-acquisition",
    group: "Blueprint",
    title: "Acquire candidate media",
    route: "/blueprint/acquisition",
    apiSurface: "POST /viral-candidates/{id}/extract-blueprint",
    requiredTruth: "Selected candidate with permitted acquisition route.",
    userOutcome: "Acquire source media and thumbnail inputs without leaking protected provider payloads.",
    primaryAction: "Acquire media",
    evidence: "Media acquisition id, source hash, rights warning and artifact ids.",
    lockedCopy: "Acquisition requires a selected candidate.",
  },
  {
    key: "blueprint-scene",
    group: "Blueprint",
    title: "Extract scene structure",
    route: "/blueprint/scene",
    apiSurface: "POST /viral-candidates/{id}/scene-blueprint",
    requiredTruth: "Clean acquired media and thumbnail artifacts.",
    userOutcome: "Extract scenes, transcript, keyframes, vision observations and OCR separately.",
    primaryAction: "Extract scene blueprint",
    evidence: "Scene blueprint id, OCR evidence, confidence and blocked low-confidence states.",
    lockedCopy: "Scene extraction requires retained clean media.",
  },
  {
    key: "blueprint-ready",
    group: "Blueprint",
    title: "Approve ready blueprint",
    route: "/blueprint/ready",
    apiSurface: "POST /blueprint-requests/{id}/ready-blueprint",
    requiredTruth: "Merged blueprint, formula and provider-neutral director prompt.",
    userOutcome: "Make one immutable blueprint ready for script generation.",
    primaryAction: "Approve blueprint",
    evidence: "Ready blueprint id, formula slots, prompt version and merge audit.",
    lockedCopy: "Ready blueprint opens after scene evidence and formula merge are retained.",
  },
  {
    key: "scripts-tournament",
    group: "Scripts",
    title: "Run script tournament",
    route: "/scripts/tournament",
    apiSurface: "POST /script-tournaments",
    requiredTruth: "Ready blueprint and approved brand profile.",
    userOutcome: "Generate 10-20 brand- and formula-constrained script variants.",
    primaryAction: "Generate scripts",
    evidence: "Tournament id, variants, evaluations, model and prompt versions.",
    lockedCopy: "Script generation requires a ready blueprint.",
  },
  {
    key: "scripts-selection",
    group: "Scripts",
    title: "Select exact script",
    route: "/scripts/selection",
    apiSurface: "POST /script-tournaments/{id}/select",
    requiredTruth: "Completed script tournament with eligible variants.",
    userOutcome: "Select one immutable evaluated script for paid generation.",
    primaryAction: "Select script",
    evidence: "Selected script id, actor, evaluation and selection audit.",
    lockedCopy: "Script selection opens after tournament candidates are ready.",
  },
  {
    key: "avatars",
    group: "Generation",
    title: "Choose eligible avatar",
    route: "/avatars",
    apiSurface: "GET /avatars",
    requiredTruth: "Approved brand profile and selected script.",
    userOutcome: "Choose a consent-safe avatar whose likeness and voice scope are eligible.",
    primaryAction: "Choose avatar",
    evidence: "Avatar id, consent state, expiry and revocation check.",
    lockedCopy: "Avatar selection requires a selected script.",
  },
  {
    key: "generation-estimate",
    group: "Generation",
    title: "Review cost estimate",
    route: "/generation/estimate",
    apiSurface: "POST /generation-estimates · POST /generation-estimates/{id}/confirm",
    requiredTruth: "Selected script, eligible avatar and active price version.",
    userOutcome: "Review estimated cost and maximum authorisation before reserving credits.",
    primaryAction: "Reserve credits and generate",
    evidence: "Estimate id, price version, maximum authorisation and reservation record.",
    lockedCopy: "Cost estimate requires an eligible avatar and selected script.",
  },
  {
    key: "generation-job",
    group: "Generation",
    title: "Track HeyGen generation",
    route: "/generation/jobs/current",
    apiSurface: "POST /generation-jobs/{id}/submit · POST /generation-jobs/{id}/reconcile",
    requiredTruth: "Confirmed estimate and durable provider operation before network I/O.",
    userOutcome: "Submit, monitor and reconcile generation without duplicate paid operations.",
    primaryAction: "Check generation state",
    evidence: "Generation job id, provider operation id, callback or reconciliation outcome.",
    lockedCopy: "Generation opens after credits are reserved.",
  },
  {
    key: "composition-plan",
    group: "Composition",
    title: "Create AE plan",
    route: "/composition/plan",
    apiSurface: "POST /composition-plans",
    requiredTruth: "Retained generated media asset.",
    userOutcome: "Convert user direction into a versioned AE timeline plan.",
    primaryAction: "Create composition plan",
    evidence: "Composition instruction id, AE plan id and validation result.",
    lockedCopy: "Composition planning requires generated media.",
  },
  {
    key: "composition-render",
    group: "Composition",
    title: "Render final video",
    route: "/composition/render",
    apiSurface: "POST /composition-plans/{id}/render",
    requiredTruth: "Valid AE plan and clean referenced assets.",
    userOutcome: "Render a retained, fingerprinted 9:16 final MP4 with thumbnail and captions.",
    primaryAction: "Render final video",
    evidence: "Final video id, sha256, thumbnail, captions and render attempt.",
    lockedCopy: "Rendering requires a valid AE plan.",
  },
  {
    key: "review",
    group: "Review",
    title: "Approve exact version",
    route: "/review/current",
    apiSurface: "GET /review-items/{id} · POST /review-items/{id}/comments · POST /review-items/{id}/decisions",
    requiredTruth: "Current final-video version.",
    userOutcome: "Collect comments and approve, reject or request changes on the exact version.",
    primaryAction: "Approve this version",
    evidence: "Review item id, comments, decision, exact final-video hash and approval token only on approve.",
    lockedCopy: "Review opens after a final video render is retained.",
  },
  {
    key: "calendar",
    group: "Publish",
    title: "Schedule approved post",
    route: "/calendar",
    apiSurface: "POST /calendar-posts · PATCH /calendar-posts/{id}",
    requiredTruth: "Approved exact final-video version.",
    userOutcome: "Create or edit a calendar post with account, platform, caption and time.",
    primaryAction: "Schedule post",
    evidence: "Calendar post id, approved media binding, account, platform and schedule audit.",
    lockedCopy: "Scheduling requires an approved review decision.",
  },
  {
    key: "publish",
    group: "Publish",
    title: "Submit for publication",
    route: "/publish/current",
    apiSurface: "POST /calendar-posts/{id}/publish · POST /calendar-posts/{id}/publish/reconcile",
    requiredTruth: "Approved scheduled calendar post.",
    userOutcome: "Publish idempotently or reconcile unknown provider state before retrying.",
    primaryAction: "Publish post",
    evidence: "Publish operation id, provider acknowledgement, external id or manual export artifact.",
    lockedCopy: "Publishing requires an approved scheduled calendar post.",
  },
  {
    key: "verify",
    group: "Verify",
    title: "Verify live post",
    route: "/verify/current",
    apiSurface: "POST /calendar-posts/{id}/verify",
    requiredTruth: "Provider-accepted or manually exported post with public URL when required.",
    userOutcome: "Verify account, media identity, caption, visibility and publish time.",
    primaryAction: "Check live post",
    evidence: "Post verification id, audience evidence artifact, notification and performance snapshot.",
    lockedCopy: "Verification opens after provider acceptance or manual URL evidence.",
  },
  {
    key: "lineage",
    group: "Evidence",
    title: "Retain lineage",
    route: "/lineage/current",
    apiSurface: "GET /lineage/{finalVideoId}",
    requiredTruth: "Published and verified calendar post.",
    userOutcome: "Inspect the complete lineage from brand truth through verified publication.",
    primaryAction: "View lineage",
    evidence: "Lineage manifest, artifact hashes, cost records, job trace and recovery proof.",
    lockedCopy: "Lineage is complete only after the post is published and verified.",
  },
];

export const ROLE_CAPABILITIES: { role: WorkspaceRole; allowed: WorkflowStepKey[] }[] = [
  { role: "OWNER", allowed: WORKFLOW_STEPS.map((step) => step.key) },
  { role: "ADMIN", allowed: WORKFLOW_STEPS.map((step) => step.key) },
  {
    role: "CLIENT_MANAGER",
    allowed: WORKFLOW_STEPS.map((step) => step.key).filter((key) => key !== "lineage"),
  },
  { role: "REVIEWER", allowed: ["review"] },
];

export const WORKSPACE_SURFACES: WorkspaceSurface[] = [
  {
    key: "evidence",
    title: "Evidence and lineage",
    route: "/evidence",
    group: "Evidence",
    purpose: "Inspect retained artifacts, hashes, costs, approvals, publication proof and recovery records.",
    contract: "GET /lineage/{finalVideoId} and retained artifact/job evidence from V0-A1/A2/A3.",
    evidence: ["Brand approval", "Selected script", "Estimate and reservation", "Final video hash", "Audience verification"],
  },
  {
    key: "wallet",
    title: "Credit wallet",
    route: "/wallet",
    group: "Cost",
    purpose: "Show creator-credit balance, reservations, captures, releases, refunds and append-only ledger entries.",
    contract: "GET /credit-wallets/{id}/ledger plus Razorpay/Stripe purchase and reconciliation contracts.",
    evidence: ["Price version", "Maximum authorisation", "Reservation", "Capture or release", "Provider reconciliation"],
  },
  {
    key: "jobs",
    title: "Jobs and recovery",
    route: "/jobs",
    group: "Operations",
    purpose: "Track async jobs, provider operations, unknown states, traces and recovery actions.",
    contract: "GET /jobs/{id}, GET /jobs/{id}/events, GET /jobs/{id}/trace and POST /jobs/{id}/recover.",
    evidence: ["Job id", "Attempt history", "Provider operation", "Unknown reconciliation", "Recovery proof"],
  },
  {
    key: "settings/members",
    title: "Members and roles",
    route: "/settings/members",
    group: "Settings",
    purpose: "Manage workspace membership and V0 roles without bypassing approval, consent, credit or publication gates.",
    contract: "Workspace membership and permission model from V0-F1 and V0_PERMISSIONS.md.",
    evidence: ["Owner", "Admin", "Client Manager", "Reviewer", "Audit event"],
  },
  {
    key: "settings/credentials",
    title: "Provider credentials",
    route: "/settings/credentials",
    group: "Settings",
    purpose: "Store credential metadata and rotation evidence without exposing secrets to the browser.",
    contract: "POST /workspaces/{workspace_id}/service-credentials and rotate credential APIs.",
    evidence: ["Credential metadata", "Capability state", "Rotation audit", "Redaction proof", "No secret exposure"],
  },
];

export const STATUS_PRESENTATION = {
  draft: { label: "Draft", tone: "neutral" },
  queued: { label: "Queued", tone: "queued" },
  running: { label: "Running", tone: "running" },
  unknown: { label: "Unknown — checking", tone: "unknown" },
  blocked: { label: "Blocked", tone: "blocked" },
  failed: { label: "Failed", tone: "error" },
  approved: { label: "Approved", tone: "success" },
  accepted: {
    label: "Accepted",
    tone: "queued",
    note: "Provider acknowledgement is not final success.",
  },
  published_unverified: { label: "Published — checking", tone: "running" },
  published_verified: { label: "Published and verified", tone: "success" },
} as const;

export const DEFAULT_WORKFLOW_SNAPSHOT: WorkflowGateSnapshot = {
  workspaceName: "Aura Luxury Estates",
  role: "CLIENT_MANAGER",
  currentStepKey: "brand-intake",
  completedStepKeys: [],
  blockedStepKeys: [],
  failedStepKeys: [],
  unknownStepKeys: [],
  statusTruth: {
    brandProfile: "draft",
    generationProvider: "draft",
    reviewItem: "internal_review",
    calendarPost: "draft",
  },
};

const routeAliases: Record<string, WorkflowStepKey> = Object.fromEntries(
  WORKFLOW_STEPS.flatMap((step) => [
    [step.route.replace(/^\//, ""), step.key],
    [step.key, step.key],
  ]),
) as Record<string, WorkflowStepKey>;

export function getStepByKey(key: WorkflowStepKey): WorkflowStep {
  return WORKFLOW_STEPS.find((step) => step.key === key) ?? WORKFLOW_STEPS[0];
}

export function getStepAccess(step: WorkflowStep, snapshot: WorkflowGateSnapshot): StepAccess {
  if (snapshot.failedStepKeys.includes(step.key)) return "failed";
  if (snapshot.unknownStepKeys.includes(step.key)) return "unknown";
  if (snapshot.blockedStepKeys.includes(step.key)) return "blocked";
  if (snapshot.completedStepKeys.includes(step.key)) return "read_only";
  if (step.key === snapshot.currentStepKey) return "current";
  return "locked";
}

export function getCurrentStep(snapshot: WorkflowGateSnapshot = DEFAULT_WORKFLOW_SNAPSHOT): WorkflowStep {
  return getStepByKey(snapshot.currentStepKey);
}

export function resolveWorkspaceRoute(segments: string[] | undefined): WorkflowStep {
  if (!segments || segments.length === 0) {
    return getCurrentStep();
  }

  const routeKey = segments.join("/");
  const exact = routeAliases[routeKey];
  if (exact) return getStepByKey(exact);

  const twoSegmentKey = routeAliases[segments.slice(0, 2).join("/")];
  if (twoSegmentKey) return getStepByKey(twoSegmentKey);

  return getCurrentStep();
}

export function resolveWorkspaceSurface(segments: string[] | undefined): WorkspaceSurface | undefined {
  if (!segments || segments.length === 0) return undefined;
  const routeKey = segments.join("/");
  return WORKSPACE_SURFACES.find((surface) => surface.route.replace(/^\//, "") === routeKey);
}

export function getStepHref(workspaceSlug: string, step: WorkflowStep): string {
  return `/w/${workspaceSlug}${step.route}`;
}
