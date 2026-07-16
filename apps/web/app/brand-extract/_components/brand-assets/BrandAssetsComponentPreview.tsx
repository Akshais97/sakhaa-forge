"use client";

import { CheckCircle2, Eye, RotateCcw } from "lucide-react";
import { useMemo, useState } from "react";
import { AcquiredBrandAssetsCupboard, type AcquiredBrandAsset } from "./AcquiredBrandAssetsCupboard";
import { BrandIntakeStepDeck, type BrandIntakeStep } from "./BrandIntakeStepDeck";
import { LiquidEtherBackground } from "./LiquidEtherBackground";
import { SecureArtifactThumbnail } from "./SecureArtifactThumbnail";

const initialAssets: AcquiredBrandAsset[] = [
  {
    id: "logo-primary",
    artifactReference: "artifact:f33971d6-61aa-4d42-8ce1-58d00cdd15cd",
    name: "Primary logo",
    category: "Logo",
    provenance: "Client upload · clean artifact",
    rights: "Owner-approved use",
    status: "ready",
    selected: true,
    previewClassName: "bg-[linear-gradient(135deg,#111827,#4338ca)]",
  },
  {
    id: "property-hero",
    artifactReference: "artifact:199eaf81-f100-4c18-9c53-74e80466b53a",
    name: "Property hero",
    category: "Photography",
    provenance: "Website acquisition · retained",
    rights: "Website evidence retained",
    status: "loading",
    selected: true,
  },
  {
    id: "source-mark",
    sourceReference: "source:invalid-logo",
    name: "Source mark",
    category: "Candidate",
    provenance: "Malformed source URL",
    rights: "Not acquired",
    status: "rejected",
    selected: false,
  },
];

export function BrandAssetsComponentPreview() {
  const [assets, setAssets] = useState(initialAssets);
  const [activeStep, setActiveStep] = useState(2);
  const [staticBackground, setStaticBackground] = useState(false);

  const steps = useMemo<BrandIntakeStep[]>(() => [
    { id: "source", label: "Source", eyebrow: "Step 1 of 4", title: "Confirm permitted sources", description: "Only permitted URLs and client-owned uploads enter extraction.", content: <PreviewPlaceholder label="Source permissions retained" /> },
    { id: "evidence", label: "Evidence", eyebrow: "Step 2 of 4", title: "Review extracted evidence", description: "Candidate truth remains separate from approved truth.", content: <PreviewPlaceholder label="Evidence review complete" /> },
    { id: "assets", label: "Assets", eyebrow: "Step 3 of 4", title: "Build the acquired asset library", description: "Review retained private files shelf by shelf. Rejected source candidates remain visible as evidence, not as stored assets.", content: <AcquiredBrandAssetsCupboard assets={assets} renderThumbnail={asset => <SecureArtifactThumbnail {...(asset.status === "rejected" ? { status: "rejected" as const } : { artifactReference: asset.artifactReference, status: asset.selected ? asset.status : "removed" as const, previewOnly: true as const })} label={asset.name} previewClassName={asset.previewClassName} />} onAdd={() => setAssets((current) => [...current, createPreviewAsset(current.length)])} onRemove={(assetId) => setAssets((current) => current.map(asset => asset.id === assetId ? { ...asset, selected: false } : asset))} onRestore={(assetId) => setAssets((current) => current.map(asset => asset.id === assetId ? { ...asset, selected: true } : asset))} /> },
    { id: "confirm", label: "Confirm", eyebrow: "Step 4 of 4", title: "Confirm exact approved truth", description: "Approval remains a server-confirmed action with no optimistic success.", content: <PreviewPlaceholder label="Ready for authorized approval" /> },
  ], [assets]);

  const advance = () => setActiveStep((current) => Math.min(steps.length - 1, current + 1));

  return (
    <main className="relative min-h-dvh overflow-hidden bg-[#050507] px-4 py-8 text-zinc-100 sm:px-6">
      <LiquidEtherBackground staticFallback={staticBackground} />
      <div className="relative z-10 mx-auto mb-5 flex w-full max-w-6xl flex-wrap items-center justify-between gap-3 rounded-2xl border border-white/10 bg-black/25 px-4 py-3 backdrop-blur-xl">
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-violet-300">Reusable component review</p>
          <p className="mt-1 text-sm text-zinc-300">Brand intake step deck and acquired asset cupboard</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button type="button" onClick={() => setStaticBackground((value) => !value)} className="inline-flex min-h-9 items-center gap-2 rounded-full border border-white/10 bg-white/5 px-3 text-xs text-zinc-300 outline-none hover:bg-white/10 focus-visible:ring-2 focus-visible:ring-violet-300">
            <Eye aria-hidden="true" className="h-3.5 w-3.5" /> {staticBackground ? "Show Liquid Ether" : "Use static fallback"}
          </button>
          <button type="button" onClick={() => { setAssets(initialAssets); setActiveStep(2); }} className="inline-flex min-h-9 items-center gap-2 rounded-full border border-white/10 bg-white/5 px-3 text-xs text-zinc-300 outline-none hover:bg-white/10 focus-visible:ring-2 focus-visible:ring-violet-300">
            <RotateCcw aria-hidden="true" className="h-3.5 w-3.5" /> Reset preview
          </button>
        </div>
      </div>
      <div className="relative z-10">
        <BrandIntakeStepDeck steps={steps} activeStep={activeStep} canAdvance={true} onStepChange={setActiveStep} onAdvance={advance} />
      </div>
    </main>
  );
}

function PreviewPlaceholder({ label }: { label: string }) {
  return <div className="flex min-h-64 items-center justify-center rounded-2xl border border-dashed border-white/10 bg-white/[0.025] text-sm text-zinc-400"><CheckCircle2 aria-hidden="true" className="mr-2 h-5 w-5 text-emerald-300" />{label}</div>;
}

function createPreviewAsset(index: number): AcquiredBrandAsset {
  return {
    id: `new-asset-${index}`,
    artifactReference: `artifact:preview-${String(index).padStart(4, "0")}`,
    name: `New retained asset ${index + 1}`,
    category: "Uploaded",
    provenance: "Preview-only client upload",
    rights: "Awaiting confirmation",
    status: "unavailable",
    selected: true,
    previewClassName: "bg-[linear-gradient(135deg,#164e63,#312e81)]",
  };
}
