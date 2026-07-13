import { motion, AnimatePresence } from 'motion/react';
import { ShieldCheck, CheckCircle2, AlertTriangle, Layers, Calendar, Lock, Sparkles, FileText, Check, Play, UserCheck, CreditCard, RefreshCw, AlertCircle, MapPin, Film, Search, ExternalLink } from 'lucide-react';
import { BrandData } from '../types';

interface DynamicMockupProps {
  activeStageId: number;
  activeBrand: BrandData;
  onActionTriggered?: (action: string) => void;
}

export default function DynamicMockup({ activeStageId, activeBrand, onActionTriggered }: DynamicMockupProps) {
  // Brand candidates render
  const renderBrandTruth = () => {
    const ec = activeBrand.extractedCandidates;
    return (
      <div className="space-y-4 text-left p-4 h-full overflow-y-auto" id="mockup-brand-truth">
        <div className="flex justify-between items-center border-b border-white/5 pb-2">
          <span className="text-[10px] font-mono text-zinc-500 uppercase">Input Intake Link</span>
          <span className="text-xs font-mono text-white select-all">{activeBrand.url}</span>
        </div>

        {/* Brand Candidates List */}
        <div className="space-y-3">
          <div>
            <h5 className="text-[9px] font-mono text-zinc-500 uppercase tracking-widest mb-1">Logo Candidates</h5>
            <div className="flex flex-wrap gap-1.5">
              {ec.logos.map((logo, idx) => (
                <span key={idx} className="px-2 py-0.5 rounded border border-white/5 bg-white/2 text-[10px] text-zinc-300 font-sans">
                  {logo}
                </span>
              ))}
            </div>
          </div>

          <div>
            <h5 className="text-[9px] font-mono text-zinc-500 uppercase tracking-widest mb-1">Extracted Color Palette</h5>
            <div className="flex gap-2">
              {ec.colors.map((color, idx) => (
                <div key={idx} className="flex items-center gap-1.5 bg-white/2 border border-white/5 p-1 rounded">
                  <div className="h-3.5 w-3.5 rounded-sm border border-white/10" style={{ backgroundColor: color.split(' ')[0] }} />
                  <span className="text-[9px] font-mono text-zinc-400">{color.split(' ')[0]}</span>
                </div>
              ))}
            </div>
          </div>

          <div>
            <h5 className="text-[9px] font-mono text-zinc-500 uppercase tracking-widest mb-1">Inviolable Claim Rules</h5>
            <div className="space-y-1 bg-black/40 p-2.5 rounded-lg border border-white/5">
              <p className="text-[9px] text-zinc-500 font-mono">REQUIRED PHRASE:</p>
              <p className="text-[10px] text-white italic">"{activeBrand.guidelines[3]}"</p>
            </div>
          </div>

          <div>
            <h5 className="text-[9px] font-mono text-zinc-500 uppercase tracking-widest mb-1.5">Brand Prohibitions</h5>
            <div className="space-y-1">
              {ec.prohibitions.map((p, idx) => (
                <div key={idx} className="flex items-start gap-1.5 text-red-400/80">
                  <span className="text-red-500 mt-0.5 font-mono">✕</span>
                  <p className="text-[9px] font-sans leading-tight">{p}</p>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Stamp Overlay */}
        <motion.div
          initial={{ scale: 1.5, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={{ type: 'spring', damping: 15 }}
          className="mt-4 p-2 rounded border-2 border-dashed flex items-center justify-center gap-1.5 uppercase font-mono tracking-widest text-[10px] bg-emerald-500/5 text-emerald-400"
          style={{ borderColor: '#10b981' }}
        >
          <ShieldCheck className="h-4 w-4" /> HUMAN CLIENT MANAGER APPROVED
        </motion.div>
      </div>
    );
  };

  // Blueprint Discovery render
  const renderBlueprint = () => {
    const sb = activeBrand.sampleBlueprint;
    return (
      <div className="space-y-4 text-left p-4 h-full overflow-y-auto" id="mockup-blueprint">
        <div className="bg-black/40 border border-white/5 rounded-xl p-3 space-y-2">
          <div className="flex justify-between items-center">
            <span className="px-2 py-0.5 text-[8px] font-mono bg-zinc-900 border border-white/10 text-zinc-400 rounded">
              VIRAL REFERENCE
            </span>
            <span className="text-[9px] font-mono text-zinc-500">{sb.sourceUrl}</span>
          </div>
          <div className="grid grid-cols-3 gap-2">
            {[
              { label: 'VIEWS', val: sb.metrics.views },
              { label: 'ENGAGEMENT', val: sb.metrics.engagement },
              { label: 'RATIO', val: sb.metrics.ratio }
            ].map((m, idx) => (
              <div key={idx} className="bg-white/2 border border-white/5 p-1.5 rounded text-center leading-none">
                <span className="text-[8px] font-mono text-zinc-500 uppercase block mb-1">{m.label}</span>
                <span className="text-xs font-mono font-bold text-white">{m.val}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Structural Blueprint Timeline */}
        <div>
          <h5 className="text-[9px] font-mono text-zinc-500 uppercase tracking-widest mb-2 text-left">
            Extracted Structure (Timing & Rhythm)
          </h5>
          <div className="space-y-2">
            {[
              { label: 'HOOK SEQUENCE (0-3s)', text: sb.structure.hook },
              { label: 'AESTHETIC SETUP (3-7s)', text: sb.structure.setup },
              { label: 'USP VALUE DRIFT (7-14s)', text: sb.structure.value },
              { label: 'ACTION GATE CTA (14-18s)', text: sb.structure.cta }
            ].map((seg, idx) => (
              <div key={idx} className="relative pl-3 border-l border-white/10 text-left">
                <div className="absolute -left-[3.5px] top-1.5 h-1.5 w-1.5 rounded-full" style={{ backgroundColor: activeBrand.primaryColor }} />
                <p className="text-[8px] font-mono text-zinc-500 uppercase tracking-wider leading-none mb-0.5">{seg.label}</p>
                <p className="text-[10px] font-sans text-zinc-300 leading-tight">{seg.text}</p>
              </div>
            ))}
          </div>
        </div>

        <div className="p-2.5 rounded border border-white/5 bg-white/2 text-[9px] font-mono text-zinc-500 uppercase text-center">
          The structure remains. The content becomes yours.
        </div>
      </div>
    );
  };

  // Script Tournament render
  const renderScripts = () => {
    return (
      <div className="space-y-4 text-left p-4 h-full overflow-y-auto" id="mockup-scripts">
        <h5 className="text-[9px] font-mono text-zinc-500 uppercase tracking-widest mb-1.5">
          Script Tournament Pool (10-20 Variants Generated)
        </h5>
        <div className="space-y-2.5">
          {activeBrand.scripts.map((script) => (
            <div
              key={script.id}
              className={`rounded-lg border p-3 space-y-2 transition-all duration-300 ${
                script.safety === 'Blocked'
                  ? 'border-red-500/20 bg-red-500/5 opacity-55'
                  : script.id === 'script-aura-1' || script.id === 'script-soma-1' || script.id === 'script-vedic-1'
                  ? 'border-emerald-500/30 bg-emerald-500/5'
                  : 'border-white/5 bg-white/2'
              }`}
            >
              <div className="flex justify-between items-center text-[9px] font-mono">
                <span className="text-white font-medium">{script.hookType}</span>
                <span
                  style={{
                    color: script.safety === 'Blocked' ? '#f87171' : script.score >= 90 ? '#34d399' : activeBrand.primaryColor
                  }}
                >
                  Score: {script.score}%
                </span>
              </div>

              <div className="space-y-1">
                <p className="text-[10px] font-display font-semibold text-white leading-tight">
                  "{script.hookText}"
                </p>
                <p className="text-[9px] text-zinc-400 font-sans leading-snug truncate">
                  {script.setupText}
                </p>
              </div>

              <div className="h-px bg-white/5" />

              <div className="flex justify-between items-center text-[8px] font-mono uppercase">
                <span className="text-zinc-500">{script.brandFit}</span>
                {script.safety === 'Blocked' ? (
                  <span className="text-red-400 bg-red-500/10 px-1.5 py-0.5 rounded border border-red-500/20">
                    BLOCKED: INFRACTION
                  </span>
                ) : script.id === 'script-aura-1' || script.id === 'script-soma-1' || script.id === 'script-vedic-1' ? (
                  <span className="text-emerald-400 bg-emerald-500/10 px-1.5 py-0.5 rounded border border-emerald-500/20 flex items-center gap-1">
                    <Check className="h-2 w-2" /> SELECTED
                  </span>
                ) : (
                  <span className="text-zinc-400 hover:text-white cursor-pointer">
                    Click to swap
                  </span>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>
    );
  };

  // Avatar Consent render
  const renderAvatar = () => {
    return (
      <div className="space-y-4 text-left p-4 h-full overflow-y-auto" id="mockup-avatar">
        <h5 className="text-[9px] font-mono text-zinc-500 uppercase tracking-widest mb-1">
          Likeness catalogue & consent validation
        </h5>
        <p className="text-[10px] text-zinc-400 mb-2 leading-tight">
          Ineligible or revoked cards are blocked prior to generation submitting.
        </p>
        <div className="grid grid-cols-1 gap-3">
          {activeBrand.avatars.map((av) => {
            const isEligible = av.consentState === 'Eligible';
            return (
              <div
                key={av.id}
                className={`flex items-center justify-between p-3 rounded-lg border transition-all duration-300 ${
                  isEligible
                    ? 'border-white/10 bg-white/2 hover:border-white/20'
                    : 'border-red-500/10 bg-red-500/2 opacity-50'
                }`}
              >
                <div className="flex items-center gap-3">
                  <img
                    src={av.avatarUrl}
                    alt={av.name}
                    className="h-10 w-10 rounded-full object-cover border border-white/10"
                    referrerPolicy="no-referrer"
                  />
                  <div className="leading-tight text-left">
                    <p className="text-xs font-display font-medium text-white">{av.name}</p>
                    <p className="text-[9px] text-zinc-500 font-mono mt-0.5">{av.type}</p>
                    <p className="text-[8px] text-zinc-400 font-mono mt-0.5 italic">{av.voice}</p>
                  </div>
                </div>

                <div className="text-right">
                  {isEligible ? (
                    <span className="text-[8px] font-mono px-2 py-0.5 rounded bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 flex items-center gap-1">
                      <UserCheck className="h-3 w-3" /> ELIGIBLE
                    </span>
                  ) : (
                    <span className="text-[8px] font-mono px-2 py-0.5 rounded bg-red-500/10 text-red-400 border border-red-500/20 flex items-center gap-1 uppercase">
                      <Lock className="h-3 w-3" /> {av.consentState}
                    </span>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    );
  };

  // Cost estimate render
  const renderCost = () => {
    const ce = activeBrand.costEstimate;
    return (
      <div className="space-y-4 text-left p-4 h-full overflow-y-auto" id="mockup-cost">
        <div className="bg-zinc-900/60 rounded-xl border border-white/15 p-4 space-y-3 relative overflow-hidden">
          <div className="flex justify-between text-[9px] font-mono text-zinc-500 border-b border-white/5 pb-2">
            <span>PRICE CALCULATION GATES</span>
            <span>ID: {ce.reservationId}</span>
          </div>

          <div className="space-y-2">
            <div className="flex justify-between items-center">
              <span className="text-xs text-zinc-400">Selected Duration:</span>
              <span className="text-xs font-mono font-medium text-white">{ce.duration}</span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-xs text-zinc-400">Rate Plan Version:</span>
              <span className="text-xs font-mono font-medium text-white">{ce.priceVersion}</span>
            </div>
            <div className="flex justify-between items-center border-t border-white/5 pt-2">
              <span className="text-xs text-white font-medium">Reserved Credits:</span>
              <span className="text-sm font-mono font-bold text-white" style={{ color: activeBrand.primaryColor }}>
                {ce.maxAuthorised}
              </span>
            </div>
          </div>

          {/* Wallet integration info */}
          <div className="h-px bg-white/5" />
          <div className="flex justify-between items-center text-[9px] font-mono text-zinc-500 leading-none">
            <span>CURRENT WALLET BALANCE</span>
            <span className="text-white">{ce.walletBalance}</span>
          </div>
        </div>

        {/* Append-only ledger visualization */}
        <div className="space-y-1.5">
          <h5 className="text-[8px] font-mono text-zinc-500 uppercase tracking-widest">Append-Only Ledger Record</h5>
          <div className="bg-black/40 border border-white/5 rounded p-2.5 space-y-1 font-mono text-[9px] text-zinc-400 text-left leading-none">
            <p className="text-emerald-400">✓ [01:45:00] RESERVE {ce.maxAuthorised} -- ID: {ce.reservationId}</p>
            <p className="text-zinc-600">⌛ [PENDING] CAPTURE ON PROVIDER_SETTLE</p>
          </div>
        </div>

        <div className="p-2.5 rounded border border-white/5 bg-white/2 text-[9px] font-mono text-zinc-500 uppercase text-center leading-tight">
          Credits are captured only after successful generation. Quick release on failure.
        </div>
      </div>
    );
  };

  // Generation Reconciliation render
  const renderGeneration = () => {
    return (
      <div className="space-y-4 text-left p-4 h-full overflow-y-auto animate-pulse" id="mockup-generation">
        <div className="flex justify-between items-center border-b border-white/5 pb-2">
          <span className="text-[9px] font-mono text-zinc-500 uppercase">Provider Status Track</span>
          <span className="text-[9px] font-mono text-amber-400 flex items-center gap-1 uppercase">
            <RefreshCw className="h-3 w-3 animate-spin" /> UNKNOWN_PENDING_RECONCILE
          </span>
        </div>

        {/* Stage blocks */}
        <div className="grid grid-cols-4 gap-1">
          {[
            { label: 'QUEUED', state: 'done' },
            { label: 'SUBMIT', state: 'done' },
            { label: 'PROVIDER', state: 'unknown' },
            { label: 'SETTLE', state: 'pending' }
          ].map((st, idx) => (
            <div
              key={idx}
              className={`border p-1 text-center rounded leading-none ${
                st.state === 'done'
                  ? 'border-emerald-500/20 bg-emerald-500/5 text-emerald-400'
                  : st.state === 'unknown'
                  ? 'border-amber-500/30 bg-amber-500/5 text-amber-400'
                  : 'border-white/5 bg-white/2 text-zinc-600'
              }`}
            >
              <span className="text-[8px] font-mono uppercase block">{st.label}</span>
            </div>
          ))}
        </div>

        {/* Reconciliation logs */}
        <div className="space-y-1.5">
          <h5 className="text-[8px] font-mono text-zinc-500 uppercase tracking-widest">Active Safety Actions</h5>
          <div className="bg-black/40 border border-white/5 rounded p-3 space-y-1.5 font-mono text-[9px] text-zinc-400">
            <div className="flex items-start gap-1.5 text-amber-400">
              <AlertCircle className="h-3.5 w-3.5 mt-0.5 flex-shrink-0" />
              <span>Provider connection timed out. Status of Job #GEN-{activeBrand.id.toUpperCase()}-1 is currently UNKNOWN.</span>
            </div>
            <div className="h-px bg-white/5 my-1" />
            <p className="text-zinc-400">⌛ [Action Log]: Double submit prevention block is engaged.</p>
            <p className="text-zinc-500">⌛ [Action Log]: Re-evaluating provider side transaction hash prior to retrying.</p>
          </div>
        </div>
      </div>
    );
  };

  // Composition Render checks
  const renderComposition = () => {
    const comp = activeBrand.composition;
    return (
      <div className="space-y-4 text-left p-4 h-full overflow-y-auto" id="mockup-composition">
        <h5 className="text-[9px] font-mono text-zinc-500 uppercase tracking-widest mb-1.5">
          After-Effects Composition Pipeline Plan
        </h5>

        {/* Checked assets list */}
        <div className="bg-black/40 p-2.5 rounded-lg border border-white/5 space-y-1.5 text-left">
          <span className="text-[7px] font-mono text-zinc-500 block uppercase">Watermark & Fonts Verification Check</span>
          <div className="space-y-1 text-[9px] font-mono">
            {comp.assetsChecked.map((asset, idx) => (
              <div key={idx} className="flex items-center gap-1.5 text-emerald-400">
                <Check className="h-3 w-3" /> {asset}
              </div>
            ))}
          </div>
        </div>

        {/* Timeline block */}
        <div className="space-y-1.5">
          <span className="text-[8px] font-mono text-zinc-500 block uppercase tracking-widest">Render Composition Timeline</span>
          <div className="space-y-1.5">
            {comp.timeline.map((item, idx) => (
              <div key={idx} className="flex justify-between items-center text-[10px] bg-white/2 p-2 rounded border border-white/5 font-sans">
                <span className="text-white font-medium">{item.action}</span>
                <span className="text-zinc-500 font-mono text-[9px]">{item.time}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    );
  };

  // Review Board render
  const renderReview = () => {
    const ri = activeBrand.reviewItem;
    return (
      <div className="space-y-4 text-left p-4 h-full overflow-y-auto" id="mockup-review">
        <div className="flex justify-between items-center border-b border-white/5 pb-2">
          <span className="text-[10px] font-mono text-zinc-500 uppercase">Version Latch</span>
          <span className="text-xs font-mono text-white" style={{ color: activeBrand.primaryColor }}>{ri.version}</span>
        </div>

        {/* Comments stream */}
        <div className="space-y-2">
          <span className="text-[8px] font-mono text-zinc-500 uppercase block tracking-widest">Team Discussion Timeline</span>
          {ri.comments.map((comment, idx) => (
            <div key={idx} className="bg-white/2 p-2.5 rounded-lg border border-white/5 space-y-1 text-left leading-tight">
              <div className="flex justify-between text-[9px] font-mono">
                <span className="text-white font-medium">{comment.user}</span>
                <span className="text-zinc-500">{comment.time}</span>
              </div>
              <p className="text-[10px] text-zinc-300 font-sans">"{comment.text}"</p>
            </div>
          ))}
        </div>

        {/* Decision Stamp */}
        <div className="p-3 bg-emerald-500/10 border border-emerald-500/20 rounded-xl flex items-center justify-between text-left">
          <div className="leading-none">
            <span className="text-[8px] font-mono text-zinc-500 uppercase">LOCKED DECISION HASH</span>
            <p className="text-xs font-mono font-medium text-emerald-400 mt-1 uppercase tracking-wider flex items-center gap-1">
              <CheckCircle2 className="h-3.5 w-3.5" /> Approved
            </p>
          </div>
          <span className="text-[9px] font-mono text-zinc-500 select-all">{ri.hash.substring(0, 18)}...</span>
        </div>
      </div>
    );
  };

  // Calendar render
  const renderCalendar = () => {
    const cp = activeBrand.calendarPost;
    return (
      <div className="space-y-4 text-left p-4 h-full overflow-y-auto" id="mockup-calendar">
        <div className="bg-zinc-900/40 border border-white/10 rounded-xl p-3.5 space-y-2 text-left">
          <div className="flex justify-between items-center">
            <span className="text-[9px] font-mono text-zinc-500 uppercase">Publication Hub</span>
            <span className="text-[10px] font-mono text-white" style={{ color: activeBrand.primaryColor }}>
              {cp.platform}
            </span>
          </div>
          <p className="text-xs font-sans text-white font-semibold">{cp.account}</p>
          <p className="text-[10px] text-zinc-400 font-sans italic leading-tight">
            "{cp.caption.substring(0, 80)}..."
          </p>
        </div>

        {/* Verification checklist results */}
        <div className="space-y-1.5">
          <span className="text-[8px] font-mono text-zinc-500 block uppercase tracking-widest">
            Audience Verification Checks (Crawler results)
          </span>
          <div className="space-y-1">
            {cp.verificationChecklist.map((chk, idx) => (
              <div key={idx} className="flex items-center gap-2 bg-white/2 border border-white/5 p-2 rounded text-[10px] font-mono text-zinc-300">
                <CheckCircle2 className="h-4 w-4 text-emerald-400 flex-shrink-0" />
                <span>{chk.label}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Live confirmation stamp */}
        <div className="p-2.5 rounded border border-emerald-500/20 bg-emerald-500/5 text-[9px] font-mono text-emerald-400 flex items-center justify-between">
          <span className="flex items-center gap-1 uppercase tracking-widest font-semibold">
            <Check className="h-3 w-3" /> AUDIENCE VERIFIED LIVE
          </span>
          <span className="text-zinc-500">{cp.liveUrl}</span>
        </div>
      </div>
    );
  };

  // Connected Lineage ledger graph render
  const renderLineage = () => {
    return (
      <div className="relative p-4 h-full flex flex-col justify-between overflow-y-auto" id="mockup-lineage">
        <h5 className="text-[9px] font-mono text-zinc-500 uppercase tracking-widest mb-3 text-left">
          Interconnected Ledger Nodes Tree (Ancestry Flow)
        </h5>

        <div className="space-y-2 relative text-left">
          {/* Custom SVG line decoration connecting nodes */}
          <div className="absolute left-3 top-2 bottom-2 w-0.5 bg-gradient-to-b from-amber-500 via-emerald-500 to-transparent pointer-events-none" />

          {[
            { tag: 'BRAND_URL', val: activeBrand.url, col: activeBrand.primaryColor },
            { tag: 'EXTRACT_BLUEPRINT', val: activeBrand.sampleBlueprint.category, col: '#fff' },
            { tag: 'WINNING_SCRIPT_TEXT', val: activeBrand.scripts[0].hookText.substring(0, 30) + '...', col: '#fff' },
            { tag: 'AVATAR_CONSENT_HASH', val: 'av-id: ' + activeBrand.avatars[0].id, col: '#34d399' },
            { tag: 'ESTIMATE_LEDGER_TX', val: 'RES_ID: ' + activeBrand.costEstimate.reservationId, col: activeBrand.primaryColor },
            { tag: 'REVIEW_VERSION_APPROVAL', val: activeBrand.reviewItem.version, col: '#10b981' },
            { tag: 'LIVE_POST_VERIFIED', val: activeBrand.calendarPost.liveUrl, col: '#10b981' }
          ].map((node, idx) => (
            <div key={idx} className="relative pl-7 py-0.5 flex items-center justify-between leading-none">
              <div className="absolute left-2.5 top-2.5 h-1.5 w-1.5 rounded-full" style={{ backgroundColor: node.col }} />
              <div>
                <p className="text-[8px] font-mono text-zinc-500 leading-none uppercase">{node.tag}</p>
                <p className="text-[10px] font-mono text-zinc-300 mt-1 leading-none">{node.val}</p>
              </div>
              <span className="text-[8px] font-mono text-zinc-600">Trace Verified</span>
            </div>
          ))}
        </div>

        <div className="mt-4 p-2.5 rounded bg-white/2 border border-white/5 text-[9px] font-mono text-zinc-500 uppercase text-center">
          Every output explains exactly where it came from.
        </div>
      </div>
    );
  };

  const renderStageVisual = () => {
    switch (activeStageId) {
      case 2:
        return renderBrandTruth();
      case 3:
        return renderBlueprint();
      case 4:
        return renderScripts();
      case 5:
        return renderAvatar();
      case 6:
        return renderCost();
      case 7:
        return renderGeneration();
      case 8:
        return renderComposition();
      case 9:
        return renderReview();
      case 10:
        return renderCalendar();
      case 11:
        return renderLineage();
      default:
        return (
          <div className="flex flex-col items-center justify-center h-full p-6 text-center text-zinc-500 font-mono text-xs">
            <Sparkles className="h-6 w-6 animate-pulse mb-2 text-zinc-500" />
            Select any workflow stage below to observe its live simulated parameters.
          </div>
        );
    }
  };

  return (
    <div className="relative w-full h-full bg-zinc-950/80 rounded-2xl border border-white/10 overflow-hidden backdrop-blur shadow-2xl flex flex-col" id="product-theatre-mockup">
      {/* Upper header section */}
      <div className="p-3 border-b border-white/5 flex justify-between items-center bg-zinc-950/40 select-none">
        <div className="flex items-center gap-1.5">
          <div className="flex gap-1">
            <div className="h-2 w-2 rounded-full bg-red-500/60" />
            <div className="h-2 w-2 rounded-full bg-yellow-500/60" />
            <div className="h-2 w-2 rounded-full bg-green-500/60" />
          </div>
          <span className="text-[9px] font-mono text-zinc-500 uppercase tracking-widest pl-2">
            Sakhaa Forge Mock Console // {activeBrand.id.toUpperCase()}_WORKSPACE
          </span>
        </div>

        <div className="flex items-center gap-1 font-mono text-[9px] text-zinc-400 bg-white/5 px-2 py-0.5 rounded border border-white/10">
          <Lock className="h-3 w-3 text-zinc-500" /> Secure Sandbox Enclave
        </div>
      </div>

      {/* Main active content box */}
      <div className="flex-1 overflow-hidden relative">
        <AnimatePresence mode="wait">
          <motion.div
            key={`${activeStageId}-${activeBrand.id}`}
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -20 }}
            transition={{ duration: 0.3 }}
            className="w-full h-full"
          >
            {renderStageVisual()}
          </motion.div>
        </AnimatePresence>
      </div>

      {/* Footer statistics label */}
      <div className="p-3 border-t border-white/5 bg-zinc-950/40 flex justify-between items-center text-[9px] font-mono text-zinc-500 select-none">
        <span>GATED STEP {activeStageId - 1} OF 10</span>
        <span>AUDIT EVIDENCE SYNCED // OK</span>
      </div>
    </div>
  );
}
