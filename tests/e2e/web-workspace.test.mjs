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
