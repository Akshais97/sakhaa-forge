import test from "node:test";
import assert from "node:assert/strict";
import { withApiServer } from "../helpers/server.mjs";

test("Swagger is enabled and accessible locally", async () => {
  await withApiServer(
    {
      APP_ENV: "local",
      SWAGGER_ENABLED: "true",
      V0_INTERNAL_WORKER_TOKEN: "test-token"
    },
    async ({ baseUrl }) => {
      // The baseUrl from helper is `${url}/api/v0`, we get the root url
      const urlObj = new URL(baseUrl);
      const rootUrl = `${urlObj.protocol}//${urlObj.host}`;

      // 1. Verify Swagger UI page is accessible at /api/docs
      const docsResponse = await fetch(`${rootUrl}/api/docs`);
      assert.equal(docsResponse.status, 200);
      const docsText = await docsResponse.text();
      assert.ok(docsText.includes("html"));

      // 2. Verify X-Robots-Tag noindex header is set
      assert.equal(docsResponse.headers.get("x-robots-tag"), "noindex, nofollow");

      // 3. Verify CORS Access-Control-Allow-Origin is removed/absent
      assert.equal(docsResponse.headers.has("access-control-allow-origin"), false);

      // 4. Verify OpenAPI raw JSON route is accessible
      const openapiResponse = await fetch(`${rootUrl}/openapi.json`);
      assert.equal(openapiResponse.status, 200);
      const openapiJson = await openapiResponse.json();
      assert.equal(openapiJson.openapi, "3.1.0");
      assert.equal(openapiJson.info.title, "Sakhaa Forge V0 API");
    }
  );
});

test("Swagger and raw OpenAPI JSON are blocked when SWAGGER_ENABLED=false", async () => {
  await withApiServer(
    {
      APP_ENV: "local",
      SWAGGER_ENABLED: "false",
      V0_INTERNAL_WORKER_TOKEN: "test-token"
    },
    async ({ baseUrl }) => {
      const urlObj = new URL(baseUrl);
      const rootUrl = `${urlObj.protocol}//${urlObj.host}`;

      // 1. Swagger UI must return 404
      const docsResponse = await fetch(`${rootUrl}/api/docs`);
      assert.equal(docsResponse.status, 404);

      // 2. Swagger UI sub-resources must return 404
      const docsCssResponse = await fetch(`${rootUrl}/api/docs/ui.css`);
      assert.equal(docsCssResponse.status, 404);

      // 3. Raw OpenAPI JSON at root must return 404
      const openapiResponse = await fetch(`${rootUrl}/openapi.json`);
      assert.equal(openapiResponse.status, 404);

      // 4. Raw OpenAPI JSON at prefix must return 404
      const prefixOpenapiResponse = await fetch(`${baseUrl}/openapi.json`);
      assert.equal(prefixOpenapiResponse.status, 404);
    }
  );
});

test("Swagger is protected by Basic Auth in non-local environments (staging)", async () => {
  const username = "testuser";
  const password = "testpassword";
  const basicAuthCredentials = Buffer.from(`${username}:${password}`).toString("base64");

  await withApiServer(
    {
      APP_ENV: "staging",
      SWAGGER_ENABLED: "true",
      SWAGGER_USER: username,
      SWAGGER_PASSWORD: password,
      V0_INTERNAL_WORKER_TOKEN: "test-token"
    },
    async ({ baseUrl }) => {
      const urlObj = new URL(baseUrl);
      const rootUrl = `${urlObj.protocol}//${urlObj.host}`;

      // 1. Accessing Swagger UI without auth must return 401 with WWW-Authenticate header
      const unauthResponse = await fetch(`${rootUrl}/api/docs`);
      assert.equal(unauthResponse.status, 401);
      assert.equal(unauthResponse.headers.get("www-authenticate"), 'Basic realm="Sakhaa Forge Swagger Docs"');

      // 2. Accessing raw OpenAPI JSON without auth must return 401
      const unauthOpenapi = await fetch(`${rootUrl}/openapi.json`);
      assert.equal(unauthOpenapi.status, 401);

      // 3. Accessing with incorrect credentials must return 401
      const badAuthResponse = await fetch(`${rootUrl}/api/docs`, {
        headers: {
          Authorization: "Basic " + Buffer.from("baduser:badpass").toString("base64")
        }
      });
      assert.equal(badAuthResponse.status, 401);

      // 4. Accessing with correct credentials must succeed
      const authResponse = await fetch(`${rootUrl}/api/docs`, {
        headers: {
          Authorization: `Basic ${basicAuthCredentials}`
        }
      });
      assert.equal(authResponse.status, 200);

      // 5. Accessing raw OpenAPI JSON with correct credentials must succeed
      const authOpenapiResponse = await fetch(`${rootUrl}/openapi.json`, {
        headers: {
          Authorization: `Basic ${basicAuthCredentials}`
        }
      });
      assert.equal(authOpenapiResponse.status, 200);
    }
  );
});

test("Swagger is blocked in non-local environments when SWAGGER_PASSWORD is not set", async () => {
  await withApiServer(
    {
      APP_ENV: "staging",
      SWAGGER_ENABLED: "true",
      SWAGGER_USER: "user-only",
      V0_INTERNAL_WORKER_TOKEN: "test-token"
    },
    async ({ baseUrl }) => {
      const urlObj = new URL(baseUrl);
      const rootUrl = `${urlObj.protocol}//${urlObj.host}`;

      // Accessing Swagger UI must return 403 Forbidden since password is not configured
      const response = await fetch(`${rootUrl}/api/docs`);
      assert.equal(response.status, 403);
    }
  );
});

test("Swagger defaults to disabled in production", async () => {
  await withApiServer(
    {
      APP_ENV: "production",
      V0_INTERNAL_WORKER_TOKEN: "test-token"
    },
    async ({ baseUrl }) => {
      const urlObj = new URL(baseUrl);
      const rootUrl = `${urlObj.protocol}//${urlObj.host}`;

      // UI and JSON must return 404 by default in production
      const docsResponse = await fetch(`${rootUrl}/api/docs`);
      assert.equal(docsResponse.status, 404);

      const openapiResponse = await fetch(`${rootUrl}/openapi.json`);
      assert.equal(openapiResponse.status, 404);
    }
  );
});
