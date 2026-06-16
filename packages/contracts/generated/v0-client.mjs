// GENERATED from packages/contracts/src/openapi.v0.json by scripts/generate-contracts.mjs.
// Do not edit by hand.

export class V0Client {
  constructor({ baseUrl = "http://localhost:3001/api/v0", fetchImpl = globalThis.fetch } = {}) {
    this.baseUrl = baseUrl.replace(/\/$/, "");
    this.fetchImpl = fetchImpl;
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

  async #get(path) {
    const response = await this.fetchImpl(`${this.baseUrl}${path}`, {
      method: "GET",
      headers: {
        accept: "application/json"
      }
    });
    const body = await response.json();
    return {
      ok: response.ok,
      status: response.status,
      body
    };
  }
}
