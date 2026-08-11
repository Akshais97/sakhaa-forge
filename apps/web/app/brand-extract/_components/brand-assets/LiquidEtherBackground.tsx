"use client";

import { useReducedMotion } from "motion/react";
import { useEffect, useState } from "react";
import LiquidEther from "./LiquidEther";

export type LiquidEtherBackgroundProps = {
  className?: string;
  staticFallback?: boolean;
};

export function LiquidEtherBackground({ className = "", staticFallback = false }: LiquidEtherBackgroundProps) {
  const reduceMotion = useReducedMotion();
  const [mounted, setMounted] = useState(false);
  const [prefersReducedMotion, setPrefersReducedMotion] = useState(false);
  const [webglFailed, setWebglFailed] = useState(false);

  useEffect(() => {
    const media = window.matchMedia("(prefers-reduced-motion: reduce)");
    const updatePreference = () => setPrefersReducedMotion(media.matches);
    updatePreference();
    setMounted(true);
    media.addEventListener("change", updatePreference);
    return () => media.removeEventListener("change", updatePreference);
  }, []);

  const shouldUseFallback = !mounted || staticFallback || Boolean(reduceMotion) || prefersReducedMotion || webglFailed;

  return (
    <div
      aria-hidden="true"
      data-static-fallback={shouldUseFallback ? "true" : "false"}
      className={`pointer-events-none absolute inset-0 overflow-hidden bg-[#050507] ${className}`}
    >
      {shouldUseFallback ? (
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_68%_28%,rgba(82,39,255,0.16),transparent_24%),radial-gradient(circle_at_30%_72%,rgba(255,159,252,0.1),transparent_22%),#050507]" />
      ) : (
        <LiquidEther
          colors={["#5227FF", "#FF9FFC", "#B497CF"]}
          mouseForce={20}
          cursorSize={100}
          isViscous
          viscous={30}
          iterationsViscous={32}
          iterationsPoisson={32}
          resolution={0.5}
          isBounce={false}
          autoDemo
          autoSpeed={0.5}
          autoIntensity={2.2}
          takeoverDuration={0.25}
          autoResumeDelay={3000}
          autoRampDuration={0.6}
          onWebGLFailure={() => setWebglFailed(true)}
          className="absolute inset-0"
        />
      )}
    </div>
  );
}
