"use client";

import { FileImage, LoaderCircle, ShieldCheck, TriangleAlert, XCircle } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  requestArtifactDownload,
  type ArtifactDownloadClient
} from "./secure-artifact-media";

export type SecureArtifactThumbnailStatus = "loading" | "ready" | "unavailable" | "rejected" | "removed";

type BaseThumbnailProps = {
  label: string;
  previewClassName?: string;
};

type AuthorizedThumbnailProps = BaseThumbnailProps & {
  artifactReference: `artifact:${string}`;
  status: "loading" | "ready" | "unavailable";
  workspaceId: string;
  client: ArtifactDownloadClient;
  previewOnly?: false;
};

type PreviewThumbnailProps = BaseThumbnailProps & {
  artifactReference: `artifact:${string}`;
  status: "loading" | "ready" | "unavailable";
  previewOnly: true;
  workspaceId?: never;
  client?: never;
};

type NonRetainedThumbnailProps = BaseThumbnailProps & {
  artifactReference?: `artifact:${string}`;
  status: "rejected" | "removed";
  previewOnly?: boolean;
  workspaceId?: never;
  client?: never;
};

export type SecureArtifactThumbnailProps = AuthorizedThumbnailProps | PreviewThumbnailProps | NonRetainedThumbnailProps;

type MediaState = "authorizing" | "ready" | "retrying" | "unavailable" | "rejected" | "removed";

const stateCopy: Record<MediaState, string> = {
  authorizing: "Authorizing preview",
  ready: "Private asset ready",
  retrying: "Refreshing preview",
  unavailable: "Preview unavailable",
  rejected: "Source rejected",
  removed: "Removed from profile"
};

export function SecureArtifactThumbnail(props: SecureArtifactThumbnailProps) {
  const {
    artifactReference,
    label,
    status,
    previewClassName = "bg-[linear-gradient(135deg,#312e81,#0891b2)]"
  } = props;
  const previewOnly = props.previewOnly === true;
  const client = "client" in props ? props.client : undefined;
  const workspaceId = "workspaceId" in props ? props.workspaceId : undefined;
  const [signedUrl, setSignedUrl] = useState<string | null>(null);
  const [mediaState, setMediaState] = useState<MediaState>(() => initialMediaState(status));
  const retryAttempted = useRef(false);
  const artifactId = artifactReference?.slice("artifact:".length);

  const authorize = useCallback(async (pendingState: "authorizing" | "retrying") => {
    if (previewOnly || status !== "ready" || !artifactReference || !client || !workspaceId) {
      return;
    }
    setSignedUrl(null);
    setMediaState(pendingState);
    try {
      const download = await requestArtifactDownload(client, artifactReference, workspaceId);
      setSignedUrl(download.url);
      setMediaState("ready");
    } catch {
      setSignedUrl(null);
      setMediaState("unavailable");
    }
  }, [artifactReference, client, previewOnly, status, workspaceId]);

  useEffect(() => {
    retryAttempted.current = false;
    setSignedUrl(null);
    if (previewOnly || status !== "ready") {
      setMediaState(initialMediaState(status));
      return;
    }
    void authorize("authorizing");
  }, [authorize, previewOnly, status]);

  const handleMediaFailure = () => {
    if (retryAttempted.current) {
      setSignedUrl(null);
      setMediaState("unavailable");
      return;
    }
    retryAttempted.current = true;
    void authorize("retrying");
  };

  return (
    <figure className="group relative flex h-24 w-32 shrink-0 overflow-hidden rounded-xl border border-white/10 bg-zinc-950">
      {mediaState === "ready" && signedUrl ? (
        <img src={signedUrl} alt={label} onError={handleMediaFailure} className="h-full w-full object-cover" />
      ) : mediaState === "ready" && previewOnly ? (
        <div role="img" aria-label={`${label} preview`} className={`flex h-full w-full items-center justify-center ${previewClassName}`}>
          <span className="rounded-md bg-black/45 px-2 py-1 text-[10px] font-semibold uppercase tracking-[0.16em] text-white">
            {label.split(" ")[0]}
          </span>
        </div>
      ) : (
        <div aria-live="polite" className="flex h-full w-full flex-col items-center justify-center gap-2 px-2 text-center text-zinc-400">
          {(mediaState === "authorizing" || mediaState === "retrying") && <LoaderCircle aria-hidden="true" className="h-5 w-5 animate-spin" />}
          {mediaState === "unavailable" && <TriangleAlert aria-hidden="true" className="h-5 w-5 text-amber-300" />}
          {(mediaState === "rejected" || mediaState === "removed") && <XCircle aria-hidden="true" className="h-5 w-5 text-rose-300" />}
          <span className="text-[10px] leading-tight">{stateCopy[mediaState]}</span>
        </div>
      )}
      <figcaption className="sr-only">
        {label}. {stateCopy[mediaState]}. {artifactId ? `Private artifact ending ${artifactId.slice(-6)}.` : "No artifact was retained."}
      </figcaption>
      <span className="absolute right-1.5 top-1.5 rounded-full bg-black/55 p-1 text-emerald-300" title="Authorized private artifact">
        {mediaState === "ready" ? <ShieldCheck aria-hidden="true" className="h-3 w-3" /> : <FileImage aria-hidden="true" className="h-3 w-3" />}
      </span>
    </figure>
  );
}

function initialMediaState(status: SecureArtifactThumbnailStatus): MediaState {
  if (status === "loading") return "authorizing";
  return status;
}
