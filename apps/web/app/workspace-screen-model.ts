export type ScreenSpec = {
  title: string;
  routePattern: string;
  status: "Ready" | "Blocked" | "Unknown - checking" | "Published - checking" | "Published and verified";
  purpose: string;
  primaryAction: string;
  secondaryActions: string[];
  dataShown: string[];
  states: string[];
  components: string[];
  permission: string;
  nextAction?: string;
};

const foundationScreens: ScreenSpec[] = [
  {
    title: "Workspace home",
    routePattern: "",
    status: "Unknown - checking",
    purpose: "Show the active workspace, recent jobs, next action and blockers.",
    primaryAction: "Continue production",
    secondaryActions: ["Open activity", "Review notifications", "Inspect lineage"],
    dataShown: ["workspace role", "capability state", "recent jobs", "credit state"],
    states: ["loading", "no brand", "next-action", "degraded capability"],
    components: ["workspace switcher", "next-action summary", "activity rail", "credit wallet"],
    permission: "All workspace members",
    nextAction: "Create or approve the brand profile when no approved brand exists.",
  },
  {
    title: "Activity",
    routePattern: "activity",
    status: "Unknown - checking",
    purpose: "Expose user-visible jobs and production events.",
    primaryAction: "Open selected job",
    secondaryActions: ["Filter by state", "Open linked artifact", "Review recovery path"],
    dataShown: ["job state", "attempts", "linked artifact", "last update"],
    states: ["empty", "queued", "running", "retrying", "unknown", "failed", "done"],
    components: ["async job card", "status timeline", "recovery banner"],
    permission: "All workspace members",
  },
  {
    title: "Notifications",
    routePattern: "notifications",
    status: "Ready",
    purpose: "Show actionable notifications with durable deep links.",
    primaryAction: "Open notification target",
    secondaryActions: ["Mark read", "Filter unread"],
    dataShown: ["notification type", "object identity", "state", "created time"],
    states: ["empty", "loading", "malformed deep link"],
    components: ["notification list", "status chip", "deep-link guard"],
    permission: "All workspace members",
  },
];

const brandScreens: ScreenSpec[] = [
  {
    title: "Brand list",
    routePattern: "brands",
    status: "Blocked",
    purpose: "List brands and show whether an approved source of truth exists.",
    primaryAction: "Add brand",
    secondaryActions: ["Open active profile", "View archived brands"],
    dataShown: ["brand name", "active profile version", "approval state", "last crawl"],
    states: ["empty", "loading", "archived filter", "no approved profile"],
    components: ["brand table", "profile status chip", "empty state"],
    permission: "Owner, Admin, Client Manager",
    nextAction: "Open /brands/new to submit permitted source material.",
  },
  {
    title: "Brand intake",
    routePattern: "brands/new",
    status: "Ready",
    purpose: "Collect permitted URL or upload material for brand extraction.",
    primaryAction: "Start intake",
    secondaryActions: ["Save draft", "Cancel"],
    dataShown: ["source URL", "file scan state", "rights acknowledgement"],
    states: ["URL invalid", "rights missing", "upload scanning", "partial uploads", "success run"],
    components: ["intake form", "upload dropzone", "rights checklist"],
    permission: "Owner, Admin, Client Manager",
  },
  {
    title: "Brand detail",
    routePattern: "brands/{brandId}",
    status: "Ready",
    purpose: "Show the active profile, assets, rules and source evidence.",
    primaryAction: "Open active profile",
    secondaryActions: ["View assets", "View rules", "Open crawl runs"],
    dataShown: ["approved profile", "source evidence", "locked rules", "asset health"],
    states: ["no approved profile", "approved", "superseded"],
    components: ["profile summary", "evidence drawer", "rule list", "asset strip"],
    permission: "Relevant production roles",
  },
  {
    title: "Brand review",
    routePattern: "brands/{brandId}/profiles/{profileId}/review",
    status: "Blocked",
    purpose: "Compare candidates and approve one exact brand profile version.",
    primaryAction: "Approve this profile",
    secondaryActions: ["Edit candidate", "Reject candidate", "Open source evidence"],
    dataShown: ["candidate fields", "source references", "confidence", "changed fields"],
    states: ["low confidence", "source conflict", "missing required field", "stale version"],
    components: ["candidate diff", "approval dialog", "evidence popover"],
    permission: "Owner, Admin, Client Manager",
  },
];

const blueprintScreens: ScreenSpec[] = [
  {
    title: "Blueprint library",
    routePattern: "blueprints",
    status: "Ready",
    purpose: "Show approved reusable blueprints for the selected brand.",
    primaryAction: "Create blueprint",
    secondaryActions: ["Open blueprint", "Filter archived", "Start discovery"],
    dataShown: ["blueprint id", "brand fit", "formula state", "last used"],
    states: ["empty", "loading", "incompatible", "archived"],
    components: ["blueprint cards", "formula chips", "archive filter"],
    permission: "Owner, Admin, Client Manager",
  },
  {
    title: "Viral candidate search",
    routePattern: "discover",
    status: "Unknown - checking",
    purpose: "Search observed real-estate candidates and preserve source identity.",
    primaryAction: "Search candidates",
    secondaryActions: ["Filter platform", "Open candidate", "Inspect rights warning"],
    dataShown: ["thumbnail", "source identity", "platform metrics", "snapshot date", "rights warning"],
    states: ["empty before search", "searching", "no results", "provider delayed", "provider failed"],
    components: ["candidate cards", "metrics strip", "rights warning", "snapshot badge"],
    permission: "Owner, Admin, Client Manager",
  },
  {
    title: "Candidate detail",
    routePattern: "discover/{candidateId}",
    status: "Ready",
    purpose: "Inspect metrics, media, rights and source before immutable selection.",
    primaryAction: "Extract blueprint",
    secondaryActions: ["Open source", "Compare candidates", "Return to search"],
    dataShown: ["media preview", "metric snapshot", "rights warning", "source identity"],
    states: ["stale metrics", "missing rights", "provider payload partial"],
    components: ["9:16 preview", "metric table", "rights panel", "selection dialog"],
    permission: "Owner, Admin, Client Manager",
  },
  {
    title: "Blueprint detail",
    routePattern: "blueprints/{blueprintId}",
    status: "Ready",
    purpose: "Show immutable formula, scene blueprint and director prompt.",
    primaryAction: "Use for scripts",
    secondaryActions: ["Open stages", "Inspect prompt", "View lineage"],
    dataShown: ["scene timing", "formula slots", "director prompt", "source candidate"],
    states: ["pending", "ready", "blocked", "failed", "archived"],
    components: ["cinematic timeline", "formula panel", "director prompt", "lineage rail"],
    permission: "Production roles",
  },
];

const productionScreens: ScreenSpec[] = [
  {
    title: "Tournament list",
    routePattern: "scripts",
    status: "Ready",
    purpose: "List script tournaments and their generation or evaluation state.",
    primaryAction: "Generate scripts",
    secondaryActions: ["Open tournament", "Filter by status", "Open selected script"],
    dataShown: ["tournament id", "blueprint", "variant count", "selection state"],
    states: ["empty", "loading", "status filters", "generating", "evaluating", "failed"],
    components: ["tournament table", "status chip", "variant summary"],
    permission: "Owner, Admin, Client Manager",
  },
  {
    title: "Script comparison",
    routePattern: "scripts/{tournamentId}/compare",
    status: "Blocked",
    purpose: "Compare evaluated script variants and select one immutable script.",
    primaryAction: "Select script",
    secondaryActions: ["Open evaluation", "Return to tournament", "View brand rules"],
    dataShown: ["variant text", "eligibility", "evaluation", "brand-rule flags"],
    states: ["no valid variants", "stale selection", "already selected"],
    components: ["comparison table", "eligibility badge", "selection dialog"],
    permission: "Owner, Admin, Client Manager",
  },
  {
    title: "Generation detail",
    routePattern: "generations/{generationId}",
    status: "Unknown - checking",
    purpose: "Show provider generation state and reconciliation path.",
    primaryAction: "Open generated media",
    secondaryActions: ["Review provider operation", "Open ledger", "Cancel where safe"],
    dataShown: ["provider operation", "operation state", "idempotency key", "credit hold"],
    states: ["queued", "submitting", "accepted", "unknown-checking", "generating", "generated", "failed"],
    components: ["job card", "provider operation panel", "cost ledger", "recovery banner"],
    permission: "Owner, Admin, Client Manager",
  },
  {
    title: "Review item",
    routePattern: "reviews/{reviewItemId}",
    status: "Blocked",
    purpose: "Review the exact final-video version before approval.",
    primaryAction: "Approve this version",
    secondaryActions: ["Request changes", "Add comment", "Open lineage"],
    dataShown: ["final-video version", "media hash", "comments", "approval decision"],
    states: ["media processing", "comment failure", "stale", "superseded", "approved", "rejected"],
    components: ["9:16 player", "comment thread", "decision dialog", "evidence inspector"],
    permission: "Review participants; decision roles restricted",
  },
  {
    title: "Post detail",
    routePattern: "posts/{calendarPostId}",
    status: "Published - checking",
    purpose: "Track scheduled, submitted and audience-verified publication state.",
    primaryAction: "Check live post",
    secondaryActions: ["Edit pre-submit post", "Provide manual URL", "Open evidence"],
    dataShown: ["platform account", "caption version", "media identity", "verification checklist"],
    states: ["scheduled", "submitting", "accepted", "unverified", "retrying", "mismatch", "verified", "unknown"],
    components: ["publication timeline", "Audience verification panel", "provider operation card"],
    permission: "Publishing roles",
    nextAction: "Completion notification only after audience verification.",
  },
  {
    title: "Lineage",
    routePattern: "lineage/{finalVideoId}",
    status: "Ready",
    purpose: "Inspect full ancestry, cost, approval and retained evidence.",
    primaryAction: "Export manifest",
    secondaryActions: ["Open upstream artifact", "Open ledger", "Open publication"],
    dataShown: ["brand profile", "blueprint", "script", "avatar", "provider operation", "review", "post"],
    states: ["loading", "lineage-ready", "incomplete", "blocked hash mismatch", "lineage-invalid", "unknown"],
    components: ["lineage graph", "evidence cards", "ledger table", "hash panel"],
    permission: "Authorised production roles; not Reviewer",
  },
];

const commerceScreens: ScreenSpec[] = [
  {
    title: "Credits",
    routePattern: "credits",
    status: "Ready",
    purpose: "Show wallet, purchases and append-only creator credit ledger.",
    primaryAction: "Purchase credits",
    secondaryActions: ["Open ledger entry", "Inspect reconciliation"],
    dataShown: ["wallet balance", "reserved credits", "captured credits", "ledger entries"],
    states: ["loading", "zero balance", "pending purchase", "reconciliation mismatch"],
    components: ["wallet card", "ledger table", "Maximum authorisation panel"],
    permission: "Owner, Admin, Client Manager",
  },
  {
    title: "New generation",
    routePattern: "generate/new",
    status: "Blocked",
    purpose: "Confirm selected script, avatar and estimate before reserving credits.",
    primaryAction: "Reserve credits and generate",
    secondaryActions: ["Refresh estimate", "Change avatar", "Cancel"],
    dataShown: ["selected script", "avatar consent", "estimate", "maximum authorisation", "price version"],
    states: ["estimating", "stale estimate", "insufficient credit", "price changed"],
    components: ["cost panel", "avatar card", "script summary", "confirmation dialog"],
    permission: "Owner, Admin, Client Manager",
  },
];

const otherScreens: ScreenSpec[] = [
  {
    title: "Review queue",
    routePattern: "reviews",
    status: "Ready",
    purpose: "List assigned and recent review items.",
    primaryAction: "Open review item",
    secondaryActions: ["Filter assigned", "Open media"],
    dataShown: ["review state", "final-video version", "assignee", "due date"],
    states: ["empty", "loading", "role-filtered"],
    components: ["review list", "media thumbnail", "status chip"],
    permission: "Review participants",
  },
  {
    title: "Calendar",
    routePattern: "calendar",
    status: "Ready",
    purpose: "Show scheduled posts and publication conflicts.",
    primaryAction: "Schedule media",
    secondaryActions: ["Open post", "Filter platform", "View timezone"],
    dataShown: ["scheduled time", "platform", "approval state", "conflicts"],
    states: ["empty", "timezone display", "conflict", "loading"],
    components: ["calendar grid", "schedule list", "conflict banner"],
    permission: "Publishing roles; Reviewer read if assigned",
  },
  {
    title: "Settings",
    routePattern: "settings",
    status: "Ready",
    purpose: "Manage workspace settings, members, integrations and data controls.",
    primaryAction: "Open settings section",
    secondaryActions: ["Invite member", "Open integrations", "Export data"],
    dataShown: ["workspace metadata", "role", "integration state", "data actions"],
    states: ["loading", "forbidden", "rotation failed", "export calculating"],
    components: ["settings nav", "member table", "integration metadata", "export panel"],
    permission: "Owner, Admin",
  },
  {
    title: "Existence-hiding not-found",
    routePattern: "*",
    status: "Blocked",
    purpose: "Hide whether missing or cross-workspace resources exist.",
    primaryAction: "Return to workspace home",
    secondaryActions: ["Open activity", "Contact support with reference"],
    dataShown: ["safe reference", "workspace context"],
    states: ["malformed", "unauthorised", "not found", "stale membership"],
    components: ["not-found surface", "safe support reference"],
    permission: "Authorised workspace members only",
  },
];

export const screenSpecs = [
  ...foundationScreens,
  ...brandScreens,
  ...blueprintScreens,
  ...productionScreens,
  ...commerceScreens,
  ...otherScreens,
];

export const primaryNav = [
  ["Home", ""],
  ["Brands", "brands"],
  ["Blueprints", "blueprints"],
  ["Scripts", "scripts"],
  ["Generate", "generate/new"],
  ["Review", "reviews"],
  ["Calendar", "calendar"],
  ["Activity", "activity"],
] as const;

export function resolveScreen(segments: string[] = []): ScreenSpec {
  const path = segments.join("/");

  if (path === "") return screenSpecs[0];
  if (path === "brands/new") return byPattern("brands/new");
  if (path === "discover") return byPattern("discover");
  if (path === "generate/new") return byPattern("generate/new");
  if (path === "activity") return byPattern("activity");
  if (path === "notifications") return byPattern("notifications");
  if (path === "brands") return byPattern("brands");
  if (path === "blueprints") return byPattern("blueprints");
  if (path === "scripts") return byPattern("scripts");
  if (path === "credits") return byPattern("credits");
  if (path === "reviews") return byPattern("reviews");
  if (path === "calendar") return byPattern("calendar");
  if (path === "settings" || path.startsWith("settings/")) return byPattern("settings");
  if (path.startsWith("operations/")) return byPattern("settings");

  const [resource, , nested, nestedId, leaf] = segments;
  if (resource === "brands" && nested === "profiles" && leaf === "review") {
    return byPattern("brands/{brandId}/profiles/{profileId}/review");
  }
  if (resource === "brands") return byPattern("brands/{brandId}");
  if (resource === "discover") return byPattern("discover/{candidateId}");
  if (resource === "blueprints") return byPattern("blueprints/{blueprintId}");
  if (resource === "scripts" && nested === "compare") return byPattern("scripts/{tournamentId}/compare");
  if (resource === "scripts") return byPattern("scripts");
  if (resource === "generations") return byPattern("generations/{generationId}");
  if (resource === "reviews") return byPattern("reviews/{reviewItemId}");
  if (resource === "posts") return byPattern("posts/{calendarPostId}");
  if (resource === "lineage") return byPattern("lineage/{finalVideoId}");

  void nestedId;
  return byPattern("*");
}

function byPattern(patternOrTitle: string): ScreenSpec {
  return (
    screenSpecs.find((screen) => screen.routePattern === patternOrTitle || screen.title === patternOrTitle) ??
    otherScreens[otherScreens.length - 1]
  );
}
