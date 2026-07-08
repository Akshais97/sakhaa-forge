"use client";

import { useState, useEffect, useCallback } from "react";
import { motion, AnimatePresence } from "motion/react";
import Link from "next/link";
import {
  ArrowRight,
  RotateCcw,
  Search,
  FolderOpen,
  CheckCircle2,
  AlertCircle
} from "lucide-react";
import { Magnet } from "../../../../src/components/MotionBits";
import BrandSourcePanel from "./BrandSourcePanel";
import BrandScanConsole from "./BrandScanConsole";
import BrandEvidenceDossier from "./BrandEvidenceDossier";
import BrandStageRail from "./BrandStageRail";
import {
  DEMO_BRAND,
  PIPELINE_STAGES,
  SCAN_LOGS,
  type ScanState
} from "./data";

export default function BrandAtelier() {
  const [url, setUrl] = useState(DEMO_BRAND.url);
  const [rightsConfirmed, setRightsConfirmed] = useState(false);
  const [state, setState] = useState<ScanState>("idle");
  const [logs, setLogs] = useState<string[]>([]);
  const [isApproving, setIsApproving] = useState(false);
  const [approved, setApproved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const brand = DEMO_BRAND;
  const brandColor = brand.primaryColor;

  const reset = useCallback(() => {
    setState("idle");
    setLogs([]);
    setApproved(false);
    setIsApproving(false);
    setError(null);
    setRightsConfirmed(false);
  }, []);

  const startScan = useCallback(() => {
    setError(null);
    setState("sourceLocked");
    setLogs(SCAN_LOGS.sourceLocked);
  }, []);

  const handleUpload = useCallback(() => {
    setError("Asset upload is simulated in this mockup. Connect a real storage provider to enable uploads.");
  }, []);

  const handleApprove = useCallback(() => {
    setIsApproving(true);
    setTimeout(() => {
      setIsApproving(false);
      setApproved(true);
      setState("approved");
    }, 1200);
  }, []);

  // Simulate the crawl pipeline after sourceLocked.
  useEffect(() => {
    if (state === "sourceLocked") {
      const t1 = setTimeout(() => {
        setState("crawling");
        setLogs(SCAN_LOGS.crawling);
      }, 1400);
      return () => clearTimeout(t1);
    }

    if (state === "crawling") {
      const t2 = setTimeout(() => {
        setState("extracting");
        setLogs(SCAN_LOGS.extracting);
      }, 3200);
      return () => clearTimeout(t2);
    }

    if (state === "extracting") {
      const t3 = setTimeout(() => {
        setState("candidatesReady");
        setLogs(SCAN_LOGS.candidatesReady);
      }, 3400);
      return () => clearTimeout(t3);
    }
  }, [state]);

  const activeStageKey =
    state === "idle"
      ? "source"
      : state === "approved"
      ? "approve"
      : state === "sourceLocked"
      ? "source"
      : state === "crawling"
      ? "scan"
      : state === "extracting"
      ? "evidence"
      : "approve";

  return (
    <div className="relative flex h-dvh flex-col overflow-hidden bg-[#050507] text-[#F3F2EF] selection:bg-white/10 selection:text-white">
      {/* Ambient background glow */}
      <div
        className="pointer-events-none absolute inset-0"
        style={{
          background: `radial-gradient(ellipse 80% 60% at 50% -10%, ${brandColor}08, transparent 60%)`
        }}
      />

      {/* Header */}
      <header className="relative z-20 shrink-0 border-b border-white/5 bg-[#050507]/80 backdrop-blur-xl px-5 py-3">
        <div className="mx-auto flex w-full max-w-7xl items-center justify-between">
          <div className="flex items-center gap-3">
            <div
              className="flex h-7 w-7 items-center justify-center rounded border font-display text-xs font-bold text-white"
              style={{
                borderColor: `${brandColor}33`,
                backgroundColor: `${brandColor}15`
              }}
            >
              S
            </div>
            <div className="flex flex-col">
              <span className="font-display text-sm font-semibold tracking-wider text-white uppercase">
                Sakhaa Forge
              </span>
              <span className="text-[9px] font-mono text-[#71717a] uppercase tracking-widest">
                Brand Evidence Atelier
              </span>
            </div>
          </div>

          <Link
            href="/app/profile"
            className="rounded-lg border border-white/10 bg-white/[0.03] px-3 py-2 text-xs font-semibold text-white hover:bg-white/[0.06] transition-colors"
          >
            Profile
          </Link>
        </div>
      </header>

      {/* Main content */}
      <main className="relative z-10 flex-1 min-h-0 overflow-y-auto px-5 py-6">
        <AnimatePresence mode="wait">
          {approved ? (
            <motion.div
              key="approved"
              initial={{ opacity: 0, scale: 0.98 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.98 }}
              className="mx-auto flex h-full max-w-2xl flex-col items-center justify-center text-center"
            >
              <div className="rounded-full border border-emerald-500/20 bg-emerald-500/10 p-4">
                <CheckCircle2 className="h-8 w-8 text-emerald-400" />
              </div>
              <h2 className="mt-6 text-3xl font-display font-medium text-white">
                Brand profile approved
              </h2>
              <p className="mt-2 max-w-md text-sm text-[#D4D1CA]">
                {brand.name} is now versioned brand truth. The production
                pipeline can reference this profile for scripts, avatars, and
                calendar posts.
              </p>
              <div className="mt-6 rounded-lg border border-white/10 bg-black/40 p-4 text-left font-mono text-[11px] text-[#B4B0A7]">
                <p>Profile version: v1.0.0</p>
                <p className="mt-1">{brand.reviewHash}</p>
              </div>
              <button
                onClick={reset}
                className="mt-6 inline-flex items-center gap-2 rounded-lg border border-white/10 px-5 py-2.5 text-xs font-mono uppercase tracking-wider text-white hover:bg-white/5 transition-colors"
              >
                <RotateCcw className="h-3.5 w-3.5" />
                Start another brand
              </button>
            </motion.div>
          ) : (
            <motion.div
              key="atelier"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="mx-auto flex w-full max-w-7xl flex-col gap-6"
            >
              {/* Page title */}
              <div className="flex flex-col gap-2 md:flex-row md:items-end md:justify-between">
                <div>
                  <span
                    className="inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-[10px] font-mono uppercase tracking-widest"
                    style={{
                      borderColor: `${brandColor}33`,
                      color: brandColor,
                      backgroundColor: `${brandColor}0a`
                    }}
                  >
                    Trend-to-calendar engine
                  </span>
                  <h1 className="mt-3 text-3xl md:text-4xl font-display font-medium text-white tracking-tight">
                    Brand intake
                  </h1>
                  <p className="mt-2 max-w-2xl text-sm text-[#D4D1CA]/90 leading-relaxed">
                    Scan a permitted brand URL or attach approved assets.
                    Extracted values remain candidates until an authorised actor
                    approves the exact profile.
                  </p>
                </div>

                {state !== "idle" && (
                  <button
                    onClick={reset}
                    className="inline-flex items-center gap-1.5 rounded-lg border border-white/10 bg-white/[0.03] px-3 py-2 text-xs font-mono uppercase tracking-wider text-[#B4B0A7] hover:text-white hover:bg-white/5 transition-colors"
                  >
                    <RotateCcw className="h-3.5 w-3.5" />
                    Reset
                  </button>
                )}
              </div>

              {error && (
                <div className="rounded-lg border border-red-500/20 bg-red-500/10 px-4 py-3 flex items-start gap-2 text-sm text-red-300">
                  <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
                  <span>{error}</span>
                </div>
              )}

              {/* Two-column workspace */}
              <div className="grid gap-6 lg:grid-cols-[minmax(0,420px)_1fr]">
                <div className="flex flex-col gap-4">
                  <BrandSourcePanel
                    url={url}
                    onUrlChange={setUrl}
                    rightsConfirmed={rightsConfirmed}
                    onRightsChange={setRightsConfirmed}
                    onScan={startScan}
                    onUpload={handleUpload}
                    disabled={state !== "idle"}
                    brandColor={brandColor}
                  />

                  {state !== "idle" && (
                    <motion.div
                      initial={{ opacity: 0, height: 0 }}
                      animate={{ opacity: 1, height: "auto" }}
                      transition={{ duration: 0.3 }}
                    >
                      <BrandScanConsole
                        state={state}
                        logs={logs}
                        brandColor={brandColor}
                      />
                    </motion.div>
                  )}
                </div>

                <BrandEvidenceDossier brand={brand} state={state} />
              </div>

              {/* Review actions */}
              <div className="rounded-xl border border-white/10 bg-[#0B0A09]/60 p-4">
                <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <h3 className="text-base font-display font-medium text-white">
                      Review and approve
                    </h3>
                    <p className="mt-1 text-xs text-[#B4B0A7]">
                      Approval creates immutable brand truth. Only proceed when
                      the evidence dossier matches the brand you intend to use.
                    </p>
                  </div>

                  <div className="flex flex-wrap items-center gap-3">
                    <button
                      disabled={state !== "candidatesReady"}
                      className="inline-flex items-center gap-1.5 rounded-lg border border-white/10 px-4 py-2.5 text-xs font-mono uppercase tracking-wider text-white hover:bg-white/5 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                    >
                      <Search className="h-3.5 w-3.5" />
                      Review candidates
                    </button>

                    <button
                      disabled={state !== "candidatesReady"}
                      className="inline-flex items-center gap-1.5 rounded-lg border border-white/10 px-4 py-2.5 text-xs font-mono uppercase tracking-wider text-white hover:bg-white/5 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                    >
                      <FolderOpen className="h-3.5 w-3.5" />
                      Request missing assets
                    </button>

                    <Magnet strength={0.12}>
                      <button
                        onClick={handleApprove}
                        disabled={state !== "candidatesReady" || isApproving}
                        className="primary-action inline-flex items-center gap-1.5 rounded-lg px-5 py-2.5 text-xs font-mono tracking-widest uppercase font-semibold text-black transition-all disabled:opacity-40 disabled:cursor-not-allowed"
                        style={{
                          backgroundColor: brandColor,
                          boxShadow: `0 10px 30px -10px ${brandColor}44`
                        }}
                      >
                        {isApproving ? (
                          <>
                            <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-black/30 border-t-black" />
                            Approving…
                          </>
                        ) : (
                          <>
                            Approve profile
                            <ArrowRight className="h-3.5 w-3.5" />
                          </>
                        )}
                      </button>
                    </Magnet>
                  </div>
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </main>

      {/* Bottom stage rail */}
      <BrandStageRail
        stages={PIPELINE_STAGES}
        activeKey={activeStageKey}
        brandColor={brandColor}
      />
    </div>
  );
}
