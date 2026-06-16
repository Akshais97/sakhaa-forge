import { readFile } from "node:fs/promises";

const schema = await readFile("packages/db/prisma/schema.prisma", "utf8");

if (!schema.includes("provider = \"postgresql\"")) {
  throw new Error("Prisma datasource must use PostgreSQL.");
}

if (schema.includes("model Workspace") || schema.includes("model User")) {
  throw new Error("V0-F0 must not introduce speculative product tables.");
}

console.log("Database contract valid for V0-F0.");
