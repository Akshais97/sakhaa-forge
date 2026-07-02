import { motion } from 'motion/react';
import { ArrowRight, Activity, CheckCircle2, RefreshCw } from 'lucide-react';
import { BrandData, ProductionStage } from '../types';

interface NarrativePanelProps {
  activeStage: ProductionStage;
  activeBrand: BrandData;
  onNextStage: () => void;
  onPrevStage: () => void;
  isFirstWorkflowStage: boolean;
  isLastWorkflowStage: boolean;
  onJumpToStage: (stageId: number) => void;
  onSelectPrompt?: (prompt: string) => void;
  selectedPrompt?: string | null;
}

export default function NarrativePanel({
  activeStage,
  activeBrand,
  onNextStage,
  onPrevStage,
  isFirstWorkflowStage,
  isLastWorkflowStage,
  onJumpToStage,
  onSelectPrompt,
  selectedPrompt
}: NarrativePanelProps) {
  const isCompactVerificationStage = activeStage.key === 'verification';

  return (
    <div className={`flex flex-col justify-between h-full text-left ${isCompactVerificationStage ? 'space-y-2' : 'space-y-4'}`} id="narrative-panel">
      {/* Header tagline metadata */}
      <div className={isCompactVerificationStage ? 'space-y-2' : 'space-y-3'}>
        <div className="flex items-center gap-2">
          <span className="h-2 w-2 rounded-full animate-pulse" style={{ backgroundColor: activeBrand.primaryColor }} />
          <span className="text-[10px] font-mono tracking-widest text-zinc-500 uppercase">
            {activeStage.tagline}
          </span>
        </div>

        {/* Dynamic header title */}
        <h3 className={`${isCompactVerificationStage ? 'text-xl md:text-2xl' : 'text-2xl md:text-[1.8rem]'} font-display font-medium text-white tracking-tight leading-tight text-balance`}>
          {activeStage.title}
        </h3>

        {/* Main description block */}
        <p className={`${isCompactVerificationStage ? 'text-xs leading-snug' : 'text-sm leading-relaxed'} text-zinc-300/90 font-sans text-pretty`}>
          {activeStage.description}
        </p>
      </div>

      {/* Slide body copy if present */}
      {activeStage.body && (
        <p className={`${isCompactVerificationStage ? 'text-[11px] leading-snug' : 'text-xs leading-relaxed'} text-zinc-400 font-sans border-l pl-3 whitespace-pre-line text-pretty`} style={{ borderColor: `${activeBrand.primaryColor}55` }}>
          {activeStage.body}
        </p>
      )}

      {/* Stage-specific checklists from UI labels */}
      {activeStage.uiLabels && activeStage.uiLabels.length > 0 && (
        <motion.div
          key={`checks-${activeStage.id}`}
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.22 }}
          className={`${isCompactVerificationStage ? 'p-2.5 space-y-2' : 'p-3 space-y-2.5'} rounded-xl border border-white/5 bg-zinc-950/40`}
        >
          <div className="flex items-center gap-1.5 text-[9px] font-mono uppercase tracking-wider text-zinc-500">
            <Activity className="h-4 w-4 text-zinc-500" /> Live Checks
          </div>

          <div className={`grid grid-cols-1 sm:grid-cols-2 gap-x-4 ${isCompactVerificationStage ? 'gap-y-1 text-[11px]' : 'gap-y-1.5 text-xs'} text-zinc-400`}>
            {activeStage.uiLabels.map((label, idx) => (
              <motion.div
                key={`${activeStage.id}-${label}`}
                initial={{ opacity: 0, x: -6 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ duration: 0.2, delay: idx * 0.025 }}
                className="flex items-center gap-2"
              >
                <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500 flex-shrink-0" />
                <span className="text-zinc-300">{label}</span>
              </motion.div>
            ))}
          </div>
        </motion.div>
      )}

      {/* Slide 6: Example Prompts */}
      {activeStage.examplePrompts && activeStage.examplePrompts.length > 0 && (
        <div className="space-y-2">
          <span className="text-[9px] font-mono text-zinc-500 uppercase tracking-widest block">
            Click to simulate plain-text edit instructions:
          </span>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5">
            {activeStage.examplePrompts.map((prompt, idx) => {
              const isSelected = selectedPrompt === prompt;
              return (
                <button
                  key={idx}
                  onClick={() => onSelectPrompt?.(prompt)}
                  className={`px-2.5 py-1.5 rounded-lg border text-[10px] font-sans text-left leading-tight transition-all duration-200 active:scale-[0.99] ${
                    isSelected
                      ? 'text-white bg-white/10 font-medium'
                      : 'text-zinc-400 border-white/5 bg-white/2 hover:border-white/10 hover:text-zinc-200'
                  }`}
                  style={{
                    borderColor: isSelected ? activeBrand.primaryColor : '',
                    boxShadow: isSelected ? `0 0 10px ${activeBrand.primaryColor}22` : 'none'
                  }}
                >
                  {prompt}
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* Traversal buttons */}
      <div className={`flex items-center gap-3 ${isCompactVerificationStage ? 'pt-1' : 'pt-2'}`}>
        {!isFirstWorkflowStage && (
          <button
            onClick={onPrevStage}
            className="px-4 py-2.5 rounded-lg border border-white/5 hover:border-white/10 hover:bg-white/2 text-xs font-mono uppercase tracking-wider text-zinc-400 hover:text-white transition-all duration-200 active:scale-[0.97]"
            id="narrative-prev-btn"
          >
            Previous
          </button>
        )}

        {!isLastWorkflowStage ? (
          <button
            onClick={onNextStage}
            className="px-5 py-2.5 rounded-lg text-xs font-mono tracking-widest uppercase font-semibold transition-all duration-200 flex items-center gap-1.5 active:scale-95 text-black hover:opacity-90 shadow"
            style={{ backgroundColor: activeBrand.primaryColor }}
            id="narrative-next-btn"
          >
            Next <ArrowRight className="h-3.5 w-3.5" />
          </button>
        ) : (
          <button
            onClick={() => onJumpToStage(0)}
            className="px-5 py-2.5 rounded-lg text-xs font-mono tracking-widest uppercase font-semibold transition-all duration-200 flex items-center gap-1.5 active:scale-95 text-black hover:opacity-90 shadow"
            style={{ backgroundColor: activeBrand.primaryColor }}
            id="narrative-restart-btn"
          >
            Restart Tour <RefreshCw className="h-3.5 w-3.5" />
          </button>
        )}
      </div>
    </div>
  );
}
