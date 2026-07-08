import { motion } from 'motion/react';
import { Sparkles, ArrowUpRight, Activity, ShieldCheck, Layers } from 'lucide-react';
import { BrandData } from '../types';

interface HeaderProps {
  brands: BrandData[];
  activeBrand: BrandData;
  onSelectBrand: (brand: BrandData) => void;
  onRequestAccess: () => void;
}

export default function Header({ brands, activeBrand, onSelectBrand, onRequestAccess }: HeaderProps) {
  return (
    <header className="sticky top-0 z-40 w-full border-b border-white/5 bg-zinc-950/80 backdrop-blur-xl px-6 py-4 flex items-center justify-between" id="app-header">
      {/* Left logo & Brand tag */}
      <div className="flex items-center gap-4">
        <div className="flex items-center gap-2">
          {/* Custom geometric logo representing a double forge mark */}
          <div className="relative h-7 w-7 rounded bg-zinc-900 border border-white/10 flex items-center justify-center overflow-hidden">
            <motion.div
              animate={{ rotate: [0, 90, 180, 270, 360] }}
              transition={{ repeat: Infinity, duration: 12, ease: 'linear' }}
              className="h-3 w-3 border"
              style={{ borderColor: activeBrand.primaryColor }}
            />
            <div className="absolute inset-0 bg-gradient-to-t from-white/5 to-transparent pointer-events-none" />
          </div>
          <div className="flex flex-col">
            <span className="font-display font-bold text-sm tracking-widest text-white uppercase flex items-center gap-1.5">
              Sakhaa Forge
              <span className="text-[9px] font-mono font-medium border px-1 rounded bg-white/5" style={{ borderColor: `${activeBrand.primaryColor}22`, color: activeBrand.primaryColor }}>V0</span>
            </span>
            <span className="text-[9px] font-mono text-zinc-500 uppercase tracking-widest">
              Production Command Centre
            </span>
          </div>
        </div>

        {/* Separator */}
        <div className="hidden md:block h-6 w-px bg-white/10" />

        {/* Service status indicator */}
        <div className="hidden md:flex items-center gap-1.5 text-[10px] font-mono text-emerald-500 uppercase tracking-wider bg-emerald-500/5 px-2 py-0.5 rounded border border-emerald-500/10">
          <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse" />
          Service Status: Active
        </div>
      </div>

      {/* Center: Brand Switcher (Multi-brand Management Interface) */}
      <div className="hidden lg:flex items-center gap-1 bg-white/2 rounded-full border border-white/5 p-1" id="multi-brand-switcher">
        <span className="text-[9px] font-mono text-zinc-500 uppercase px-2.5">
          Active Brand Truth:
        </span>
        {brands.map((brand) => {
          const isActive = brand.id === activeBrand.id;
          return (
            <button
              key={brand.id}
              onClick={() => onSelectBrand(brand)}
              className={`px-3 py-1.5 rounded-full text-[10px] font-mono tracking-widest uppercase transition-all duration-300 flex items-center gap-1.5 ${
                isActive
                  ? 'bg-white/10 text-white shadow'
                  : 'text-zinc-400 hover:text-zinc-200 hover:bg-white/5'
              }`}
              style={{
                border: isActive ? `1px solid ${brand.primaryColor}33` : '1px solid transparent'
              }}
              id={`switch-brand-${brand.id}`}
            >
              <span
                className="h-1.5 w-1.5 rounded-full"
                style={{ backgroundColor: brand.primaryColor }}
              />
              {brand.name.split(' ')[0]}
            </button>
          );
        })}
      </div>

      {/* Right side CTAs */}
      <div className="flex items-center gap-3">
        {/* Dynamic credit balance widget */}
        <div className="hidden sm:flex items-center gap-2 border border-white/5 bg-white/2 rounded-lg px-3 py-1 font-mono text-xs">
          <Activity className="h-3 w-3 text-zinc-500" />
          <span className="text-zinc-400 uppercase text-[9px] tracking-wider">Credits:</span>
          <span className="text-white font-semibold" style={{ color: activeBrand.primaryColor }}>
            {activeBrand.costEstimate.walletBalance}
          </span>
        </div>

        <button
          onClick={onRequestAccess}
          className="relative overflow-hidden group rounded-lg px-4 py-2 text-xs font-mono tracking-widest uppercase transition-all duration-300 hover:shadow-lg hover:shadow-white/5 flex items-center gap-1.5 border border-white/15 text-white bg-white/5 hover:bg-white/15"
          style={{
            borderColor: `${activeBrand.primaryColor}22`
          }}
          id="request-access-header-btn"
        >
          Request Access
          <ArrowUpRight className="h-3 w-3 text-zinc-400 group-hover:text-white transition-colors duration-200" />
        </button>
      </div>
    </header>
  );
}
