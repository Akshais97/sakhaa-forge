import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { createObjectStorage } from "./src/storage.mjs";

// A minimal 1x1 transparent PNG image buffer
const pngBuffer = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=",
  "base64"
);

async function run() {
  const envPath = resolve("../../apps/api/.env");
  const envContent = await readFile(envPath, "utf-8");
  
  const env = {};
  for (const line of envContent.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const parts = trimmed.split("=");
    if (parts.length >= 2) {
      const key = parts[0].trim();
      const val = parts.slice(1).join("=").trim().replace(/^['"]|['"]$/g, "");
      env[key] = val;
    }
  }

  console.log("=== Initializing codebase ObjectStorage client ===");
  const storage = createObjectStorage(env);
  console.log(`Configured Provider: ${storage.provider}`);

  const testKey = `clean-media/verification-test-image-${Date.now()}.png`;

  console.log(`\n=== 1. Uploading PNG image to path: ${testKey} ===`);
  try {
    await storage.putObject({
      area: "clean-media",
      key: testKey,
      body: pngBuffer,
      contentType: "image/png",
      sha256: null
    });
    console.log("Success: Image uploaded to Backblaze B2.");
  } catch (error) {
    console.error("Upload failed:", error.message);
    if (error.Code) console.error("Error Code:", error.Code);
    return;
  }

  console.log("\n=== 2. Verifying object metadata (HeadObject) ===");
  try {
    const metadata = await storage.headObject({
      area: "clean-media",
      key: testKey
    });
    console.log("Success: Metadata retrieved.");
    console.log(`Byte Size: ${metadata.byteSize} bytes (Expected: ${pngBuffer.length} bytes)`);
  } catch (error) {
    console.error("Metadata verification failed:", error.message);
  }

  console.log("\n=== 3. Retrieving image bytes from B2 (GetObject) ===");
  try {
    const retrieved = await storage.getObject({
      area: "clean-media",
      key: testKey
    });
    console.log("Success: Retrieval completed.");
    if (retrieved.equals(pngBuffer)) {
      console.log("VERIFIED: Retrieved image bytes match the uploaded image perfectly!");
    } else {
      console.error("ERROR: Image byte mismatch!");
    }
  } catch (error) {
    console.error("Retrieval failed:", error.message);
  }

  console.log("\n=== 4. Deleting test image from B2 (DeleteObject) ===");
  try {
    await storage.deleteObject({
      area: "clean-media",
      key: testKey
    });
    console.log("Success: Image deleted from Backblaze B2.");
  } catch (error) {
    console.error("Deletion failed:", error.message);
  }
}

run().catch(console.error);
