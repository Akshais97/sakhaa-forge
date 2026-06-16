# DESIGN.md — The Authoritative Application Design System

> **Scope.** This is the single source of truth for how **Sakhaa Forge**
> (Product V0) becomes software, and the foundation that Product V2 and the
> V1 maturity release extend rather than replace. `PROJECT_BRAND_GUIDELINES.md` defines
> *who we are*; this document defines *how that identity becomes a usable, trustworthy,
> accessible interface*. Where the two ever conflict, brand identity wins on expression,
> this system wins on mechanics (contrast, state, accessibility, tokens).
>
> **Status:** authoritative. Components, Storybook, email templates, and rendered-media
> overlays consume the tokens defined here. No surface may hardcode a value this document
> can express as a token.
>
> **External visual references.** Files in
> `docs/Project/Design/references for only design and not TEXT/` and extracted colour/type
> notes such as `trypencil_design_extraction/DESIGN_colors.md` are reference material for
> visual direction only. They may inform landing-page energy, contrast, spacing, motion,
> typography rhythm and component density, but they are not product copy, IA, status,
> permission, claim, architecture or workflow sources. Do not copy their text, promises,
> labels or unsupported behaviours into V0.

---

## Table of contents

1. [Design philosophy and aesthetic direction](#1-design-philosophy-and-aesthetic-direction)
2. [Root-cause analysis of the tech stack → design guardrails](#2-root-cause-analysis-of-the-tech-stack--design-guardrails)
3. [Token architecture](#3-token-architecture)
4. [Color system](#4-color-system)
5. [Typography](#5-typography)
6. [Spacing, sizing, radius, border](#6-spacing-sizing-radius-border)
7. [Elevation, shadow, and the dark-mode inversion](#7-elevation-shadow-and-the-dark-mode-inversion)
8. [Motion and reduced motion](#8-motion-and-reduced-motion)
9. [Layout: grid, breakpoints, and the application shell](#9-layout-grid-breakpoints-and-the-application-shell)
10. [The status system — the signature](#10-the-status-system--the-signature)
11. [Core component patterns](#11-core-component-patterns)
12. [Media: the 9:16 player, thumbnails, and signed-URL handling](#12-media-the-916-player-thumbnails-and-signed-url-handling)
13. [Money, cost, and the ledger surface](#13-money-cost-and-the-ledger-surface)
14. [Lineage and evidence](#14-lineage-and-evidence)
15. [Empty, loading, error, and recovery states](#15-empty-loading-error-and-recovery-states)
16. [The Sakhaa / analytical surface extension](#16-the-sakhaa--analytical-surface-extension)
17. [Accessibility — WCAG 2.2 AA contract](#17-accessibility--wcag-22-aa-contract)
18. [Content and voice hooks](#18-content-and-voice-hooks)
19. [Component governance](#19-component-governance)
20. [Appendix A: token reference (DTCG)](#appendix-a-token-reference-dtcg)
21. [Appendix B: implementation notes for the stack](#appendix-b-implementation-notes-for-the-stack)

---

## 1. Design philosophy and aesthetic direction

### 1.1 The one sentence

> **Make a long, uncertain, expensive, multi-actor pipeline feel calm, legible, and honest.**

Every decision in this document is a consequence of that sentence. When a future choice is
ambiguous, return here. The product is not a video editor and not a dashboard; it is a
**control surface for irreversible work**. Calm is the brand. Honesty about state is the
feature.

### 1.2 Direction: "Studio Instrument"

The interface holds two truths at once:

- **A creative studio.** The output is a beautiful 9:16 film. Media is the hero; the canvas
  is a near-neutral grading surface so thumbnails and video are never color-cast by the UI.
- **A system of record.** Money, approvals, lineage, and audience-verification are grave,
  precise, and never overstated. Numbers are monospaced and tabular. Certainty is earned.

We reject three current defaults explicitly: neon-on-black creative-tool drama (over-promises
on a product that must not guarantee virality), generic 220° SaaS blue (under-serves the
media), and warm-cream editorial (wrong for a media-grading context). Instead: a **warm-neutral
graphite canvas**, a single confident **Iris** primary, one disciplined warm **Ember** accent
reserved for the creative/forward-motion moment, and a **rigorous, perceptually-distinct status
palette** that does the heavy lifting.

### 1.2.1 Landing-page and application adaptation

The extracted Pencil-style references can fit V0 only after adaptation. Their strong yellow,
high-contrast panels, large type, tight radii and lively motion are useful for a first-viewport
landing page that signals creative production, but the V0 application itself remains a system of
record for irreversible work. Apply the references as follows:

- **Landing page:** may use brighter creative accents, editorial scale, grid texture and kinetic
  contrast to communicate a production engine, while preserving this product's claim boundaries:
  no guaranteed virality, reach, conversion, attention, emotion or automation-without-review.
- **Authenticated application:** use this document's Studio Instrument system as the base. Do not
  replace Iris, Ember, the status palette, money treatments, signed-URL handling, evidence
  surfaces or accessibility rules with reference-site styling.
- **Shared behaviours:** reference visuals never override V0 contracts for brand truth, consent,
  tenant isolation, provider uncertainty, billing, lineage, approval or audience verification.
- **Copy:** all user-facing words come from V0 contracts and
  `docs/Project/Design/PROJECT_CONTENT_AND_LANGUAGE_GUIDE.md`, not from reference files.

### 1.3 Principles (in priority order)

1. **State is never a guess.** Every async, paid, or published thing shows exactly where it is.
   We have a real `Unknown` state and we use it; we never paint `Unknown` as success.
2. **Honest progress.** Determinate when we can measure, indeterminate when we can't. No fake
   percentages, no fake speed.
3. **Spend boldness once.** Iris and Ember are spent on the single most important action in any
   view. Everything else is quiet.
4. **The media is the subject.** Chrome recedes around video. The immediate media surround is
   color-neutral by contract.
5. **Money and irreversibility get gravity.** Cost is shown before commitment, in tabular
   monospace, with an explicit maximum authorization. Irreversible actions are never optimistic.
6. **Lineage is visible.** Any artifact can show what it came from. Provenance is a feature, not
   a debug view.
7. **Accessible by construction.** Status is never color-only. Focus is always visible. Targets
   are ≥24px. Motion is optional. This is a floor, not a goal.
8. **One vocabulary.** The word, color, icon, and shape for `published_verified` are identical in
   a chip, a timeline, a job card, an email, and a rendered overlay.

---

## 2. Root-cause analysis of the tech stack → design guardrails

The stack is not neutral. Each technology has a property that, if ignored, produces a specific
class of UI defect. The design guardrails below are derived from the *root cause*, not the
symptom.

### 2.1 Next.js (App Router, React Server Components, streaming/Suspense)

- **Root cause:** RSC streams server-rendered shells before client hydration; Suspense makes
  "loading" a structural, first-class boundary, not an afterthought.
- **Guardrails:**
  - Every Suspense fallback uses the **skeleton tokens** (§15.2), shaped like the real content.
    No spinners as page-level fallbacks.
  - Interactive, stateful surfaces (uploaders, players, comment threads, anything that mutates)
    are explicit **client boundaries**; everything else stays server-rendered. The design
    distinguishes *read* surfaces (server, fast, static-feeling) from *act* surfaces (client,
    responsive).
  - **No optimistic UI for irreversible operations** — paid generation submit, credit capture,
    publish, schedule. These show a pending state and update only on server confirmation
    (§10.4, §13.4). Optimistic UI is allowed only for trivially reversible actions (rename,
    comment, reorder).

### 2.2 NestJS + Prisma + PostgreSQL (canonical status enums)

- **Root cause:** Postgres is the canonical writer; `V0_STATUS_ENUMS.md` is the authoritative set
  of states. The UI is a *view* of server truth.
- **Guardrails:**
  - The UI status vocabulary is a **1:1 typed mapping** to the backend enum set. The design
    system owns each enum's *presentation* (label, color role, icon, shape); it must **never
    invent, merge, or split** states the backend does not have. A status with no mapping is a
    build error, not a fallback gray dot.
  - Enum → token mapping lives in one file (`status-tokens.ts`) generated from the enum source.
  - Server-derived state always wins over client state on reconciliation; conflicts resolve to
    the server value with a quiet "updated" affordance.

### 2.3 BullMQ + Redis (wake-up) with Postgres canonical

- **Root cause:** jobs are asynchronous, retryable, and may complete out of view; Redis is a
  delivery hint, Postgres is truth. Provider timeouts produce genuine uncertainty.
- **Guardrails:**
  - The **Async Job Card** (§11.3) models the full lifecycle including `queued`, `running`,
    `retrying`, `failed`, and the special `unknown`.
  - **No success before server confirmation.** A render/publish is "done" only when Postgres says
    so and (for publishing) audience verification passes (§12.4).
  - Double-submit is structurally impossible on paid/publish actions: the trigger disables on
    intent, surfaces the **idempotency key** reference, and re-enables only on a terminal state.

### 2.4 Backblaze B2 private storage (signed URLs, expiry, quarantine)

- **Root cause:** media lives in private B2; access is via **time-limited signed URLs**; uploads
  pass through a quarantine area before they are clean. Signed URLs are sensitive and expire.
- **Guardrails:**
  - Media components are **self-healing**: on signed-URL expiry, they request a fresh URL and
    never display a broken frame. A re-sign is invisible to the user (§12.3).
  - **Signed URLs and B2 keys never appear** in copy, tooltips, error text, the DOM beyond the
    media element's lifetime, analytics events, or screenshots-as-evidence. (See §2.6.)
  - Upload UI models **quarantine** explicitly: `uploaded → scanning → clean → available`, plus
    `infected/blocked` and `malformed/oversized` (§11.10). Nothing references a quarantined file
    as if it were available.

### 2.5 Supabase Auth + multi-tenant RLS (workspace-scoped everything)

- **Root cause:** rows, storage, queues, caches, and callbacks are workspace-scoped by RLS. A
  human acting in the wrong workspace is the highest-cost user error in the product.
- **Guardrails:**
  - The **active workspace is unmistakable** in the shell at all times (name + color seed +
    avatar), and reflected in the document title (§9.4). Cross-workspace data is never rendered
    ambiguously on one screen.
  - **Workspace switch is deliberate**: an explicit switcher with confirmation feel; it never
    happens as a side effect of navigation.
  - Per-workspace **accent seed** (a hash-derived tint, §4.6) gives each workspace a faint,
    persistent identity so muscle memory and color memory both guard against mistakes.

### 2.6 Project invariant: secrets never reach the client

- **Root cause:** `V0.md` release-blocking invariant — *no secret enters browser code, logs,
  prompts, or retained artifacts.*
- **Guardrails:**
  - No API key, provider token, signed URL, internal ID that grants access, or raw credential is
    ever rendered, copied to clipboard by a UI affordance, embedded in a `data-*` attribute, or
    included in a product-analytics event.
  - Error presentation follows the **existence-hiding rule** from `V0_ERROR_CATALOG.md`: where a
    resource's existence must remain hidden, "not found" and "not permitted" are presented
    identically (§15.3). The visual layer must not leak the distinction through different copy,
    layout, or color.

### 2.7 India-first

- **Root cause:** initial customers are India-first real-estate brands and operators.
- **Guardrails:** INR by default with proper grouping; IST shown with an explicit timezone label;
  India English spelling and idiom; date format `dd MMM yyyy`. See §13.2 and §18.

---

## 3. Token architecture

### 3.1 Three tiers (DTCG-compatible)

Tokens follow the [Design Tokens Community Group](https://www.w3.org/community/design-tokens/)
format so one source drives CSS, Tailwind, Storybook, email, and rendered-media overlays.

```
PRIMITIVE  →  raw, mode-agnostic values. No meaning. (--p-iris-500, --p-space-4)
   │           Never referenced directly by a component.
   ▼
SEMANTIC   →  role + mode aware. The contract surfaces consume. (--surface-raised,
   │           --text-primary, --status-running-fg, --money-reserved-bg)
   ▼
COMPONENT  →  optional, only when a component needs a stable internal alias.
              (--jobcard-border, --player-scrim)
```

- **Components reference semantic tokens only.** A component referencing a primitive directly is
  a governance failure (§19).
- **Light/dark and per-workspace tinting are resolved at the semantic layer**, so primitives stay
  fixed and modes are pure remappings.

### 3.2 Pipeline

```
tokens/*.json (DTCG, source of truth)
   ├─→ style-dictionary ─→ css variables  (:root, [data-theme="dark"])
   │                    ─→ tailwind theme extension (semantic names only)
   │                    ─→ ts constants (status map, money map)
   ├─→ storybook         (same css vars; visual regression baseline)
   ├─→ email             (inlined subset; dark-mode-safe semantic subset)
   └─→ rendered media    (overlay/caption styling derives from the same primitives so a
                          generated MP4's lower-third matches the product UI)
```

### 3.3 Naming

`--{category}-{role}-{variant?}-{state?}`

Examples: `--surface-base`, `--surface-raised`, `--text-secondary`,
`--interactive-primary-bg`, `--interactive-primary-bg-hover`, `--status-unknown-fg`,
`--money-captured-border`. Lowercase, hyphenated, no abbreviations except `bg`, `fg`.

---

## 4. Color system

> All values below are **primitives**. Semantic mappings and contrast guarantees follow.

### 4.1 Canvas and neutrals (warm graphite)

A subtly warm neutral ramp. Warmth (a few degrees toward 40°) makes the chrome feel crafted; the
ramp stays near-neutral enough that media surrounds do not cast color.

| Token | Hex | Use |
|---|---|---|
| `--p-ink-0` | `#FFFFFF` | pure white (rare; media, light-mode top surface) |
| `--p-ink-25` | `#FAFAF8` | light-mode app base |
| `--p-ink-50` | `#F3F2EF` | light-mode sunken |
| `--p-ink-100` | `#E7E5E0` | light borders, dividers |
| `--p-ink-200` | `#D4D1CA` | light strong border |
| `--p-ink-300` | `#B4B0A7` | disabled text on light |
| `--p-ink-400` | `#8A867C` | light secondary text |
| `--p-ink-500` | `#615D55` | light tertiary |
| `--p-ink-600` | `#46433C` | — |
| `--p-ink-700` | `#2E2B26` | dark raised surface |
| `--p-ink-800` | `#211F1B` | dark base surface |
| `--p-ink-850` | `#1A1815` | dark app base |
| `--p-ink-900` | `#121110` | dark sunken / media surround |
| `--p-ink-950` | `#0B0A09` | dark deepest / true media void |

The **media surround** is `--p-ink-900`/`#121110` (dark) and a neutralized `#1B1B1B` scrim
beneath players in both modes, chosen to be perceptually neutral so it does not bias a colorist's
read of the rendered video.

### 4.2 Iris — primary (interactive, trust, focus)

Luminous indigo-violet. Distinctive, premium, reads as both creative and dependable. Not SaaS
blue, not acid green.

| Token | Hex |
|---|---|
| `--p-iris-50` | `#EEEDFE` |
| `--p-iris-100` | `#DAD8FD` |
| `--p-iris-200` | `#BBB6FB` |
| `--p-iris-300` | `#9A92F8` |
| `--p-iris-400` | `#7C70F6` |
| `--p-iris-500` | `#6557F5` ← brand primary |
| `--p-iris-600` | `#5343E8` |
| `--p-iris-700` | `#4434C9` |
| `--p-iris-800` | `#372BA1` |
| `--p-iris-900` | `#2A2178` |

### 4.3 Ember — the disciplined creative accent

A warm amber-coral, **reserved** for forward creative motion: "Generate", "New viral discovery",
the spark of a tournament, the publish-go moment. Never used for status, never for money, rarely
more than once per view.

| Token | Hex |
|---|---|
| `--p-ember-300` | `#FFB089` |
| `--p-ember-400` | `#FF8A5C` |
| `--p-ember-500` | `#FF6B3D` ← accent |
| `--p-ember-600` | `#E8501F` |
| `--p-ember-700` | `#BF3D12` |

### 4.4 Status palette (perceptually distinct, accessible, never color-only)

These carry the product's meaning. Each status pairs a **hue + an icon + a label + a shape
treatment** so it survives color blindness and grayscale (§10, §17).

| Status role | Light fg/bg seed | Dark fg seed | Hue intent | Icon | Shape cue |
|---|---|---|---|---|---|
| `neutral` / idle | `#615D55` / `#F3F2EF` | `#B4B0A7` | warm gray | dot | solid dot |
| `queued` | `#3F5B7A` / `#E8EFF6` | `#8FB2D6` | calm slate-blue | clock | hollow dot |
| `running` | `#0E6E8C` / `#DDF1F6` | `#5FC6DD` | active cyan | activity | **animated** ring |
| `success` / `verified` | `#1F7A4D` / `#E2F4EA` | `#5BD08C` | green | check | filled check |
| `warning` / low-confidence | `#9A6700` / `#FBF1DA` | `#E8B84B` | amber | triangle | triangle |
| `error` / `failed` | `#B42318` / `#FCEBEA` | `#F2786C` | red | x-octagon | octagon |
| `blocked` | `#8A2BBE` … see note | `#C98AE8` | violet-red | lock | lock |
| **`unknown`** (timeout) | `#5B5168` / `#EFEBF3` | `#B8A6CC` | desaturated violet | help/dashed | **diagonal hatch** |

Primitive ramps (`--p-green-*`, `--p-amber-*`, `--p-red-*`, `--p-cyan-*`, `--p-slate-*`,
`--p-violet-*`) are defined in Appendix A. The two states unique to this product:

- **`unknown`** — the HeyGen-timeout-after-possible-acceptance state. Visually distinct from both
  success and failure: a desaturated violet with a **diagonal hatch fill** and a dashed border.
  It communicates *"we genuinely do not know yet; reconciliation is pending"* — never green,
  never red.
- **`blocked`** — *"you cannot proceed"* (e.g., unapproved brand, superseded version, low
  confidence). Distinct from `failed` (*"the system tried and could not"*). Lock iconography,
  a violet-leaning hue separate from red.

### 4.5 Semantic mapping (excerpt)

```css
:root {                          /* light */
  --surface-base:    var(--p-ink-25);
  --surface-raised:  var(--p-ink-0);
  --surface-sunken:  var(--p-ink-50);
  --surface-media:   #1B1B1B;          /* neutral under players, both modes */
  --border-subtle:   var(--p-ink-100);
  --border-strong:   var(--p-ink-200);
  --text-primary:    var(--p-ink-800);
  --text-secondary:  var(--p-ink-400);
  --text-tertiary:   var(--p-ink-300);
  --interactive-primary-bg:        var(--p-iris-500);
  --interactive-primary-bg-hover:  var(--p-iris-600);
  --interactive-primary-fg:        #FFFFFF;
  --focus-ring:      var(--p-iris-500);
  --accent-creative: var(--p-ember-500);
}
[data-theme="dark"] {
  --surface-base:    var(--p-ink-850);
  --surface-raised:  var(--p-ink-700);
  --surface-sunken:  var(--p-ink-900);
  --border-subtle:   #2E2B26;
  --border-strong:   #46433C;
  --text-primary:    #F3F2EF;
  --text-secondary:  #B4B0A7;
  --text-tertiary:   #8A867C;
  --interactive-primary-bg:        var(--p-iris-400);
  --interactive-primary-bg-hover:  var(--p-iris-300);
  --interactive-primary-fg:        #14121C;
  --focus-ring:      var(--p-iris-300);
  --accent-creative: var(--p-ember-400);
}
```

### 4.6 Per-workspace accent seed

To guard against cross-workspace mistakes (§2.5), each workspace derives a stable tint from a hash
of its id, constrained to a curated, accessible set of hues (never red/amber/green — those are
reserved for status). This tint appears only in low-stakes identity locations: the workspace
avatar, the switcher, and a 2px rail at the top of the shell. It is **never** used where status
or interactivity color is expected.

---

## 5. Typography

### 5.1 Typefaces (sourced from Fontshare / Indian Type Foundry)

A deliberate, India-grounded, free, variable, production-grade pairing — not the families one
reaches for on any project.

- **Display — Clash Display** (Fontshare). Confident, slightly condensed, contemporary. Used with
  restraint: page titles, hero numbers, the one big statement per view.
- **Text/UI — Satoshi** (Fontshare). Clean neutral humanist-geometric sans; excellent at UI sizes;
  variable. The workhorse for body, labels, buttons, tables.
- **Mono/Data — JetBrains Mono.** For everything that must align or must be copied exactly: IDs,
  content hashes, currency, timestamps, telemetry, idempotency keys. **Tabular by contract** — money
  and IDs never reflow.

Fallback stacks:

```css
--font-display: "Clash Display", "Satoshi", ui-sans-serif, system-ui, sans-serif;
--font-text:    "Satoshi", ui-sans-serif, system-ui, "Segoe UI", Roboto, sans-serif;
--font-mono:    "JetBrains Mono", ui-monospace, "SF Mono", Menlo, Consolas, monospace;
```

### 5.2 Type scale (modular, 1.250 major-third, 16px base)

| Token | Size | Line height | Tracking | Typical use |
|---|---|---|---|---|
| `--text-display-xl` | 48 / 3rem | 1.05 | -0.02em | rare hero numerals |
| `--text-display-l` | 39 / 2.44rem | 1.1 | -0.02em | page hero |
| `--text-h1` | 31 / 1.94rem | 1.15 | -0.01em | page title |
| `--text-h2` | 25 / 1.56rem | 1.2 | -0.01em | section |
| `--text-h3` | 20 / 1.25rem | 1.3 | 0 | card title |
| `--text-body-lg` | 18 / 1.125rem | 1.55 | 0 | reading |
| `--text-body` | 16 / 1rem | 1.55 | 0 | default |
| `--text-body-sm` | 14 / 0.875rem | 1.5 | 0 | secondary |
| `--text-caption` | 12.8 / 0.8rem | 1.45 | 0.01em | labels, meta |
| `--text-micro` | 11 / 0.6875rem | 1.4 | 0.02em | overlines, badges |
| `--mono-data` | 13 / 0.8125rem | 1.5 | 0 | IDs, money, hashes (tabular) |

Weights: Satoshi 400/500/700; Clash Display 500/600; JetBrains Mono 400/500. Buttons and emphatic
labels use 500. Display uses 600. **Never go below 12px for any user-facing text**, and never
below 14px for any text a person must act on.

### 5.3 Numerals and IDs

- Money, counts in tables, durations, and percentages use `font-variant-numeric: tabular-nums`.
- IDs and hashes use `--font-mono` and are **always truncatable in the middle with a copy
  affordance** (`a1b2…f9e0`) — but the copy action copies the full value. (See §11.7 copyable ID.)

---

## 6. Spacing, sizing, radius, border

### 6.1 Spacing (4px base, 8px rhythm)

`--space-0:0 · 1:4 · 2:8 · 3:12 · 4:16 · 5:24 · 6:32 · 7:48 · 8:64 · 9:96`

Component-internal padding favors 2/3/4; section rhythm favors 5/6/7. Never invent off-scale
values; if something needs `13px`, the design is wrong, not the scale.

### 6.2 Radius

| Token | Value | Use |
|---|---|---|
| `--radius-xs` | 4px | chips, tags, inline code |
| `--radius-sm` | 8px | inputs, buttons, small cards |
| `--radius-md` | 12px | cards, panels |
| `--radius-lg` | 16px | dialogs, large media frames |
| `--radius-pill` | 999px | status pills, avatars |
| `--radius-media` | 12px | 9:16 player frame (outer) |

Radius is calm and consistent; we do not use 0-radius broadsheet styling (wrong direction) nor
oversized playful radii (under-serves the gravity of money/approval).

### 6.3 Borders and hairlines

- `--border-width-hairline: 1px` (most), `--border-width-strong: 1.5px` (focus-adjacent, selected).
- In **dark mode, borders do the work that shadows do in light mode** (§7). A 1px `--border-subtle`
  defines surfaces on dark; shadows are nearly invisible there and must not be relied upon.

---

## 7. Elevation, shadow, and the dark-mode inversion

**Root cause:** drop shadows barely read on dark surfaces. Elevation must be expressed differently
per mode, or dark mode loses its depth hierarchy.

| Elevation | Light mode | Dark mode |
|---|---|---|
| `flat` (base) | no shadow | no shadow, `--border-subtle` |
| `raised` (cards) | `0 1px 2px rgba(20,18,16,.06), 0 1px 3px rgba(20,18,16,.10)` | surface step **up** one ink level + `--border-subtle` |
| `overlay` (dropdowns, popovers) | `0 8px 24px rgba(20,18,16,.12)` | surface up + `--border-strong` + faint iris glow `0 0 0 1px rgba(101,87,245,.15)` |
| `dialog` (modals) | `0 24px 48px rgba(20,18,16,.18)` + backdrop | surface up + scrim `rgba(11,10,9,.6)` + `--border-strong` |
| `media-float` | media has its own neutral frame; elevation via scrim only | same |

Tokens: `--elevation-raised`, `--elevation-overlay`, `--elevation-dialog` resolve per mode.

---

## 8. Motion and reduced motion

**Root cause:** this is an async product; motion's job is to communicate *honest* progress and
state transitions, not to entertain. Wrong motion lies about speed or certainty.

### 8.1 Durations and easing

```css
--motion-instant: 80ms;    /* press feedback */
--motion-fast:   140ms;    /* hover, small reveals */
--motion-base:   220ms;    /* enter/exit, accordions */
--motion-slow:   360ms;    /* dialog, drawer, page section */
--ease-standard: cubic-bezier(.2, 0, 0, 1);     /* most */
--ease-decel:    cubic-bezier(.05, .7, .1, 1);  /* entering */
--ease-accel:    cubic-bezier(.3, 0, .8, .15);  /* exiting */
```

### 8.2 Honesty rules

- **Determinate progress** (we can measure bytes/steps): a real progress bar with a numeric
  percentage in mono.
- **Indeterminate progress** (we cannot, e.g. provider render time): a calm, looping
  indeterminate track — **never** a fake percentage and never an invented ETA. If a provider gives
  a credible estimate, show it as a *range* with a "~" and label it an estimate (§18).
- **`running` status** uses one continuous, low-energy animation (the activity ring). It must not
  pulse aggressively — calm is the brand.
- **`unknown` status does not animate as if working.** It uses a static hatch; reconciliation
  shows a separate, quiet "checking with provider" affordance.
- State transitions (queued→running→success) **crossfade the chip** over `--motion-base`; they do
  not pop or bounce.

### 8.3 Reduced motion

`@media (prefers-reduced-motion: reduce)`: all non-essential motion is removed; the indeterminate
track becomes a static striped bar; crossfades become instant swaps; the activity ring becomes a
static ring with the running color. **No information is conveyed by motion alone** — the running
state is still legible by icon + color + label when motion is off (§17).

---

## 9. Layout: grid, breakpoints, and the application shell

### 9.1 Breakpoints

| Token | Min width | Target |
|---|---|---|
| `sm` | 640 | large phone |
| `md` | 768 | tablet |
| `lg` | 1024 | laptop (primary operator target) |
| `xl` | 1280 | desktop |
| `2xl` | 1536 | wide / multi-panel review |

The **operator's primary context is `lg`+**; the product is desktop-first for the production
pipeline. Brand approval, review, and verification are usable down to `md`. Read-only status
checking is usable on mobile (`sm`).

### 9.2 Grid

12-column fluid grid; gutters `--space-4` (16) on `md`, `--space-5` (24) on `lg`+. Content max
width `1320px` for reading/forms; pipeline and review surfaces may go full-bleed to use horizontal
space for the stage spine and media.

### 9.3 The application shell

```
┌───────────────────────────────────────────────────────────────────────┐
│ workspace rail (2px accent seed)                                        │
├──────────┬────────────────────────────────────────────────────────────┤
│          │  Top bar: [Workspace ▾]  Breadcrumb            [me ▾] [help] │
│  Primary │────────────────────────────────────────────────────────────│
│   nav    │                                                             │
│ (role-   │   ┌─ Stage spine (persistent on pipeline views) ─────────┐  │
│  aware)  │   │ Brand › Blueprint › Script › Generate › Compose ›     │  │
│          │   │ Review › Publish › Verify                             │  │
│  Brands  │   └───────────────────────────────────────────────────────┘  │
│  Pipeline│                                                             │
│  Library │   <main content>                                            │
│  Wallet  │                                                             │
│  Review  │                                                             │
│  Admin   │                                                             │
└──────────┴────────────────────────────────────────────────────────────┘
```

- **Workspace identity** (name + accent seed + avatar) is always top-left and in the document
  title. Switching is explicit (§2.5).
- **Primary nav is role-aware** (per `V0_PERMISSIONS.md`): a Finance user sees Wallet/Ledger
  prominently; a Reviewer sees Review; an Operator sees Pipeline/Jobs and runbook tools. Items a
  role cannot access are not rendered (not shown-disabled), except where hiding would confuse
  navigation, in which case they show with a lock and a one-line reason on hover.
- The **stage spine** (§11.2) is the persistent backbone of any object moving through the pipeline.

### 9.4 Browser behavior

- All object-detail views have stable, shareable URLs (`/w/:workspace/brands/:id`,
  `/w/:workspace/pipeline/:runId/review`, etc.).
- Back/refresh restore the same state; in-flight async work re-subscribes to live status on mount
  rather than showing a stale snapshot.
- Document title reflects `workspace · object · state` so a person with many tabs (a very real
  operator scenario) can find the right one: `Sunrise Estates · Render #4821 · running`.

---

## 10. The status system — the signature

This is the most important section. The status system is one vocabulary used identically in chips,
dots, badges, timeline nodes, job cards, tables, emails, and rendered overlays.

### 10.1 The grammar of a status

A status is always expressed as **{shape + color + icon + label}** so it survives color blindness,
grayscale, and small sizes. The minimal form (a table cell) is dot + label; the rich form (a job
card header) adds icon and, for `running`, motion.

### 10.2 Status chip anatomy

```
┌─────────────────────────┐
│ ◐  Running · 2 of 5      │   icon · label · optional detail
└─────────────────────────┘
   pill · status-running-bg · status-running-fg · status-running-border
```

- Pill radius `--radius-pill`, height 24px (meets ≥24px target), padding `--space-2`.
- Label is sentence case, from `PROJECT_CONTENT_AND_LANGUAGE_GUIDE.md`.
- Optional detail (counts, "2 of 5", "~3 min") in `--text-caption`.

### 10.3 The full status set (presentation contract)

Mapped 1:1 to backend enums. The design system owns presentation; it never invents members.

| Enum role | Label (India English) | Color role | Icon | Motion | Notes |
|---|---|---|---|---|---|
| `draft` | Draft | neutral | pencil | none | editable, not committed |
| `queued` | Queued | queued | clock | none | waiting for a worker |
| `running` | Running | running | activity | ring (calm) | determinate or indeterminate |
| `retrying` | Retrying | warning | rotate | slow rotate | shows attempt n of max |
| `succeeded` | Done | success | check | none | system success, not yet verified |
| `verified` | Verified | success | shield-check | none | **publishing only**, after §12.4 |
| `partial` | Partly done | warning | half-check | none | success with caveats |
| `failed` | Failed | error | x-octagon | none | retryable flag drives CTA |
| `blocked` | Blocked | blocked | lock | none | precondition unmet; not a failure |
| `unknown` | Unknown — checking | unknown | help (hatched) | none | provider-timeout; reconciliation pending |
| `cancelled` | Cancelled | neutral | slash | none | user/operator stopped it |
| `expired` | Expired | neutral | hourglass-off | none | e.g., estimate/version no longer valid |

### 10.4 The `unknown` state in detail (product-critical)

When a paid provider call (HeyGen) times out **after possible acceptance**, the truth is unknown.
The UI must:

1. Show `unknown` with the hatched help icon and the label **"Unknown — checking"**.
2. Show a quiet, non-alarming explanation: *"The provider didn't confirm in time. We're checking
   whether your video was accepted. You won't be charged twice."*
3. **Disable resubmission** of the paid operation (§2.3) — never offer "try again" while unknown.
4. Surface the **provider operation reference** (mono, copyable) and the reservation hold (§13.4)
   so the user sees money is held, not yet captured.
5. Resolve only to a terminal state on reconciliation. The transition `unknown → succeeded` or
   `unknown → failed (released)` crossfades calmly.

This single behavior is the clearest expression of the product's honesty principle, and it is a
release-blocking invariant in `V0.md`.

---

## 11. Core component patterns

Only the product-defining patterns are specified here; primitives (button, input, select,
checkbox, radio, switch, tabs, tooltip, toast, menu) follow standard semantics with the tokens
above and the a11y contract in §17. Buttons: primary (Iris), secondary (outline), ghost,
destructive (red), and exactly one **creative** variant (Ember) reserved per §4.3.

### 11.1 Card and panel

- `--surface-raised`, `--radius-md`, `--elevation-raised`, `--space-5` padding.
- A card header carries: title (`--text-h3`), a status chip (right), and an optional overflow menu.
- Cards never nest more than two deep; deeper structure becomes a panel with internal sections.

### 11.2 Stage spine (the pipeline backbone)

The brand→publication journey as a persistent horizontal spine. Each node is a stage with its own
rolled-up status. This is *navigation + status + lineage* in one device — the product's structural
signature.

```
 ●───────●───────◐───────○───────○───────○───────○───────○
 Brand   Blue-   Script  Gen-    Comp-   Review  Publish Verify
 ✓ver"d  print   running erate                                  
         ✓done
```

- `●` filled = complete, `◐` = current/running, `○` = not started, `⊘` = blocked, hatch = unknown.
- Clicking a completed node navigates to that artifact (read), preserving lineage context.
- Future/unstarted nodes are visible but clearly **non-interactive** (don't pretend capability
  exists before it does — `V0_INFORMATION_ARCHITECTURE.md` "unfinished-capability visibility").
- On `md` and below, the spine collapses to a horizontal scroller with the current stage centered;
  on `sm`, to a "Stage 4 of 8: Generate" summary that expands on tap.

### 11.3 Async job card

The atom of the pipeline. Models the full BullMQ lifecycle (§2.3).

```
┌──────────────────────────────────────────────────────────┐
│  HeyGen render                          ◐ Running          │
│  ─────────────────────────────────────────────────────────│
│  [indeterminate track ▒▒▒▒▒▒▒▒▒▒▒▒]      ~2–4 min (est.)   │
│  op: hg_op_8f3c…a91  (copy)                               │
│  Reserved ₹420 · captured on success                       │
│  ─────────────────────────────────────────────────────────│
│  Started 14:32 IST · attempt 1 of 2                        │
└──────────────────────────────────────────────────────────┘
```

States and their card treatment:

- **queued** — clock chip, "Waiting for a worker", position if known.
- **running** — activity ring; determinate bar *or* indeterminate track + estimate range; provider
  op reference; reserved amount.
- **retrying** — "Retrying · attempt 2 of 3", reason line, last-error code (not stack).
- **failed** — error chip; user message from `V0_ERROR_CATALOG.md`; **retry CTA only if the catalog
  marks it retryable**; "Reserved amount released" confirmation.
- **unknown** — §10.4 in full. No retry. Reservation held. "Checking with provider" affordance.
- **succeeded** — calm success; link to the produced artifact; "Captured ₹420".

The card **never shows a fake percentage** and **never enables a second paid submit** while a
prior submit is non-terminal.

### 11.4 Confidence meter

For brand extraction, blueprint deciphering, and any AI-derived field.

- A short segmented meter (low / medium / high) + numeric confidence in mono + the **source
  evidence** trigger.
- **Low confidence blocks promotion** to truth: the field shows `blocked` with "Needs review" and
  cannot be approved until a human resolves it (`V0.md`: never silently invent missing stages).
- Confidence is never rounded up to imply more certainty than measured.

### 11.5 Evidence popover

Click any AI-derived value → popover showing the source(s): the URL/page crawled, the snippet or
keyframe, extraction method (vision/OCR/transcript/metadata), and confidence. This makes
provenance a first-class, in-context feature (§14).

### 11.6 Approval / decision surface

Used at brand approval and at review.

- The exact object version is **pinned and labelled** at the top: `Version 4 · sha a1b2…f9e0`.
- Decision actions: Approve, Request changes, Reject — each binds to *that* version and the acting
  user, recorded immutably.
- If the underlying object has been superseded since the surface loaded, the approve action is
  **disabled with a clear banner**: "This is no longer the latest version. Reload to review
  version 5." — preventing approval of a superseded video (release-blocking invariant).

### 11.7 Copyable ID / hash

```
sha  a1b2c3…f9e0   ⧉
```

Middle-truncated mono, full value copied on click, a tiny "Copied" confirmation. Used for content
hashes, operation references, post IDs. **Never used for secrets** (§2.6).

### 11.8 Confirmation patterns

Two tiers, by consequence:

- **Reversible** (rename, reorder): inline, no modal.
- **Destructive** (delete a draft): a confirm dialog stating exactly what is lost.
- **Expensive / irreversible** (submit paid render, capture credits, publish): a dialog that
  states the **exact cost** (mono, INR), the **maximum authorization**, what becomes irreversible,
  and requires an explicit confirm. For the most irreversible (publish to a live audience account),
  a **type-to-confirm** of the target account handle. No optimistic UI (§2.1).

### 11.9 Cost estimate & authorization panel — see §13.

### 11.10 Upload & quarantine

```
file.png  ┌ uploaded ─→ scanning ─→ clean ─→ available ┐
          └ infected/blocked  ·  malformed  ·  oversized ┘
```

- Drag-and-drop + button; per-file progress; per-file status chip.
- A file is **never referenced as available** until `clean`. Quarantined files show `blocked` with
  the reason and cannot be selected downstream.
- Oversized/malformed are rejected at the boundary with the exact limit stated (e.g., "Max 50 MB —
  this file is 82 MB").
- SSRF-relevant inputs (the crawl URL) show the **permitted-scope** preview before crawl, never a
  raw redirect chain.

### 11.11 Tables (status-dense)

- Sticky header; the **status column is leftmost or rightmost and never sortable away**; numbers
  right-aligned tabular; row actions revealed on hover/focus (and always present for keyboard).
- Empty, loading (skeleton rows), and error states are first-class (§15).
- Bulk actions on irreversible/paid operations follow §11.8 with an itemized summary.

---

## 12. Media: the 9:16 player, thumbnails, and signed-URL handling

### 12.1 The 9:16 player

The product's hero output is a vertical short. The player is built for 9:16 first.

- Outer frame `--radius-media`, surrounded by `--surface-media` (neutral, §4.1) so the grade is
  read truthfully.
- Controls overlay on a bottom scrim; large enough for touch (≥44px on mobile, ≥24px desktop);
  fully keyboard-operable; captions toggle defaults **on** (captions are part of the deliverable).
- Below the player: title, **content hash** (copyable, §11.7), duration, resolution, and the
  caption track. The hash visually proves "this exact version" for review binding (§11.6).

### 12.2 Thumbnail

- 9:16 aspect preserved in lists/grids; lazy-loaded; a neutral placeholder shimmer (skeleton) while
  loading; a `blocked`/`failed` thumbnail state if the asset is quarantined or render failed (never
  a broken-image icon).

### 12.3 Signed-URL lifecycle (B2)

**Root cause:** B2 signed URLs expire and are sensitive (§2.4).

- The media component holds a short-lived signed URL and a server action to mint a fresh one.
- **On expiry or 403, it silently re-signs** and resumes; the user never sees a broken frame.
- The signed URL exists only on the media element for the minimum needed; it is **not** placed in
  copyable fields, tooltips, error messages, `data-*`, or analytics. If media truly cannot load,
  the error is generic ("This video can't be loaded right now") with a retry — never the URL or
  the reason that would leak storage layout.

### 12.4 Audience-facing verification panel

After a provider acknowledges a publish, the post is **not** "successful" until independent
verification (release-blocking invariant). The panel shows a checklist, each item a status row:

```
✓ Target account        @sunrise_estates
✓ Media identity        hash matches a1b2…f9e0
✓ Caption               matches approved caption
◐ Visibility            checking…
○ Publish time          —
```

Only when all are `verified` does the state become `published_verified`, the spine's Verify node
fill, and the **single** success notification fire (idempotent — retries never duplicate the post
or the notification).

---

## 13. Money, cost, and the ledger surface

**Root cause:** money is integer minor units or provider-native micros, never floats; charges use
an approved price version; capture/release happen exactly once (`V0.md`).

### 13.1 Money rendering rules

- All amounts in `--font-mono`, **tabular**, right-aligned in tables.
- **Never** render a float. Minor units are formatted at the presentation edge only.
- Always show the currency symbol and code where ambiguity is possible (`₹420.00 INR`).
- A money value never shifts horizontally as it updates (tabular guarantees this).

### 13.2 INR formatting (India-first)

- Symbol `₹`, two decimal places for currency, Indian digit grouping where appropriate
  (`₹1,20,000.00`) — configurable per locale but **INR is the default** (§18).
- Stripe/international amounts render in their own currency with code; never silently converted.

### 13.3 Cost estimate & authorization panel

Shown **before** any paid submission.

```
┌─ Estimated cost ───────────────────────────────┐
│  HeyGen render (avatar, 45s)        ₹  380.00   │
│  Composition + render                ₹   40.00   │
│  ─────────────────────────────────────────────  │
│  Estimate                            ₹  420.00   │
│  Maximum authorization               ₹  480.00   │   ← you won't be charged above this
│  Price version  pv_2026_05 · valid 23 min        │
│  Wallet balance                      ₹1,240.00   │
│                                                  │
│            [ Cancel ]      [ Reserve & generate ]│  ← Ember (the creative go)
└──────────────────────────────────────────────────┘
```

- The **price version** is shown and has an expiry; if it expires before confirm, the panel
  refreshes and clearly notes the change before the user can proceed.
- **Maximum authorization** is explicit and always ≥ estimate; copy reassures "you won't be charged
  above this."
- If wallet balance < maximum authorization, the primary action becomes "Add credits" (no partial
  starts on paid work).

### 13.4 Reservation → capture/release visualization

The ledger is append-only; the UI shows the lifecycle of a single charge as a small timeline:

```
purchase ─→ reserve (hold ₹480) ─→ ┬─ capture ₹420 (success)
                                    └─ release ₹480 (failed/cancelled/unknown→failed)
```

- **Reserved** money shows `money-reserved` styling (held, neutral-cool, hatched edge to echo
  "not yet yours/ours").
- **Captured** shows `money-captured` (settled).
- **Released/Refunded** show `money-released` / `money-refunded`.
- During `unknown` (§10.4), the reservation stays visibly **held**; the UI states money is held,
  not captured, and won't be double-charged.

### 13.5 Wallet & ledger view

- Append-only entries table; each row: timestamp (IST), type (purchase/reserve/capture/release/
  refund/adjustment), reference (copyable op id), amount (tabular, signed), running balance.
- A reconciliation banner shows when provider total and V0 ledger agree; a mismatch is a `warning`
  with an operator escalation path (never silently hidden).

---

## 14. Lineage and evidence

Provenance is a feature. Any artifact can answer "where did you come from?"

### 14.1 The lineage trail

A compact, expandable trail rendering the ancestry chain:

```
Brand profile v3  →  Blueprint #112  →  Formula f_44  →  Script #7 (selected)
  →  Avatar a_09  →  HeyGen render r_482  →  Composition c_19 (v4, sha a1b2…)
  →  Review (approved by A. Rao)  →  Publication p_330 (verified)
```

- Each node is a chip linking to that artifact in read context, carrying its status.
- Immutable upstream inputs are marked with a lock; a composition revision links back to the exact
  inputs it was built from (`V0.md`).
- The trail is available from any pipeline object and from the final post — the "complete brand,
  blueprint, script, generation, review, billing and publication lineage" the spec requires.

### 14.2 Evidence everywhere

Every AI-derived value carries an evidence popover (§11.5). Brand approval shows a **candidate vs
approved diff** with per-field source + confidence so a human approves *exactly* what becomes truth.

---

## 15. Empty, loading, error, and recovery states

Per the frontend-design principle: failure and emptiness are moments for **direction**, not mood.

### 15.1 Empty states

An empty screen is an invitation to act, in the interface's voice. Structure: a one-line "what
this is", a one-line "what to do", and a single primary action. Example (Brands, empty): *"No
brands yet. Add a brand by URL or upload assets to start a production."* → **Add brand**.

### 15.2 Loading / skeleton

- Skeletons mirror the real layout (card shapes, table rows, the 9:16 thumbnail aspect), using
  `--surface-sunken` with a calm shimmer (static striped under reduced motion).
- Suspense fallbacks (§2.1) use these skeletons, not spinners.
- For async work that is *running*, do not skeleton — show the job card (§11.3) with honest
  progress.

### 15.3 Errors

- Error copy follows the catalog formula (§18): what happened, why if safe to say, what to do next.
  Errors don't apologize and are never vague.
- The error code is shown (mono, copyable) for support; the stack/secret is never shown.
- **Existence-hiding** (§2.6): where required, "not found" and "not permitted" render identically —
  same layout, same copy, same status — so the visual layer leaks nothing.

### 15.4 Recovery

- Retryable failures offer retry **only when the catalog says retryable**; non-retryable failures
  offer the correct next step (e.g., "Add credits", "Reapprove brand"), never a dead "Try again".
- Crash-window/restore: on reload, in-flight work re-subscribes to live server status; the UI never
  shows a stale "running" that the server has since completed or failed.

---

## 16. The Sakhaa / analytical surface extension

Sakhaa (V2) does not replace V0; it adds *scoring and revision intelligence* around the same loop.
The design system extends with an **analytical surface** that obeys the same honesty principles —
and the same claim boundaries: **no guaranteed virality, sales, attention, emotion, or causal
performance.** Visualization must never imply more certainty than the model has.

### 16.1 Shared, not forked

Sakhaa uses the same tokens, type, status grammar, money rules, and lineage. The analytical
components below are additive; they live in the same Storybook under an `analytical/` namespace.

### 16.2 Research-prior index gauges

The four indices (Engagement, Virality, Conversion Support, Brand Recall) render as **directional
gauges with uncertainty bands**, not precise scores:

```
Engagement      ▮▮▮▮▮▯▯▯▯▯  62  ± 9   (proxy: estimated)
Virality        ▮▮▮▯▯▯▯▯▯▯  31  ± 14  (low confidence)
```

- Always show the **uncertainty band** (`± n`) and the **proxy status** label. A gauge without
  uncertainty is forbidden.
- Color is the neutral Iris family, **not** the green/red status palette — these are indices, not
  pass/fail. Mapping research priors to traffic-light status would imply certainty we don't have.
- A persistent, quiet **limitations note** accompanies any ranked decision: directional, not
  predictive; compares variants, does not guarantee outcomes.

### 16.3 Variant comparison

Side-by-side 9:16 players + an index comparison table + a **factor-contribution** view (which
factors moved the directional effect, with magnitude and sign). The "winner" is framed as
*"recommended next revision"* with expected directional effect and uncertainty — never "this will
win".

### 16.4 Decision audit & the V1 brief

- The before/after comparison and the decision are recorded immutably and bound to the exact
  published revision (lineage, §14).
- The generated V1 production-engine brief is shown as a **constrained, structured** artifact —
  clearly a brief, clearly labelled, with the constraints visible. Prompt-only preflight, if shown,
  is **explicitly labelled** as not equivalent to scoring the rendered stimulus (V2 PRD).

---

## 17. Accessibility — WCAG 2.2 AA contract

This is a floor enforced in CI, not an aspiration.

- **Contrast:** body text ≥ 4.5:1; large text (≥24px or ≥18.66px bold) and UI components/state
  indicators ≥ 3:1. Every semantic text-on-surface pair in §4.5 is verified at build; a failing
  pair fails CI. Status colors are chosen to meet 3:1 against their own backgrounds in both modes.
- **Never color alone (1.4.1):** every status carries icon + shape + label (§10.1). The `running`,
  `unknown`, `failed`, `blocked` states are all distinguishable in grayscale and with motion off.
- **Focus visible (2.4.7) + not obscured (2.4.11, new in 2.2):** a 2px `--focus-ring` (Iris) with
  2px offset on every interactive element; sticky headers/spines must not cover a focused element
  (scroll-padding accounts for them).
- **Target size (2.5.8, new in 2.2):** interactive targets ≥ 24×24px (≥44px primary touch targets
  on the media player and mobile).
- **Keyboard:** every action reachable and operable by keyboard; the media player, stage spine,
  tables, dialogs, and menus follow ARIA authoring patterns; visible focus order matches reading
  order.
- **Motion (2.3.3):** `prefers-reduced-motion` honored throughout (§8.3); nothing flashes more than
  3×/sec.
- **Forms:** every input has a programmatic label; errors are associated via `aria-describedby`;
  required state is announced; error summaries focus-managed.
- **Live regions:** status transitions and job updates announce via polite live regions — a
  screen-reader user learns when a render finishes or enters `unknown`.
- **Language & locale:** `lang` set; India English; IST announced with timezone; numbers/currency
  localized (§18).
- **Media:** captions on by default; player controls labelled; no autoplay with sound.

---

## 18. Content and voice hooks

Full guidance lives in `PROJECT_CONTENT_AND_LANGUAGE_GUIDE.md`; the design system enforces these
mechanically:

- **Sentence case** everywhere except proper nouns and the product name.
- **Action consistency:** the button label, the in-flight state, and the success toast share a verb
  root — `Publish` → `Publishing…` → `Published`. `Reserve & generate` → `Reserving…` →
  `Reserved · generating`.
- **No causal/virality claims** in any UI string: the product *assists* using observed structural
  patterns; it does not *guarantee* reach, conversion, or performance. Estimates are marked `~` and
  labelled estimates; indices carry uncertainty (§16.2).
- **Error formula:** *what happened · (why, if safe) · what to do next.* No apologies, no blame, no
  vagueness, no secrets.
- **Money confirmations** state the exact amount, the maximum authorization, and what becomes
  irreversible (§11.8, §13.3).
- **Status labels** are exactly the words in §10.3 — `Unknown — checking`, `Blocked`, `Partly
  done`, `Verified` — used identically across UI, email, and overlays.
- **Dates/times:** `dd MMM yyyy`, 24-hour `HH:mm IST` with explicit timezone. **Currency:** INR
  default, Indian grouping, code shown where ambiguous.

---

## 19. Component governance

How this system stays a system.

- **Token discipline:** components reference **semantic tokens only**. A PR adding a raw hex, an
  off-scale spacing value, or a primitive reference inside a component fails review.
- **Status mapping is generated:** `status-tokens.ts` is generated from `V0_STATUS_ENUMS.md`. An
  enum value with no presentation mapping fails the build. The UI cannot invent or drop states.
- **One component per concept:** there is one status chip, one job card, one money panel, one media
  player. Variants are props, not forks.
- **Storybook is the contract:** every component has stories for all states (incl. empty, loading,
  error, `unknown`, reduced-motion, light/dark, smallest breakpoint). Visual-regression snapshots
  gate merges.
- **A11y in CI:** automated axe checks + contrast verification of every semantic pair + a manual
  keyboard pass for new interactive components.
- **Definition of done for a component:** tokens only · all states · both modes · responsive to
  `sm` · keyboard + SR verified · reduced-motion verified · Storybook stories · no secret/URL leak
  · status labels from the content guide.
- **Change process:** token or pattern changes propose against this document; the DTCG source and
  this file move together; downstream (CSS/Tailwind/Storybook/email/overlay) regenerate from the
  single source.

---

## Appendix A: token reference (DTCG)

Illustrative excerpt — the full set lives in `tokens/`. Primitive → semantic → component.

```jsonc
{
  "$schema": "https://tr.designtokens.org/format/",
  "primitive": {
    "iris":  { "500": { "$type": "color", "$value": "#6557F5" },
               "600": { "$type": "color", "$value": "#5343E8" } },
    "ember": { "500": { "$type": "color", "$value": "#FF6B3D" } },
    "ink":   { "850": { "$type": "color", "$value": "#1A1815" },
               "25":  { "$type": "color", "$value": "#FAFAF8" } },
    "space": { "4": { "$type": "dimension", "$value": "16px" } }
  },
  "semantic": {
    "surface":     { "base":   { "$value": "{primitive.ink.25}" } },
    "interactive": { "primary": { "bg": { "$value": "{primitive.iris.500}" } } },
    "status": {
      "running": { "fg": { "$value": "{primitive.cyan.600}" },
                   "bg": { "$value": "{primitive.cyan.50}" } },
      "unknown": { "fg": { "$value": "{primitive.violet.500}" },
                   "bg": { "$value": "{primitive.violet.50}" },
                   "fill": { "$value": "hatch-violet" } }
    },
    "money": {
      "reserved":  { "fg": { "$value": "{primitive.slate.600}" } },
      "captured":  { "fg": { "$value": "{primitive.green.700}" } }
    }
  }
}
```

Status icon + shape + label mapping (generated, never hand-edited):

```ts
// status-tokens.ts — GENERATED from V0_STATUS_ENUMS.md. Do not edit by hand.
export const STATUS = {
  queued:   { label: "Queued",            role: "queued",  icon: "clock",       motion: "none" },
  running:  { label: "Running",           role: "running", icon: "activity",    motion: "ring" },
  retrying: { label: "Retrying",          role: "warning", icon: "rotate",      motion: "rotate" },
  succeeded:{ label: "Done",              role: "success", icon: "check",       motion: "none" },
  verified: { label: "Verified",          role: "success", icon: "shieldCheck", motion: "none" },
  partial:  { label: "Partly done",       role: "warning", icon: "halfCheck",   motion: "none" },
  failed:   { label: "Failed",            role: "error",   icon: "xOctagon",    motion: "none" },
  blocked:  { label: "Blocked",           role: "blocked", icon: "lock",        motion: "none" },
  unknown:  { label: "Unknown — checking",role: "unknown", icon: "helpHatched", motion: "none" },
  cancelled:{ label: "Cancelled",         role: "neutral", icon: "slash",       motion: "none" },
  expired:  { label: "Expired",           role: "neutral", icon: "hourglassOff",motion: "none" },
} as const;
// Build fails if any enum member from V0_STATUS_ENUMS lacks an entry here.
```

---

## Appendix B: implementation notes for the stack

- **Next.js:** semantic CSS variables on `:root` / `[data-theme]`; theme set server-side from the
  user/workspace preference to avoid a flash. Read surfaces stay RSC; act surfaces are explicit
  client components. Suspense fallbacks use skeleton tokens. No optimistic mutation on paid/publish.
- **Tailwind:** `theme.extend` references **only** semantic CSS variables
  (`colors: { surface: { base: "var(--surface-base)" }, status: { ... } }`). No arbitrary hex in
  class names; lint rule forbids `[#hex]` and off-scale spacing.
- **NestJS/Prisma:** the status enum is the single source; `status-tokens.ts` is generated from it
  in the codegen step that also runs Prisma generate, so UI and schema can't drift.
- **BullMQ:** job cards subscribe to job state via the API's live channel; on mount they reconcile
  with Postgres (canonical) before trusting any cached Redis hint.
- **B2:** a server action mints short-lived signed URLs; the `<Media>` component owns expiry/refresh
  and never exposes the URL outside the element. A lint rule forbids signed-URL strings in
  analytics payloads and `data-*`.
- **Email & rendered overlays:** import the same primitive color/type tokens so a generated MP4's
  lower-third and a notification email visibly belong to the same product as the app.

---

*This document defines how Sakhaa Forge's identity becomes trustworthy software.
When a choice is unclear, return to §1.1: make a long, uncertain, expensive pipeline feel calm,
legible, and honest.*
