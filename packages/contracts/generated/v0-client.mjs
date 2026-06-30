// GENERATED from packages/contracts/src/openapi.v0.json by scripts/generate-contracts.mjs.
// Do not edit by hand.

export class V0Client {
  constructor({ baseUrl = "http://localhost:3001/api/v0", fetchImpl = globalThis.fetch, authToken = null, internalWorkerToken = null } = {}) {
    this.baseUrl = baseUrl.replace(/\/$/, "");
    this.fetchImpl = fetchImpl;
    this.authToken = authToken;
    this.internalWorkerToken = internalWorkerToken;
  }

  async getHealth() {
    return this.#get("/health");
  }

  async getReadiness() {
    return this.#get("/ready");
  }

  async getVersion() {
    return this.#get("/version");
  }

  async createWorkspace(input, options = {}) {
    return this.#post("/workspaces", input, options);
  }

  async listWorkspaces() {
    return this.#get("/workspaces");
  }

  async getWorkspace(workspaceId) {
    return this.#get(`/workspaces/${encodeURIComponent(workspaceId)}`);
  }

  async setWorkspaceCapability(workspaceId, input) {
    return this.#post(`/workspaces/${encodeURIComponent(workspaceId)}/capabilities`, input);
  }

  async initiateBrandAssetUpload(input, options = {}) {
    return this.#post("/brands/assets/uploads", input, options);
  }

  async completeBrandAssetUpload(artifactId, input) {
    return this.#post(`/brands/assets/uploads/${encodeURIComponent(artifactId)}/complete`, input);
  }

  async createBrandCrawlRun(input, options = {}) {
    return this.#post("/brands/crawl-runs", input, options);
  }

  async listBrandCandidates(crawlRunId) {
    return this.#get(`/brands/crawl-runs/${encodeURIComponent(crawlRunId)}/candidates`);
  }

  async approveBrandProfile(brandId, input) {
    return this.#post(`/brands/${encodeURIComponent(brandId)}/approvals`, input);
  }

  async createGenerationEstimate(input) {
    return this.#post("/generation-estimates", input);
  }

  async confirmGenerationEstimate(estimateId, input, options = {}) {
    return this.#post("/generation-estimates/" + encodeURIComponent(estimateId) + "/confirm", input, options);
  }

  async getGenerationJob(jobId, input) {
    const params = new URLSearchParams();
    params.set("workspaceId", input.workspaceId);
    return this.#get("/generation-jobs/" + encodeURIComponent(jobId) + "?" + params.toString());
  }

  async submitGenerationJob(jobId, input, options = {}) {
    return this.#post("/generation-jobs/" + encodeURIComponent(jobId) + "/submit", input, options);
  }

  async reconcileGenerationJob(jobId, input, options = {}) {
    return this.#post("/generation-jobs/" + encodeURIComponent(jobId) + "/reconcile", input, options);
  }

  async cancelGenerationJob(jobId, input, options = {}) {
    return this.#post("/generation-jobs/" + encodeURIComponent(jobId) + "/cancel", input, options);
  }

  async settleGenerationJob(jobId, input, options = {}) {
    return this.#post("/generation-jobs/" + encodeURIComponent(jobId) + "/settle", input, options);
  }

  async createCompositionPlan(input, options = {}) {
    return this.#post("/composition-plans", input, options);
  }

  async renderCompositionPlan(compositionPlanId, input, options = {}) {
    return this.#post("/composition-plans/" + encodeURIComponent(compositionPlanId) + "/render", input, options);
  }

  async createReviewItem(input, options = {}) {
    return this.#post("/review-items", input, options);
  }

  async listReviewItems(input) {
    const params = new URLSearchParams();
    params.set("workspaceId", input.workspaceId);
    if (input.limit !== undefined) params.set("limit", String(input.limit));
    if (input.cursor) params.set("cursor", input.cursor);
    return this.#get(`/review-items?${params.toString()}`);
  }

  async getReviewItem(reviewItemId, input) {
    const params = new URLSearchParams();
    params.set("workspaceId", input.workspaceId);
    return this.#get(`/review-items/${encodeURIComponent(reviewItemId)}?${params.toString()}`);
  }

  async addReviewComment(reviewItemId, input, options = {}) {
    return this.#post(`/review-items/${encodeURIComponent(reviewItemId)}/comments`, input, options);
  }

  async listReviewComments(reviewItemId, input) {
    const params = new URLSearchParams();
    params.set("workspaceId", input.workspaceId);
    if (input.limit !== undefined) params.set("limit", String(input.limit));
    if (input.cursor) params.set("cursor", input.cursor);
    return this.#get(`/review-items/${encodeURIComponent(reviewItemId)}/comments?${params.toString()}`);
  }

  async recordReviewDecision(reviewItemId, input, options = {}) {
    return this.#post(`/review-items/${encodeURIComponent(reviewItemId)}/decisions`, input, options);
  }

  async createCalendarPost(input, options = {}) {
    return this.#post("/calendar-posts", input, options);
  }

  async publishCalendarPost(calendarPostId, input, options = {}) {
    return this.#post("/calendar-posts/" + encodeURIComponent(calendarPostId) + "/publish", input, options);
  }

  async reconcilePublishOperation(calendarPostId, input, options = {}) {
    return this.#post("/calendar-posts/" + encodeURIComponent(calendarPostId) + "/publish/reconcile", input, options);
  }

  async verifyCalendarPost(calendarPostId, input, options = {}) {
    return this.#post("/calendar-posts/" + encodeURIComponent(calendarPostId) + "/verify", input, options);
  }

  async getLineage(finalVideoId, input) {
    const params = new URLSearchParams();
    params.set("workspaceId", input.workspaceId);
    return this.#get("/lineage/" + encodeURIComponent(finalVideoId) + "?" + params.toString());
  }

  async collectPerformance(calendarPostId, input, options = {}) {
    return this.#post("/calendar-posts/" + encodeURIComponent(calendarPostId) + "/performance-collect", input, options);
  }

  async getPerformance(calendarPostId, input) {
    const params = new URLSearchParams();
    params.set("workspaceId", input.workspaceId);
    return this.#get("/calendar-posts/" + encodeURIComponent(calendarPostId) + "/performance?" + params.toString());
  }

  async updateCalendarPost(calendarPostId, input, options = {}) {
    return this.#patch("/calendar-posts/" + encodeURIComponent(calendarPostId), input, options);
  }

  async listBlueprints(input) {
    const params = new URLSearchParams();
    params.set("workspaceId", input.workspaceId);
    params.set("brandProfileId", input.brandProfileId);
    if (input.limit !== undefined) params.set("limit", String(input.limit));
    if (input.cursor) params.set("cursor", input.cursor);
    return this.#get(`/blueprints?${params.toString()}`);
  }

  async listAvatars(input) {
    const params = new URLSearchParams();
    params.set("workspaceId", input.workspaceId);
    params.set("brandProfileId", input.brandProfileId);
    if (input.limit !== undefined) params.set("limit", String(input.limit));
    if (input.cursor) params.set("cursor", input.cursor);
    return this.#get(`/avatars?${params.toString()}`);
  }

  async revokeAvatarConsent(avatarProfileId, input) {
    return this.#post(`/avatars/${encodeURIComponent(avatarProfileId)}/consent-revocation`, input);
  }

  async createCreditPurchase(input, options = {}) {
    return this.#post("/credit-purchases", input, options);
  }

  async getWalletLedger(walletId, input) {
    const params = new URLSearchParams();
    params.set("workspaceId", input.workspaceId);
    if (input.limit !== undefined) params.set("limit", String(input.limit));
    if (input.cursor) params.set("cursor", input.cursor);
    return this.#get(`/credit-wallets/${encodeURIComponent(walletId)}/ledger?${params.toString()}`);
  }

  async createCreditAdjustment(walletId, input, options = {}) {
    return this.#post(`/credit-wallets/${encodeURIComponent(walletId)}/adjustments`, input, options);
  }

  async postRazorpayCallback(envelope, signature) {
    return this.#postSigned("/callbacks/razorpay", envelope, "x-razorpay-signature", signature);
  }

  async postStripeCallback(envelope, signature) {
    return this.#postSigned("/callbacks/stripe", envelope, "stripe-signature", signature);
  }

  async postHeygenCallback(envelope, signature) {
    return this.#postSigned("/callbacks/heygen", envelope, "x-heygen-signature", signature);
  }

  async postPublishingCallback(provider, envelope, signature) {
    // The signature header is provider-selected (Meta: x-meta-signature, YouTube:
    // x-youtube-signature) to match the server-side publish adapter registry.
    const signatureHeader = provider === "youtube" ? "x-youtube-signature" : "x-meta-signature";
    return this.#postSigned("/callbacks/publishing/" + encodeURIComponent(provider), envelope, signatureHeader, signature);
  }

  async seedBlueprintLibraryEntry(input) {
    return this.#post("/blueprints/library-entries", input);
  }

  async createBlueprintRequest(input) {
    return this.#post("/blueprint-requests", input);
  }

  async createReadyBlueprint(blueprintRequestId, input) {
    return this.#post(`/blueprint-requests/${encodeURIComponent(blueprintRequestId)}/ready-blueprint`, input);
  }

  async createScriptTournament(input, options = {}) {
    return this.#post("/script-tournaments", input, options);
  }

  async selectScriptVariant(tournamentId, input, options = {}) {
    return this.#post(`/script-tournaments/${encodeURIComponent(tournamentId)}/select`, input, options);
  }

  async searchViralCandidates(input) {
    return this.#post("/viral-candidates/search", input);
  }

  async extractViralCandidateBlueprint(candidateId, input) {
    return this.#post(`/viral-candidates/${encodeURIComponent(candidateId)}/extract-blueprint`, input);
  }

  async createSceneBlueprint(candidateId, input) {
    return this.#post(`/viral-candidates/${encodeURIComponent(candidateId)}/scene-blueprint`, input);
  }

  async createArtifactDownload(artifactId, input) {
    return this.#post(`/artifacts/${encodeURIComponent(artifactId)}/downloads`, input);
  }

  async startSimulatedMediaProcessing(input, options = {}) {
    return this.#post("/jobs/simulated-media-processing", input, options);
  }

  async getJob(jobId) {
    return this.#get(`/jobs/${encodeURIComponent(jobId)}`);
  }

  async listJobEvents(jobId) {
    return this.#get(`/jobs/${encodeURIComponent(jobId)}/events`);
  }

  async getJobTrace(jobId) {
    return this.#get(`/jobs/${encodeURIComponent(jobId)}/trace`);
  }

  async recoverJob(jobId, input) {
    return this.#post(`/jobs/${encodeURIComponent(jobId)}/recover`, input);
  }

  async getWorkspaceOperationalMetrics(workspaceId) {
    return this.#get(`/workspaces/${encodeURIComponent(workspaceId)}/operations/metrics`);
  }

  async createServiceCredential(workspaceId, input) {
    return this.#post(`/workspaces/${encodeURIComponent(workspaceId)}/service-credentials`, input);
  }

  async rotateServiceCredential(workspaceId, credentialId, input) {
    return this.#post(
      `/workspaces/${encodeURIComponent(workspaceId)}/service-credentials/${encodeURIComponent(credentialId)}/rotate`,
      input
    );
  }

  async setSimulatorMode(workspaceId, input) {
    return this.#post(`/workspaces/${encodeURIComponent(workspaceId)}/simulator-mode`, input);
  }

  async recordRestoreDrill(workspaceId, input) {
    return this.#post(`/workspaces/${encodeURIComponent(workspaceId)}/restore-drills`, input);
  }

  async runRedactionScan(workspaceId, input) {
    return this.#post(`/workspaces/${encodeURIComponent(workspaceId)}/redaction-scan`, input);
  }

  async runB2Benchmark(workspaceId, input) {
    return this.#post(`/workspaces/${encodeURIComponent(workspaceId)}/b2-benchmark`, input);
  }

  async runBacklogSimulation(workspaceId, input) {
    return this.#post(`/workspaces/${encodeURIComponent(workspaceId)}/backlog-simulation`, input);
  }

  async runIncidentRehearsal(workspaceId, input) {
    return this.#post(`/workspaces/${encodeURIComponent(workspaceId)}/incident-rehearsal`, input);
  }

  async getWorkspaceOperationalAlerts(workspaceId) {
    return this.#get(`/workspaces/${encodeURIComponent(workspaceId)}/operations/alerts`);
  }

  async listDeadLetterJobs(workspaceId) {
    return this.#post("/jobs/dead-letter", { workspaceId });
  }

  async claimJob(jobId, input) {
    return this.#post(`/internal/jobs/${encodeURIComponent(jobId)}/claim`, input);
  }

  async heartbeatJob(jobId, input) {
    return this.#post(`/internal/jobs/${encodeURIComponent(jobId)}/heartbeat`, input);
  }

  async completeJob(jobId, input) {
    return this.#post(`/internal/jobs/${encodeURIComponent(jobId)}/complete`, input);
  }

  async failJob(jobId, input) {
    return this.#post(`/internal/jobs/${encodeURIComponent(jobId)}/fail`, input);
  }

  async expireJobLeases(input) {
    return this.#post("/internal/jobs/leases/expire", input);
  }

  async relayOutbox(input) {
    return this.#post("/internal/outbox/relay", input);
  }

  async #get(path) {
    const response = await this.fetchImpl(`${this.baseUrl}${path}`, {
      method: "GET",
      headers: this.#headers()
    });
    const body = await response.json();
    return {
      ok: response.ok,
      status: response.status,
      body
    };
  }

  async #post(path, input, options = {}) {
    const response = await this.fetchImpl(`${this.baseUrl}${path}`, {
      method: "POST",
      headers: this.#headers({
        "content-type": "application/json",
        ...(options.idempotencyKey ? { "idempotency-key": options.idempotencyKey } : {})
      }),
      body: JSON.stringify(input)
    });
    const body = await response.json();
    return {
      ok: response.ok,
      status: response.status,
      body
    };
  }

  async #patch(path, input, options = {}) {
    const response = await this.fetchImpl(`${this.baseUrl}${path}`, {
      method: "PATCH",
      headers: this.#headers({
        "content-type": "application/json",
        ...(options.idempotencyKey ? { "idempotency-key": options.idempotencyKey } : {})
      }),
      body: JSON.stringify(input)
    });
    const body = await response.json();
    return {
      ok: response.ok,
      status: response.status,
      body
    };
  }

  async #postSigned(path, input, signatureHeader, signature) {
    const response = await this.fetchImpl(`${this.baseUrl}${path}`, {
      method: "POST",
      headers: this.#headers({
        "content-type": "application/json",
        ...(signature ? { [signatureHeader]: signature } : {})
      }),
      body: JSON.stringify(input)
    });
    const body = await response.json();
    return {
      ok: response.ok,
      status: response.status,
      body
    };
  }

  #headers(extra = {}) {
    const headers = {
      accept: "application/json",
      ...extra
    };
    if (this.authToken) {
      headers.authorization = `Bearer ${this.authToken}`;
    }
    if (this.internalWorkerToken) {
      headers["x-v0-worker-token"] = this.internalWorkerToken;
    }
    return headers;
  }
}
