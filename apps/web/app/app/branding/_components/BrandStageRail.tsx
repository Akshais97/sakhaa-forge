"use client";

import { motion } from "motion/react";

interface Stage {
  id: string;
  label: string;
  key: string;
}

interface BrandStageRailProps {
  stages: readonly Stage[];
  activeKey: string;
  brandColor?: string;
  onSelect?: (key: string) => void;
}

export default function BrandStageRail({
  stages,
  activeKey,
  brandColor = "#D4AF37",
  onSelect
}: BrandStageRailProps) {
  const activeIndex = stages.findIndex((s) => s.id === activeKey);
  const progress =
    stages.length > 1 ? (activeIndex / (stages.length - 1)) * 100 : 0;

  return (
    <div className="shrink-0 w-full border-t border-white/5 bg-[#0B0A09]/80 backdrop-blur-xl px-5 py-3">
      <div className="mx-auto flex w-full max-w-7xl flex-col gap-2">
        <div className="flex justify-between items-center text-[9px] font-mono text-[#B4B0A7] uppercase tracking-widest">
          <span>Brand pipeline</span>
          <span>Four human-meaningful stages</span>
        </div>

        <div className="relative flex items-center justify-between overflow-x-auto gap-4 py-1 no-scrollbar">
          {/* Background trace */}
          <div className="absolute inset-x-0 top-1/2 -translate-y-1/2 h-0.5 bg-white/5 pointer-events-none z-0" />

          {/* Active progress bar */}
          <motion.div
            className="absolute left-0 top-1/2 -translate-y-1/2 h-0.5 pointer-events-none z-0"
            animate={{ width: `${progress}%` }}
            transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
            style={{ backgroundColor: brandColor }}
          />

          {stages.map((stage, index) => {
            const isActive = stage.id === activeKey;
            const isPassed = index < activeIndex;

            return (
              <button
                key={stage.id}
                onClick={() => onSelect?.(stage.id)}
                className="relative z-10 flex flex-col items-center group cursor-pointer focus:outline-none flex-shrink-0"
              >
                <div
                  className="h-7 w-7 rounded-full border flex items-center justify-center font-mono text-[9px] font-bold transition-all duration-300 bg-[#050507]"
                  style={{
                    borderColor: isActive
                      ? brandColor
                      : isPassed
                      ? `${brandColor}88`
                      : "rgba(255, 255, 255, 0.08)",
                    color: isActive
                      ? "#fff"
                      : isPassed
                      ? brandColor
                      : "#71717a",
                    boxShadow: isActive
                      ? `0 0 15px ${brandColor}55`
                      : "none"
                  }}
                >
                  {index + 1 < 10 ? `0${index + 1}` : index + 1}
                </div>
                <span
                  className={`hidden sm:block text-[9px] font-mono tracking-wider uppercase mt-1.5 transition-colors duration-200 ${
                    isActive
                      ? "text-white font-medium"
                      : "text-[#71717a] group-hover:text-[#D4D1CA]"
                  }`}
                  style={{ color: isActive ? brandColor : undefined }}
                >
                  {stage.label}
                </span>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
