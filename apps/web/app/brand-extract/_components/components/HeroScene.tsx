import { motion } from 'motion/react';
import { Play, ShieldAlert, Sparkles, Send, CheckCircle2, RefreshCw, FileText, Calendar, ArrowRight } from 'lucide-react';
import { BrandData } from '../types';

interface HeroSceneProps {
  activeBrand: BrandData;
  onRequestAccess: () => void;
  onExploreWorkflow: () => void;
}

export default function HeroScene({ activeBrand, onRequestAccess, onExploreWorkflow }: HeroSceneProps) {
  return (
    <div className="relative w-full min-h-[85vh] flex flex-col justify-between py-12 px-6 lg:px-16 overflow-hidden" id="hero-scene">
      {/* Background ambient lighting */}
      <div
        className="glow-spot -top-40 left-1/3 h-[500px] w-[500px]"
        style={{
          background: `radial-gradient(circle, ${activeBrand.primaryColor}22 0%, transparent 70%)`
        }}
      />

      {/* Main split grid */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-12 items-center my-auto">
        {/* Left column: Swiss-style Typography Content */}
        <div className="lg:col-span-7 space-y-8 relative z-10 text-left">
          {/* Tagline label */}
          <div className="flex items-center gap-2">
            <span
              className="px-3 py-1 text-[10px] font-mono tracking-[0.2em] uppercase rounded-full border"
              style={{
                borderColor: `${activeBrand.primaryColor}33`,
                color: activeBrand.primaryColor,
                backgroundColor: `${activeBrand.primaryColor}0a`
              }}
            >
              Category Defining Production Engine
            </span>
          </div>

          {/* Core high-end header */}
          <h1 className="text-4xl md:text-5xl lg:text-6xl font-display font-medium tracking-tight text-white leading-[1.05] max-w-2xl">
            Create videos from <span style={{ color: activeBrand.primaryColor }}>approved brand truth</span> to verified publication.
          </h1>

          {/* Subline */}
          <p className="text-zinc-400 text-sm md:text-base font-sans max-w-xl leading-relaxed">
            Sakhaa Forge turns approved brand material, reusable short-form structures, script tournaments, consent-gated avatars, cost-balanced renders, and audience-facing post verification into one unified, premium production workflow.
          </p>

          {/* CTAs and buttons */}
          <div className="flex flex-wrap items-center gap-4 pt-2">
            <button
              onClick={onRequestAccess}
              className="px-6 py-3 text-xs font-mono tracking-widest uppercase text-black font-semibold rounded-lg transition-all duration-300 hover:scale-102 hover:shadow-lg"
              style={{
                backgroundColor: activeBrand.primaryColor,
                boxShadow: `0 10px 30px -10px ${activeBrand.primaryColor}44`
              }}
              id="hero-request-access-btn"
            >
              Request Access
            </button>

            <button
              onClick={onExploreWorkflow}
              className="px-6 py-3 text-xs font-mono tracking-widest uppercase border border-white/10 hover:border-white/25 hover:bg-white/5 rounded-lg text-white transition-all duration-300 flex items-center gap-2"
              id="hero-explore-workflow-btn"
            >
              See the Workflow <ArrowRight className="h-3.5 w-3.5" />
            </button>
          </div>

          {/* Trust warning caveat strictly formatted */}
          <div className="flex items-center gap-2.5 text-[10px] text-zinc-500 font-mono border-t border-white/5 pt-6 max-w-md">
            <ShieldAlert className="h-3.5 w-3.5 text-zinc-500 flex-shrink-0" />
            <span>
              Built from observed creative structures. Performance outcomes and virality metrics are not guaranteed.
            </span>
          </div>
        </div>

        {/* Right column: Dynamic Product Theatre / Mockup */}
        <div className="lg:col-span-5 flex justify-center relative">
          <div className="relative w-full max-w-[340px] aspect-[9/16] rounded-2xl border border-white/15 bg-zinc-950/60 p-3 shadow-2xl backdrop-blur-xl overflow-hidden group">
            {/* Gloss reflection glare */}
            <div className="absolute inset-0 bg-gradient-to-tr from-transparent via-white/5 to-transparent pointer-events-none" />

            {/* Simulated camera safety margins */}
            <div className="absolute inset-x-4 top-4 flex justify-between items-center text-[8px] font-mono text-zinc-500 pointer-events-none">
              <span>9:16 RAW_HD</span>
              <span>● REC 60FPS</span>
            </div>

            {/* Inner dynamic content representing active brand */}
            <div className="relative w-full h-full rounded-xl overflow-hidden bg-zinc-900/40 flex flex-col justify-between p-4">
              {/* Top metadata */}
              <div className="flex items-center justify-between z-10">
                <div className="flex items-center gap-1 bg-black/40 backdrop-blur px-2 py-0.5 rounded border border-white/10 text-[9px] font-mono text-white">
                  <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-ping" />
                  <span>ACTIVE</span>
                </div>
                <span className="text-[9px] font-mono text-zinc-400">hash:{activeBrand.reviewItem.hash.substring(7, 14)}</span>
              </div>

              {/* Background property preview card */}
              <div className="absolute inset-0 z-0">
                <img
                  src={activeBrand.reviewItem.thumbnailUrl}
                  alt="Property Background"
                  className="w-full h-full object-cover opacity-35 filter grayscale scale-102 group-hover:scale-105 transition-all duration-700"
                  referrerPolicy="no-referrer"
                />
                <div className="absolute inset-0 bg-gradient-to-t from-zinc-950 via-zinc-950/20 to-transparent" />
              </div>

              {/* Center Play Button Overlay */}
              <motion.div
                initial={{ scale: 0.95, opacity: 0.8 }}
                animate={{ scale: [1, 1.05, 1], opacity: [0.8, 1, 0.8] }}
                transition={{ repeat: Infinity, duration: 4, ease: 'easeInOut' }}
                className="absolute inset-0 m-auto h-12 w-12 rounded-full flex items-center justify-center border border-white/20 bg-black/40 backdrop-blur-sm cursor-pointer hover:bg-black/60 z-10"
              >
                <Play className="h-4 w-4 text-white fill-white translate-x-0.5" />
              </motion.div>

              {/* Bottom creative parameters */}
              <div className="relative z-10 space-y-3 pt-24">
                <div className="bg-black/60 backdrop-blur-md rounded-lg border border-white/10 p-2.5 space-y-1.5">
                  <div className="flex justify-between text-[8px] font-mono text-zinc-500">
                    <span>BRAND PROFILE</span>
                    <span style={{ color: activeBrand.primaryColor }}>LOCKED_TRUTH</span>
                  </div>
                  <h4 className="text-xs font-display font-medium text-white truncate">
                    {activeBrand.name}
                  </h4>
                  <div className="h-px bg-white/5" />
                  <p className="text-[9px] text-zinc-400 font-sans leading-tight">
                    "{activeBrand.guidelines[3]?.substring(18, activeBrand.guidelines[3].length - 1) || activeBrand.guidelines[0]}"
                  </p>
                </div>

                {/* Live Caption Render Area */}
                <div className="bg-black/40 backdrop-blur px-2.5 py-1.5 rounded-lg border border-white/5">
                  <p className="text-[9px] font-mono text-zinc-400 leading-none mb-1 text-left uppercase">Captions Lower-third</p>
                  <p className="text-[10px] font-display font-medium text-white tracking-tight leading-snug">
                    {activeBrand.scripts[0].hookText}
                  </p>
                </div>
              </div>
            </div>

            {/* Micro-evidence card sliding in over frame */}
            <motion.div
              initial={{ x: 60, opacity: 0 }}
              animate={{ x: 0, opacity: 1 }}
              transition={{ delay: 0.8, duration: 0.6 }}
              className="absolute -right-6 bottom-36 bg-zinc-950/90 border border-white/15 p-2.5 rounded-xl shadow-xl w-44 backdrop-blur z-20 space-y-1.5"
            >
              <div className="flex items-center gap-1.5 text-[8px] font-mono text-emerald-400 uppercase tracking-wider">
                <CheckCircle2 className="h-3 w-3 text-emerald-500 flex-shrink-0" /> Live Post Checked
              </div>
              <p className="text-[10px] font-display font-medium text-white tracking-tight">
                Audience Verified
              </p>
              <div className="h-px bg-white/5" />
              <p className="text-[8px] text-zinc-400 font-mono leading-none truncate">
                {activeBrand.calendarPost.liveUrl}
              </p>
            </motion.div>

            {/* Creative Lineage badge floating left */}
            <motion.div
              initial={{ x: -60, opacity: 0 }}
              animate={{ x: 0, opacity: 1 }}
              transition={{ delay: 1.1, duration: 0.6 }}
              className="absolute -left-6 top-24 bg-zinc-950/90 border border-white/15 p-2 rounded-xl shadow-xl w-40 backdrop-blur z-20 space-y-1"
            >
              <span className="text-[7px] font-mono text-zinc-500 block uppercase tracking-widest">
                Ledger Sync Trace
              </span>
              <p className="text-[9px] font-mono text-white font-medium flex items-center justify-between">
                <span>RESERVED</span>
                <span style={{ color: activeBrand.primaryColor }}>{activeBrand.costEstimate.maxAuthorised}</span>
              </p>
              <div className="h-1.5 w-full bg-white/5 rounded-full overflow-hidden">
                <motion.div
                  animate={{ width: ['0%', '100%'] }}
                  transition={{ repeat: Infinity, duration: 3, ease: 'easeInOut' }}
                  className="h-full bg-emerald-500"
                />
              </div>
            </motion.div>
          </div>
        </div>
      </div>

      {/* Decorative prompt switcher help line */}
      <div className="flex flex-col sm:flex-row items-center justify-between gap-4 border-t border-white/5 pt-6 text-[10px] text-zinc-500 font-mono mt-8 relative z-10">
        <div className="flex items-center gap-2">
          <span>Active multi-brand workspace:</span>
          <span className="text-white bg-white/5 px-2 py-0.5 rounded border border-white/10 uppercase">
            {activeBrand.id}_channel_V0
          </span>
        </div>
        <div className="flex items-center gap-1">
          <RefreshCw className="h-3 w-3 animate-spin text-zinc-500" />
          <span>Select any brand above to morph the active production ruleset</span>
        </div>
      </div>
    </div>
  );
}
