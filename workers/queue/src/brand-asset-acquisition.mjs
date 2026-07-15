import { createHash } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

const allowedContentTypes = new Map([
  ["image/jpeg", ".jpg"],
  ["image/png", ".png"],
  ["image/webp", ".webp"],
  ["image/svg+xml", ".svg"]
]);

export async function retainCrawlAssets(assets, {
  workspaceId,
  crawlRunId,
  objectStorage = null,
  storageRoot = process.env.LOCAL_STORAGE_ROOT || ".local/storage",
  fetchImpl = globalThis.fetch,
  maxAssets = 50,
  maxBytes = 10 * 1024 * 1024
} = {}) {
  const retainedAssets = [];
  const skippedAssets = [];
  const seen = new Set();
  for (const asset of Array.isArray(assets) ? assets.slice(0, maxAssets) : []) {
    const locator = typeof asset?.locator === "string" ? asset.locator.trim() : "";
    if (!locator || seen.has(locator) || !isSafeAssetUrl(locator)) continue;
    seen.add(locator);
    try {
      const response = await fetchWithSafeRedirects(locator, fetchImpl);
      if (!response.ok) {
        skippedAssets.push({ locator, code: "ASSET_DOWNLOAD_FAILED", status: response.status });
        continue;
      }
      const contentType = String(response.headers?.get?.("content-type") ?? "").split(";", 1)[0].trim().toLowerCase();
      const extension = allowedContentTypes.get(contentType);
      const declaredSize = Number.parseInt(response.headers?.get?.("content-length") ?? "", 10);
      const unsupportedSvg = contentType === "image/svg+xml" && asset.type !== "logo";
      if (!extension || unsupportedSvg || (Number.isFinite(declaredSize) && declaredSize > maxBytes)) {
        skippedAssets.push({
          locator,
          code: !extension || unsupportedSvg ? "ASSET_TYPE_UNSUPPORTED" : "ASSET_TOO_LARGE"
        });
        continue;
      }
      const bytes = Buffer.from(await response.arrayBuffer());
      if (bytes.length === 0 || bytes.length > maxBytes) {
        skippedAssets.push({ locator, code: bytes.length === 0 ? "ASSET_MEDIA_MALFORMED" : "ASSET_TOO_LARGE" });
        continue;
      }
      const sha256 = createHash("sha256").update(bytes).digest("hex");
      const objectKey = `clean-media/${workspaceId}/brand-crawl/${crawlRunId}/${sha256}${extension}`;
      if (objectStorage) {
        const quarantineKey = `quarantine/${workspaceId}/brand-crawl/${crawlRunId}/${sha256}${extension}`;
        await objectStorage.putObject({
          area: "quarantine",
          key: quarantineKey,
          body: bytes,
          contentType,
          sha256
        });
        const retained = await objectStorage.headObject({ area: "quarantine", key: quarantineKey });
        if (retained.byteSize !== bytes.length || (retained.contentType && retained.contentType !== contentType)) {
          throw new Error("ASSET_STORAGE_VERIFICATION_FAILED");
        }
        await objectStorage.copyObject({
          sourceArea: "quarantine",
          sourceKey: quarantineKey,
          destinationArea: "clean-media",
          destinationKey: objectKey,
          contentType,
          sha256
        });
        const clean = await objectStorage.headObject({ area: "clean-media", key: objectKey });
        if (clean.byteSize !== bytes.length) throw new Error("ASSET_STORAGE_VERIFICATION_FAILED");
        await objectStorage.deleteObject({ area: "quarantine", key: quarantineKey });
      } else {
        const absoluteRoot = path.resolve(storageRoot);
        const absolutePath = path.resolve(absoluteRoot, ...objectKey.split("/"));
        if (!absolutePath.startsWith(`${absoluteRoot}${path.sep}`)) throw new Error("ASSET_PATH_INVALID");
        await mkdir(path.dirname(absolutePath), { recursive: true });
        await writeFile(absolutePath, bytes, { flag: "wx" }).catch((error) => {
          if (error?.code !== "EEXIST") throw error;
        });
      }
      retainedAssets.push({
        fileName: `${asset.type ?? "brand-image"}-${sha256.slice(0, 12)}${extension}`,
        contentType,
        byteSize: bytes.length,
        sha256,
        objectKey,
        category: asset.type ?? "image",
        rightsBasis: asset.rightsBasis ?? "public website crawl evidence",
        permittedUse: asset.permittedUse ?? "candidate review"
      });
    } catch {
      skippedAssets.push({ locator, code: "ASSET_DOWNLOAD_FAILED" });
    }
  }
  return { retainedAssets, skippedAssets };
}

async function fetchWithSafeRedirects(initialUrl, fetchImpl) {
  let current = initialUrl;
  for (let redirect = 0; redirect <= 3; redirect += 1) {
    if (!isSafeAssetUrl(current)) throw new Error("CRAWL_SSRF_BLOCKED");
    const response = await fetchImpl(current, { method: "GET", redirect: "manual", headers: { accept: "image/*" } });
    if (![301, 302, 303, 307, 308].includes(response.status)) return response;
    const location = response.headers?.get?.("location");
    if (!location) return response;
    current = new URL(location, current).toString();
  }
  throw new Error("CRAWL_REDIRECT_LIMIT");
}

function isSafeAssetUrl(value) {
  try {
    const parsed = new URL(value);
    if (!["http:", "https:"].includes(parsed.protocol) || parsed.username || parsed.password) return false;
    const hostname = parsed.hostname.toLowerCase();
    if (hostname === "localhost" || hostname.endsWith(".localhost") || hostname.endsWith(".local")) return false;
    if (/^(?:127\.|0\.|10\.|169\.254\.|192\.168\.|224\.|255\.)/.test(hostname)) return false;
    const private172 = hostname.match(/^172\.(\d{1,3})\./);
    if (private172 && Number(private172[1]) >= 16 && Number(private172[1]) <= 31) return false;
    if (hostname === "::1" || hostname.startsWith("fe80:") || hostname.startsWith("fc") || hostname.startsWith("fd")) return false;
    return true;
  } catch {
    return false;
  }
}
