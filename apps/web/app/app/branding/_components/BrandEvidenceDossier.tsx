"use client";

import type React from "react";
import { motion } from "motion/react";
import {
  ShieldAlert,
  AlertTriangle,
  FileWarning,
  Bookmark,
  CheckCircle2,
  Palette,
  Megaphone,
  XOctagon,
  FileQuestion
} from "lucide-react";
import { Spotlight } from "../../../../src/components/MotionBits";
import type {
  BrandIntakeFixture,
  ScanState,
  USPCard,
  Prohibition,
  ComplianceNote,
  MissingAsset
} from "./data";

interface BrandEvidenceDossierProps {
  brand: BrandIntakeFixture;
  state: ScanState;
}

function DossierSection({
  title,
  icon: Icon,
  children,
  delay = 0
}: {
  title: string;
  icon: React.ElementType;
  children: React.ReactNode;
  delay?: number;
}) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay, duration: 0.35, ease: [0.22, 1, 0.36, 1] }}
      className="rounded-lg border border-white/5 bg-white/[0.02] p-3 space-y-2"
    >
      <div className="flex items-center gap-1.5 text-[9px] font-mono uppercase tracking-widest text-[#B4B0A7]">
        <Icon className="h-3 w-3" />
        {title}
      </div>
      {children}
    </motion.div>
  );
}

export default function BrandEvidenceDossier({
  brand,
  state
}: BrandEvidenceDossierProps) {
  const isRevealed = state === "candidatesReady" || state === "approved";
  const isPartial = state === "extracting";
  const revealProgress = isRevealed ? 1 : isPartial ? 0.6 : 0;

  return (
    <Spotlight color={brand.primaryColor} className="relative h-full min-h-[480px] rounded-2xl border border-white/10 bg-[#0B0A09]/60 p-5 shadow-2xl backdrop-blur-xl overflow-hidden">
      {/* Ambient brand glow */}
      <div
        className="absolute -right-24 -top-24 h-72 w-72 rounded-full blur-[90px] pointer-events-none"
        style={{
          background: `radial-gradient(circle, ${brand.primaryColor}18 0%, transparent 70%)`,
          opacity: revealProgress
        }}
      />

      {/* Dossier header */}
      <div className="relative z-10 flex items-start justify-between mb-5">
        <div>
          <div className="flex items-center gap-2 mb-2">
            <span
              className="px-2.5 py-0.5 text-[9px] font-mono tracking-widest uppercase rounded border"
              style={{
                borderColor: `${brand.primaryColor}33`,
                color: brand.primaryColor,
                backgroundColor: `${brand.primaryColor}0a`
              }}
            >
              Evidence Dossier
            </span>
            {(state === "candidatesReady" || state === "approved") && (
              <span className="flex items-center gap-1 text-[9px] font-mono text-emerald-400">
                <CheckCircle2 className="h-3 w-3" /> Ready for review
              </span>
            )}
          </div>
          <h2 className="text-2xl font-display font-medium text-white tracking-tight">
            {brand.name}
          </h2>
          <p className="text-xs font-mono text-[#B4B0A7] mt-1">{brand.tagline}</p>
        </div>

        {/* Logo crest placeholder */}
        <div
          className="h-14 w-14 rounded-xl border flex items-center justify-center font-display text-lg font-semibold text-white"
          style={{
            borderColor: `${brand.primaryColor}44`,
            backgroundColor: `${brand.primaryColor}15`
          }}
        >
          {brand.logoMark[0]}
        </div>
      </div>

      {/* Revealed content */}
      <div className="relative z-10 space-y-3">
        <DossierSection title="Colour palette" icon={Palette} delay={0.05}>
          <div className="flex flex-wrap gap-2">
            {brand.extractedColors.map((color) => (
              <div
                key={color.hex}
                className="flex items-center gap-1.5 rounded-md border border-white/5 bg-white/[0.02] px-2 py-1.5"
              >
                <div
                  className="h-5 w-5 rounded-sm border border-white/10"
                  style={{ backgroundColor: color.hex }}
                />
                <div className="flex flex-col leading-none">
                  <span className="text-[9px] font-mono text-white">{color.hex}</span>
                  <span className="text-[8px] font-mono text-[#71717a]">{color.label}</span>
                </div>
              </div>
            ))}
          </div>
        </DossierSection>

        <DossierSection title="Tone / voice" icon={Megaphone} delay={0.1}>
          <div className="flex flex-wrap gap-1.5">
            {brand.toneLabels.map((tone) => (
              <span
                key={tone}
                className="rounded-full border border-white/10 bg-white/[0.03] px-2 py-1 text-[10px] text-[#D4D1CA]"
              >
                {tone}
              </span>
            ))}
          </div>
        </DossierSection>

        <DossierSection title="Verified USPs" icon={Bookmark} delay={0.15}>
          <ul className="space-y-2">
            {brand.usps.map((usp: USPCard) => (
              <li
                key={usp.id}
                className="flex items-start gap-2 text-[11px] text-[#D4D1CA]"
              >
                <span
                  className="mt-0.5 h-1.5 w-1.5 rounded-full shrink-0"
                  style={{ backgroundColor: brand.primaryColor }}
                />
                <div>
                  <p className="text-white font-medium leading-snug">{usp.title}</p>
                  <p className="text-[9px] font-mono text-[#71717a]">
                    Evidence: {usp.evidence}
                  </p>
                </div>
              </li>
            ))}
          </ul>
        </DossierSection>

        <DossierSection title="Prohibitions" icon={XOctagon} delay={0.2}>
          <ul className="space-y-1.5">
            {brand.prohibitions.map((pro: Prohibition) => (
              <li
                key={pro.id}
                className="flex items-start gap-2 text-[11px] text-red-300/90"
              >
                <span className="font-mono text-red-500 shrink-0">✕</span>
                <span className="leading-snug">{pro.rule}</span>
              </li>
            ))}
          </ul>
        </DossierSection>

        <DossierSection title="Compliance notes" icon={ShieldAlert} delay={0.25}>
          <ul className="space-y-1.5">
            {brand.complianceNotes.map((note: ComplianceNote) => (
              <li
                key={note.id}
                className={`flex items-start gap-2 text-[11px] ${
                  note.severity === "warning"
                    ? "text-amber-300/90"
                    : "text-emerald-300/90"
                }`}
              >
                {note.severity === "warning" ? (
                  <AlertTriangle className="h-3.5 w-3.5 shrink-0 text-amber-500" />
                ) : (
                  <CheckCircle2 className="h-3.5 w-3.5 shrink-0 text-emerald-500" />
                )}
                <div>
                  <p className="font-medium leading-snug">{note.label}</p>
                  <p className="text-[9px] font-mono opacity-80">{note.detail}</p>
                </div>
              </li>
            ))}
          </ul>
        </DossierSection>

        <DossierSection title="Missing assets" icon={FileQuestion} delay={0.3}>
          <ul className="space-y-1.5">
            {brand.missingAssets.map((asset: MissingAsset) => (
              <li
                key={asset.id}
                className="flex items-start gap-2 text-[11px] text-[#B4B0A7]"
              >
                <FileWarning className="h-3.5 w-3.5 shrink-0 text-[#71717a]" />
                <div>
                  <p className="text-white font-medium leading-snug">{asset.name}</p>
                  <p className="text-[9px] font-mono opacity-80">{asset.reason}</p>
                </div>
              </li>
            ))}
          </ul>
        </DossierSection>
      </div>

      {/* Footer readiness */}
      <div className="relative z-10 mt-5 border-t border-white/5 pt-4">
        <div className="flex items-center justify-between text-[10px] font-mono text-[#B4B0A7]">
          <span>Readiness score</span>
          <span style={{ color: brand.primaryColor }}>{brand.readinessScore}/100</span>
        </div>
        <div className="mt-2 h-1 w-full rounded-full bg-white/5 overflow-hidden">
          <motion.div
            className="h-full rounded-full"
            initial={{ width: 0 }}
            animate={{ width: `${brand.readinessScore}%` }}
            transition={{ duration: 0.8, ease: [0.22, 1, 0.36, 1] }}
            style={{ backgroundColor: brand.primaryColor }}
          />
        </div>
      </div>
    </Spotlight>
  );
}
