import http from "node:http";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { getBuildInfo } from "./build-info.mjs";
import { getHealth, getReadiness } from "./readiness.mjs";

const currentDir = dirname(fileURLToPath(import.meta.url));
const openApiPath = resolve(currentDir, "../../../packages/contracts/generated/openapi.v0.json");

export function createApiServer(env = process.env) {
  return http.createServer(async (request, response) => {
    const url = new URL(request.url || "/", "http://localhost");

    if (request.method !== "GET") {
      return sendJson(response, 405, problem("VALIDATION_FAILED", "Only GET is supported in V0-F0."));
    }

    if (url.pathname === "/health" || url.pathname === "/api/v0/health") {
      return sendJson(response, 200, getHealth(env));
    }

    if (url.pathname === "/ready" || url.pathname === "/api/v0/ready") {
      const readiness = getReadiness(env);
      return sendJson(response, readiness.status === "ready" ? 200 : 503, readiness);
    }

    if (url.pathname === "/version" || url.pathname === "/api/v0/version") {
      return sendJson(response, 200, getBuildInfo(env));
    }

    if (url.pathname === "/openapi.json" || url.pathname === "/api/v0/openapi.json") {
      const openapi = JSON.parse(await readFile(openApiPath, "utf8"));
      return sendJson(response, 200, openapi);
    }

    return sendJson(response, 404, problem("WORKSPACE_ACCESS_DENIED", "We could not find that item."));
  });
}

function problem(code, detail) {
  return {
    type: `https://errors.sakhaa-forge.invalid/v0/${code}`,
    title: code,
    status: code === "WORKSPACE_ACCESS_DENIED" ? 404 : 422,
    code,
    detail,
    trace_id: "v0-f0-local-trace",
    retryable: false
  };
}

function sendJson(response, statusCode, body) {
  response.writeHead(statusCode, {
    "content-type": "application/json; charset=utf-8",
    "cache-control": "no-store"
  });
  response.end(`${JSON.stringify(body)}\n`);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const port = Number.parseInt(process.env.PORT || "3001", 10);
  const server = createApiServer(process.env);
  server.listen(port, () => {
    console.log(`Sakhaa Forge API listening on http://localhost:${port}`);
  });
}
