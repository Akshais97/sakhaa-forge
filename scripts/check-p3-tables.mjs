import { readFileSync } from "node:fs";
import { PrismaClient } from "../packages/db/generated/client/index.js";

try {
  for (const line of readFileSync("apps/api/.env", "utf8").split(/\r?\n/)) {
    const match = line.match(/^([^#=]+)=(.*)$/);
    if (match && !process.env[match[1].trim()]) {
      process.env[match[1].trim()] = match[2].trim().replace(/^['"]|['"]$/g, "");
    }
  }
} catch (error) {
  if (error?.code !== "ENOENT") {
    throw error;
  }
}

const expected = ["media_acquisitions", "thumbnail_blueprints"];
const prisma = new PrismaClient();

try {
  const rows = await prisma.$queryRaw`
    SELECT table_name
    FROM information_schema.tables
    WHERE table_schema = 'public'
      AND table_name IN ('media_acquisitions', 'thumbnail_blueprints')
    ORDER BY table_name
  `;
  const found = rows.map((row) => row.table_name);
  const missing = expected.filter((table) => !found.includes(table));
  if (missing.length > 0) {
    throw new Error(`Missing P3 tables: ${missing.join(", ")}`);
  }
  console.log(`P3 tables exist; P2021 clear: ${found.join(", ")}`);
} finally {
  await prisma.$disconnect();
}
