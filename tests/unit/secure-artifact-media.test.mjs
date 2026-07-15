import test from "node:test";
import assert from "node:assert/strict";
import {
  parseArtifactReference,
  requestArtifactDownload
} from "../../apps/web/app/brand-extract/_components/brand-assets/secure-artifact-media.ts";

const artifactReference = "artifact:f33971d6-61aa-4d42-8ce1-58d00cdd15cd";

test("private artifact references are parsed without treating arbitrary URLs as artifacts", () => {
  assert.equal(parseArtifactReference(artifactReference), "f33971d6-61aa-4d42-8ce1-58d00cdd15cd");
  assert.equal(parseArtifactReference("https://example.com/logo.png"), null);
  assert.equal(parseArtifactReference("artifact:not-a-uuid"), null);
});

test("private artifact downloads are minted for the active workspace", async () => {
  const calls = [];
  const fakeClient = {
    async createArtifactDownload(id, input) {
      calls.push({ id, input });
      return {
        status: 200,
        body: {
          download: {
            url: "https://signed.invalid/object",
            expiresAt: "2030-01-01T00:00:00.000Z"
          }
        }
      };
    }
  };

  const result = await requestArtifactDownload(fakeClient, artifactReference, "workspace-a");

  assert.deepEqual(result, {
    url: "https://signed.invalid/object",
    expiresAt: "2030-01-01T00:00:00.000Z"
  });
  assert.deepEqual(calls, [{
    id: "f33971d6-61aa-4d42-8ce1-58d00cdd15cd",
    input: { workspaceId: "workspace-a" }
  }]);
});

test("tenant-hidden and malformed download responses become stable media errors", async () => {
  await assert.rejects(
    requestArtifactDownload({
      async createArtifactDownload() {
        return { status: 404, body: { detail: "We could not find that item." } };
      }
    }, artifactReference, "workspace-a"),
    { message: "ARTIFACT_UNAVAILABLE" }
  );

  await assert.rejects(
    requestArtifactDownload({
      async createArtifactDownload() {
        return { status: 200, body: { download: {} } };
      }
    }, artifactReference, "workspace-a"),
    { message: "ARTIFACT_DOWNLOAD_FAILED" }
  );
});
