"use client";

import { useState } from "react";
import { motion, AnimatePresence } from "motion/react";
import {
  Link2,
  Upload,
  ShieldCheck,
  ChevronDown,
  Globe,
  AlertCircle
} from "lucide-react";
import { Magnet } from "../../../../src/components/MotionBits";

interface BrandSourcePanelProps {
  url: string;
  onUrlChange: (value: string) => void;
  rightsConfirmed: boolean;
  onRightsChange: (value: boolean) => void;
  onScan: () => void;
  onUpload: () => void;
  disabled?: boolean;
  brandColor?: string;
}

export default function BrandSourcePanel({
  url,
  onUrlChange,
  rightsConfirmed,
  onRightsChange,
  onScan,
  onUpload,
  disabled = false,
  brandColor = "#D4AF37"
}: BrandSourcePanelProps) {
  const [scopeOpen, setScopeOpen] = useState(true);
  const urlValid =
    url.startsWith("http://") || url.startsWith("https://");

  return (
    <div className="rounded-xl border border-white/10 bg-[#0B0A09]/60 p-5 backdrop-blur-sm">
      <div className="mb-5">
        <p className="text-[10px] font-mono uppercase tracking-[0.2em] text-[#B4B0A7]">
          Brand source
        </p>
        <h2 className="mt-2 text-2xl font-display font-medium text-white tracking-tight">
          Build a production-ready brand dossier.
        </h2>
        <p className="mt-2 text-sm text-[#D4D1CA]/90 leading-relaxed">
          Paste a permitted URL. We extract identity, offer, proof, visuals, and
          compliance notes so your team can review and approve brand truth.
        </p>
      </div>

      {/* URL input */}
      <div className="space-y-4">
        <label className="block">
          <span className="text-[10px] font-mono uppercase tracking-wider text-[#B4B0A7]">
            Company website URL
          </span>
          <div className="relative mt-1.5">
            <Globe className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-[#71717a]" />
            <input
              type="url"
              value={url}
              onChange={(e) => onUrlChange(e.target.value)}
              placeholder="https://brand.example"
              disabled={disabled}
              className="w-full rounded-lg border border-white/10 bg-black/40 pl-10 pr-3 py-2.5 text-sm text-white placeholder-[#71717a] outline-none focus:border-white/20 focus:bg-black/60 transition-all disabled:opacity-50 font-sans"
            />
          </div>
          {url && !urlValid && (
            <p className="mt-1.5 flex items-center gap-1 text-[11px] text-red-400">
              <AlertCircle className="h-3 w-3" />
              URL must start with http:// or https://
            </p>
          )}
        </label>

        {/* Scope preview accordion */}
        <div className="rounded-lg border border-white/5 bg-black/40 overflow-hidden">
          <button
            onClick={() => setScopeOpen((v) => !v)}
            className="w-full flex items-center justify-between px-3 py-2.5 text-[10px] font-mono uppercase tracking-wider text-[#B4B0A7] hover:text-[#D4D1CA] transition-colors"
          >
            <span className="flex items-center gap-1.5">
              <ShieldCheck className="h-3.5 w-3.5" /> Crawl scope preview
            </span>
            <motion.span animate={{ rotate: scopeOpen ? 180 : 0 }}>
              <ChevronDown className="h-3.5 w-3.5" />
            </motion.span>
          </button>
          <AnimatePresence initial={false}>
            {scopeOpen && (
              <motion.div
                initial={{ height: 0, opacity: 0 }}
                animate={{ height: "auto", opacity: 1 }}
                exit={{ height: 0, opacity: 0 }}
                transition={{ duration: 0.22 }}
                className="overflow-hidden"
              >
                <ul className="px-3 pb-3 space-y-1.5 text-[11px] text-[#B4B0A7] leading-relaxed">
                  <li className="flex items-start gap-2">
                    <span className="text-[#71717a]">›</span>
                    Root, about, projects, contact, brochure, RERA and legal pages.
                  </li>
                  <li className="flex items-start gap-2">
                    <span className="text-[#71717a]">›</span>
                    External links and subdomains are not crawled.
                  </li>
                  <li className="flex items-start gap-2">
                    <span className="text-[#71717a]">›</span>
                    Robots policy is respected. Raw provider payloads stay server-side.
                  </li>
                </ul>
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        {/* Rights confirmation */}
        <label className="flex items-start gap-3 rounded-lg border border-white/5 bg-black/40 p-3 cursor-pointer group">
          <input
            type="checkbox"
            checked={rightsConfirmed}
            onChange={(e) => onRightsChange(e.target.checked)}
            disabled={disabled}
            className="mt-0.5 accent-white"
          />
          <span className="text-xs text-[#D4D1CA] leading-relaxed group-hover:text-white transition-colors">
            I confirm the source may be used for brand extraction evidence in
            this workspace.
          </span>
        </label>

        {/* Actions */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
          <Magnet strength={0.12}>
            <button
              onClick={onScan}
              disabled={disabled || !urlValid || !rightsConfirmed}
              className="primary-action w-full rounded-lg px-4 py-2.5 text-xs font-mono tracking-widest uppercase font-semibold text-black transition-all disabled:opacity-40 disabled:cursor-not-allowed flex items-center justify-center gap-1.5"
              style={{
                backgroundColor: brandColor,
                boxShadow: `0 10px 30px -10px ${brandColor}44`
              }}
            >
              <Link2 className="h-3.5 w-3.5" />
              Scan URL
            </button>
          </Magnet>

          <button
            onClick={onUpload}
            disabled={disabled}
            className="w-full rounded-lg border border-white/10 px-4 py-2.5 text-xs font-mono tracking-widest uppercase font-semibold text-white hover:bg-white/5 transition-all disabled:opacity-40 disabled:cursor-not-allowed flex items-center justify-center gap-1.5"
          >
            <Upload className="h-3.5 w-3.5" />
            Upload assets
          </button>
        </div>

        <p className="text-[10px] text-[#71717a] font-mono leading-relaxed">
          Approval creates versioned brand truth. Extraction alone does not
          authorise production use.
        </p>
      </div>
    </div>
  );
}
