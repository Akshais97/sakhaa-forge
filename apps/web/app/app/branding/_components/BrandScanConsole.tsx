"use client";

import { motion, AnimatePresence } from "motion/react";
import { Terminal, CheckCircle2, Loader2 } from "lucide-react";
import BrandStatusChip from "./BrandStatusChip";
import type { ScanState } from "./data";

interface BrandScanConsoleProps {
  state: ScanState;
  logs: string[];
  brandColor?: string;
}

export default function BrandScanConsole({
  state,
  logs,
  brandColor = "#D4AF37"
}: BrandScanConsoleProps) {
  const isRunning = state === "crawling" || state === "extracting";
  const isReady = state === "candidatesReady";

  return (
    <div className="rounded-xl border border-white/10 bg-[#0B0A09]/80 p-4 overflow-hidden">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2 text-[10px] font-mono text-[#B4B0A7] uppercase tracking-widest">
          <Terminal className="h-3.5 w-3.5" />
          <span>Live scan console</span>
        </div>
        <BrandStatusChip state={state} brandColor={brandColor} />
      </div>

      <div className="rounded-lg border border-white/5 bg-black/40 p-3 font-mono text-[11px] leading-relaxed min-h-[120px]">
        <AnimatePresence mode="wait">
          {logs.length === 0 ? (
            <motion.p
              key="empty"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="text-[#71717a] italic"
            >
              Waiting for source confirmation...
            </motion.p>
          ) : (
            <motion.ul
              key={state}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="space-y-1.5"
            >
              {logs.map((log, index) => (
                <motion.li
                  key={`${state}-${index}`}
                  initial={{ opacity: 0, x: -8 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: index * 0.06 }}
                  className="flex items-start gap-2 text-[#D4D1CA]"
                >
                  <span className="text-[#71717a] select-none">›</span>
                  <span>{log}</span>
                </motion.li>
              ))}
              {isRunning && (
                <motion.li
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  transition={{ delay: logs.length * 0.06 }}
                  className="flex items-center gap-2 text-[#B4B0A7]"
                >
                  <Loader2 className="h-3 w-3 animate-spin" />
                  <span>Working...</span>
                </motion.li>
              )}
              {isReady && (
                <motion.li
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  transition={{ delay: logs.length * 0.06 }}
                  className="flex items-center gap-2 text-emerald-400"
                >
                  <CheckCircle2 className="h-3 w-3" />
                  <span>Crawl run complete. Dossier ready for review.</span>
                </motion.li>
              )}
            </motion.ul>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}
