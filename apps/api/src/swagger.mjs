import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { SwaggerModule } from "@nestjs/swagger";
import { timingSafeEqual } from "node:crypto";

const currentDir = dirname(fileURLToPath(import.meta.url));
const openApiPath = resolve(currentDir, "../../../packages/contracts/generated/openapi.v0.json");

/**
 * Checks whether Swagger documentation is enabled for the current environment.
 */
export function isSwaggerEnabled(env) {
  const isProd = env.APP_ENV === "production";
  const isStaging = env.APP_ENV === "staging";
  const isLocal = env.APP_ENV === "local" || !env.APP_ENV;

  if (env.SWAGGER_ENABLED !== undefined) {
    return env.SWAGGER_ENABLED === "true";
  }
  return isLocal || isStaging;
}

/**
 * Perform a timing-safe string comparison.
 */
function safeCompare(actual, expected) {
  if (typeof actual !== "string" || typeof expected !== "string") {
    return false;
  }
  const actualBuffer = Buffer.from(actual);
  const expectedBuffer = Buffer.from(expected);
  if (actualBuffer.length !== expectedBuffer.length) {
    return false;
  }
  return timingSafeEqual(actualBuffer, expectedBuffer);
}

/**
 * Set up the Swagger UI and apply security, visibility, and SEO protections.
 */
export async function setupSwagger(app, env) {
  if (!isSwaggerEnabled(env)) {
    // If Swagger is not enabled, we still register the onRequest hook 
    // to block raw openapi JSON spec endpoints served by F0Controller.
    registerHook(app, env);
    return;
  }

  // Load generated openapi JSON
  let document;
  try {
    document = JSON.parse(await readFile(openApiPath, "utf8"));
  } catch (error) {
    console.error("Failed to load OpenAPI document for Swagger:", error);
    return;
  }

  // Set up Swagger UI at `/api/docs`
  SwaggerModule.setup("api/docs", app, document, {
    customSiteTitle: "Sakhaa Forge V0 API Docs",
    swaggerOptions: {
      persistAuthorization: true,
    },
  });

  registerHook(app, env);
}

function registerHook(app, env) {
  const fastifyInstance = app.getHttpAdapter().getInstance();
  fastifyInstance.addHook("onRequest", async (request, reply) => {
    const url = request.raw.url;
    const normalized = url.split("?")[0];

    const isSwaggerUrl =
      normalized === "/openapi.json" ||
      normalized === "/api/v0/openapi.json" ||
      normalized === "/api/docs" ||
      normalized.startsWith("/api/docs/") ||
      normalized === "/api/docs-json";

    if (!isSwaggerUrl) {
      return;
    }

    // 1. Enforce SWAGGER_ENABLED check
    if (!isSwaggerEnabled(env)) {
      reply.code(404).send({
        type: "https://errors.sakhaa-forge.invalid/v0/NOT_FOUND",
        title: "Not Found",
        status: 404,
        code: "NOT_FOUND",
        detail: "We could not find that item.",
        trace_id: "v0-local-trace",
        retryable: false
      });
      return;
    }

    // 2. Prevent search engine indexing
    reply.header("X-Robots-Tag", "noindex, nofollow");

    // 3. Remove CORS access from unrelated origins
    reply.removeHeader("Access-Control-Allow-Origin");

    // 4. Require Basic Authentication in non-local/non-test environments
    const isLocal = env.APP_ENV === "local";
    const isTest = env.APP_ENV === "test";
    const needsAuth = !isLocal && !isTest;

    if (needsAuth) {
      const authHeader = request.headers.authorization || request.headers.Authorization;
      const expectedUser = env.SWAGGER_USER || "sakhaa";
      const expectedPassword = env.SWAGGER_PASSWORD;

      if (!expectedPassword) {
        console.warn("SWAGGER_PASSWORD is not configured in non-local environment. Denying access.");
        reply.code(403).send({
          type: "https://errors.sakhaa-forge.invalid/v0/PERMISSION_DENIED",
          title: "Permission denied",
          status: 403,
          code: "PERMISSION_DENIED",
          detail: "Swagger documentation is disabled due to missing credentials."
        });
        return;
      }

      if (!authHeader || !authHeader.startsWith("Basic ")) {
        reply.header("WWW-Authenticate", 'Basic realm="Sakhaa Forge Swagger Docs"');
        reply.code(401).send({
          type: "https://errors.sakhaa-forge.invalid/v0/AUTH_REQUIRED",
          title: "Auth required",
          status: 401,
          code: "AUTH_REQUIRED",
          detail: "Basic authentication is required to access API documentation."
        });
        return;
      }

      const base64Credentials = authHeader.slice("Basic ".length).trim();
      const [username, password] = Buffer.from(base64Credentials, "base64").toString("utf8").split(":");

      if (!safeCompare(username, expectedUser) || !safeCompare(password, expectedPassword)) {
        reply.header("WWW-Authenticate", 'Basic realm="Sakhaa Forge Swagger Docs"');
        reply.code(401).send({
          type: "https://errors.sakhaa-forge.invalid/v0/AUTH_TOKEN_INVALID",
          title: "Auth token invalid",
          status: 401,
          code: "AUTH_TOKEN_INVALID",
          detail: "Invalid Swagger credentials."
        });
        return;
      }
    }
  });
}
