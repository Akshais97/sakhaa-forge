import { copyFile, mkdir, readFile, stat, unlink, writeFile } from "node:fs/promises";
import { dirname, resolve, sep } from "node:path";
import {
  CopyObjectCommand,
  DeleteObjectCommand,
  GetObjectCommand,
  HeadObjectCommand,
  PutObjectCommand,
  S3Client
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

const defaultBuckets = {
  quarantine: "v0-local-quarantine",
  cleanMedia: "v0-local-clean",
  privateArtifacts: "v0-local-artifacts"
};

export function getObjectStorageConfig(env = process.env) {
  const appEnv = String(env.APP_ENV ?? "development").toLowerCase();
  const provider = String(env.OBJECT_STORAGE_PROVIDER ?? (appEnv === "production" ? "" : "local-filesystem")).toLowerCase();
  if (!provider || !["local-filesystem", "b2"].includes(provider)) {
    throw new Error("OBJECT_STORAGE_PROVIDER must be b2 outside local development and tests");
  }
  if (provider === "local-filesystem" && !["test", "development", "local"].includes(appEnv)) {
    throw new Error("OBJECT_STORAGE_PROVIDER=b2 is required outside local development and tests");
  }
  const config = {
    provider,
    root: resolve(env.LOCAL_STORAGE_ROOT || ".local/storage"),
    endpoint: env.OBJECT_STORAGE_ENDPOINT || env.B2_S3_ENDPOINT,
    region: env.OBJECT_STORAGE_REGION || env.B2_S3_REGION || "us-west-004",
    keyId: env.OBJECT_STORAGE_KEY_ID || env.B2_KEY_ID,
    applicationKey: env.OBJECT_STORAGE_APPLICATION_KEY || env.B2_APPLICATION_KEY,
    buckets: {
      quarantine: env.B2_BUCKET_QUARANTINE || defaultBuckets.quarantine,
      "clean-media": env.B2_BUCKET_CLEAN_MEDIA || defaultBuckets.cleanMedia,
      "private-artifacts": env.B2_BUCKET_PRIVATE_ARTIFACTS || defaultBuckets.privateArtifacts
    },
    uploadTtlSeconds: positiveInteger(env.SIGNED_UPLOAD_TTL_SECONDS, 900),
    downloadTtlSeconds: positiveInteger(env.SIGNED_DOWNLOAD_TTL_SECONDS, 300)
  };
  if (provider === "b2") {
    for (const [name, value] of Object.entries({
      OBJECT_STORAGE_ENDPOINT: config.endpoint,
      OBJECT_STORAGE_KEY_ID: config.keyId,
      OBJECT_STORAGE_APPLICATION_KEY: config.applicationKey,
      B2_BUCKET_QUARANTINE: env.B2_BUCKET_QUARANTINE,
      B2_BUCKET_CLEAN_MEDIA: env.B2_BUCKET_CLEAN_MEDIA,
      B2_BUCKET_PRIVATE_ARTIFACTS: env.B2_BUCKET_PRIVATE_ARTIFACTS
    })) {
      if (typeof value !== "string" || value.trim().length === 0) throw new Error(`${name} is required for B2 object storage`);
    }
  }
  return config;
}

export function createObjectStorage(env = process.env) {
  const config = getObjectStorageConfig(env);
  return config.provider === "b2" ? createB2ObjectStorage(config) : createLocalObjectStorage(config);
}

export function getLocalStorageSimulatorConfig(env = process.env) {
  const config = getObjectStorageConfig({ ...env, APP_ENV: "test", OBJECT_STORAGE_PROVIDER: "local-filesystem" });
  return {
    provider: config.provider,
    root: config.root,
    quarantineBucket: config.buckets.quarantine,
    cleanMediaBucket: config.buckets["clean-media"],
    privateArtifactsBucket: config.buckets["private-artifacts"],
    quarantinePath: resolve(config.root, config.buckets.quarantine),
    cleanMediaPath: resolve(config.root, config.buckets["clean-media"]),
    privateArtifactsPath: resolve(config.root, config.buckets["private-artifacts"])
  };
}

export async function ensureLocalStorageSimulator(storage) {
  await Promise.all([
    mkdir(storage.quarantinePath, { recursive: true }),
    mkdir(storage.cleanMediaPath, { recursive: true }),
    mkdir(storage.privateArtifactsPath, { recursive: true })
  ]);
  return storage;
}

function createB2ObjectStorage(config) {
  const client = new S3Client({
    endpoint: config.endpoint,
    region: config.region,
    forcePathStyle: true,
    credentials: { accessKeyId: config.keyId, secretAccessKey: config.applicationKey }
  });
  const bucket = (area) => requiredBucket(config, area);
  return {
    provider: "b2",
    async putObject({ area, key, body, contentType, sha256 }) {
      await client.send(new PutObjectCommand({
        Bucket: bucket(area), Key: key, Body: body, ContentType: contentType,
        Metadata: sha256 ? { sha256 } : undefined
      }));
    },
    async headObject({ area, key }) {
      const value = await client.send(new HeadObjectCommand({ Bucket: bucket(area), Key: key }));
      return { byteSize: Number(value.ContentLength), contentType: value.ContentType ?? null, sha256: value.Metadata?.sha256 ?? null };
    },
    async copyObject({ sourceArea, sourceKey, destinationArea, destinationKey, contentType, sha256 }) {
      await client.send(new CopyObjectCommand({
        Bucket: bucket(destinationArea), Key: destinationKey,
        CopySource: encodeURIComponent(`${bucket(sourceArea)}/${sourceKey}`).replaceAll("%2F", "/"),
        ContentType: contentType, MetadataDirective: "REPLACE", Metadata: sha256 ? { sha256 } : undefined
      }));
    },
    async deleteObject({ area, key }) {
      await client.send(new DeleteObjectCommand({ Bucket: bucket(area), Key: key }));
    },
    async getObject({ area, key }) {
      const value = await client.send(new GetObjectCommand({ Bucket: bucket(area), Key: key }));
      return Buffer.from(await value.Body.transformToByteArray());
    },
    async createSignedUploadUrl({ area, key, contentType }) {
      return getSignedUrl(client, new PutObjectCommand({ Bucket: bucket(area), Key: key, ContentType: contentType }), { expiresIn: config.uploadTtlSeconds });
    },
    async createSignedDownloadUrl({ area, key }) {
      return getSignedUrl(client, new GetObjectCommand({ Bucket: bucket(area), Key: key }), { expiresIn: config.downloadTtlSeconds });
    }
  };
}

function createLocalObjectStorage(config) {
  const objectPath = (area, key) => safeObjectPath(config.root, requiredBucket(config, area), key);
  return {
    provider: "local-filesystem",
    async putObject({ area, key, body }) {
      const target = objectPath(area, key);
      await mkdir(dirname(target), { recursive: true });
      await writeFile(target, body);
    },
    async headObject({ area, key }) {
      const value = await stat(objectPath(area, key));
      return { byteSize: value.size, contentType: null, sha256: null };
    },
    async copyObject({ sourceArea, sourceKey, destinationArea, destinationKey }) {
      const target = objectPath(destinationArea, destinationKey);
      await mkdir(dirname(target), { recursive: true });
      await copyFile(objectPath(sourceArea, sourceKey), target);
    },
    async deleteObject({ area, key }) {
      await unlink(objectPath(area, key)).catch((error) => { if (error?.code !== "ENOENT") throw error; });
    },
    async getObject({ area, key }) {
      return readFile(objectPath(area, key));
    },
    async createSignedUploadUrl() { return null; },
    async createSignedDownloadUrl() { return null; }
  };
}

function requiredBucket(config, area) {
  const value = config.buckets[area];
  if (!value) throw new Error(`Unknown object storage area: ${area}`);
  return value;
}

function safeObjectPath(root, bucket, key) {
  if (typeof key !== "string" || key.startsWith("/") || key.includes("..") || key.includes("\\")) throw new Error("OBJECT_KEY_INVALID");
  const base = resolve(root, bucket);
  const target = resolve(base, ...key.split("/"));
  if (!target.startsWith(`${base}${sep}`)) throw new Error("OBJECT_KEY_INVALID");
  return target;
}

function positiveInteger(value, fallback) {
  const parsed = Number.parseInt(String(value ?? ""), 10);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
}
