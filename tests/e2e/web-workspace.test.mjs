import test from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";

test("web shell renders sign-in, workspace creation and switcher controls", async () => {
  const port = 3917;
  const child = spawn(process.execPath, ["apps/web/src/server.mjs"], {
    env: { ...process.env, PORT: String(port) },
    stdio: ["ignore", "pipe", "pipe"]
  });

  try {
    await waitForServer(`http://127.0.0.1:${port}`);
    const response = await fetch(`http://127.0.0.1:${port}`);
    const html = await response.text();

    assert.equal(response.status, 200);
    assert.match(html, /Sign in/);
    assert.match(html, /Create workspace/);
    assert.match(html, /Workspace switcher/);
    assert.match(html, /Active workspace/);
    assert.match(html, /data-testid="workspace-create-form"/);
    assert.match(html, /data-testid="workspace-switcher"/);
  } finally {
    child.kill();
  }
});

test("web shell renders B2 candidate review provenance and partial states", async () => {
  const port = 3918;
  const child = spawn(process.execPath, ["apps/web/src/server.mjs"], {
    env: { ...process.env, PORT: String(port) },
    stdio: ["ignore", "pipe", "pipe"]
  });

  try {
    await waitForServer(`http://127.0.0.1:${port}`);
    const response = await fetch(`http://127.0.0.1:${port}`);
    const html = await response.text();

    assert.equal(response.status, 200);
    assert.match(html, /data-testid="brand-candidate-review"/);
    assert.match(html, /Extracted values wait for human approval before becoming brand truth/);
    assert.match(html, /data-testid="candidate-provenance"/);
    assert.match(html, /excerpt hash retained/);
    assert.match(html, /data-state="partial"/);
    assert.match(html, /Partly complete/);
    assert.match(html, /data-state="low-confidence"/);
    assert.match(html, /Low confidence/);
    assert.match(html, /Guaranteed appreciation/);
  } finally {
    child.kill();
  }
});

test("web shell renders B3 brand profile approval diff and production gate", async () => {
  const port = 3919;
  const child = spawn(process.execPath, ["apps/web/src/server.mjs"], {
    env: { ...process.env, PORT: String(port) },
    stdio: ["ignore", "pipe", "pipe"]
  });

  try {
    await waitForServer(`http://127.0.0.1:${port}`);
    const response = await fetch(`http://127.0.0.1:${port}`);
    const html = await response.text();

    assert.equal(response.status, 200);
    assert.match(html, /data-testid="brand-profile-approval"/);
    assert.match(html, /Approve this profile/);
    assert.match(html, /data-testid="profile-version-diff"/);
    assert.match(html, /Version 1/);
    assert.match(html, /Required rule/);
    assert.match(html, /Prohibited rule/);
    assert.match(html, /Production uses only the active approved version/);
    assert.match(html, /data-state="superseded"/);
    assert.match(html, /Superseded/);
  } finally {
    child.kill();
  }
});

test("web shell renders P1 explicit blueprint path selection empty and stale states", async () => {
  const port = 3920;
  const child = spawn(process.execPath, ["apps/web/src/server.mjs"], {
    env: { ...process.env, PORT: String(port) },
    stdio: ["ignore", "pipe", "pipe"]
  });

  try {
    await waitForServer(`http://127.0.0.1:${port}`);
    const response = await fetch(`http://127.0.0.1:${port}`);
    const html = await response.text();

    assert.equal(response.status, 200);
    assert.match(html, /data-testid="blueprint-path-selection"/);
    assert.match(html, /Choose blueprint path/);
    assert.match(html, /No reusable blueprints match this approved brand profile/);
    assert.match(html, /Existing blueprint/);
    assert.match(html, /New viral discovery/);
    assert.match(html, /Approved default formula/);
    assert.match(html, /data-testid="blueprint-compatibility"/);
    assert.match(html, /Compatible with brand profile v1/);
    assert.match(html, /data-state="stale"/);
    assert.match(html, /Review the latest profile version before continuing/);
  } finally {
    child.kill();
  }
});

test("web shell renders P2 viral discovery candidates and provider outage state", async () => {
  const port = 3921;
  const child = spawn(process.execPath, ["apps/web/src/server.mjs"], {
    env: { ...process.env, PORT: String(port) },
    stdio: ["ignore", "pipe", "pipe"]
  });

  try {
    await waitForServer(`http://127.0.0.1:${port}`);
    const response = await fetch(`http://127.0.0.1:${port}`);
    const html = await response.text();

    assert.equal(response.status, 200);
    assert.match(html, /data-testid="viral-candidate-search"/);
    assert.match(html, /Observed metrics are retained as immutable snapshots/);
    assert.match(html, /snapshot locked/);
    assert.match(html, /analysis only until acquisition rights are recorded/);
    assert.match(html, /data-state="provider-outage"/);
    assert.match(html, /No candidate is created from an empty, malformed or timed-out provider result/);
    assert.match(html, /Manual fallback keeps actor, source URL and rights basis as provenance/);
  } finally {
    child.kill();
  }
});

test("web shell renders P3 media acquisition and thumbnail blueprint blocked states", async () => {
  const port = 3922;
  const child = spawn(process.execPath, ["apps/web/src/server.mjs"], {
    env: { ...process.env, PORT: String(port) },
    stdio: ["ignore", "pipe", "pipe"]
  });

  try {
    await waitForServer(`http://127.0.0.1:${port}`);
    const response = await fetch(`http://127.0.0.1:${port}`);
    const html = await response.text();

    assert.equal(response.status, 200);
    assert.match(html, /data-testid="media-acquisition-blueprint"/);
    assert.match(html, /Source media is retained only when rights allow internal structural analysis/);
    assert.match(html, /Retained private artifact/);
    assert.match(html, /source hash traced/);
    assert.match(html, /object key hidden/);
    assert.match(html, /data-state="blocked"/);
    assert.match(html, /Reference-only sources do not create retained analysis copies/);
    assert.match(html, /Low-confidence OCR remains visible and stops dependent blueprint stages/);
  } finally {
    child.kill();
  }
});

test("web shell renders P4 scene blueprint stage progress and blocked states", async () => {
  const port = 3923;
  const child = spawn(process.execPath, ["apps/web/src/server.mjs"], {
    env: { ...process.env, PORT: String(port) },
    stdio: ["ignore", "pipe", "pipe"]
  });

  try {
    await waitForServer(`http://127.0.0.1:${port}`);
    const response = await fetch(`http://127.0.0.1:${port}`);
    const html = await response.text();

    assert.equal(response.status, 200);
    assert.match(html, /data-testid="scene-blueprint-stages"/);
    assert.match(html, /Scene detection, transcript, keyframes, vision and OCR progress independently/);
    assert.match(html, /CPU and GPU queues stay isolated/);
    assert.match(html, /workers receive no database or Redis credentials/);
    assert.match(html, /Transcript, shots, motion and on-screen text are retained with artifact hashes/);
    assert.match(html, /Empty transcript, malformed model JSON, timeout and OOM never report a complete blueprint/);
    assert.match(html, /data-state="blocked"/);
  } finally {
    child.kill();
  }
});

test("web shell renders P5 ready blueprint script input contract states", async () => {
  const port = 3924;
  const child = spawn(process.execPath, ["apps/web/src/server.mjs"], {
    env: { ...process.env, PORT: String(port) },
    stdio: ["ignore", "pipe", "pipe"]
  });

  try {
    await waitForServer(`http://127.0.0.1:${port}`);
    const response = await fetch(`http://127.0.0.1:${port}`);
    const html = await response.text();

    assert.equal(response.status, 200);
    assert.match(html, /data-testid="ready-blueprint-contract"/);
    assert.match(html, /Ready blueprint contract/);
    assert.match(html, /Extracted and approved default formula paths produce the same script input contract/);
    assert.match(html, /Formula derivation and provider-neutral director prompt are retained with lineage/);
    assert.match(html, /Missing stage evidence or invalid formula slots block readiness/);
  } finally {
    child.kill();
  }
});

async function waitForServer(url) {
  const started = Date.now();
  while (Date.now() - started < 5000) {
    try {
      const response = await fetch(url);
      await response.arrayBuffer();
      return;
    } catch {
      await new Promise((resolve) => setTimeout(resolve, 50));
    }
  }
  throw new Error("web server did not start");
}
