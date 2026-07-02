import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { CheckCircle2, Lock, Sparkles, Check, RefreshCw, Film, Calendar, Activity } from 'lucide-react';
import { BrandData } from '../types';

interface DynamicMockupProps {
  activeStageId: number;
  activeBrand: BrandData;
  selectedPrompt?: string | null;
}

export default function DynamicMockup({ activeStageId, activeBrand, selectedPrompt }: DynamicMockupProps) {
  const [typedPrompt, setTypedPrompt] = useState('');

  // Typewriter effect simulation for Slide 6 V2 Simulation
  useEffect(() => {
    if (activeStageId === 5) {
      const promptToType = selectedPrompt || 'Make the hook faster in the first 3 seconds.';
      setTypedPrompt('');
      let i = 0;
      const interval = setInterval(() => {
        setTypedPrompt(promptToType.substring(0, i + 1));
        i++;
        if (i >= promptToType.length) {
          clearInterval(interval);
        }
      }, 30);
      return () => clearInterval(interval);
    }
  }, [selectedPrompt, activeStageId]);
  const renderExtraction = () => {
    const sb = activeBrand.sampleBlueprint;
    const ec = activeBrand.extractedCandidates;
    return (
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 p-4 h-full overflow-y-auto text-left" id="mockup-extraction">
        {/* Discovered trend structure */}
        <div className="space-y-3 bg-black/40 border border-white/5 p-3 rounded-xl flex flex-col justify-between">
          <div className="space-y-3">
            <div className="flex justify-between items-center border-b border-white/5 pb-1.5">
              <span className="px-1.5 py-0.5 text-[8px] font-mono bg-zinc-900 border border-white/10 text-zinc-400 rounded">
                DISCOVERED TREND BLUEPRINT
              </span>
              <span className="text-[9px] font-mono text-zinc-500">{sb.sourceUrl}</span>
            </div>

            <div className="grid grid-cols-3 gap-1.5">
              {[
                { label: 'VIEWS', val: sb.metrics.views },
                { label: 'ENGAGEMENT', val: sb.metrics.engagement },
                { label: 'RATIO', val: sb.metrics.ratio }
              ].map((m, idx) => (
                <div key={idx} className="bg-white/2 border border-white/5 p-1 rounded text-center leading-none">
                  <span className="text-[7px] font-mono text-zinc-500 uppercase block mb-1">{m.label}</span>
                  <span className="text-[10px] font-mono font-bold text-white">{m.val}</span>
                </div>
              ))}
            </div>

            <div className="space-y-2 pt-1.5">
              {[
                { label: 'Hook Sequence (0-3s)', text: sb.structure.hook },
                { label: 'Aesthetic Setup (3-7s)', text: sb.structure.setup },
                { label: 'USP Value Drift (7-14s)', text: sb.structure.value },
                { label: 'Action Gate CTA (14-18s)', text: sb.structure.cta }
              ].map((seg, idx) => (
                <div key={idx} className="relative pl-3 border-l border-white/10">
                  <div className="absolute -left-[3.5px] top-1.5 h-1.5 w-1.5 rounded-full" style={{ backgroundColor: activeBrand.primaryColor }} />
                  <p className="text-[8px] font-mono text-zinc-500 uppercase tracking-wider leading-none mb-0.5">{seg.label}</p>
                  <p className="text-[9.5px] text-zinc-300 leading-tight font-sans">{seg.text}</p>
                </div>
              ))}
            </div>
          </div>

          <div className="text-[9px] font-mono text-zinc-500 uppercase text-center border-t border-white/5 pt-2">
            Trend found, hook mapped & structure saved
          </div>
        </div>

        {/* Brand Scanned */}
        <div className="space-y-3 bg-black/40 border border-white/5 p-3 rounded-xl flex flex-col justify-between">
          <div className="space-y-3">
            <div className="flex justify-between items-center border-b border-white/5 pb-1.5">
              <span className="px-1.5 py-0.5 text-[8px] font-mono bg-zinc-900 border border-white/10 text-zinc-400 rounded">
                BRAND TRUTH CRAWLED
              </span>
              <span className="text-[9px] font-mono text-zinc-500">{activeBrand.url}</span>
            </div>

            <div className="space-y-2">
              <div>
                <h5 className="text-[8px] font-mono text-zinc-500 uppercase tracking-widest mb-1">Color Palette</h5>
                <div className="flex gap-1.5">
                  {ec.colors.map((color, idx) => (
                    <div key={idx} className="flex items-center gap-1 bg-white/2 border border-white/5 p-1 rounded-md">
                      <div className="h-3 w-3 rounded-sm border border-white/10" style={{ backgroundColor: color.split(' ')[0] }} />
                      <span className="text-[8px] font-mono text-zinc-400">{color.split(' ')[0]}</span>
                    </div>
                  ))}
                </div>
              </div>

              <div>
                <h5 className="text-[8px] font-mono text-zinc-500 uppercase tracking-widest mb-1">Extracted USPs</h5>
                <div className="bg-black/30 p-2 rounded border border-white/5 text-[9.5px] text-zinc-300 italic font-sans leading-tight">
                  "{activeBrand.guidelines[3] || activeBrand.guidelines[0]}"
                </div>
              </div>

              <div>
                <h5 className="text-[8px] font-mono text-zinc-500 uppercase tracking-widest mb-1">Prohibitions Checked</h5>
                <div className="space-y-1">
                  {ec.prohibitions.map((p, idx) => (
                    <div key={idx} className="flex items-start gap-1 text-[9px] text-red-400 leading-tight">
                      <span className="text-red-500 font-mono">✕</span>
                      <span>{p}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>

          <div className="text-[9px] font-mono text-emerald-400 bg-emerald-500/5 py-1 px-2.5 rounded border border-emerald-500/20 text-center uppercase tracking-wide">
            ✓ Campaign Angle Ready
          </div>
        </div>
      </div>
    );
  };

  // Slide 3: UGC Avatars Mockup
  const renderAvatarsUGC = () => {
    return (
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 p-4 h-full overflow-y-auto text-left" id="mockup-avatars">
        {/* Likeness catalogue */}
        <div className="space-y-3 bg-black/40 border border-white/5 p-3 rounded-xl">
          <span className="px-1.5 py-0.5 text-[8px] font-mono bg-zinc-900 border border-white/10 text-zinc-400 rounded">
            AVATAR CATALOGUE
          </span>
          <div className="space-y-2">
            {activeBrand.avatars.map((av, idx) => {
              const isEligible = av.consentState === 'Eligible';
              const isSelected = idx === 0; // Select first avatar by default
              return (
                <div
                  key={av.id}
                  className={`flex items-center justify-between p-2 rounded-lg border transition-all duration-300 ${
                    isSelected
                      ? 'border-emerald-500/30 bg-emerald-500/5'
                      : isEligible
                      ? 'border-white/5 bg-white/2'
                      : 'border-red-500/10 bg-red-500/2 opacity-40'
                  }`}
                >
                  <div className="flex items-center gap-2">
                    <img
                      src={av.avatarUrl}
                      alt={av.name}
                      className="h-8 w-8 rounded-full object-cover border border-white/10"
                      referrerPolicy="no-referrer"
                    />
                    <div className="leading-none text-left">
                      <p className="text-[10px] font-medium text-white">{av.name}</p>
                      <p className="text-[8px] text-zinc-500 font-mono mt-0.5">{av.type}</p>
                    </div>
                  </div>

                  <div className="text-right">
                    {isSelected ? (
                      <span className="text-[7px] font-mono px-1.5 py-0.5 rounded bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                        SELECTED
                      </span>
                    ) : isEligible ? (
                      <span className="text-[7px] font-mono px-1.5 py-0.5 rounded bg-zinc-800 text-zinc-400 border border-white/5">
                        ELIGIBLE
                      </span>
                    ) : (
                      <span className="text-[7px] font-mono px-1.5 py-0.5 rounded bg-red-500/10 text-red-400 border border-red-500/20 uppercase">
                        LOCKED
                      </span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* AI UGC Generation simulation */}
        <div className="space-y-3 bg-black/40 border border-white/5 p-3 rounded-xl flex flex-col justify-between">
          <div className="space-y-2">
            <span className="px-1.5 py-0.5 text-[8px] font-mono bg-zinc-900 border border-white/10 text-zinc-400 rounded">
              GENERATION PIPELINE
            </span>
            <div className="space-y-1.5 text-[10px] font-mono text-zinc-400">
              <p className="flex justify-between"><span>Voice Direction:</span> <span className="text-white">Premium Explainer</span></p>
              <p className="flex justify-between text-zinc-400 gap-2">
                <span>Voice Model:</span>
                <span className="text-white truncate max-w-[120px]">{activeBrand.avatars[0].voice}</span>
              </p>
              <p className="flex justify-between"><span>UGC Style:</span> <span className="text-white">Founder Pitch v1.2</span></p>
              <p className="flex justify-between"><span>Route Target:</span> <span className="text-white">Sakhaa-Synth Hub</span></p>
            </div>
          </div>

          {/* Animating Waveform */}
          <div className="h-16 flex items-center justify-center gap-1.5 bg-black/50 border border-white/5 rounded-lg overflow-hidden relative">
            <div className="absolute inset-0 bg-[linear-gradient(90deg,rgba(0,0,0,0.1)_1px,transparent_1px)] bg-[size:10px_100%] opacity-20 pointer-events-none" />
            {[...Array(12)].map((_, idx) => (
              <motion.div
                key={idx}
                animate={{ height: [12, 38, 12] }}
                transition={{
                  repeat: Infinity,
                  duration: 1.2 + Math.random() * 0.8,
                  ease: 'easeInOut',
                  delay: idx * 0.1
                }}
                className="w-1.5 rounded-full"
                style={{ backgroundColor: activeBrand.primaryColor }}
              />
            ))}
          </div>

          <div className="p-2 rounded border border-emerald-500/20 bg-emerald-500/5 text-[9px] font-mono text-emerald-400 flex items-center justify-center gap-1.5">
            <RefreshCw className="h-3 w-3 animate-spin" /> CAMPAIGN CREATIVE READY
          </div>
        </div>
      </div>
    );
  };

  // Slide 4: Calendar Builder Mockup
  const renderCalendarBuilder = () => {
    return (
      <div className="space-y-3 p-4 h-full overflow-y-auto text-left" id="mockup-calendar-builder">
        <div className="flex justify-between items-center border-b border-white/5 pb-2">
          <span className="px-1.5 py-0.5 text-[8px] font-mono bg-zinc-900 border border-white/10 text-zinc-400 rounded">
            TREND-LED CAMPAIGN CALENDAR
          </span>
          <span className="text-[9px] font-mono text-zinc-500">Workspace / Calendar_Builder_v1.0</span>
        </div>

        <div className="space-y-2">
          {[
            {
              day: 'MON 09:00',
              pillar: 'Awareness Campaign',
              platform: 'Instagram Reels',
              hook: activeBrand.scripts[0].hookText,
              objective: 'Audience Acquisition'
            },
            {
              day: 'WED 12:30',
              pillar: 'Offer-led Explainer',
              platform: 'YouTube Shorts',
              hook: activeBrand.scripts[1]?.hookText || 'Acquire a heritage title. Request parchment documentation.',
              objective: 'Conversion Offer'
            },
            {
              day: 'FRI 18:00',
              pillar: 'Retargeting Testimonial',
              platform: 'TikTok Video',
              hook: 'What our clients say about the verification process...',
              objective: 'Trust & Proof'
            }
          ].map((item, idx) => (
            <div key={idx} className="bg-white/2 border border-white/5 rounded-xl p-3 flex flex-col sm:flex-row justify-between sm:items-center gap-3">
              <div className="space-y-1">
                <div className="flex items-center gap-2">
                  <span className="text-[9px] font-mono font-bold text-white">{item.day}</span>
                  <span className="text-[8px] font-mono bg-white/5 text-zinc-400 px-1.5 py-0.5 rounded border border-white/5 uppercase">
                    {item.platform}
                  </span>
                  <span className="text-[8px] font-mono px-1.5 py-0.5 rounded uppercase" style={{ backgroundColor: `${activeBrand.primaryColor}15`, color: activeBrand.primaryColor, border: `1px solid ${activeBrand.primaryColor}22` }}>
                    {item.objective}
                  </span>
                </div>
                <p className="text-[10px] text-zinc-400 font-sans italic leading-tight truncate max-w-[320px]">
                  "{item.hook}"
                </p>
              </div>

              <div className="flex items-center gap-2 self-end sm:self-center">
                <div className="h-6 w-8 rounded border border-white/10 bg-zinc-900 overflow-hidden flex items-center justify-center">
                  <Film className="h-3 w-3 text-zinc-500" />
                </div>
                <span className="text-[8px] font-mono text-emerald-400 bg-emerald-500/10 px-1.5 py-0.5 rounded border border-emerald-500/20 uppercase">
                  READY
                </span>
              </div>
            </div>
          ))}
        </div>

        <div className="p-2.5 rounded border border-dashed border-white/10 bg-black/40 text-[9px] font-mono text-zinc-500 uppercase text-center flex items-center justify-center gap-1.5">
          <Calendar className="h-3 w-3 text-zinc-600" /> CAMPAIGN CALENDAR READY
        </div>
      </div>
    );
  };

  // Slide 5: Calendar Integration & Publishing Mockup
  const renderPublishingHub = () => {
    return (
      <div className="grid grid-cols-1 md:grid-cols-12 gap-4 p-4 h-full overflow-y-auto text-left" id="mockup-publishing">
        {/* Approvals Checklist */}
        <div className="md:col-span-5 space-y-3 bg-black/40 border border-white/5 p-3 rounded-xl flex flex-col justify-between">
          <div className="space-y-3">
            <span className="px-1.5 py-0.5 text-[8px] font-mono bg-zinc-900 border border-white/10 text-zinc-400 rounded">
              APPROVAL STATUS
            </span>

            <div className="space-y-1.5">
              {[
                { label: 'Video approved', checked: true },
                { label: 'Caption approved', checked: true },
                { label: 'Platform selected', checked: true },
                { label: 'Posting time confirmed', checked: true },
                { label: 'Calendar synced', checked: true }
              ].map((chk, idx) => (
                <div key={idx} className="flex items-center gap-2 text-[10px] font-mono">
                  <CheckCircle2 className="h-3.5 w-3.5 text-emerald-400 flex-shrink-0" />
                  <span className="text-zinc-300">{chk.label}</span>
                </div>
              ))}
            </div>
          </div>
          <div className="text-[8px] font-mono text-zinc-500 leading-tight">
            Team approvals latched successfully.
          </div>
        </div>

        {/* Integration Syncing Console */}
        <div className="md:col-span-7 space-y-3 bg-black/40 border border-white/5 p-3 rounded-xl flex flex-col justify-between">
          <span className="px-1.5 py-0.5 text-[8px] font-mono bg-zinc-900 border border-white/10 text-zinc-400 rounded self-start">
            API PUBLISHING PIPELINE
          </span>

          <div className="space-y-1.5">
            {[
              { platform: 'Instagram Reels', status: 'Synced & Active', color: activeBrand.primaryColor },
              { platform: 'YouTube Shorts', status: 'Synced & Active', color: '#ff0000' },
              { platform: 'TikTok Video', status: 'Synced & Active', color: '#00f2fe' }
            ].map((pl, idx) => (
              <div key={idx} className="bg-white/2 border border-white/5 p-2 rounded-lg flex items-center justify-between text-[10px] font-mono">
                <div className="flex items-center gap-2">
                  <div className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: pl.color }} />
                  <span className="text-white">{pl.platform}</span>
                </div>
                <span className="text-emerald-400 font-semibold bg-emerald-500/10 px-1.5 py-0.5 rounded border border-emerald-500/20">
                  {pl.status}
                </span>
              </div>
            ))}
          </div>

          <div className="p-2 rounded border border-emerald-500/20 bg-emerald-500/5 text-[9px] font-mono text-emerald-400 flex items-center justify-between">
            <span className="flex items-center gap-1 uppercase tracking-widest font-semibold">
              <Check className="h-3 w-3" /> READY TO PUBLISH
            </span>
            <span className="text-zinc-500">Official API Connected</span>
          </div>
        </div>
      </div>
    );
  };

  // Slide 6: V2 Learning & Creative Simulation Mockup
  const renderV2Simulation = () => {
    return (
      <div className="grid grid-cols-1 md:grid-cols-12 gap-4 p-4 h-full overflow-y-auto text-left" id="mockup-v2-simulation">
        {/* Terminal Compiler */}
        <div className="md:col-span-5 space-y-3 bg-black/60 border border-white/5 p-3 rounded-xl font-mono text-[9px] flex flex-col justify-between">
          <div className="space-y-2">
            <div className="flex justify-between items-center border-b border-white/5 pb-1">
              <span className="text-zinc-500">PLAIN-TEXT COMPILER V2</span>
              <span className="text-zinc-500">AE_SCRIPT_ENGINE</span>
            </div>
            <div className="space-y-2 leading-tight">
              <p className="text-zinc-400">sakhaa-forge:~ $ edit-video --instruction</p>
              <div className="flex items-start text-white bg-white/5 p-1.5 rounded border border-white/5 min-h-[36px]">
                <span>&gt;&nbsp;</span>
                <p className="font-sans text-[9.5px] min-h-[14px] leading-tight text-zinc-200">
                  {typedPrompt}
                  <span className="animate-pulse font-bold text-white select-none">|</span>
                </p>
              </div>
              {typedPrompt.length > 0 && (
                <motion.div
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  transition={{ delay: 0.8 }}
                  className="space-y-1 text-emerald-400"
                >
                  <p>&gt; Plain-text edit received</p>
                  <p>&gt; After Effects script prepared</p>
                  <p>&gt; Variant updated successfully</p>
                </motion.div>
              )}
            </div>
          </div>
          <div className="text-[8px] text-zinc-500 border-t border-white/5 pt-1.5 leading-none">
            Compiler: v2.4.0 (TypeScript bound)
          </div>
        </div>

        {/* Performance metrics split-test simulation */}
        <div className="md:col-span-7 space-y-3 bg-black/40 border border-white/5 p-3 rounded-xl flex flex-col justify-between">
          <span className="px-1.5 py-0.5 text-[8px] font-mono bg-zinc-900 border border-white/10 text-zinc-400 rounded self-start">
            CREATIVE VARIANT SIMULATION
          </span>

          <div className="space-y-2">
            {/* Split Comparison Cards */}
            <div className="grid grid-cols-2 gap-2 text-[9px] font-mono">
              <div className="bg-white/2 border border-white/5 p-2 rounded-lg">
                <span className="text-zinc-500 uppercase">Variant A (Original)</span>
                <p className="text-xs font-bold text-zinc-300 mt-1">Neuro Attention: 78%</p>
                <div className="h-1 w-full bg-white/5 rounded mt-1.5 overflow-hidden">
                  <div className="h-full bg-zinc-500" style={{ width: '78%' }} />
                </div>
              </div>
              <div className="bg-white/2 border border-white/5 p-2 rounded-lg" style={{ borderColor: `${activeBrand.primaryColor}33` }}>
                <span style={{ color: activeBrand.primaryColor }}>Variant B (Optimized)</span>
                <p className="text-xs font-bold text-emerald-400 mt-1">Neuro Attention: 94%</p>
                <div className="h-1 w-full bg-white/5 rounded mt-1.5 overflow-hidden">
                  <div className="h-full bg-emerald-500 animate-pulse" style={{ width: '94%' }} />
                </div>
              </div>
            </div>

            {/* Neural and marketing prediction bars */}
            <div className="space-y-1.5 font-mono text-[8px] text-zinc-400">
              <div className="space-y-1 border-t border-white/5 pt-2">
                <div className="flex justify-between"><span>Neuroscience test:</span> <span className="text-emerald-400">Running (Passed)</span></div>
                <div className="flex justify-between"><span>Marketing model:</span> <span className="text-emerald-400">Synced</span></div>
                <div className="flex justify-between"><span>Winning patterns:</span> <span className="text-white">Detected</span></div>
              </div>
            </div>
          </div>

          <div className="p-2 rounded border border-emerald-500/20 bg-emerald-500/5 text-[9px] font-mono text-emerald-400 text-center uppercase tracking-wider font-semibold">
            Next recommendations ready
          </div>
        </div>
      </div>
    );
  };

  const renderStageVisual = () => {
    switch (activeStageId) {
      case 1:
        return renderExtraction();
      case 2:
        return renderAvatarsUGC();
      case 3:
        return renderCalendarBuilder();
      case 4:
        return renderPublishingHub();
      case 5:
        return renderV2Simulation();
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
        <span>SLIDE {activeStageId + 1} OF 6</span>
        <span>AUDIT EVIDENCE SYNCED // OK</span>
      </div>
    </div>
  );
}
