import { createHmac, timingSafeEqual } from "node:crypto";

const LOCAL_DEV_JWT_SECRET = "local-dev-supabase-jwt-secret";

export function authenticateRequest(headers, env) {
  const authorization = headers.authorization ?? headers.Authorization;
  if (!authorization?.startsWith("Bearer ")) {
    return { ok: false, problem: authProblem("AUTH_REQUIRED", 401, "Auth required", "Sign in to continue.") };
  }

  const secret = env.SUPABASE_JWT_SECRET || localDevJwtSecret(env);
  if (!secret) {
    return { ok: false, problem: authProblem("AUTH_TOKEN_INVALID", 401, "Auth token invalid", "Your session is not valid. Sign in again.") };
  }

  const token = authorization.slice("Bearer ".length);
  const payload = verifyHs256Jwt(token, secret);
  if (!payload?.sub || payload.aud !== "authenticated") {
    return { ok: false, problem: authProblem("AUTH_TOKEN_INVALID", 401, "Auth token invalid", "Your session is not valid. Sign in again.") };
  }

  return {
    ok: true,
    actor: {
      userId: payload.sub,
      email: payload.email ?? null
    }
  };
}

function localDevJwtSecret(env) {
  const appEnv = env.APP_ENV ?? "local";
  return ["local", "dev", "development"].includes(appEnv) ? LOCAL_DEV_JWT_SECRET : null;
}

function verifyHs256Jwt(token, secret) {
  const parts = token.split(".");
  if (parts.length !== 3) {
    return null;
  }

  const [encodedHeader, encodedPayload, signature] = parts;
  const header = parseBase64Json(encodedHeader);
  const payload = parseBase64Json(encodedPayload);
  if (header?.alg !== "HS256" || !payload) {
    return null;
  }

  const expected = createHmac("sha256", secret)
    .update(`${encodedHeader}.${encodedPayload}`)
    .digest("base64url");

  if (!safeEqual(signature, expected)) {
    return null;
  }

  if (typeof payload.exp === "number" && payload.exp <= Math.floor(Date.now() / 1000)) {
    return null;
  }

  return payload;
}

function parseBase64Json(value) {
  try {
    return JSON.parse(Buffer.from(value, "base64url").toString("utf8"));
  } catch {
    return null;
  }
}

function safeEqual(actual, expected) {
  const actualBuffer = Buffer.from(actual);
  const expectedBuffer = Buffer.from(expected);
  return actualBuffer.length === expectedBuffer.length && timingSafeEqual(actualBuffer, expectedBuffer);
}

function authProblem(code, status, title, detail) {
  return {
    type: `https://errors.sakhaa-forge.invalid/v0/${code}`,
    title,
    status,
    code,
    detail,
    trace_id: "v0-local-trace",
    retryable: code === "AUTH_TOKEN_INVALID"
  };
}
