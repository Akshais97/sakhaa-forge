import { motion } from 'motion/react';
import { ProductionStage, BrandData } from '../types';

interface ProgressBarProps {
  stages: ProductionStage[];
  activeStageId: number;
  activeBrand: BrandData;
  onSelectStage: (id: number) => void;
}

export default function ProgressBar({ stages, activeStageId, activeBrand, onSelectStage }: ProgressBarProps) {
  return (
    <div className="w-full border-t border-white/5 bg-zinc-950/80 backdrop-blur-xl px-6 py-4 flex flex-col space-y-3 select-none" id="production-timeline-rail">
      {/* Small top track metadata */}
      <div className="flex justify-between items-center text-[9px] font-mono text-zinc-500 uppercase tracking-widest px-1">
        <span>Gated Command Lineage Track</span>
        <span>Click any node to navigate the pipeline</span>
      </div>

      {/* Horizontal Scrollable timeline track */}
      <div className="relative flex items-center justify-between overflow-x-auto gap-4 py-2 no-scrollbar scroll-smooth" id="timeline-rail-scroll">
        {/* Continuous background trace line */}
        <div className="absolute inset-x-0 top-1/2 -translate-y-1/2 h-0.5 bg-white/5 pointer-events-none z-0" />

        {/* Animated active progress highlight bar */}
        <div
          className="absolute left-0 top-1/2 -translate-y-1/2 h-0.5 transition-all duration-500 pointer-events-none z-0"
          style={{
            backgroundColor: activeBrand.primaryColor,
            width: `${(activeStageId / (stages.length - 1)) * 100}%`
          }}
        />

        {stages.map((stage) => {
          const isActive = stage.id === activeStageId;
          const isPassed = stage.id < activeStageId;

          return (
            <button
              key={stage.id}
              onClick={() => onSelectStage(stage.id)}
              className="relative z-10 flex flex-col items-center group cursor-pointer focus:outline-none flex-shrink-0"
              id={`timeline-node-${stage.id}`}
            >
              {/* Node Indicator circle */}
              <div
                className="h-7 w-7 rounded-full border flex items-center justify-center font-mono text-[10px] font-bold transition-all duration-300 bg-zinc-950"
                style={{
                  borderColor: isActive
                    ? activeBrand.primaryColor
                    : isPassed
                    ? `${activeBrand.primaryColor}88`
                    : 'rgba(255, 255, 255, 0.08)',
                  color: isActive
                    ? '#fff'
                    : isPassed
                    ? activeBrand.primaryColor
                    : '#71717a',
                  boxShadow: isActive
                    ? `0 0 15px ${activeBrand.primaryColor}55`
                    : 'none'
                }}
              >
                {stage.id < 10 ? `0${stage.id}` : stage.id}
              </div>

              {/* Label below */}
              <span
                className={`text-[9px] font-mono tracking-wider uppercase mt-2 transition-colors duration-200 ${
                  isActive
                    ? 'text-white font-medium'
                    : 'text-zinc-500 group-hover:text-zinc-300'
                }`}
                style={{
                  color: isActive ? activeBrand.primaryColor : ''
                }}
              >
                {stage.label}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
