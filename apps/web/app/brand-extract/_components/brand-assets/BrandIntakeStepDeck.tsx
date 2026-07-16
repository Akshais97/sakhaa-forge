"use client";

import { AnimatePresence, motion, useReducedMotion, type PanInfo } from "motion/react";
import { Check, ChevronLeft } from "lucide-react";
import type { ReactNode } from "react";
import { MagneticNextCue } from "./MagneticNextCue";

export type BrandIntakeStep = {
  id: string;
  label: string;
  eyebrow: string;
  title: string;
  description: string;
  content: ReactNode;
};

export type BrandIntakeStepDeckProps = {
  steps: BrandIntakeStep[];
  activeStep: number;
  canAdvance: boolean;
  onStepChange: (step: number) => void;
  onAdvance: () => void;
};

export function BrandIntakeStepDeck({ steps, activeStep, canAdvance, onStepChange, onAdvance }: BrandIntakeStepDeckProps) {
  const reduceMotion = useReducedMotion();
  const step = steps[activeStep];
  if (!step) return null;

  const goBack = () => onStepChange(Math.max(0, activeStep - 1));
  const handleDragEnd = (_event: MouseEvent | TouchEvent | PointerEvent, info: PanInfo) => {
    if (reduceMotion) return;
    if (info.offset.x < -90 && canAdvance) onAdvance();
    if (info.offset.x > 90 && activeStep > 0) goBack();
  };

  return (
    <section aria-label="Approved brand profile steps" className="relative mx-auto w-full max-w-6xl">
      <ol className="mb-5 flex items-center justify-center gap-2" aria-label="Progress">
        {steps.map((candidate, index) => {
          const complete = index < activeStep;
          return (
            <li key={candidate.id}>
              <button
                type="button"
                aria-current={index === activeStep ? "step" : undefined}
                aria-label={`${candidate.label}${complete ? ", completed" : ""}`}
                disabled={index > activeStep}
                onClick={() => index <= activeStep && onStepChange(index)}
                className="group flex items-center gap-2 rounded-full px-2 py-1 text-xs text-zinc-500 outline-none focus-visible:ring-2 focus-visible:ring-violet-300 disabled:cursor-not-allowed"
              >
                <span className={`grid h-7 w-7 place-items-center rounded-full border transition ${index === activeStep ? "border-violet-300 bg-violet-300 text-zinc-950" : complete ? "border-emerald-400/40 bg-emerald-400/10 text-emerald-300" : "border-white/10 bg-white/5"}`}>
                  {complete ? <Check aria-hidden="true" className="h-3.5 w-3.5" /> : index + 1}
                </span>
                <span className="hidden sm:inline">{candidate.label}</span>
              </button>
            </li>
          );
        })}
      </ol>

      <AnimatePresence mode="wait" initial={false}>
        <motion.article
          key={step.id}
          drag="x"
          dragConstraints={{ left: 0, right: 0 }}
          dragElastic={reduceMotion ? 0 : 0.12}
          onDragEnd={handleDragEnd}
          initial={reduceMotion ? { opacity: 0 } : { opacity: 0, x: 36, scale: 0.985 }}
          animate={{ opacity: 1, x: 0, scale: 1 }}
          exit={reduceMotion ? { opacity: 0 } : { opacity: 0, x: -36, scale: 0.985 }}
          transition={{ duration: reduceMotion ? 0.01 : 0.28, ease: [0.22, 1, 0.36, 1] }}
          className="overflow-hidden rounded-[28px] border border-white/10 bg-zinc-950/75 shadow-[0_30px_100px_rgba(0,0,0,0.45)] backdrop-blur-2xl"
        >
          <div className="border-b border-white/10 px-5 py-5 sm:px-8">
            <p className="text-[10px] font-semibold uppercase tracking-[0.22em] text-violet-300">{step.eyebrow}</p>
            <h1 className="mt-2 text-2xl font-semibold tracking-tight text-white sm:text-3xl">{step.title}</h1>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-zinc-400">{step.description}</p>
          </div>
          <div className="p-4 sm:p-6">{step.content}</div>
          <footer className="flex items-center justify-between border-t border-white/10 px-3 py-1 sm:px-5">
            <button
              type="button"
              onClick={goBack}
              disabled={activeStep === 0}
              className="inline-flex min-h-11 items-center gap-2 rounded-full px-4 text-sm font-medium text-zinc-400 outline-none hover:bg-white/5 hover:text-white focus-visible:ring-2 focus-visible:ring-violet-300 disabled:invisible"
            >
              <ChevronLeft aria-hidden="true" className="h-4 w-4" /> Back
            </button>
            <div className="flex items-center gap-2">
              <span className="hidden text-[11px] text-zinc-500 md:inline">Swipe left after the step is ready</span>
              <MagneticNextCue disabled={!canAdvance} onClick={onAdvance} label={activeStep === steps.length - 1 ? "Finish review" : "Next step"} />
            </div>
          </footer>
        </motion.article>
      </AnimatePresence>
    </section>
  );
}
