import { createHmac } from "node:crypto";
import test from "node:test";
import assert from "node:assert/strict";
import { authenticateRequest } from "../../apps/api/src/auth.mjs";

test("local API auth accepts the brand-extract dummy JWT secret when no Supabase secret is configured", () => {
  const token = signJwt("brand-extract-demo-user", "local-dev-supabase-jwt-secret");
  const result = authenticateRequest({ authorization: `Bearer ${token}` }, { APP_ENV: "local" });

  assert.equal(result.ok, true);
  assert.equal(result.actor.userId, "brand-extract-demo-user");
});

test("production API auth does not accept the brand-extract dummy JWT secret implicitly", () => {
  const token = signJwt("brand-extract-demo-user", "local-dev-supabase-jwt-secret");
  const result = authenticateRequest({ authorization: `Bearer ${token}` }, { APP_ENV: "production" });

  assert.equal(result.ok, false);
  assert.equal(result.problem.code, "AUTH_TOKEN_INVALID");
});

function signJwt(userId, secret) {
  const header = Buffer.from(JSON.stringify({ alg: "HS256", typ: "JWT" })).toString("base64url");
  const payload = Buffer.from(
    JSON.stringify({
      aud: "authenticated",
      sub: userId,
      email: `${userId}@example.test`,
      exp: Math.floor(Date.now() / 1000) + 3600
    })
  ).toString("base64url");
  const signature = createHmac("sha256", secret).update(`${header}.${payload}`).digest("base64url");
  return `${header}.${payload}.${signature}`;
}
