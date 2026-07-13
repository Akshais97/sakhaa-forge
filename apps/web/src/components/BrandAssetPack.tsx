'use client';

import { useState, useMemo } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  Link,
  CheckCircle2,
  AlertCircle,
  Lock,
  XCircle,
  Palette,
  MessageSquare,
  Tag,
  Award,
  Shield,
  Megaphone,
  AlertTriangle,
  ChevronDown,
  ChevronRight,
  Play,
} from 'lucide-react';
import { BrandData } from '../types';
import { Spotlight } from './MotionBits';

type TabKey = 'identity' | 'messaging' | 'offers' | 'proof' | 'voice' | 'compliance';
type Confidence = 'high' | 'medium' | 'low';
type ItemStatus = 'ready' | 'review' | 'blocked';

interface AssetItem {
  label: string;
  value: string;
  source: string;
  confidence: Confidence;
  status: ItemStatus;
}

interface AssetCategory {
  key: TabKey;
  title: string;
  icon: React.ElementType;
  summary: string;
  items: AssetItem[];
}

interface BrandSpecimen {
  headline: string;
  subhead: string;
  cta: string;
  watermark: string;
}

function brandSpecimen(brand: BrandData): BrandSpecimen {
  const firstScript = brand.scripts[0];
  return {
    headline: firstScript.hookText,
    subhead: firstScript.setupText,
    cta: firstScript.ctaText,
    watermark: brand.extractedCandidates.logos[0] ?? brand.name,
  };
}

function buildPack(brand: BrandData): { score: number; categories: AssetCategory[]; specimen: BrandSpecimen } {
  const ec = brand.extractedCandidates;
  const isAura = brand.id === 'aura';
  const isSoma = brand.id === 'soma';
  const isVedic = brand.id === 'vedic';

  const score = isSoma ? 91 : isVedic ? 88 : 84;

  const categories: AssetCategory[] = [
    {
      key: 'identity',
      title: 'Identity',
      icon: Palette,
      summary: 'Visual truth extracted from the homepage, OG tags, CSS variables, and schema metadata.',
      items: [
        {
          label: 'Logos',
          value: ec.logos.join(' · '),
          source: `${brand.url}/homepage`,
          confidence: 'high',
          status: 'ready',
        },
        {
          label: 'Color palette',
          value: ec.colors.join(' · '),
          source: `${brand.url}/homepage`,
          confidence: 'high',
          status: 'ready',
        },
        {
          label: 'Typography',
          value: isAura
            ? 'Aura Serif Display · Source Sans Pro body'
            : isSoma
            ? 'Soma Kinetic Mono · Inter body'
            : 'Vedic Copper Monolith · Cormorant Garamond body',
          source: `${brand.url}/style.css`,
          confidence: 'medium',
          status: 'ready',
        },
        {
          label: 'Hero imagery',
          value: 'Homepage hero frame and OG image captured at 1440px viewport.',
          source: `${brand.url}/homepage`,
          confidence: 'high',
          status: 'ready',
        },
      ],
    },
    {
      key: 'messaging',
      title: 'Messaging',
      icon: MessageSquare,
      summary: 'Headlines, taglines, benefit claims, and calls to action preserved verbatim from the source.',
      items: [
        {
          label: 'Hero headline',
          value: isAura
            ? 'An legacy of quiet luxury, certified for generations.'
            : isSoma
            ? 'Soma: Built for the code that runs your world.'
            : 'Where centuries of architecture become your private sanctuary.',
          source: `${brand.url}/homepage`,
          confidence: 'high',
          status: 'ready',
        },
        {
          label: 'Tagline',
          value: brand.niche,
          source: `${brand.url}/homepage`,
          confidence: 'high',
          status: 'ready',
        },
        {
          label: 'Primary CTAs',
          value: ec.ctas.join(' · '),
          source: `${brand.url}/homepage`,
          confidence: 'high',
          status: 'ready',
        },
        {
          label: 'Benefit claims',
          value: ec.usps.join(' · '),
          source: `${brand.url}/offers`,
          confidence: 'high',
          status: 'ready',
        },
        {
          label: 'FAQ / objection handling',
          value: isAura
            ? 'Private viewing qualification · provenance dossier request · title verification'
            : isSoma
            ? 'Zero-deposit policy · micro-lease terms · professional credit verification'
            : 'Heritage title acquisition · conservation access · parchment documentation',
          source: `${brand.url}/faq`,
          confidence: 'medium',
          status: 'review',
        },
      ],
    },
    {
      key: 'offers',
      title: 'Offers',
      icon: Tag,
      summary: 'Products, services, packages, pricing framing, and lead magnets available for video scripts.',
      items: [
        {
          label: 'Core offer',
          value: isAura
            ? 'Private coastal villas at Aura Alibaug with helipad access and concierge.'
            : isSoma
            ? 'Tech-optimized co-living studios on Outer Ring Road, Bengaluru.'
            : 'Restored palatial estates in Shekhawati with heritage title.'
            ,          source: `${brand.url}/products`,
          confidence: 'high',
          status: 'ready',
        },
        {
          label: 'Pricing framing',
          value: isAura
            ? 'Ultra-premium segment; qualified requests only.'
            : isSoma
            ? 'Zero deposit, paperless checkout in 4 minutes.'
            : 'Heritage title acquisition; pricing by private audience.',
          source: `${brand.url}/pricing`,
          confidence: 'medium',
          status: 'review',
        },
        {
          label: 'Lead magnets',
          value: isAura
            ? 'Private helicopter tour · physical provenance dossier'
            : isSoma
            ? '2-day work trial · instant professional credit scan'
            : 'Parchment history booklet · conservator audience',
          source: `${brand.url}/contact`,
          confidence: 'high',
          status: 'ready',
        },
      ],
    },
    {
      key: 'proof',
      title: 'Proof',
      icon: Award,
      summary: 'Trust evidence: testimonials, ratings, certifications, case studies, and metrics pulled from public pages.',
      items: [
        {
          label: 'Verified credentials',
          value: isAura
            ? 'Certified soil tests · verified property titles · Spazio Milan architecture'
            : isSoma
            ? 'Gigabit mesh network · smart-key access · active tech hub proximity'
            : '500-year-old lime-mortar restoration · Channapatna wood · copper rain-harvesting',
          source: `${brand.url}/about`,
          confidence: 'high',
          status: 'ready',
        },
        {
          label: 'Ratings & testimonials',
          value: 'Public review sentiment captured; exact quotes retained with source URLs.',
          source: `${brand.url}/reviews`,
          confidence: 'medium',
          status: 'review',
        },
        {
          label: 'Case studies',
          value: isAura
            ? 'Provenance ledger #LE-992A · private estate sales record'
            : isSoma
            ? 'Community occupancy case · Q3 tech cohort record'
            : 'Heritage archive ledger #HA-1740V · dynastic deed reference',
          source: `${brand.url}/case-studies`,
          confidence: 'medium',
          status: 'review',
        },
      ],
    },
    {
      key: 'voice',
      title: 'Voice',
      icon: Megaphone,
      summary: 'Tone labels, recurring phrases, vocabulary guardrails, and prohibited language.',
      items: [
        {
          label: 'Tone',
          value: ec.tone,
          source: `${brand.url}/homepage`,
          confidence: 'high',
          status: 'ready',
        },
        {
          label: 'Required phrases',
          value: brand.guidelines.find(g => g.toLowerCase().includes('required phrase'))?.replace('Required Phrase: ', '') ?? 'None declared.',
          source: `${brand.url}/brand-guidelines`,
          confidence: 'high',
          status: 'ready',
        },
        {
          label: 'Prohibitions',
          value: ec.prohibitions.join(' · '),
          source: `${brand.url}/brand-guidelines`,
          confidence: 'high',
          status: ec.prohibitions.length > 0 ? 'ready' : 'review',
        },
      ],
    },
    {
      key: 'compliance',
      title: 'Compliance',
      icon: Shield,
      summary: 'Regulated claims, disclaimers, rights status, and items that must clear human review before production.',
      items: [
        {
          label: 'Regulated vertical',
          value: isAura || isVedic ? 'Real estate / heritage assets — pricing and availability claims require review.' : 'Rental housing — deposit and occupancy claims require review.',
          source: `${brand.url}/legal`,
          confidence: 'high',
          status: 'review',
        },
        {
          label: 'Claims requiring review',
          value: isAura
            ? 'RERA numbers · possession timelines · pricing under 10 Crore'
            : isSoma
            ? 'Zero-deposit eligibility · occupancy rates · instant credit approval'
            : 'Heritage authenticity · restoration dates · title provenance',
          source: `${brand.url}/pricing`,
          confidence: 'high',
          status: 'review',
        },
        {
          label: 'Image rights',
          value: 'Hero and gallery images flagged as brand-owned-claimed; review before commercial use.',
          source: `${brand.url}/gallery`,
          confidence: 'medium',
          status: 'review',
        },
        {
          label: 'Disclaimers',
          value: 'Performance outcomes are not guaranteed. Built from observed patterns; verified before publication.',
          source: 'system-policy',
          confidence: 'high',
          status: 'ready',
        },
      ],
    },
  ];

  return { score, categories, specimen: brandSpecimen(brand) };
}

function ReadinessGauge({ score, color }: { score: number; color: string }) {
  const radius = 42;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference - (score / 100) * circumference;

  return (
    <div className="relative h-24 w-24 sm:h-28 sm:w-28 shrink-0 flex items-center justify-center">
      <svg className="h-full w-full -rotate-90" viewBox="0 0 100 100">
        <circle cx="50" cy="50" r={radius} stroke="rgba(255,255,255,0.08)" strokeWidth="8" fill="none" />
        <motion.circle
          cx="50"
          cy="50"
          r={radius}
          stroke={color}
          strokeWidth="8"
          fill="none"
          strokeLinecap="round"
          strokeDasharray={circumference}
          initial={{ strokeDashoffset: circumference }}
          animate={{ strokeDashoffset: offset }}
          transition={{ duration: 1.2, ease: [0.22, 1, 0.36, 1] }}
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className="text-xl sm:text-2xl font-display font-semibold text-white">{score}</span>
        <span className="text-[7px] sm:text-[8px] font-mono text-zinc-500 uppercase tracking-wider">ready</span>
      </div>
    </div>
  );
}

function StatusIcon({ status }: { status: ItemStatus }) {
  if (status === 'blocked') return <XCircle className="h-4 w-4 text-red-400" aria-hidden="true" />;
  if (status === 'review') return <AlertTriangle className="h-4 w-4 text-amber-400" aria-hidden="true" />;
  return <CheckCircle2 className="h-4 w-4 text-emerald-400" aria-hidden="true" />;
}

function ConfidenceBadge({ level }: { level: Confidence }) {
  const color = level === 'high' ? 'text-emerald-400' : level === 'medium' ? 'text-amber-400' : 'text-red-400';
  return <span className={`text-[9px] font-mono uppercase ${color}`}>{level}</span>;
}

function SpecimenFrame({ brand, specimen }: { brand: BrandData; specimen: BrandSpecimen }) {
  return (
    <div className="w-full max-w-[220px] mx-auto aspect-[9/16] rounded-2xl border border-white/15 bg-zinc-950/60 p-2 shadow-2xl overflow-hidden relative group">
      <div className="absolute inset-0 bg-gradient-to-tr from-transparent via-white/5 to-transparent pointer-events-none z-10" />
      <div className="relative w-full h-full rounded-xl overflow-hidden bg-zinc-900/40 flex flex-col justify-between p-3">
        <div className="absolute inset-0 z-0">
          <img
            src={brand.reviewItem.thumbnailUrl}
            alt={`${brand.name} hero`}
            className="w-full h-full object-cover opacity-40 filter grayscale group-hover:grayscale-0 group-hover:scale-105 transition-all duration-700"
            referrerPolicy="no-referrer"
          />
          <div className="absolute inset-0 bg-gradient-to-t from-zinc-950 via-zinc-950/30 to-transparent" />
        </div>

        <div className="relative z-10 flex justify-between items-start">
          <span className="text-[7px] font-mono text-zinc-400 uppercase tracking-wider">{specimen.watermark}</span>
          <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse" />
        </div>

        <motion.div
          initial={{ scale: 0.95, opacity: 0.8 }}
          animate={{ scale: [1, 1.05, 1], opacity: [0.8, 1, 0.8] }}
          transition={{ repeat: Infinity, duration: 4, ease: 'easeInOut' }}
          className="absolute inset-0 m-auto h-10 w-10 rounded-full flex items-center justify-center border border-white/20 bg-black/40 backdrop-blur-sm cursor-pointer hover:bg-black/60 z-10"
        >
          <Play className="h-3 w-3 text-white fill-white translate-x-0.5" />
        </motion.div>

        <div className="relative z-10 space-y-2 pt-16">
          <div className="bg-black/60 backdrop-blur-md rounded-lg border border-white/10 p-2.5 space-y-1">
            <p className="text-[8px] font-mono text-zinc-500 uppercase tracking-wider">Ad Preview</p>
            <h4 className="text-[10px] font-display font-medium text-white leading-tight line-clamp-2">
              {specimen.headline}
            </h4>
            <p className="text-[8px] text-zinc-400 font-sans leading-tight line-clamp-2">{specimen.subhead}</p>
            <div className="h-px bg-white/5" />
            <p className="text-[8px] font-mono uppercase tracking-wide truncate" style={{ color: brand.primaryColor }}>
              {specimen.cta}
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function BrandAssetPack({ brand }: { brand: BrandData }) {
  const [activeTab, setActiveTab] = useState<TabKey>('identity');
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});

  const pack = useMemo(() => buildPack(brand), [brand]);

  const toggle = (id: string) => setExpanded((prev) => ({ ...prev, [id]: !prev[id] }));

  const activeCategory = pack.categories.find((c) => c.key === activeTab)!;
  const readyCount = pack.categories.reduce((acc, cat) => acc + cat.items.filter((i) => i.status === 'ready').length, 0);
  const reviewCount = pack.categories.reduce((acc, cat) => acc + cat.items.filter((i) => i.status === 'review').length, 0);
  const blockedCount = pack.categories.reduce((acc, cat) => acc + cat.items.filter((i) => i.status === 'blocked').length, 0);

  return (
    <Spotlight color={brand.primaryColor} className="relative w-full h-full rounded-2xl border border-white/10 bg-zinc-950/80 backdrop-blur shadow-2xl overflow-hidden flex flex-col">
      <div className="p-3 sm:p-4 border-b border-white/5 flex justify-between items-start gap-4 shrink-0">
        <div className="min-w-0 space-y-1">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-[9px] font-mono text-zinc-500 uppercase tracking-widest">Brand Dossier</span>
            <span className={`px-1.5 py-0.5 text-[8px] font-mono border rounded uppercase ${pack.score >= 80 ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20' : 'bg-amber-500/10 text-amber-400 border-amber-500/20'}`}>
              {pack.score >= 80 ? 'Generation Ready' : 'Review Required'}
            </span>
          </div>
          <h3 className="text-lg sm:text-xl font-display font-medium text-white tracking-tight truncate">{brand.name}</h3>
          <div className="flex items-center gap-2 text-[9px] sm:text-[10px] font-mono text-zinc-400 flex-wrap">
            <Link className="h-3 w-3" />
            <span className="truncate max-w-[120px] sm:max-w-none">{brand.url}</span>
            <span className="text-zinc-600">·</span>
            <span>Real Estate</span>
            <span className="text-zinc-600">·</span>
            <span className="text-emerald-400">High confidence</span>
          </div>
        </div>
        <ReadinessGauge score={pack.score} color={brand.primaryColor} />
      </div>

      <div className="px-2 sm:px-3 border-b border-white/5 flex overflow-x-auto no-scrollbar gap-0 shrink-0">
        {pack.categories.map((cat) => {
          const isActive = activeTab === cat.key;
          const Icon = cat.icon;
          return (
            <button
              key={cat.key}
              onClick={() => setActiveTab(cat.key)}
              className={`flex items-center gap-1.5 px-2.5 sm:px-3 py-2 text-[9px] sm:text-[10px] font-mono uppercase tracking-wider border-b-2 transition-all duration-200 whitespace-nowrap focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-0 focus-visible:ring-inset ${
                isActive ? 'text-white' : 'text-zinc-500 hover:text-zinc-300'
              }`}
              style={{ borderColor: isActive ? brand.primaryColor : 'transparent' }}
            >
              <Icon className="h-3.5 w-3.5" />
              <span className="hidden sm:inline">{cat.title}</span>
              <span className="sm:hidden">{cat.title.slice(0, 3)}</span>
            </button>
          );
        })}
      </div>

      <div className="flex-1 overflow-y-auto p-3 sm:p-4 min-h-0">
        <AnimatePresence mode="wait">
          <motion.div
            key={activeTab}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            transition={{ duration: 0.22 }}
            className="space-y-3"
          >
            {activeTab === 'identity' && (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="space-y-3">
                  <p className="text-xs text-zinc-400 font-sans">{activeCategory.summary}</p>
                  {activeCategory.items.map((item, idx) => {
                    const id = `${activeTab}-${idx}`;
                    return (
                      <AssetAccordion
                        key={id}
                        id={id}
                        item={item}
                        isOpen={expanded[id]}
                        onToggle={() => toggle(id)}
                      />
                    );
                  })}
                </div>
                <div className="flex items-center justify-center">
                  <SpecimenFrame brand={brand} specimen={pack.specimen} />
                </div>
              </div>
            )}

            {activeTab !== 'identity' && (
              <>
                <p className="text-xs text-zinc-400 font-sans">{activeCategory.summary}</p>
                {activeCategory.items.map((item, idx) => {
                  const id = `${activeTab}-${idx}`;
                  return (
                    <AssetAccordion
                      key={id}
                      id={id}
                      item={item}
                      isOpen={expanded[id]}
                      onToggle={() => toggle(id)}
                    />
                  );
                })}
              </>
            )}
          </motion.div>
        </AnimatePresence>
      </div>

      <div className="p-3 border-t border-white/5 bg-zinc-950/40 shrink-0">
        <div className="flex items-center justify-between gap-3 text-[9px] font-mono text-zinc-500 mb-2">
          <span className="flex items-center gap-1"><CheckCircle2 className="h-3 w-3 text-emerald-400" /> {readyCount} ready</span>
          <span className="flex items-center gap-1"><AlertCircle className="h-3 w-3 text-amber-400" /> {reviewCount} review</span>
          {blockedCount > 0 && <span className="flex items-center gap-1"><XCircle className="h-3 w-3 text-red-400" /> {blockedCount} blocked</span>}
        </div>
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
          <div className="space-y-0.5 min-w-0">
            <div className="flex items-center gap-2 text-[9px] font-mono text-zinc-500">
              <Lock className="h-3 w-3" />
              <span className="truncate">Version 1 · sha {brand.reviewItem.hash.substring(7, 18)}</span>
            </div>
            <p className="text-[10px] text-zinc-400 font-sans">
              Approve this profile before any paid generation begins.
            </p>
          </div>
          <div className="flex items-center gap-2 w-full sm:w-auto">
            <button className="flex-1 sm:flex-none px-3 sm:px-4 py-2 rounded-lg text-[9px] sm:text-[10px] font-mono uppercase tracking-wider border border-white/10 text-zinc-300 hover:text-white hover:bg-white/5 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-white/20">
              Request review
            </button>
            <button
              className="flex-1 sm:flex-none px-3 sm:px-4 py-2 rounded-lg text-[9px] sm:text-[10px] font-mono uppercase tracking-wider font-semibold text-black transition-all duration-200 hover:opacity-90 focus:outline-none focus-visible:ring-2 focus-visible:ring-white/30"
              style={{ backgroundColor: brand.primaryColor }}
            >
              Approve profile
            </button>
          </div>
        </div>
      </div>
    </Spotlight>
  );
}

function AssetAccordion({
  id,
  item,
  isOpen,
  onToggle,
}: {
  id: string;
  item: AssetItem;
  isOpen?: boolean;
  onToggle: () => void;
}) {
  return (
    <div className="rounded-xl border border-white/5 bg-white/[0.02] overflow-hidden">
      <button
        onClick={onToggle}
        aria-expanded={isOpen}
        className="w-full flex items-center justify-between p-3 text-left hover:bg-white/[0.03] transition-colors focus:outline-none focus-visible:bg-white/[0.05]"
      >
        <div className="flex items-center gap-2.5 min-w-0">
          <StatusIcon status={item.status} />
          <span className="text-xs font-medium text-zinc-200 truncate">{item.label}</span>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <ConfidenceBadge level={item.confidence} />
          {isOpen ? <ChevronDown className="h-3.5 w-3.5 text-zinc-500" /> : <ChevronRight className="h-3.5 w-3.5 text-zinc-500" />}
        </div>
      </button>
      <AnimatePresence initial={false}>
        {isOpen && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.22 }}
            className="overflow-hidden"
          >
            <div className="px-3 pb-3 space-y-2">
              <p className="text-[11px] text-zinc-300 font-sans leading-relaxed">{item.value}</p>
              <div className="flex items-center gap-1.5 text-[9px] font-mono text-zinc-500">
                <Link className="h-3 w-3 shrink-0" />
                <span className="truncate">{item.source}</span>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
