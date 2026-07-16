import { createHmac, randomUUID } from 'node:crypto';
import { NextResponse } from 'next/server.js';

export const runtime = 'nodejs';

const LOCAL_DEV_JWT_SECRET = 'local-dev-supabase-jwt-secret';

function base64UrlJson(value: unknown): string {
  return Buffer.from(JSON.stringify(value)).toString('base64url');
}

function signLocalJwt(secret: string, userId: string, expiresAtSeconds: number): string {
  const header = base64UrlJson({ alg: 'HS256', typ: 'JWT' });
  const payload = base64UrlJson({
    aud: 'authenticated',
    sub: userId,
    email: `${userId}@brand-extract.local`,
    exp: expiresAtSeconds
  });
  const signature = createHmac('sha256', secret)
    .update(`${header}.${payload}`)
    .digest('base64url');
  return `${header}.${payload}.${signature}`;
}

async function createWorkspace(apiBaseUrl: string, authToken: string, label: string) {
  return fetch(`${apiBaseUrl}/workspaces`, {
    method: 'POST',
    headers: {
      authorization: `Bearer ${authToken}`,
      'content-type': 'application/json',
      'idempotency-key': `brand-extract-demo-workspace-${label}`
    },
    body: JSON.stringify({ name: `Brand Extract Demo ${label.slice(0, 8)}` })
  });
}

export async function POST() {
  if (process.env.NODE_ENV === 'production' && process.env.BRAND_EXTRACT_DEMO_AUTH_ENABLED !== '1') {
    return NextResponse.json(
      {
        code: 'DEMO_AUTH_DISABLED',
        detail: 'Local demo auth is disabled in production.'
      },
      { status: 403 }
    );
  }

  const secret = process.env.SUPABASE_JWT_SECRET || LOCAL_DEV_JWT_SECRET;
  const apiBaseUrl = `${(process.env.V0_API_BASE_URL || 'http://localhost:3001').replace(/\/$/, '')}/api/v0`;
  const userId = `brand-extract-demo-${randomUUID()}`;
  const expiresAtSeconds = Math.floor(Date.now() / 1000) + 60 * 60;
  const authToken = signLocalJwt(secret, userId, expiresAtSeconds);
  const label = randomUUID();

  const created = await createWorkspace(apiBaseUrl, authToken, label);
  const body = await created.json().catch(() => ({}));
  if (!created.ok || !body?.workspace?.id) {
    return NextResponse.json(
      {
        code: body?.code || 'DEMO_WORKSPACE_CREATE_FAILED',
        detail: body?.detail || 'Could not create a local demo workspace for brand extraction.'
      },
      { status: created.status || 502 }
    );
  }

  return NextResponse.json({
    workspaceId: body.workspace.id,
    authToken,
    expiresAt: new Date(expiresAtSeconds * 1000).toISOString()
  });
}

export async function GET() {
  return NextResponse.json({
    message: "Welcome to the Sakhaa Forge Brand Extract Demo Session endpoint.",
    usage: "To register a new demo session workspace, make a POST request to this endpoint.",
    tip: "You can click the 'Create Demo Session' button in the Brand Extraction Studio UI, or use a POST request via curl/fetch."
  });
}
