const ARTIFACT_REFERENCE = /^artifact:([0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12})$/i;

export type ArtifactDownloadClient = {
  createArtifactDownload(
    artifactId: string,
    input: { workspaceId: string }
  ): Promise<{ status: number; body: unknown }>;
};

export type AuthorizedArtifactDownload = {
  url: string;
  expiresAt: string;
};

export function parseArtifactReference(reference: string): string | null {
  return ARTIFACT_REFERENCE.exec(reference.trim())?.[1] ?? null;
}

export async function requestArtifactDownload(
  client: ArtifactDownloadClient,
  reference: string,
  workspaceId: string
): Promise<AuthorizedArtifactDownload> {
  const artifactId = parseArtifactReference(reference);
  if (!artifactId) throw new Error("ARTIFACT_REFERENCE_INVALID");

  const response = await client.createArtifactDownload(artifactId, { workspaceId });
  const body = response.body as { download?: { url?: unknown; expiresAt?: unknown } };
  if (response.status !== 200) {
    throw new Error(response.status === 404 ? "ARTIFACT_UNAVAILABLE" : "ARTIFACT_DOWNLOAD_FAILED");
  }
  if (typeof body.download?.url !== "string" || typeof body.download.expiresAt !== "string") {
    throw new Error("ARTIFACT_DOWNLOAD_FAILED");
  }

  return {
    url: body.download.url,
    expiresAt: body.download.expiresAt
  };
}
