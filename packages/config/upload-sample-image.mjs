import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { createObjectStorage } from "./src/storage.mjs";

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

  const storage = createObjectStorage(env);

  const localImagePath = "C:/Users/askhai/.gemini/antigravity/brain/b9ad6051-456b-48ca-950b-a137c9a42a88/aura_estates_logo_1784127921921.png";
  const imageBuffer = await readFile(localImagePath);

  const targetKey = "clean-media/aura_estates_logo.png";

  console.log(`=== Uploading Real-Estate Logo to B2 clean-media bucket ===`);
  console.log(`Target Key: ${targetKey}`);
  console.log(`File Size: ${(imageBuffer.length / 1024).toFixed(2)} KB`);

  try {
    await storage.putObject({
      area: "clean-media",
      key: targetKey,
      body: imageBuffer,
      contentType: "image/png",
      sha256: null
    });
    console.log("SUCCESS: Logo uploaded and retained in your Backblaze B2 bucket!");

    console.log("\n=== Generating Presigned B2 Download URL ===");
    const downloadUrl = await storage.createSignedDownloadUrl({
      area: "clean-media",
      key: targetKey
    });
    console.log(`Signed View URL:\n${downloadUrl}`);

  } catch (error) {
    console.error("Upload failed:", error);
  }
}

run().catch(console.error);
