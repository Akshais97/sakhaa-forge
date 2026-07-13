import { useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { AlertCircle, ArrowRight, Layers, FileSpreadsheet, MessageSquare, Video, ShieldClose, Calendar, Network, Lock } from 'lucide-react';
import { BrandData } from '../types';

interface ProblemSceneProps {
  activeBrand: BrandData;
  onProceed: () => void;
}

export default function ProblemScene({ activeBrand, onProceed }: ProblemSceneProps) {
  const [activeTab, setActiveTab] = useState<'fragmented' | 'unified'>('fragmented');

  return (
    <div className="relative w-full min-h-[85vh] flex flex-col justify-center py-12 px-6 lg:px-16 overflow-hidden" id="problem-scene">
      {/* Dynamic glow base */}
      <div
        className="glow-spot -bottom-20 right-1/4 h-[400px] w-[400px]"
        style={{
          background: `radial-gradient(circle, ${activeTab === 'fragmented' ? '#ef4444' : activeBrand.primaryColor}15 0%, transparent 70%)`
        }}
      />

      <div className="max-w-5xl mx-auto space-y-12 relative z-10 text-left w-full">
        {/* Title Block */}
        <div className="space-y-4 max-w-2xl">
          <span className="text-[10px] font-mono tracking-[0.2em] uppercase text-zinc-500">
            System Diagnostics
          </span>
          <h2 className="text-3xl md:text-4xl font-display font-medium text-white tracking-tight leading-tight">
            Your short-form reels break when creative production is fragmented.
          </h2>
          <p className="text-sm text-zinc-400">
            Social media workflows fail when brand truth, references, scripts, generation, and cost records live in separate, disconnected siloes. Sakhaa Forge consolidates them into a single traceable command system.
          </p>
        </div>

        {/* Tab Controls */}
        <div className="flex border-b border-white/5 pb-2 max-w-md">
          <button
            onClick={() => setActiveTab('fragmented')}
            className={`flex-1 pb-3 text-xs font-mono tracking-wider uppercase border-b-2 transition-all duration-300 ${
              activeTab === 'fragmented'
                ? 'border-red-500 text-red-400'
                : 'border-transparent text-zinc-500 hover:text-zinc-300'
            }`}
            id="tab-fragmented"
          >
            01 / Fragmented Siloes
          </button>
          <button
            onClick={() => setActiveTab('unified')}
            className={`flex-1 pb-3 text-xs font-mono tracking-wider uppercase border-b-2 transition-all duration-300 ${
              activeTab === 'unified'
                ? 'border-white text-white'
                : 'border-transparent text-zinc-500 hover:text-zinc-300'
            }`}
            style={{
              borderColor: activeTab === 'unified' ? activeBrand.primaryColor : 'transparent',
              color: activeTab === 'unified' ? activeBrand.primaryColor : ''
            }}
            id="tab-unified"
          >
            02 / Unified Forge System
          </button>
        </div>

        {/* Dynamic Display Area */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-stretch">
          {/* Left panel: Bullet descriptions */}
          <div className="lg:col-span-5 flex flex-col justify-between space-y-8 bg-zinc-950/40 p-6 rounded-xl border border-white/5 backdrop-blur">
            <AnimatePresence mode="wait">
              {activeTab === 'fragmented' ? (
                <motion.div
                  key="frag-list"
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -10 }}
                  className="space-y-6"
                >
                  <div className="flex items-center gap-2 text-red-400 font-mono text-xs uppercase tracking-wider">
                    <AlertCircle className="h-4 w-4" /> Lost Alignment & Bleeding Credits
                  </div>
                  <ul className="space-y-4 text-xs font-sans text-zinc-400">
                    <li className="flex items-start gap-2">
                      <span className="text-red-500 font-mono select-none mt-0.5">✕</span>
                      <span><strong>Brand truth is guessed</strong>: Creative copywriters draft scripts from old emails or templates, leading to costly off-brand compliance failures.</span>
                    </li>
                    <li className="flex items-start gap-2">
                      <span className="text-red-500 font-mono select-none mt-0.5">✕</span>
                      <span><strong>Credits are blind-spent</strong>: Video renders are kicked off on unapproved scripts, wasting valuable credits before discovering typos or tone errors.</span>
                    </li>
                    <li className="flex items-start gap-2">
                      <span className="text-red-500 font-mono select-none mt-0.5">✕</span>
                      <span><strong>Zero publication audit</strong>: Once a video is compiled, publishing states are assumed success, with no automated proof that public links are active.</span>
                    </li>
                  </ul>
                </motion.div>
              ) : (
                <motion.div
                  key="uni-list"
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -10 }}
                  className="space-y-6"
                >
                  <div className="flex items-center gap-2 text-emerald-400 font-mono text-xs uppercase tracking-wider">
                    <Layers className="h-4 w-4" /> Pure Traceability & Risk Control
                  </div>
                  <ul className="space-y-4 text-xs font-sans text-zinc-400">
                    <li className="flex items-start gap-2">
                      <span className="text-emerald-500 font-mono select-none mt-0.5">✓</span>
                      <span><strong>Locked Inviolate Foundation</strong>: Nothing enters production until guidelines, watermarks, colors, and prohibitions are approved.</span>
                    </li>
                    <li className="flex items-start gap-2">
                      <span className="text-emerald-500 font-mono select-none mt-0.5">✓</span>
                      <span><strong>Tournament-Grade Checking</strong>: Scores hook mechanics and checks compliance prior to spending paid platform render credits.</span>
                    </li>
                    <li className="flex items-start gap-2">
                      <span className="text-emerald-500 font-mono select-none mt-0.5">✓</span>
                      <span><strong>Audience-Facing Proof</strong>: Automated verification crawling confirms live visibility on Instagram or YouTube before finalizing the ledger.</span>
                    </li>
                  </ul>
                </motion.div>
              )}
            </AnimatePresence>

            <button
              onClick={onProceed}
              className="mt-6 w-full py-3 text-xs font-mono tracking-widest uppercase border border-white/10 hover:border-white/20 hover:bg-zinc-900 rounded-lg text-white transition-all duration-300 flex items-center justify-center gap-2"
              id="proceed-to-workflow-btn"
            >
              Inspect the Production Flow <ArrowRight className="h-3.5 w-3.5" />
            </button>
          </div>

          {/* Right panel: Visualization Cards Board */}
          <div className="lg:col-span-7 flex items-center justify-center bg-zinc-950/20 rounded-xl border border-white/5 p-8 relative min-h-[300px]">
            <AnimatePresence mode="wait">
              {activeTab === 'fragmented' ? (
                <motion.div
                  key="frag-viz"
                  initial={{ opacity: 0, scale: 0.95 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.95 }}
                  className="relative w-full h-full min-h-[250px]"
                >
                  {/* Floating scattered cards */}
                  <motion.div
                    animate={{ y: [0, -5, 0], x: [0, 2, 0] }}
                    transition={{ repeat: Infinity, duration: 4, ease: 'easeInOut' }}
                    className="absolute top-0 left-4 bg-zinc-900/80 border border-red-500/20 p-3 rounded-lg shadow-lg w-44 backdrop-blur text-left"
                  >
                    <div className="flex items-center gap-1.5 text-[8px] font-mono text-red-400 uppercase tracking-wider mb-1">
                      <FileSpreadsheet className="h-3 w-3" /> Costs Spreadsheet
                    </div>
                    <div className="h-1 w-12 bg-red-500/20 rounded mb-1.5" />
                    <p className="text-[9px] text-zinc-400 font-mono">Credits manually typed inside columns; easily mistranscribed.</p>
                  </motion.div>

                  <motion.div
                    animate={{ y: [0, 6, 0], x: [0, -3, 0] }}
                    transition={{ repeat: Infinity, duration: 5, ease: 'easeInOut', delay: 0.5 }}
                    className="absolute top-10 right-4 bg-zinc-900/80 border border-red-500/20 p-3 rounded-lg shadow-lg w-44 backdrop-blur text-left"
                  >
                    <div className="flex items-center gap-1.5 text-[8px] font-mono text-red-400 uppercase tracking-wider mb-1">
                      <MessageSquare className="h-3 w-3" /> WhatsApp Script Drafts
                    </div>
                    <div className="h-1 w-16 bg-red-500/20 rounded mb-1.5" />
                    <p className="text-[9px] text-zinc-400 font-sans">"Check out this cool new villa, best cheap price..."</p>
                  </motion.div>

                  <motion.div
                    animate={{ y: [0, -8, 0], x: [0, -4, 0] }}
                    transition={{ repeat: Infinity, duration: 6, ease: 'easeInOut', delay: 1 }}
                    className="absolute bottom-4 left-10 bg-zinc-900/80 border border-red-500/20 p-3 rounded-lg shadow-lg w-48 backdrop-blur text-left"
                  >
                    <div className="flex items-center gap-1.5 text-[8px] font-mono text-red-400 uppercase tracking-wider mb-1">
                      <Video className="h-3 w-3" /> External Render Engine
                    </div>
                    <div className="h-1 w-10 bg-red-500/20 rounded mb-1.5" />
                    <p className="text-[9px] text-zinc-400 font-mono">Render output: v4_final_final_draft_FIXED.mp4</p>
                  </motion.div>

                  <motion.div
                    animate={{ y: [0, 4, 0], x: [0, 4, 0] }}
                    transition={{ repeat: Infinity, duration: 4.5, ease: 'easeInOut', delay: 1.5 }}
                    className="absolute bottom-16 right-8 bg-zinc-900/80 border border-red-500/20 p-3 rounded-lg shadow-lg w-44 backdrop-blur text-left"
                  >
                    <div className="flex items-center gap-1.5 text-[8px] font-mono text-red-400 uppercase tracking-wider mb-1">
                      <Calendar className="h-3 w-3" /> Post Schedule assumed
                    </div>
                    <div className="h-1 w-14 bg-red-500/20 rounded mb-1.5" />
                    <p className="text-[9px] text-zinc-400 font-sans">API success returns HTTP 200, post is empty or private.</p>
                  </motion.div>

                  {/* Warning label in center */}
                  <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                    <span className="px-3 py-1 bg-red-500/10 border border-red-500/30 text-red-400 text-[10px] font-mono rounded uppercase tracking-widest backdrop-blur-sm">
                      Disconnected siloes
                    </span>
                  </div>
                </motion.div>
              ) : (
                <motion.div
                  key="uni-viz"
                  initial={{ opacity: 0, scale: 0.95 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.95 }}
                  className="w-full flex flex-col items-center justify-center space-y-4"
                >
                  {/* Central Node Visualizer */}
                  <div className="relative flex flex-col items-center p-6 bg-zinc-900/80 border border-white/10 rounded-2xl shadow-xl max-w-sm w-full text-left backdrop-blur">
                    <div className="flex justify-between items-center w-full mb-3 pb-2 border-b border-white/5">
                      <span className="text-[8px] font-mono text-zinc-500 uppercase tracking-widest">
                        Lineage sync: ACTIVE
                      </span>
                      <Lock className="h-3.5 w-3.5 text-zinc-400" style={{ color: activeBrand.primaryColor }} />
                    </div>

                    <div className="space-y-3">
                      <div className="flex items-center gap-2.5">
                        <div className="h-5 w-5 rounded bg-zinc-950 border border-white/10 flex items-center justify-center font-mono text-[9px] text-zinc-400">
                          BT
                        </div>
                        <div className="text-left leading-none">
                          <p className="text-[10px] text-white font-mono uppercase tracking-wider">Brand Truth Approved</p>
                          <p className="text-[8px] text-zinc-500 font-sans mt-0.5">{activeBrand.url}</p>
                        </div>
                      </div>

                      <div className="flex items-center gap-2.5">
                        <div className="h-5 w-5 rounded bg-zinc-950 border border-white/10 flex items-center justify-center font-mono text-[9px] text-zinc-400">
                          SC
                        </div>
                        <div className="text-left leading-none">
                          <p className="text-[10px] text-white font-mono uppercase tracking-wider">Tournament Lock</p>
                          <p className="text-[8px] text-zinc-500 font-sans mt-0.5">Score: {activeBrand.scripts[0].score}% compliance</p>
                        </div>
                      </div>

                      <div className="flex items-center gap-2.5">
                        <div className="h-5 w-5 rounded bg-zinc-950 border border-white/10 flex items-center justify-center font-mono text-[9px] text-zinc-400">
                          PV
                        </div>
                        <div className="text-left leading-none">
                          <p className="text-[10px] text-white font-mono uppercase tracking-wider">Audience Verified</p>
                          <p className="text-[8px] text-emerald-400 font-mono mt-0.5">Post resolved live successfully</p>
                        </div>
                      </div>
                    </div>

                    {/* Laser trace line animation */}
                    <div className="absolute inset-x-0 bottom-0 h-0.5 overflow-hidden rounded-b-2xl">
                      <motion.div
                        animate={{ x: ['-100%', '100%'] }}
                        transition={{ repeat: Infinity, duration: 2, ease: 'linear' }}
                        className="w-1/2 h-full"
                        style={{
                          background: `linear-gradient(90deg, transparent, ${activeBrand.primaryColor}, transparent)`
                        }}
                      />
                    </div>
                  </div>

                  <span className="text-[10px] font-mono text-zinc-500 uppercase">
                    Unified Command System
                  </span>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </div>
      </div>
    </div>
  );
}
