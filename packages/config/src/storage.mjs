import { mkdir } from "node:fs/promises";
import { resolve } from "node:path";

const defaultBuckets = {
  quarantine: "v0-local-quarantine",
  cleanMedia: "v0-local-clean",
  privateArtifacts: "v0-local-artifacts"
};

export function getLocalStorageSimulatorConfig(env = process.env) {
  const root = env.LOCAL_STORAGE_ROOT || ".local/storage";
  const quarantine = env.B2_BUCKET_QUARANTINE || defaultBuckets.quarantine;
  const cleanMedia = env.B2_BUCKET_CLEAN_MEDIA || defaultBuckets.cleanMedia;
  const privateArtifacts =
    env.B2_BUCKET_PRIVATE_ARTIFACTS || defaultBuckets.privateArtifacts;

  return {
    provider: "local-filesystem",
    root: resolve(root),
    quarantineBucket: quarantine,
    cleanMediaBucket: cleanMedia,
    privateArtifactsBucket: privateArtifacts,
    quarantinePath: resolve(root, quarantine),
    cleanMediaPath: resolve(root, cleanMedia),
    privateArtifactsPath: resolve(root, privateArtifacts)
  };
}

export async function ensureLocalStorageSimulator(storage) {
  await mkdir(storage.quarantinePath, { recursive: true });
  await mkdir(storage.cleanMediaPath, { recursive: true });
  await mkdir(storage.privateArtifactsPath, { recursive: true });
  return storage;
}
