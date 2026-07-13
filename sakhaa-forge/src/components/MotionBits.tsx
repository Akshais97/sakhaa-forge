import { useEffect, useRef, useState } from 'react';
import type React from 'react';
import { AnimatePresence, motion } from 'motion/react';

interface RotatingTextProps {
  texts: string[];
  interval?: number;
  className?: string;
  color?: string;
}

export function RotatingText({ texts, interval = 2600, className = '', color }: RotatingTextProps) {
  const [index, setIndex] = useState(0);

  useEffect(() => {
    const timer = window.setInterval(() => {
      setIndex((current) => (current + 1) % texts.length);
    }, interval);
    return () => window.clearInterval(timer);
  }, [texts.length, interval]);

  return (
    <span className={`rotating-text-wrapper ${className}`} style={{ '--brand-accent': color } as React.CSSProperties}>
      <AnimatePresence mode="wait">
        <motion.span
          key={texts[index]}
          className="rotating-text-item"
          initial={{ y: 18, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          exit={{ y: -18, opacity: 0 }}
          transition={{ duration: 0.26, ease: [0.22, 1, 0.36, 1] }}
        >
          {texts[index]}
        </motion.span>
      </AnimatePresence>
    </span>
  );
}

interface RotatingWordPairProps {
  pairs: Array<{ first: string; second: string }>;
  interval?: number;
  color?: string;
}

export function RotatingWordPair({ pairs, interval = 2600, color }: RotatingWordPairProps) {
  const [index, setIndex] = useState(0);
  const activePair = pairs[index];

  useEffect(() => {
    const timer = window.setInterval(() => {
      setIndex((current) => (current + 1) % pairs.length);
    }, interval);
    return () => window.clearInterval(timer);
  }, [pairs.length, interval]);

  return (
    <>
      <span className="rotating-text-wrapper hero-rotating-word hero-word-primary" style={{ '--brand-accent': color } as React.CSSProperties}>
        <AnimatePresence mode="wait">
          <motion.span
            key={activePair.first}
            className="rotating-text-item"
            initial={{ y: 18, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: -18, opacity: 0 }}
            transition={{ duration: 0.26, ease: [0.22, 1, 0.36, 1] }}
          >
            {activePair.first}
          </motion.span>
        </AnimatePresence>
      </span>{' '}
      Trends into{' '}
      <span className="rotating-text-wrapper hero-rotating-word hero-word-secondary" style={{ '--brand-accent': color } as React.CSSProperties}>
        <AnimatePresence mode="wait">
          <motion.span
            key={activePair.second}
            className="rotating-text-item"
            initial={{ y: 18, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: -18, opacity: 0 }}
            transition={{ duration: 0.26, ease: [0.22, 1, 0.36, 1] }}
          >
            {activePair.second}
          </motion.span>
        </AnimatePresence>
      </span>{' '}
      Calendars.
    </>
  );
}

interface MagnetProps {
  children: React.ReactNode;
  range?: number;
  strength?: number;
  className?: string;
}

export function Magnet({ children, range = 34, strength = 0.22, className = '' }: MagnetProps) {
  const ref = useRef<HTMLDivElement>(null);
  const [position, setPosition] = useState({ x: 0, y: 0 });

  const handleMouseMove = (event: React.MouseEvent) => {
    if (!ref.current) return;
    const { left, top, width, height } = ref.current.getBoundingClientRect();
    const centerX = left + width / 2;
    const centerY = top + height / 2;
    const distanceX = event.clientX - centerX;
    const distanceY = event.clientY - centerY;
    const distance = Math.hypot(distanceX, distanceY);
    setPosition(distance < range ? { x: distanceX * strength, y: distanceY * strength } : { x: 0, y: 0 });
  };

  return (
    <motion.div
      ref={ref}
      className={className}
      onMouseMove={handleMouseMove}
      onMouseLeave={() => setPosition({ x: 0, y: 0 })}
      animate={position}
      transition={{ type: 'spring', stiffness: 170, damping: 18 }}
    >
      {children}
    </motion.div>
  );
}

interface SpotlightProps {
  children: React.ReactNode;
  color: string;
  className?: string;
}

export function Spotlight({ children, color, className = '' }: SpotlightProps) {
  const [coords, setCoords] = useState({ x: 0, y: 0 });

  const handleMouseMove = (event: React.MouseEvent<HTMLDivElement>) => {
    const rect = event.currentTarget.getBoundingClientRect();
    setCoords({ x: event.clientX - rect.left, y: event.clientY - rect.top });
  };

  return (
    <div
      className={`spotlight-card ${className}`}
      onMouseMove={handleMouseMove}
      style={{
        '--spotlight-color': `${color}22`,
        '--spotlight-border': `${color}66`,
        '--x': `${coords.x}px`,
        '--y': `${coords.y}px`
      } as React.CSSProperties}
    >
      <div className="spotlight-card-border" />
      <div className="spotlight-card-content">{children}</div>
    </div>
  );
}
