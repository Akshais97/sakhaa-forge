"use client";

import { motion, useReducedMotion } from "motion/react";
import { ArrowRight } from "lucide-react";
import { useRef, useState, type PointerEvent as ReactPointerEvent } from "react";

export type MagneticNextCueProps = {
  disabled?: boolean;
  label?: string;
  onClick: () => void;
};

export function MagneticNextCue({ disabled = false, label = "Next step", onClick }: MagneticNextCueProps) {
  const hostRef = useRef<HTMLDivElement>(null);
  const reduceMotion = useReducedMotion();
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const magneticDisabled = disabled || Boolean(reduceMotion);

  const handlePointerMove = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (magneticDisabled || event.pointerType === "touch" || !hostRef.current) return;
    const bounds = hostRef.current.getBoundingClientRect();
    setOffset({
      x: Math.max(-10, Math.min(10, (event.clientX - (bounds.left + bounds.width / 2)) / 8)),
      y: Math.max(-6, Math.min(6, (event.clientY - (bounds.top + bounds.height / 2)) / 10)),
    });
  };

  return (
    <div
      ref={hostRef}
      className="relative inline-flex p-6"
      onPointerMove={handlePointerMove}
      onPointerLeave={() => setOffset({ x: 0, y: 0 })}
    >
      <motion.span
        aria-hidden="true"
        animate={magneticDisabled ? { x: 0, y: 0, opacity: 0 } : { ...offset, opacity: 0.8 }}
        className="absolute inset-3 rounded-full bg-violet-500/20 blur-xl"
        transition={{ type: "spring", stiffness: 220, damping: 22 }}
      />
      <motion.button
        type="button"
        disabled={disabled}
        onClick={onClick}
        animate={magneticDisabled ? { x: 0, y: 0 } : offset}
        transition={{ type: "spring", stiffness: 260, damping: 20 }}
        className="primary-action relative inline-flex min-h-11 items-center gap-2 rounded-full bg-white px-5 py-2.5 text-sm font-semibold text-zinc-950 shadow-[0_12px_40px_rgba(139,92,246,0.24)] outline-none hover:bg-violet-100 focus-visible:ring-2 focus-visible:ring-violet-300 focus-visible:ring-offset-2 focus-visible:ring-offset-zinc-950 disabled:cursor-not-allowed disabled:bg-zinc-700 disabled:text-zinc-400 disabled:shadow-none"
      >
        {label}
        <ArrowRight aria-hidden="true" className="h-4 w-4" />
      </motion.button>
    </div>
  );
}
