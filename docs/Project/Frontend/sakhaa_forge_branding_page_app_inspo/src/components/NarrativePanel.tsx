import { motion } from 'motion/react';
import { ArrowRight, ShieldCheck, HelpCircle, Activity, ChevronRight, CheckCircle2, RefreshCw } from 'lucide-react';
import { BrandData, ProductionStage } from '../types';

interface NarrativePanelProps {
  activeStage: ProductionStage;
  activeBrand: BrandData;
  onNextStage: () => void;
  onPrevStage: () => void;
  isFirstWorkflowStage: boolean;
  isLastWorkflowStage: boolean;
  onJumpToStage: (stageId: number) => void;
}

export default function NarrativePanel({
  activeStage,
  activeBrand,
  onNextStage,
  onPrevStage,
  isFirstWorkflowStage,
  isLastWorkflowStage,
  onJumpToStage
}: NarrativePanelProps) {
  return (
    <div className="flex flex-col justify-between h-full space-y-6 text-left" id="narrative-panel">
      {/* Header tagline metadata */}
      <div className="space-y-4">
        <div className="flex items-center gap-2">
          <span className="h-2 w-2 rounded-full" style={{ backgroundColor: activeBrand.primaryColor }} />
          <span className="text-[10px] font-mono tracking-widest text-zinc-500 uppercase">
            {activeStage.tagline}
          </span>
        </div>

        {/* Dynamic header title */}
        <h3 className="text-2xl md:text-3xl font-display font-medium text-white tracking-tight leading-tight">
          {activeStage.title}
        </h3>

        {/* Main description block */}
        <p className="text-zinc-400 text-sm leading-relaxed font-sans">
          {activeStage.description}
        </p>
      </div>

      {/* Stage-specific custom evidentiary insights (Swiss Grid lists) */}
      <div className="p-4 rounded-xl border border-white/5 bg-zinc-950/40 space-y-3">
        <div className="flex items-center gap-1.5 text-[9px] font-mono uppercase tracking-wider" style={{ color: activeBrand.primaryColor }}>
          <ShieldCheck className="h-4 w-4" /> Traceability Evidence Logs
        </div>

        <div className="space-y-2 text-xs text-zinc-400">
          {activeStage.id === 2 && (
            <>
              <p>• Automated crawler extracted 3 logos & guidelines from <span className="text-white font-mono">{activeBrand.url}</span>.</p>
              <p>• Verified claims rules configured: <strong>No generic discount EMIs allowed.</strong></p>
            </>
          )}
          {activeStage.id === 3 && (
            <>
              <p>• Extraction from viral candidate <span className="text-white font-mono">{activeBrand.sampleBlueprint.sourceUrl.split('/')[2]}</span> completed.</p>
              <p>• Original footage dissolved; hook, timing, and pattern-interrupt blueprint saved.</p>
            </>
          )}
          {activeStage.id === 4 && (
            <>
              <p>• Pre-flight checker flagged 1 out-of-bounds script variant (Score: 25%).</p>
              <p>• Immutable selected script locked: <strong>"{activeBrand.scripts[0].hookText.substring(0, 45)}..."</strong></p>
            </>
          )}
          {activeStage.id === 5 && (
            <>
              <p>• Active catalog consent check: <strong>{activeBrand.avatars[0].name} is certified eligible.</strong></p>
              <p>• Unconsented or expired talent profiles automatically blocked from paid renders.</p>
            </>
          )}
          {activeStage.id === 6 && (
            <>
              <p>• Rate card locked: <strong>v4.1 Standard Plan</strong>.</p>
              <p>• Maximum authorized balance reservation: <span className="text-white font-mono">{activeBrand.costEstimate.maxAuthorised}</span>.</p>
            </>
          )}
          {activeStage.id === 7 && (
            <>
              <p>• Dual-submit double charge lock is actively monitoring external rendering clusters.</p>
              <p>• <strong>"Unknown" provider outputs</strong> are checked via server-to-server hashes.</p>
            </>
          )}
          {activeStage.id === 8 && (
            <>
              <p>• Safe composition margins validated. Captions checked for overlay readability.</p>
              <p>• High-fidelity assets integrated: <strong>{activeBrand.composition.assetsChecked[0]}</strong>.</p>
            </>
          )}
          {activeStage.id === 9 && (
            <>
              <p>• Approved by legal counsel. <strong>Decision cryptographically bound to version {activeBrand.reviewItem.version}.</strong></p>
              <p>• Older draft compositions are permanently locked from scheduling.</p>
            </>
          )}
          {activeStage.id === 10 && (
            <>
              <p>• Crawler successfully matched rendering signature of live video with Facebook/Instagram.</p>
              <p>• Status: <strong>Audience Verified Live.</strong></p>
            </>
          )}
          {activeStage.id === 11 && (
            <>
              <p>• Complete creative, financial, and regulatory tree is synchronized.</p>
              <p>• <strong>Immutable record hash:</strong> <span className="text-white font-mono text-[10px] break-all">{activeBrand.reviewItem.hash}</span>.</p>
            </>
          )}
        </div>
      </div>

      {/* Next actions & Stage traversal buttons */}
      <div className="space-y-4 pt-2">
        <div className="flex items-center gap-2 text-[10px] text-zinc-500 font-mono leading-tight">
          <ChevronRight className="h-3.5 w-3.5 flex-shrink-0" />
          <span>Next Safe Action: {activeStage.nextSafeAction}</span>
        </div>

        <div className="flex items-center gap-3">
          {!isFirstWorkflowStage && (
            <button
              onClick={onPrevStage}
              className="px-4 py-2.5 rounded-lg border border-white/5 hover:border-white/10 hover:bg-white/2 text-xs font-mono uppercase tracking-wider text-zinc-400 hover:text-white transition-all duration-200"
              id="narrative-prev-btn"
            >
              Previous Step
            </button>
          )}

          {!isLastWorkflowStage ? (
            <button
              onClick={onNextStage}
              className="px-5 py-2.5 rounded-lg text-xs font-mono tracking-widest uppercase font-semibold transition-all duration-200 flex items-center gap-1.5 active:scale-95 text-black hover:opacity-90 shadow"
              style={{ backgroundColor: activeBrand.primaryColor }}
              id="narrative-next-btn"
            >
              Next Step <ArrowRight className="h-3.5 w-3.5" />
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
    </div>
  );
}
