import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

test("F3 Prisma schema defines Artifact and InboxEvent tenant-owned records", async () => {
  const schema = await readFile("packages/db/prisma/schema.prisma", "utf8");

  assert.match(schema, /enum AssetTrustStatus \{\s*QUARANTINED\s+VALIDATING\s+CLEAN\s+REJECTED\s+DELETED\s+@@map\("asset_trust_status"\)\s*\}/);
  assert.match(schema, /model Artifact \{/);
  assert.match(schema, /workspaceId\s+String\s+@map\("workspace_id"\) @db\.Uuid/);
  assert.match(schema, /sha256\s+String\s+@db\.Char\(64\)/);
  assert.match(schema, /retentionClass\s+String\s+@map\("retention_class"\)/);
  assert.match(schema, /model InboxEvent \{/);
});

test("F3 migration protects artifacts and inbox events with RLS", async () => {
  const migration = await readFile(
    "packages/db/prisma/migrations/0003_v0_f3_artifacts_inbox_events/migration.sql",
    "utf8"
  );

  assert.match(migration, /CREATE TYPE asset_trust_status/);
  assert.match(migration, /CREATE TABLE artifacts/);
  assert.match(migration, /CREATE TABLE inbox_events/);
  assert.match(migration, /ALTER TABLE artifacts ENABLE ROW LEVEL SECURITY;/);
  assert.match(migration, /ALTER TABLE inbox_events ENABLE ROW LEVEL SECURITY;/);
  assert.match(migration, /CREATE POLICY artifacts_workspace_isolation/);
  assert.match(migration, /CREATE POLICY inbox_events_workspace_isolation/);
  assert.doesNotMatch(migration, /BYPASSRLS/i);
});
