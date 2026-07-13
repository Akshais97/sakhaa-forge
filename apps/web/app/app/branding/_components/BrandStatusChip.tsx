"use client";

import { motion } from "motion/react";
import {
  Clock,
  Activity,
  CheckCircle2,
  AlertCircle,
  HelpCircle,
  Lock
} from "lucide-react";

export interface BrandStatusChipProps {
  state:
    | "idle"
    | "sourceLocked"
    | "crawling"
    | "extracting"
    | "candidatesReady"
    | "approved";
  brandColor?: string;
}

const config: Record<
  BrandStatusChipProps["state"],
  { label: string; icon: typeof Clock; color: string }
> = {
  idle: { label: "Ready to scan", icon: Clock, color: "#B4B0A7" },
  sourceLocked: { label: "Source locked", icon: Lock, color: "#8FB2D6" },
  crawling: { label: "Crawling pages", icon: Activity, color: "#5FC6DD" },
  extracting: { label: "Extracting identity", icon: Activity, color: "#9A92F8" },
  candidatesReady: { label: "Candidates ready", icon: CheckCircle2, color: "#10B981" },
  approved: { label: "Profile approved", icon: CheckCircle2, color: "#10B981" }
};

export default function BrandStatusChip({
  state,
  brandColor = "#D4AF37"
}: BrandStatusChipProps) {
  const { label, icon: Icon, color } = config[state];
  const isRunning = state === "crawling" || state === "extracting";

  return (
    <motion.div
      key={state}
      initial={{ opacity: 0, y: 4 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.22 }}
      className="inline-flex items-center gap-2 rounded-full border px-3 py-1.5"
      style={{
        borderColor: `${color}44`,
        backgroundColor: `${color}0f`,
        color
      }}
    >
      {isRunning ? (
        <span className="relative flex h-3.5 w-3.5">
          <span
            className="absolute inline-flex h-full w-full animate-ping rounded-full opacity-40"
            style={{ backgroundColor: color }}
          />
          <Icon className="relative h-3.5 w-3.5" />
        </span>
      ) : (
        <Icon className="h-3.5 w-3.5" />
      )}
      <span className="text-[10px] font-mono uppercase tracking-wider font-semibold">
        {label}
      </span>
    </motion.div>
  );
}
