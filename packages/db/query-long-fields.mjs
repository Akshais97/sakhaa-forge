import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { PrismaClient } from "./generated/client/index.js";

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

  process.env.DATABASE_URL = env.DATABASE_URL;

  const prisma = new PrismaClient({
    datasources: {
      db: {
        url: env.DATABASE_URL
      }
    }
  });

  try {
    console.log("=== Checking BrandProfile Names ===");
    // check names in brand_profiles
    const profiles = await prisma.$queryRaw`
      SELECT id, brand_id, length(profile->>'name') as len, profile->>'name' as name
      FROM brand_profiles
      WHERE length(profile->>'name') > 200;
    `;
    console.log("Profiles with name > 200 chars:", profiles);

    console.log("\n=== Checking BrandCrawlRun URLs ===");
    // check calculated brand names from brand_crawl_runs
    const crawlRuns = await prisma.$queryRaw`
      SELECT id, normalized_url, 
             length(initcap(split_part(split_part(regexp_replace(normalized_url, '^https?://', ''), '/', 1), '.', 1))) as name_len,
             initcap(split_part(split_part(regexp_replace(normalized_url, '^https?://', ''), '/', 1), '.', 1)) as name
      FROM brand_crawl_runs
      WHERE length(initcap(split_part(split_part(regexp_replace(normalized_url, '^https?://', ''), '/', 1), '.', 1))) > 200;
    `;
    console.log("Crawl runs resulting in name > 200 chars:", crawlRuns);

    console.log("\n=== Checking calculated normalized_domain ===");
    const domains = await prisma.$queryRaw`
      SELECT id, normalized_url,
             length(lower(split_part(regexp_replace(normalized_url, '^https?://', ''), '/', 1))) as dom_len,
             lower(split_part(regexp_replace(normalized_url, '^https?://', ''), '/', 1)) as dom
      FROM brand_crawl_runs
      WHERE length(lower(split_part(regexp_replace(normalized_url, '^https?://', ''), '/', 1))) > 253;
    `;
    console.log("Crawl runs resulting in domain > 253 chars:", domains);

  } catch (error) {
    console.error("DB Query Failed:", error);
  } finally {
    await prisma.$disconnect();
  }
}

run().catch(console.error);
