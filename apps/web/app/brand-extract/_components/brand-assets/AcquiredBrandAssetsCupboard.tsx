import { Plus, Trash2 } from "lucide-react";
import { SecureArtifactThumbnail, type SecureArtifactThumbnailStatus } from "./SecureArtifactThumbnail";

type BrandAssetShelfRow = {
  id: string;
  name: string;
  category: string;
  provenance: string;
  rights: string;
  previewClassName?: string;
};

export type AcquiredBrandAsset = BrandAssetShelfRow & (
  | {
      artifactReference: `artifact:${string}`;
      sourceReference?: never;
      status: Exclude<SecureArtifactThumbnailStatus, "rejected">;
    }
  | {
      artifactReference?: never;
      sourceReference: string;
      status: "rejected";
    }
);

export type AcquiredBrandAssetsCupboardProps = {
  assets: AcquiredBrandAsset[];
  onAdd: () => void;
  onRemove: (assetId: string) => void;
};

export function AcquiredBrandAssetsCupboard({ assets, onAdd, onRemove }: AcquiredBrandAssetsCupboardProps) {
  return (
    <section aria-labelledby="acquired-assets-title" className="rounded-2xl border border-white/10 bg-black/30 p-4 backdrop-blur-xl sm:p-5">
      <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-violet-300">Private library</p>
          <h2 id="acquired-assets-title" className="mt-1 text-lg font-semibold text-white">Acquired brand assets</h2>
          <p className="mt-1 max-w-xl text-xs leading-5 text-zinc-400">
            Retained files stay distinct from remote source candidates. Move sideways to review every shelf field.
          </p>
        </div>
        <button
          type="button"
          onClick={onAdd}
          className="inline-flex min-h-10 items-center gap-2 rounded-full border border-violet-300/30 bg-violet-400/10 px-4 text-xs font-semibold text-violet-100 outline-none hover:bg-violet-400/20 focus-visible:ring-2 focus-visible:ring-violet-300"
        >
          <Plus aria-hidden="true" className="h-4 w-4" />
          Add asset
        </button>
      </div>

      <div className="overflow-x-auto rounded-xl border border-white/10" role="region" aria-label="Acquired brand assets cupboard" tabIndex={0}>
        <div className="min-w-[820px]">
          <div className="grid grid-cols-[148px_170px_120px_180px_150px_52px] gap-3 border-b border-white/10 bg-white/[0.035] px-3 py-2 text-[10px] font-semibold uppercase tracking-[0.15em] text-zinc-500">
            <span>Preview</span><span>Asset</span><span>Category</span><span>Provenance</span><span>Rights</span><span className="sr-only">Actions</span>
          </div>
          {assets.length === 0 ? (
            <div className="flex min-h-36 items-center justify-center px-6 text-sm text-zinc-400">No retained assets yet.</div>
          ) : (
            assets.map((asset) => (
              <div key={asset.id} className="grid grid-cols-[148px_170px_120px_180px_150px_52px] items-center gap-3 border-b border-white/[0.07] px-3 py-3 last:border-b-0 hover:bg-white/[0.025]">
                <SecureArtifactThumbnail
                  {...(asset.status === "rejected" ? { status: asset.status } : { artifactReference: asset.artifactReference, status: asset.status, previewOnly: true as const })}
                  label={asset.name}
                  previewClassName={asset.previewClassName}
                />
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium text-zinc-100">{asset.name}</p>
                  <p className="mt-1 font-mono text-[10px] text-zinc-500">
                    {asset.status === "rejected" ? asset.sourceReference : `${asset.artifactReference.slice(0, 18)}…`}
                  </p>
                </div>
                <span className="w-fit rounded-full border border-white/10 bg-white/5 px-2.5 py-1 text-[11px] text-zinc-300">{asset.category}</span>
                <p className="text-xs leading-5 text-zinc-400">{asset.provenance}</p>
                <p className="text-xs leading-5 text-zinc-400">{asset.rights}</p>
                <button
                  type="button"
                  onClick={() => onRemove(asset.id)}
                  aria-label={`Remove ${asset.name}`}
                  className="inline-flex h-9 w-9 items-center justify-center rounded-full text-zinc-500 outline-none hover:bg-rose-400/10 hover:text-rose-300 focus-visible:ring-2 focus-visible:ring-rose-300"
                >
                  <Trash2 aria-hidden="true" className="h-4 w-4" />
                </button>
              </div>
            ))
          )}
        </div>
      </div>
    </section>
  );
}
