import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, access, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  createObjectStorage,
  getLocalStorageSimulatorConfig,
  ensureLocalStorageSimulator
} from "../../packages/config/src/storage.mjs";

test("local storage simulator creates quarantine, clean and artifact roots", async () => {
  const root = await mkdtemp(join(tmpdir(), "sakhaa-forge-storage-"));
  const env = {
    LOCAL_STORAGE_ROOT: root,
    B2_BUCKET_QUARANTINE: "quarantine",
    B2_BUCKET_CLEAN_MEDIA: "clean-media",
    B2_BUCKET_PRIVATE_ARTIFACTS: "private-artifacts"
  };

  try {
    const storage = getLocalStorageSimulatorConfig(env);
    await ensureLocalStorageSimulator(storage);

    await access(storage.quarantinePath);
    await access(storage.cleanMediaPath);
    await access(storage.privateArtifactsPath);
    assert.equal(storage.provider, "local-filesystem");
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("non-local storage fails closed unless the B2 adapter is fully configured", () => {
  assert.throws(
    () => createObjectStorage({ APP_ENV: "production", OBJECT_STORAGE_PROVIDER: "local-filesystem" }),
    /OBJECT_STORAGE_PROVIDER=b2 is required/
  );
  assert.throws(
    () => createObjectStorage({ APP_ENV: "production", OBJECT_STORAGE_PROVIDER: "b2" }),
    /OBJECT_STORAGE_ENDPOINT is required/
  );
});
