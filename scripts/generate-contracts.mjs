import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname } from "node:path";

const sourcePath = "packages/contracts/src/openapi.v0.json";
const generatedOpenApiPath = "packages/contracts/generated/openapi.v0.json";
const generatedClientPath = "packages/contracts/generated/v0-client.mjs";

const openapiText = await readFile(sourcePath, "utf8");
JSON.parse(openapiText);

await mkdir(dirname(generatedOpenApiPath), { recursive: true });
await writeFile(generatedOpenApiPath, `${openapiText.trim()}\n`);
await writeFile(
  generatedClientPath,
  `// GENERATED from ${sourcePath} by scripts/generate-contracts.mjs.
// Do not edit by hand.

export class V0Client {
  constructor({ baseUrl = "http://localhost:3001/api/v0", fetchImpl = globalThis.fetch, authToken = null, internalWorkerToken = null } = {}) {
    this.baseUrl = baseUrl.replace(/\\/$/, "");
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
    return this.#get(\`/workspaces/\${encodeURIComponent(workspaceId)}\`);
  }

  async initiateBrandAssetUpload(input, options = {}) {
    return this.#post("/brands/assets/uploads", input, options);
  }

  async completeBrandAssetUpload(artifactId, input) {
    return this.#post(\`/brands/assets/uploads/\${encodeURIComponent(artifactId)}/complete\`, input);
  }

  async createArtifactDownload(artifactId, input) {
    return this.#post(\`/artifacts/\${encodeURIComponent(artifactId)}/downloads\`, input);
  }

  async startSimulatedMediaProcessing(input, options = {}) {
    return this.#post("/jobs/simulated-media-processing", input, options);
  }

  async getJob(jobId) {
    return this.#get(\`/jobs/\${encodeURIComponent(jobId)}\`);
  }

  async listJobEvents(jobId) {
    return this.#get(\`/jobs/\${encodeURIComponent(jobId)}/events\`);
  }

  async listDeadLetterJobs(workspaceId) {
    return this.#post("/jobs/dead-letter", { workspaceId });
  }

  async claimJob(jobId, input) {
    return this.#post(\`/internal/jobs/\${encodeURIComponent(jobId)}/claim\`, input);
  }

  async heartbeatJob(jobId, input) {
    return this.#post(\`/internal/jobs/\${encodeURIComponent(jobId)}/heartbeat\`, input);
  }

  async completeJob(jobId, input) {
    return this.#post(\`/internal/jobs/\${encodeURIComponent(jobId)}/complete\`, input);
  }

  async failJob(jobId, input) {
    return this.#post(\`/internal/jobs/\${encodeURIComponent(jobId)}/fail\`, input);
  }

  async expireJobLeases(input) {
    return this.#post("/internal/jobs/leases/expire", input);
  }

  async relayOutbox(input) {
    return this.#post("/internal/outbox/relay", input);
  }

  async #get(path) {
    const response = await this.fetchImpl(\`\${this.baseUrl}\${path}\`, {
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
    const response = await this.fetchImpl(\`\${this.baseUrl}\${path}\`, {
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
      headers.authorization = \`Bearer \${this.authToken}\`;
    }
    if (this.internalWorkerToken) {
      headers["x-v0-worker-token"] = this.internalWorkerToken;
    }
    return headers;
  }
}
`
);

console.log("Generated V0 OpenAPI document and TypeScript-compatible client.");
