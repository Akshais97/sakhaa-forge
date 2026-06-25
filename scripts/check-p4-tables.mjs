import { loadEnvFile } from "node:process";
import { PrismaClient } from "../packages/db/generated/client/index.js";

try {
  loadEnvFile("apps/api/.env");
} catch (error) {
  if (error?.code !== "ENOENT") {
    throw error;
  }
}

const prisma = new PrismaClient();

try {
  const expected = ["video_blueprints", "blueprint_scenes"];
  const rows = await prisma.$queryRaw`
    SELECT table_name
    FROM information_schema.tables
    WHERE table_schema = 'public'
      AND table_name IN ('video_blueprints', 'blueprint_scenes')
    ORDER BY table_name
  `;
  const found = rows.map((row) => row.table_name);
  const missing = expected.filter((table) => !found.includes(table));
  if (missing.length > 0) {
    throw new Error(`Missing P4 tables: ${missing.join(", ")}`);
  }
  console.log(`P4 tables exist; P2021 clear: ${found.join(", ")}`);
} finally {
  await prisma.$disconnect();
}
