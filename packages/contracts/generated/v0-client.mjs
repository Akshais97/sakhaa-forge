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

  async listBlueprints(input) {
    const params = new URLSearchParams();
    params.set("workspaceId", input.workspaceId);
    params.set("brandProfileId", input.brandProfileId);
    if (input.limit !== undefined) params.set("limit", String(input.limit));
    if (input.cursor) params.set("cursor", input.cursor);
    return this.#get(`/blueprints?${params.toString()}`);
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

  async setSimulatorMode(workspaceId, input) {
    return this.#post(`/workspaces/${encodeURIComponent(workspaceId)}/simulator-mode`, input);
  }

  async recordRestoreDrill(workspaceId, input) {
    return this.#post(`/workspaces/${encodeURIComponent(workspaceId)}/restore-drills`, input);
  }

  async runRedactionScan(workspaceId, input) {
    return this.#post(`/workspaces/${encodeURIComponent(workspaceId)}/redaction-scan`, input);
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
