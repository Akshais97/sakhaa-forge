"use client";

import {
  CheckCircle2, Eye, RotateCcw, ArrowRight, ShieldCheck, Database,
  Megaphone, Palette, Bookmark, XOctagon, ShieldAlert, Plus, Trash2
} from "lucide-react";
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
  const [activeStep, setActiveStep] = useState(3);
  const [staticBackground, setStaticBackground] = useState(false);

  // Mock Step 7 State for interactive fields preview
  const [mockDraft, setMockDraft] = useState({
    name: { public: "Aster Heights", legal: "Aster Heights Real Estate Pvt Ltd" },
    industry: "Real Estate",
    markets: "Mumbai, Pune, Dubai",
    positioning: {
      statement: "Premium residential villas with scenic hill views and private infinity pools.",
      differentiators: [
        "Hilltop private villas",
        "Zero processing fee",
        "24/7 concierge services"
      ]
    },
    visual_identity: {
      logos: ["https://placehold.co/120x80/09090b/a3e635?text=Aster+Heights"],
      colors: [
        { role: "Primary", value: "#A3E635" },
        { role: "Secondary", value: "#10B981" },
        { role: "Background", value: "#0B0A09" }
      ],
      fonts: { heading: "Space Grotesk", primary: "Inter", code: "JetBrains Mono" },
      media_assets: [
        { locator: "https://images.unsplash.com/photo-1600585154340-be6161a56a0c?auto=format&fit=crop&w=300&q=80", category: "Project photo" },
        { locator: "https://images.unsplash.com/photo-1600607687939-ce8a6c25118c?auto=format&fit=crop&w=300&q=80", category: "Lifestyle banner" }
      ]
    },
    voice: {
      formality: "balanced" as "formal" | "balanced" | "conversational",
      languages: "English, Hindi",
      attributes: ["premium", "professional", "warm"]
    },
    products: [
      { title: "Aster Villas (4BHK)", description: "Luxury hilltop villas" }
    ],
    calls_to_action: [
      { label: "Schedule site visit" }
    ],
    rules: {
      required_phrases: ["RERA Registration No. P5123456789"],
      prohibited_phrases: ["Cheap EMI options", "Immediate discount"]
    },
    reviewerSignature: "Rohan Malhotra",
    approvalStatus: {
      version: 1,
      timestamp: "2026-07-18T13:20:00Z",
      approvalId: "app-923f1-d82f"
    }
  });

  const steps = useMemo<BrandIntakeStep[]>(() => [
    { id: "source", label: "Source", eyebrow: "Step 1 of 4", title: "Confirm permitted sources", description: "Only permitted URLs and client-owned uploads enter extraction.", content: <PreviewPlaceholder label="Source permissions retained" /> },
    { id: "evidence", label: "Evidence", eyebrow: "Step 2 of 4", title: "Review extracted evidence", description: "Candidate truth remains separate from approved truth.", content: <PreviewPlaceholder label="Evidence review complete" /> },
    { id: "assets", label: "Assets", eyebrow: "Step 3 of 4", title: "Build the acquired asset library", description: "Review retained private files shelf by shelf. Rejected source candidates remain visible as evidence, not as stored assets.", content: <AcquiredBrandAssetsCupboard assets={assets} renderThumbnail={asset => <SecureArtifactThumbnail {...(asset.status === "rejected" ? { status: "rejected" as const } : { artifactReference: asset.artifactReference, status: asset.selected ? asset.status : "removed" as const, previewOnly: true as const })} label={asset.name} previewClassName={asset.previewClassName} />} onAdd={() => setAssets((current) => [...current, createPreviewAsset(current.length)])} onRemove={(assetId) => setAssets((current) => current.map(asset => asset.id === assetId ? { ...asset, selected: false } : asset))} onRestore={(assetId) => setAssets((current) => current.map(asset => asset.id === assetId ? { ...asset, selected: true } : asset))} /> },
    { id: "confirm", label: "Redesigned Success Dashboard", eyebrow: "Step 4 of 4", title: "Step 7 Success Dashboard Overhaul Preview", description: "Interactive mockup showing exact approved fields and visual styling for reel creation pipelines.", content: (
      <div className="grid grid-cols-1 xl:grid-cols-12 gap-6 items-start">
        
        {/* INTERACTIVE CONTROLS (Left/Top) */}
        <div className="xl:col-span-4 bg-zinc-950/60 rounded-2xl border border-white/10 p-5 space-y-4 font-sans text-xs text-left">
          <div className="border-b border-white/5 pb-2">
            <span className="text-[10px] font-mono text-zinc-500 uppercase tracking-widest block">Interactive Sandbox</span>
            <h5 className="text-sm font-medium text-white mt-0.5">Edit Fields in Real Time</h5>
          </div>

          <div className="space-y-3">
            <div>
              <label className="block text-[9px] font-mono text-zinc-400 uppercase mb-1">Public Brand Name</label>
              <input
                type="text"
                value={mockDraft.name.public}
                onChange={(e) => setMockDraft(prev => ({ ...prev, name: { ...prev.name, public: e.target.value } }))}
                className="w-full rounded border border-white/15 bg-black/40 px-2.5 py-1.5 text-white focus:border-violet-500/50 outline-none"
              />
            </div>

            <div>
              <label className="block text-[9px] font-mono text-zinc-400 uppercase mb-1">Positioning Statement</label>
              <textarea
                value={mockDraft.positioning.statement}
                rows={2}
                onChange={(e) => setMockDraft(prev => ({ ...prev, positioning: { ...prev.positioning, statement: e.target.value } }))}
                className="w-full rounded border border-white/15 bg-black/40 px-2.5 py-1.5 text-white focus:border-violet-500/50 outline-none resize-none"
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-[9px] font-mono text-zinc-400 uppercase mb-1">Primary Color</label>
                <div className="flex gap-1">
                  <input
                    type="color"
                    value={mockDraft.visual_identity.colors[0].value}
                    onChange={(e) => setMockDraft(prev => {
                      const colors = [...prev.visual_identity.colors];
                      colors[0] = { ...colors[0], value: e.target.value };
                      return { ...prev, visual_identity: { ...prev.visual_identity, colors } };
                    })}
                    className="h-7 w-7 rounded border border-white/10 bg-transparent cursor-pointer p-0"
                  />
                  <input
                    type="text"
                    value={mockDraft.visual_identity.colors[0].value}
                    onChange={(e) => setMockDraft(prev => {
                      const colors = [...prev.visual_identity.colors];
                      colors[0] = { ...colors[0], value: e.target.value };
                      return { ...prev, visual_identity: { ...prev.visual_identity, colors } };
                    })}
                    className="w-full rounded border border-white/15 bg-black/40 px-1 text-center font-mono"
                  />
                </div>
              </div>

              <div>
                <label className="block text-[9px] font-mono text-zinc-400 uppercase mb-1">Secondary Color</label>
                <div className="flex gap-1">
                  <input
                    type="color"
                    value={mockDraft.visual_identity.colors[1].value}
                    onChange={(e) => setMockDraft(prev => {
                      const colors = [...prev.visual_identity.colors];
                      colors[1] = { ...colors[1], value: e.target.value };
                      return { ...prev, visual_identity: { ...prev.visual_identity, colors } };
                    })}
                    className="h-7 w-7 rounded border border-white/10 bg-transparent cursor-pointer p-0"
                  />
                  <input
                    type="text"
                    value={mockDraft.visual_identity.colors[1].value}
                    onChange={(e) => setMockDraft(prev => {
                      const colors = [...prev.visual_identity.colors];
                      colors[1] = { ...colors[1], value: e.target.value };
                      return { ...prev, visual_identity: { ...prev.visual_identity, colors } };
                    })}
                    className="w-full rounded border border-white/15 bg-black/40 px-1 text-center font-mono"
                  />
                </div>
              </div>
            </div>

            <div>
              <label className="block text-[9px] font-mono text-zinc-400 uppercase mb-1">Required Slogan Overlay</label>
              <input
                type="text"
                value={mockDraft.rules.required_phrases[0]}
                onChange={(e) => setMockDraft(prev => ({
                  ...prev,
                  rules: { ...prev.rules, required_phrases: [e.target.value] }
                }))}
                className="w-full rounded border border-white/15 bg-black/40 px-2.5 py-1.5 text-white focus:border-violet-500/50 outline-none"
              />
            </div>

            <div>
              <label className="block text-[9px] font-mono text-zinc-400 uppercase mb-1">Prohibited Phrase</label>
              <input
                type="text"
                value={mockDraft.rules.prohibited_phrases[0]}
                onChange={(e) => setMockDraft(prev => ({
                  ...prev,
                  rules: { ...prev.rules, prohibited_phrases: [e.target.value] }
                }))}
                className="w-full rounded border border-white/15 bg-black/40 px-2.5 py-1.5 text-white focus:border-violet-500/50 outline-none"
              />
            </div>

            <div>
              <label className="block text-[9px] font-mono text-zinc-400 uppercase mb-1">Reviewer Name</label>
              <input
                type="text"
                value={mockDraft.reviewerSignature}
                onChange={(e) => setMockDraft(prev => ({ ...prev, reviewerSignature: e.target.value }))}
                className="w-full rounded border border-white/15 bg-black/40 px-2.5 py-1.5 text-white focus:border-violet-500/50 outline-none"
              />
            </div>
          </div>
        </div>

        {/* OVERHAULED SUCCESS DASHBOARD PREVIEW (Right/Bottom) */}
        <div className="xl:col-span-8 bg-zinc-950/40 rounded-2xl border border-white/10 p-6 space-y-6 text-left">
          
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-white/10 pb-4">
            <div className="flex items-center gap-3">
              <div className="flex h-12 w-12 items-center justify-center rounded-full bg-emerald-500/10 border border-emerald-500/20 text-emerald-400">
                <CheckCircle2 className="h-6 w-6 animate-pulse" />
              </div>
              <div className="leading-normal">
                <h4 className="text-xl font-display font-medium text-white">Brand Profile Approved & Synchronized</h4>
                <p className="text-xs text-zinc-400">
                  Version <strong className="text-white">v{mockDraft.approvalStatus.version}</strong> saved as the downstream production standard for ad/reel generation.
                </p>
              </div>
            </div>
            
            <div className="flex gap-3">
              <button
                type="button"
                className="px-4 py-2.5 rounded-lg border border-white/10 bg-white/2 hover:bg-white/5 text-xs font-mono text-zinc-300 hover:text-white"
              >
                Recrawl Website
              </button>
              <button
                type="button"
                className="px-6 py-2.5 rounded-lg text-xs font-mono font-semibold text-black uppercase tracking-wider transition-all hover:opacity-90 active:scale-95 flex items-center gap-1.5"
                style={{ backgroundColor: mockDraft.visual_identity.colors[0].value }}
              >
                Launch Video Pipeline <ArrowRight className="h-4 w-4" />
              </button>
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            
            {/* COLUMN 1: Visual Identity & Creative Ingredients */}
            <div className="space-y-4">
              
              {/* Core Identity */}
              <div className="rounded-xl border border-white/5 bg-zinc-950/40 p-4 space-y-2">
                <span className="block text-[9px] font-mono text-zinc-500 uppercase tracking-widest mb-1">Brand Identity</span>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <span className="text-[10px] text-zinc-400 block leading-tight">Public Name</span>
                    <span className="text-sm font-semibold text-white">{mockDraft.name.public}</span>
                  </div>
                  <div>
                    <span className="text-[10px] text-zinc-400 block leading-tight">Industry / Niche</span>
                    <span className="text-sm font-semibold text-white capitalize">{mockDraft.industry}</span>
                  </div>
                </div>
                <div>
                  <span className="text-[10px] text-zinc-400 block leading-tight font-medium">Target Markets</span>
                  <span className="text-xs text-zinc-300 font-mono">{mockDraft.markets}</span>
                </div>
              </div>

              {/* Visual Identity */}
              <div className="rounded-xl border border-white/5 bg-zinc-950/40 p-4 space-y-3">
                <span className="block text-[9px] font-mono text-zinc-500 uppercase tracking-widest mb-1">Visual identity</span>
                
                {/* Logos Shelf */}
                <div className="space-y-1.5">
                  <span className="text-[10px] text-zinc-400 block leading-tight font-medium">Approved Logos</span>
                  <div className="flex flex-wrap gap-3">
                    {mockDraft.visual_identity.logos.map((logo, idx) => (
                      <div key={idx} className="relative rounded-lg overflow-hidden border border-white/10 bg-zinc-950 w-24 h-20 flex items-center justify-center">
                        <img src={logo} alt={`Approved Logo ${idx + 1}`} className="h-full w-full object-contain p-1" />
                      </div>
                    ))}
                  </div>
                </div>

                {/* Swatches */}
                <div className="space-y-1.5 pt-1.5">
                  <span className="text-[10px] text-zinc-400 block leading-tight font-medium">Color Palette</span>
                  <div className="flex flex-wrap gap-2">
                    {mockDraft.visual_identity.colors.map((col, idx) => (
                      <div key={idx} className="flex items-center gap-1.5 bg-zinc-900/60 p-1.5 px-2.5 border border-white/5 rounded-lg">
                        <div className="h-4 w-4 rounded border border-white/20" style={{ backgroundColor: col.value }} />
                        <div className="leading-none flex flex-col">
                          <span className="text-[9px] font-mono text-zinc-400 uppercase">{col.role}</span>
                          <span className="text-[10px] font-mono text-white font-bold">{col.value}</span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Approved Images */}
                <div className="space-y-1.5 pt-2">
                  <span className="text-[10px] text-zinc-400 block leading-tight font-medium">Other Approved Images</span>
                  <div className="flex flex-wrap gap-2">
                    {mockDraft.visual_identity.media_assets.map((m, idx) => (
                      <div key={idx} className="relative rounded-lg overflow-hidden border border-white/10 bg-zinc-950 w-20 h-16 flex items-center justify-center" title={`Category: ${m.category}`}>
                        <img src={m.locator} alt={`Media ${idx + 1}`} className="h-full w-full object-cover" />
                      </div>
                    ))}
                  </div>
                </div>
              </div>

              {/* Core Positioning */}
              <div className="rounded-xl border border-white/5 bg-zinc-950/40 p-4 space-y-2">
                <span className="block text-[9px] font-mono text-zinc-500 uppercase tracking-widest mb-1">Core Positioning</span>
                <blockquote className="border-l-2 pl-3 py-1 text-sm text-zinc-200 italic" style={{ borderColor: mockDraft.visual_identity.colors[0].value }}>
                  "{mockDraft.positioning.statement}"
                </blockquote>
                
                <div className="pt-2 space-y-1">
                  <span className="text-[10px] text-zinc-400 block leading-tight font-medium">USPs / Differentiators</span>
                  <ul className="list-disc list-inside text-xs text-zinc-300 space-y-1">
                    {mockDraft.positioning.differentiators.map((diff, idx) => (
                      <li key={idx} className="truncate">{diff}</li>
                    ))}
                  </ul>
                </div>
              </div>
            </div>

            {/* COLUMN 2: Voice Guidelines & Reel Rules */}
            <div className="space-y-4">
              
              {/* Voice & Personality */}
              <div className="rounded-xl border border-white/5 bg-zinc-950/40 p-4 space-y-3">
                <span className="block text-[9px] font-mono text-zinc-500 uppercase tracking-widest mb-1">Voice & Personality</span>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <span className="text-[10px] text-zinc-400 block leading-tight font-medium">Formality Level</span>
                    <span className="text-xs font-semibold text-white capitalize">{mockDraft.voice.formality}</span>
                  </div>
                  <div>
                    <span className="text-[10px] text-zinc-400 block leading-tight font-medium">Languages</span>
                    <span className="text-xs font-semibold text-white">{mockDraft.voice.languages}</span>
                  </div>
                </div>
                
                <div className="space-y-1.5">
                  <span className="text-[10px] text-zinc-400 block leading-tight font-medium">Tone Attributes</span>
                  <div className="flex flex-wrap gap-1.5">
                    {mockDraft.voice.attributes.map((attr) => (
                      <span key={attr} className="px-2 py-0.5 rounded-full bg-white/5 border border-white/10 text-[10px] text-zinc-300">
                        {attr}
                      </span>
                    ))}
                  </div>
                </div>
              </div>

              {/* Offerings & CTAs */}
              <div className="rounded-xl border border-white/5 bg-zinc-950/40 p-4 space-y-3">
                <span className="block text-[9px] font-mono text-zinc-500 uppercase tracking-widest mb-1">Offerings & CTAs</span>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <span className="text-[10px] text-zinc-400 block leading-tight font-medium">Active Products</span>
                    <div className="space-y-1">
                      {mockDraft.products.map((p, idx) => (
                        <span key={idx} className="block text-xs text-white font-medium truncate">{p.title}</span>
                      ))}
                    </div>
                  </div>
                  <div>
                    <span className="text-[10px] text-zinc-400 block leading-tight font-medium">Approved CTAs</span>
                    <div className="space-y-1">
                      {mockDraft.calls_to_action.map((c, idx) => (
                        <span key={idx} className="block text-xs text-white font-medium truncate">{c.label}</span>
                      ))}
                    </div>
                  </div>
                </div>
              </div>

              {/* Rules & Claims */}
              <div className="rounded-xl border border-white/5 bg-zinc-950/40 p-4 space-y-3">
                <span className="block text-[9px] font-mono text-zinc-500 uppercase tracking-widest mb-1">Reel Guardrails & Compliance</span>
                
                <div>
                  <span className="text-[10px] text-zinc-400 block leading-tight font-medium">Required Phrases</span>
                  <div className="space-y-1">
                    {mockDraft.rules.required_phrases.map((p, idx) => (
                      <span key={idx} className="block text-xs text-zinc-300 font-mono">• "{p}"</span>
                    ))}
                  </div>
                </div>

                {mockDraft.rules.prohibited_phrases[0] && (
                  <div>
                    <span className="text-[10px] text-red-400 block leading-tight font-semibold">Prohibited Phrases</span>
                    <div className="space-y-1">
                      {mockDraft.rules.prohibited_phrases.map((p, idx) => (
                        <span key={idx} className="block text-xs text-red-300 font-mono">• "{p}"</span>
                      ))}
                    </div>
                  </div>
                )}
              </div>

              {/* Creative Ancestry Ledger */}
              <div className="p-4 bg-zinc-950/60 rounded-xl border border-white/5 text-left font-mono text-[10px] space-y-2">
                <div className="flex justify-between text-zinc-500 uppercase border-b border-white/5 pb-1.5">
                  <span>Creative Ancestry ledger sync</span>
                  <span className="text-emerald-400">STATUS: SYNCHRONIZED</span>
                </div>
                <p className="text-zinc-400">• <span className="text-zinc-500 uppercase">Approval Stamp:</span> <span className="text-white">{mockDraft.approvalStatus.timestamp}</span></p>
                <p className="text-zinc-400">• <span className="text-zinc-500 uppercase">Approval Record:</span> <span className="text-zinc-300 select-all">{mockDraft.approvalStatus.approvalId}</span></p>
                <p className="text-zinc-400">• <span className="text-zinc-500 uppercase">Signatory:</span> <span className="text-white italic">{mockDraft.reviewerSignature}</span></p>
              </div>

            </div>
          </div>
        </div>

      </div>
    ) },
  ], [assets, mockDraft]);

  const advance = () => setActiveStep((current) => Math.min(steps.length - 1, current + 1));

  return (
    <main className="relative min-h-dvh overflow-hidden bg-[#050507] px-4 py-8 text-zinc-100 sm:px-6">
      <LiquidEtherBackground staticFallback={staticBackground} />
      <div className="relative z-10 mx-auto mb-5 flex w-full max-w-7xl flex-wrap items-center justify-between gap-3 rounded-2xl border border-white/10 bg-black/25 px-4 py-3 backdrop-blur-xl">
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-violet-300">Reusable component review</p>
          <p className="mt-1 text-sm text-zinc-300">Brand Extraction Studio Overhauled Success Screen Preview</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button type="button" onClick={() => setStaticBackground((value) => !value)} className="inline-flex min-h-9 items-center gap-2 rounded-full border border-white/10 bg-white/5 px-3 text-xs text-zinc-300 outline-none hover:bg-white/10 focus-visible:ring-2 focus-visible:ring-violet-300">
            <Eye aria-hidden="true" className="h-3.5 w-3.5" /> {staticBackground ? "Show Liquid Ether" : "Use static fallback"}
          </button>
          <button type="button" onClick={() => { setAssets(initialAssets); setActiveStep(3); }} className="inline-flex min-h-9 items-center gap-2 rounded-full border border-white/10 bg-white/5 px-3 text-xs text-zinc-300 outline-none hover:bg-white/10 focus-visible:ring-2 focus-visible:ring-violet-300">
            <RotateCcw aria-hidden="true" className="h-3.5 w-3.5" /> Reset preview
          </button>
        </div>
      </div>
      <div className="relative z-10 w-full max-w-7xl mx-auto">
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
