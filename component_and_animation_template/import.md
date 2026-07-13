# CHERP Application Animations Reference

This document compiles the code for all the interactive animations, UI transition effects, keyframe-based visual components, and CSS styles used across the application.

---

## 1. Interactive UI Components

### Magnetic Hover Pull
Pulls the element towards the cursor dynamically when hovering within a set range, using spring physics.

```tsx
import { useRef, useState } from 'react'
import { motion } from 'framer-motion'

interface MagnetProps {
  children: React.ReactNode
  range?: number
  strength?: number
  className?: string
}

export function Magnet({
  children,
  range = 40,
  strength = 0.35,
  className = '',
}: MagnetProps) {
  const ref = useRef<HTMLDivElement>(null)
  const [position, setPosition] = useState({ x: 0, y: 0 })

  const handleMouseMove = (e: React.MouseEvent) => {
    if (!ref.current) return
    const { clientX, clientY } = e
    const { left, top, width, height } = ref.current.getBoundingClientRect()
    const centerX = left + width / 2
    const centerY = top + height / 2
    const distanceX = clientX - centerX
    const distanceY = clientY - centerY
    const distance = Math.hypot(distanceX, distanceY)

    if (distance < range) {
      setPosition({ x: distanceX * strength, y: distanceY * strength })
    } else {
      setPosition({ x: 0, y: 0 })
    }
  }

  const handleMouseLeave = () => {
    setPosition({ x: 0, y: 0 })
  }

  return (
    <motion.div
      ref={ref}
      className={className}
      onMouseMove={handleMouseMove}
      onMouseLeave={handleMouseLeave}
      animate={{ x: position.x, y: position.y }}
      transition={{ type: 'spring', stiffness: 150, damping: 15 }}
      style={{ display: 'inline-block' }}
    >
      {children}
    </motion.div>
  )
}
```

---

### Numeric Count Up
Smooth numeric odometer animation using high-performance animation frames.

```tsx
import { useEffect, useState } from 'react'

interface CountUpProps {
  end: number
  start?: number
  duration?: number
  prefix?: string
  suffix?: string
  className?: string
}

export function CountUp({
  end,
  start = 0,
  duration = 1.5,
  prefix = '',
  suffix = '',
  className = '',
}: CountUpProps) {
  const [count, setCount] = useState(start)

  useEffect(() => {
    let startTimestamp: number | null = null
    let animationFrameId: number

    const step = (timestamp: number) => {
      if (!startTimestamp) startTimestamp = timestamp
      const progress = Math.min((timestamp - startTimestamp) / (duration * 1000), 1)
      setCount(Math.floor(progress * (end - start) + start))
      if (progress < 1) {
        animationFrameId = window.requestAnimationFrame(step)
      } else {
        setCount(end)
      }
    }
    animationFrameId = window.requestAnimationFrame(step)
    return () => window.cancelAnimationFrame(animationFrameId)
  }, [end, start, duration])

  return (
    <span className={className}>
      {prefix}
      {count}
      {suffix}
    </span>
  )
}
```

---

### Cyber Decryption Text Reveal
Scrambles letters/symbols randomly and gradually resolves them into target values to create a decryption text reveal.

```tsx
import { useEffect, useState } from 'react'

interface DecryptedTextProps {
  text: string
  speed?: number
  maxIterations?: number
  sequential?: boolean
  className?: string
}

export function DecryptedText({
  text,
  speed = 40,
  maxIterations = 5,
  sequential = true,
  className = '',
}: DecryptedTextProps) {
  const [displayText, setDisplayText] = useState('')
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789!@#$%^&*()_+'

  useEffect(() => {
    let active = true
    let iteration = 0
    const interval = setInterval(() => {
      if (!active) return

      const nextText = text
        .split('')
        .map((char, index) => {
          if (char === ' ') return ' '
          const solvedThreshold = sequential ? (iteration / maxIterations) : (iteration >= maxIterations ? text.length : 0)
          if (index < solvedThreshold) {
            return text[index]
          }
          return chars[Math.floor(Math.random() * chars.length)]
        })
        .join('')

      setDisplayText(nextText)

      if (iteration >= text.length * maxIterations) {
        setDisplayText(text)
        clearInterval(interval)
      }

      iteration++
    }, speed)

    return () => {
      active = false
      clearInterval(interval)
    }
  }, [text, speed, maxIterations, sequential])

  return <span className={className}>{displayText}</span>
}
```

---

### Shiny Text Sweep
Shifts an infinite linear background gradient mask across text nodes to form metallic shimmer sweeps.

```tsx
interface ShinyTextProps {
  text: string
  disabled?: boolean
  speed?: number
  className?: string
}

export function ShinyText({
  text,
  disabled = false,
  speed = 5,
  className = '',
}: ShinyTextProps) {
  const animationDuration = `${speed}s`

  return (
    <span
      className={`shiny-text ${disabled ? 'disabled' : ''} ${className}`}
      style={{ animationDuration } as React.CSSProperties}
    >
      {text}
    </span>
  )
}
```

```css
.shiny-text {
  background: linear-gradient(
    120deg,
    var(--text) 40%,
    rgba(59, 109, 214, 0.8) 50%,
    var(--text) 60%
  );
  background-size: 200% auto;
  -webkit-background-clip: text;
  -webkit-text-fill-color: transparent;
  background-clip: text;
  display: inline-block;
  animation: shine 5s linear infinite;
}

.shiny-text.disabled {
  background: none;
  -webkit-text-fill-color: initial;
  background-clip: initial;
  animation: none;
}

@keyframes shine {
  0% {
    background-position: 200% center;
  }
  100% {
    background-position: -200% center;
  }
}
```

---

### Soft Aurora Background Blobs
Floating organic gradient spheres moving in slow, overlapping directions behind elements.

```tsx
interface SoftAuroraProps {
  color1?: string
  color2?: string
  color3?: string
  children?: React.ReactNode
  className?: string
}

export function SoftAurora({
  color1 = 'var(--blue-light)',
  color2 = 'var(--teal-light)',
  color3 = 'var(--purple-light)',
  children,
  className = '',
}: SoftAuroraProps) {
  return (
    <div className={`soft-aurora-container ${className}`}>
      <div className="soft-aurora-ambient">
        <div className="aurora-blob blob-1" style={{ backgroundColor: color1 }} />
        <div className="aurora-blob blob-2" style={{ backgroundColor: color2 }} />
        <div className="aurora-blob blob-3" style={{ backgroundColor: color3 }} />
      </div>
      <div className="soft-aurora-content">{children}</div>
    </div>
  )
}
```

```css
.soft-aurora-container {
  position: relative;
  width: 100%;
  height: 100%;
  overflow: hidden;
}

.soft-aurora-ambient {
  position: absolute;
  inset: 0;
  filter: blur(120px);
  opacity: 0.6;
  pointer-events: none;
  z-index: 0;
}

.aurora-blob {
  position: absolute;
  border-radius: 50%;
  mix-blend-mode: multiply;
  filter: opacity(0.85);
  animation: moveBlob 25s infinite alternate ease-in-out;
}

.blob-1 {
  width: 70%;
  height: 70%;
  top: -10%;
  left: -10%;
  animation-duration: 22s;
}

.blob-2 {
  width: 65%;
  height: 65%;
  bottom: -15%;
  right: -10%;
  animation-duration: 28s;
  animation-delay: -5s;
}

.blob-3 {
  width: 55%;
  height: 55%;
  top: 35%;
  left: 25%;
  animation-duration: 35s;
  animation-delay: -10s;
}

@keyframes moveBlob {
  0% {
    transform: translate(0px, 0px) scale(1);
  }
  33% {
    transform: translate(40px, -60px) scale(1.15);
  }
  66% {
    transform: translate(-30px, 30px) scale(0.9);
  }
  100% {
    transform: translate(0px, 0px) scale(1);
  }
}

.soft-aurora-content {
  position: relative;
  z-index: 1;
  width: 100%;
  height: 100%;
}
```

---

### Spotlight Card Glow
Tracks cursor mouse position using CSS Custom Variables to generate dynamic border and radial gradient hover reveals.

```tsx
import { useRef, useState } from 'react'

interface SpotlightCardProps extends React.HTMLAttributes<HTMLElement> {
  as?: React.ElementType
  spotlightColor?: string
  children: React.ReactNode
}

export function SpotlightCard({
  as: Component = 'div',
  spotlightColor = 'rgba(59, 109, 214, 0.12)',
  children,
  className = '',
  ...props
}: SpotlightCardProps) {
  const cardRef = useRef<HTMLElement>(null)
  const [coords, setCoords] = useState({ x: 0, y: 0 })

  const handleMouseMove = (e: React.MouseEvent) => {
    if (!cardRef.current) return
    const rect = cardRef.current.getBoundingClientRect()
    setCoords({ x: e.clientX - rect.left, y: e.clientY - rect.top })
  }

  return (
    <Component
      ref={cardRef}
      className={`spotlight-card ${className}`}
      onMouseMove={handleMouseMove}
      {...props}
      style={{
        ['--spotlight-color' as any]: spotlightColor,
        ['--x' as any]: `${coords.x}px`,
        ['--y' as any]: `${coords.y}px`,
        ...props.style
      } as React.CSSProperties}
    >
      <div className="spotlight-card-border" />
      <div className="spotlight-card-content">{children}</div>
    </Component>
  )
}
```

```css
.spotlight-card {
  position: relative;
  border-radius: 12px;
  background: var(--card);
  border: 1px solid var(--border);
  overflow: hidden;
}

.spotlight-card::before {
  content: '';
  position: absolute;
  inset: 0;
  background: radial-gradient(
    circle 220px at var(--x) var(--y),
    var(--spotlight-color),
    transparent 80%
  );
  opacity: 0;
  transition: opacity 0.3s ease;
  pointer-events: none;
  z-index: 1;
}

.spotlight-card:hover::before {
  opacity: 1;
}

.spotlight-card-border {
  position: absolute;
  inset: 0;
  border-radius: inherit;
  padding: 1.5px;
  background: radial-gradient(
    circle 160px at var(--x) var(--y),
    rgba(59, 109, 214, 0.35),
    transparent 70%
  );
  -webkit-mask: linear-gradient(#fff 0 0) content-box, linear-gradient(#fff 0 0);
  -webkit-mask-composite: xor;
  mask-composite: exclude;
  pointer-events: none;
  opacity: 0;
  transition: opacity 0.3s ease;
  z-index: 2;
}

.spotlight-card:hover .spotlight-card-border {
  opacity: 1;
}

.spotlight-card-content {
  position: relative;
  z-index: 3;
  width: 100%;
  height: 100%;
}
```

---

### Landing Page Switching Text / Word Rotator
Cycles through high-impact marketing keywords vertically on the landing page screen using exit/entry slide-up transitions.

```tsx
import { useEffect, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'

interface RotatingTextProps {
  texts: string[]
  interval?: number
  className?: string
}

export function RotatingText({
  texts,
  interval = 3000,
  className = '',
}: RotatingTextProps) {
  const [index, setIndex] = useState(0)

  useEffect(() => {
    const timer = setInterval(() => {
      setIndex((prev) => (prev + 1) % texts.length)
    }, interval)
    return () => clearInterval(timer)
  }, [texts, interval])

  return (
    <div className={`rotating-text-wrapper ${className}`}>
      <AnimatePresence mode="wait">
        <motion.span
          key={index}
          className="rotating-text-item"
          initial={{ y: 22, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          exit={{ y: -22, opacity: 0 }}
          transition={{ duration: 0.3, ease: 'easeOut' }}
        >
          {texts[index]}
        </motion.span>
      </AnimatePresence>
    </div>
  )
}
```

```css
.rotating-text-wrapper {
  display: inline-flex;
  position: relative;
  overflow: hidden;
  height: 1.45em;
  vertical-align: -0.15em;
  align-items: center;
}

.rotating-text-item {
  display: inline-block;
  color: var(--blue);
  font-weight: 800;
  padding-bottom: 0.1em;
  padding-right: 0.05em;
}
```

---

## 2. Layout Transitions & Page Reveals

### Shell Route Transitions
Fades and shifts child routes dynamically on switch actions within the primary workspace shell.

```tsx
<div className="content-area">
  <AnimatePresence mode="wait">
    <motion.div
      key={activeRoute}
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -6 }}
      transition={{ duration: 0.18, ease: 'easeOut' }}
    >
      {activeRoute === 'dashboard' ? (
        <DashboardPage
          onNavigate={(nextRoute, ids) => {
            setTargetWorkflowId(ids?.workflowId ?? null)
            setRoute(nextRoute)
          }}
        />
      ) : null}
      {/* Additional route conditions follow ... */}
    </motion.div>
  </AnimatePresence>
</div>
```

### CSS Content Swapping Reveal
Standard CSS reveal anim for fallback route container area swaps.

```css
.content-area > * {
  min-width: 0;
  animation: page-reveal 220ms ease both;
}

@keyframes page-reveal {
  from {
    opacity: 0;
    transform: translateY(8px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}
```

---

## 3. General & Premium UI Animations (Global CSS Library)

These keyframe sets and corresponding helper classes are loaded globally to animate layouts, headers, metric cards, status badges, and elements.

```css
/* Premium Animations Keyframes */
@keyframes pageIn {
  from { opacity: 0; transform: translateY(10px); }
  to { opacity: 1; transform: translateY(0); }
}
@keyframes headerDrop {
  from { opacity: 0; transform: translateY(-15px); }
  to { opacity: 1; transform: translateY(0); }
}
@keyframes cardRise {
  from { opacity: 0; transform: translateY(20px); }
  to { opacity: 1; transform: translateY(0); }
}
@keyframes taskCascade {
  from { opacity: 0; transform: translateX(-10px); }
  to { opacity: 1; transform: translateX(0); }
}
@keyframes logoShimmer {
  0% { background-position: -200% 0; }
  100% { background-position: 200% 0; }
}
@keyframes statusPulse {
  0% { box-shadow: 0 0 0 0 rgba(45, 168, 107, 0.4); }
  70% { box-shadow: 0 0 0 6px rgba(45, 168, 107, 0); }
  100% { box-shadow: 0 0 0 0 rgba(45, 168, 107, 0); }
}
@keyframes borderSweep {
  0%, 100% { border-color: var(--border); }
  50% { border-color: var(--blue); }
}

/* Animations Classes */
.animate-pageIn {
  animation: pageIn 0.3s cubic-bezier(0.16, 1, 0.3, 1) forwards;
}
.animate-headerDrop {
  animation: headerDrop 0.4s cubic-bezier(0.16, 1, 0.3, 1) forwards;
}
.animate-cardRise {
  animation: cardRise 0.5s cubic-bezier(0.16, 1, 0.3, 1) forwards;
}
```

---

## 4. Theme Toggle Switch Complex Animations

Morphing vector and state transitions on check configurations:

```css
/* Clouds wind drifting keyframe */
@keyframes cloud-move {
  0% { transform: translateX(0px); }
  40% { transform: translateX(4px); }
  80% { transform: translateX(-4px); }
  100% { transform: translateX(0px); }
}

/* Star scaling twinkle keyframe */
@keyframes star-twinkle {
  0% { transform: scale(1); }
  40% { transform: scale(1.2); }
  80% { transform: scale(0.8); }
  100% { transform: scale(1); }
}

/* Transitions on stars show state */
.stars {
  transform: translateY(-32px);
  opacity: 0;
  transition: 0.4s;
}

#theme-toggle-input:checked + .slider .stars {
  transform: translateY(0);
  opacity: 1;
}

.star {
  fill: white;
  position: absolute;
  transition: 0.4s;
  animation-name: star-twinkle;
  animation-duration: 2s;
  animation-iteration-count: infinite;
}
```

---

## 5. Micro-Interactions, Data Progress Indicators & Hover Transitions

### Dynamic Progress Bar Transitions
Animates progress indicators filling up dynamically when rendering client lists or analytical charts.

```tsx
style={{
  width: `${progress}%`,
  transition: 'width 0.4s ease-in-out'
}}
```

---

### Circular Progress Indicator Sweeps
Performs smooth SVG stroke displacement transitions when progress counters populate.

```tsx
style={{
  strokeDashoffset,
  transition: 'stroke-dashoffset 0.5s ease'
}}
```

---

### Pie Chart Slice Hover expansion
Flares pie or line chart sections dynamically under selection highlights.

```tsx
style={{
  transition: 'stroke-width 0.2s ease, stroke 0.2s'
}}
```

---

### Kanban Board Card Interactive Transitions
Smooth card movements and hover highlights in the task board workflow sections.

```css
.task-board-card {
  transition: background-color 0.2s ease, border-color 0.2s ease, box-shadow 0.2s ease;
}
```

---

### Interactive Rows & List Selections
Soft background fade changes on table grids and dropdown item highlights.

```css
.list-row-item {
  transition: background 0.15s;
}
```

---

### Primary Actions & CTA Elevations
Raises element vertically while casting softer, broader box shadows below.

```css
.primary-action {
  transition: transform 140ms ease, box-shadow 140ms ease, background 140ms ease;
}

.primary-action:hover:not(:disabled) {
  box-shadow: 0 10px 24px rgba(59, 109, 214, 0.24);
  transform: translateY(-1px);
}
```

---

### Dashboard Metric Cards
Combines translations and deep shadows for layout hover focus cards.

```css
.metric-card {
  transition: transform 160ms ease, box-shadow 160ms ease, border-color 160ms ease;
}

.metric-card:hover {
  border-color: rgba(59, 109, 214, 0.18);
  box-shadow: 0 12px 32px rgba(26, 26, 26, 0.07);
  transform: translateY(-2px);
}
```

---

### Icon Action Elements & Ghost States
Instantaneous color shifts to strong theme border outlines.

```css
.icon-button {
  transition: transform 140ms ease, border-color 140ms ease, background 140ms ease;
}

.logout-button:hover,
.ghost-button:hover,
.icon-button:hover {
  color: var(--text);
  border-color: var(--border-strong);
  background: var(--hover);
}
```
