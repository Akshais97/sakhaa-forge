'use client';

import { useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Scan, ShieldAlert, CheckCircle2, Activity, Link } from 'lucide-react';
import { BrandData } from '../types';
import BrandAssetPack from './BrandAssetPack';
import { Magnet } from './MotionBits';

type ScanState = 'idle' | 'planning' | 'homepage' | 'priority' | 'vertical' | 'media' | 'tone' | 'ready';

const SCAN_STEPS: { key: Exclude<ScanState, 'idle' | 'ready'>; label: string }[] = [
  { key: 'planning', label: 'Plan crawl scope' },
  { key: 'homepage', label: 'Capture homepage' },
  { key: 'priority', label: 'Scrape priority pages' },
  { key: 'vertical', label: 'Vertical deep crawl' },
  { key: 'media', label: 'Harvest media assets' },
  { key: 'tone', label: 'Calibrate tone' },
];

interface BrandIntakeSectionProps {
  brand: BrandData;
}

export default function BrandIntakeSection({ brand }: BrandIntakeSectionProps) {
  const [scanState, setScanState] = useState<ScanState>('idle');
  const [url, setUrl] = useState(brand.url);

  useEffect(() => {
    setUrl(brand.url);
    setScanState('idle');
  }, [brand.id]);

  const startScan = useCallback(() => {
    if (scanState !== 'idle' && scanState !== 'ready') return;
    setScanState('planning');
  }, [scanState]);

  useEffect(() => {
    if (scanState === 'idle' || scanState === 'ready') return;

    const currentIndex = SCAN_STEPS.findIndex((s) => s.key === scanState);
    if (currentIndex < 0) return;

    const timer = window.setTimeout(() => {
      if (currentIndex >= SCAN_STEPS.length - 1) {
        setScanState('ready');
      } else {
        setScanState(SCAN_STEPS[currentIndex + 1].key);
      }
    }, 850);

    return () => window.clearTimeout(timer);
  }, [scanState]);

  const progress = scanState === 'ready'
    ? 100
    : scanState === 'idle'
    ? 0
    : ((SCAN_STEPS.findIndex((s) => s.key === scanState) + 1) / SCAN_STEPS.length) * 100;

  const isScanning = scanState !== 'idle' && scanState !== 'ready';
  const currentStepIndex = SCAN_STEPS.findIndex((s) => s.key === scanState);

  return (
    <div className="flex flex-col h-full">
      <main className="flex-1 min-h-0 w-full flex flex-col justify-center relative overflow-hidden">
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_80%_80%_at_50%_-20%,rgba(120,119,198,0.05),rgba(255,255,255,0))] pointer-events-none" />

        <div className="w-full max-w-7xl mx-auto px-5 py-4 lg:py-5 grid grid-cols-1 lg:grid-cols-12 gap-6 lg:gap-8 items-center min-h-0 relative z-10">
          {/* Left narrative */}
          <div className="lg:col-span-5 h-full flex flex-col justify-center space-y-4 sm:space-y-5">
            <div className="flex items-center gap-2">
              <span
                className="px-3 py-1 text-[10px] font-mono tracking-[0.2em] uppercase rounded-full border"
                style={{
                  borderColor: `${brand.primaryColor}33`,
                  color: brand.primaryColor,
                  backgroundColor: `${brand.primaryColor}0a`,
                }}
              >
                Brand intake
              </span>
            </div>

            <h2 className="text-3xl md:text-4xl lg:text-[2.75rem] font-display font-medium text-white tracking-tight leading-[1.05] max-w-xl text-balance">
              Build every video from approved brand truth.
            </h2>

            <p className="text-sm md:text-[15px] text-zinc-300/90 font-sans max-w-lg leading-relaxed text-pretty">
              Paste a brand URL. Sakhaa Forge crawls the site, extracts logos, colours, messaging, offers, proof, and
              compliance notes, then packages them into a versioned brand profile ready for production.
            </p>

            <div className="space-y-3">
              <label htmlFor="brand-url" className="text-[10px] font-mono text-zinc-500 uppercase tracking-widest block">
                Brand website URL
              </label>
              <div className="flex gap-2">
                <div className="flex-1 relative">
                  <Link className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-zinc-500" />
                  <input
                    id="brand-url"
                    type="url"
                    value={url}
                    onChange={(e) => setUrl(e.target.value)}
                    className="w-full bg-zinc-950/60 border border-white/10 rounded-lg pl-9 pr-3 py-2.5 text-xs font-mono text-white placeholder-zinc-600 focus:outline-none focus:border-white/25 focus:ring-1 focus:ring-white/10 transition-colors"
                    placeholder="https://brand.example"
                  />
                </div>
                <Magnet>
                  <button
                    onClick={startScan}
                    disabled={isScanning}
                    className="px-4 py-2.5 rounded-lg text-xs font-mono tracking-widest uppercase font-semibold text-black transition-all duration-200 hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed focus:outline-none focus-visible:ring-2 focus-visible:ring-white/30"
                    style={{ backgroundColor: brand.primaryColor }}
                  >
                    {scanState === 'ready' ? 'Rescan' : scanState === 'idle' ? 'Scan URL' : 'Scanning…'}
                  </button>
                </Magnet>
              </div>
            </div>

            <div className="flex items-start gap-2.5 text-[10px] text-zinc-500 font-mono border-t border-white/5 pt-4 max-w-md">
              <ShieldAlert className="h-3.5 w-3.5 text-zinc-500 flex-shrink-0 mt-0.5" />
              <span>
                No claim is invented. Missing assets, rights warnings, and regulated claims are flagged for human review.
              </span>
            </div>
          </div>

          {/* Right mockup */}
          <div className="lg:col-span-7 h-[min(58vh,520px)] flex items-center justify-center">
            <AnimatePresence mode="wait">
              {scanState === 'idle' && (
                <motion.div
                  key="idle"
                  initial={{ opacity: 0, scale: 0.98 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.98 }}
                  transition={{ duration: 0.3 }}
                  className="w-full h-full flex flex-col items-center justify-center text-center space-y-4"
                >
                  <div className="h-16 w-16 rounded-2xl border border-white/10 bg-zinc-950/60 flex items-center justify-center">
                    <Scan className="h-7 w-7 text-zinc-400" />
                  </div>
                  <div className="space-y-1">
                    <p className="text-sm font-medium text-white">Ready to scan {brand.url}</p>
                    <p className="text-xs text-zinc-500 font-mono uppercase tracking-wider">7 crawl passes · 75 pages max</p>
                  </div>
                </motion.div>
              )}

              {scanState === 'ready' && (
                <motion.div
                  key="ready"
                  initial={{ opacity: 0, x: 20 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: -20 }}
                  transition={{ duration: 0.3 }}
                  className="w-full h-full"
                >
                  <BrandAssetPack brand={brand} />
                </motion.div>
              )}

              {isScanning && (
                <motion.div
                  key="scanning"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  transition={{ duration: 0.2 }}
                  className="w-full max-w-md space-y-4 p-4 rounded-2xl border border-white/5 bg-zinc-950/40 backdrop-blur"
                >
                  <div className="flex items-center justify-between text-[10px] font-mono text-zinc-500 uppercase tracking-widest">
                    <span>Crawl in progress</span>
                    <span className="text-white">{Math.round(progress)}%</span>
                  </div>

                  <div className="h-1.5 w-full bg-white/5 rounded-full overflow-hidden">
                    <motion.div
                      className="h-full rounded-full"
                      style={{ backgroundColor: brand.primaryColor }}
                      initial={{ width: 0 }}
                      animate={{ width: `${progress}%` }}
                      transition={{ duration: 0.3 }}
                    />
                  </div>

                  <div className="space-y-2">
                    {SCAN_STEPS.map((step, idx) => {
                      const isDone = idx < currentStepIndex;
                      const isCurrent = idx === currentStepIndex;
                      return (
                        <div
                          key={step.key}
                          className={`flex items-center gap-2 text-xs ${isDone || isCurrent ? 'text-zinc-300' : 'text-zinc-600'}`}
                        >
                          {isDone ? (
                            <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500 flex-shrink-0" />
                          ) : (
                            <Activity className={`h-3.5 w-3.5 flex-shrink-0 ${isCurrent ? 'text-white' : ''}`} />
                          )}
                          <span className={isCurrent ? 'text-white font-medium' : ''}>{step.label}</span>
                        </div>
                      );
                    })}
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </div>
      </main>
    </div>
  );
}
