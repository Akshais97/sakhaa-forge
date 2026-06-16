# PROJECT_BRAND_GUIDELINES.md — Our Product Identity

> **What this is.** This document defines the identity of **our own product** — what the
> Sakhaa Forge looks and sounds like. It is *not* the customer brand-intake
> template (`V0_CUSTOMER_BRAND_INTAKE_TEMPLATE.md`) and not the brand we extract from a
> customer's website. This answers: *"What does our product look and sound like?"*
>
> **Relationship to other documents.** `PROJECT_BRAND_GUIDELINES.md` defines **identity**;
> `DESIGN.md` defines **how that identity becomes software** (tokens, components,
> accessibility). Where the two reference the same value (a hex, a typeface), `DESIGN.md`
> holds the machine-readable token and this document holds the rationale and the
> expression rules. They must never diverge; a change to one is a pull request against both.

---

## 1. Product name and naming rules

### 1.1 Names

| Thing | Name | Notes |
|---|---|---|
| The production product (V0) | **Sakhaa Forge** | Formal application name. "The Forge" is acceptable only after first full mention in internal prose. |
| The decision/scoring product (V2) | **Sakhaa** | A distinct product layer that sits around the production engine; it does not replace V0. |
| The release line | **V0 → V1 → V2** | V0 standalone; V1 the maturity release of the same production application; V2 is a separate intelligence product. |

- Always capitalise **Sakhaa Forge** in full. Lowercase "the forge" is not the product
  name and should be avoided in customer-facing copy; use "the Forge" only as an internal
  short form after first full mention.
- **Sakhaa** is always capitalised, never anglicised in spelling, never abbreviated to "SK"
  in customer-facing surfaces.
- Never write "SakhaaForge", "Forge Pro", "Virality Engine", "VCE™ Pro", or invent sub-brands. There is one product
  name. Feature names are lowercase descriptive (the script tournament, blueprint discovery,
  the review room), never trademark-styled.

### 1.2 The name is a method, not a promise

This is the most important naming rule in this document. Sakhaa Forge works with
structural patterns observed in short-form content that has spread, but the product name
is not a result promise. The product assists production using those observed patterns; it
does not promise that any output will go viral, reach an audience, convert, or perform.

Therefore:

- The product name may appear in a UI, a header, or a deck. It must **never be extended into
  a claim**: never "Sakhaa Forge — guaranteed reach", never "go viral with…", never
  "Sakhaa Forge makes your video viral."
- Any external use of the name should be able to sit next to the claim boundary in §6 without
  contradiction. If a sentence containing the product name would be false when the claim
  boundary is applied, rewrite the sentence.

### 1.3 Lockup with Sakhaa

When both products appear together, they are co-equal products, not a suite name:

```
Sakhaa Forge   ·   Sakhaa
production         decision intelligence
```

Sakhaa is described as working *with* or *around* Sakhaa Forge, never as a tier or upgrade
of it ("Sakhaa, the decision layer around Sakhaa Forge" is acceptable; "Forge Pro" is not).

---

## 2. Logo and icon

> The brand book specifies *construction and usage rules*. The rendered logo assets live in
> `packages/ui/brand/` and are the only approved files; do not recreate the mark by hand.

### 2.1 The mark — concept

The icon is a **9:16 vertical frame** (the unmistakable shape of short-form video) with an
offset **forward element** in Ember that reads simultaneously as a play triangle and a spark —
the single moment of creative go. The frame says *vertical film*; the spark says *make*. It
embodies the "Studio Instrument" direction from `DESIGN.md`: a precise frame (the instrument)
holding one warm point of creative energy (the studio).

```
   ┌───────────┐        the frame: a 9:16 rounded rectangle (the deliverable's shape)
   │           │        corner radius derives from --radius-media
   │     ▸      │        the spark/play: a single Ember element, offset, never centred
   │           │        negative space inside the frame stays generous
   └───────────┘
```

- The frame is drawn in the current foreground (ink on light, paper on dark).
- The spark is the **only** place Ember appears in the mark. Per `DESIGN.md` §4.3, Ember is
  spent once.
- The wordmark sets **Sakhaa Forge** in Clash Display 600, tracking `-0.01em`,
  with the icon to its left at cap-height.

### 2.2 Clear space and minimum size

- **Clear space:** a margin equal to the height of the spark element on all sides; nothing
  (text, rule, other logo) enters that zone.
- **Minimum size:** icon 24px; full lockup 120px wide. Below 24px use the icon only.
- The favicon and app icon use the icon alone on a solid field (§9).

### 2.3 Light / dark usage

| Background | Mark treatment |
|---|---|
| Light (`--surface-base` light) | ink frame, Ember spark |
| Dark (`--surface-base` dark) | paper frame, Ember spark (use `--p-ember-400`, the dark-mode Ember) |
| On Iris (brand fill) | paper frame, paper spark (monochrome — Ember is dropped to avoid clashing on Iris) |
| On photography / media | monochrome paper mark inside a subtle scrim; never place the coloured mark directly on a busy frame |

### 2.4 Misuse (never)

- Do not recolour the frame to a status colour (green/red/amber) — the mark is not a status.
- Do not stretch, rotate, add shadow/glow, or outline the mark.
- Do not place the spark in the centre, or use more than one spark.
- Do not set the wordmark in any face other than Clash Display.
- Do not put the coloured mark on a low-contrast background; verify ≥3:1 against the field.

---

## 3. Colour

The brand palette **is** the `DESIGN.md` primitive palette; this section states intent and the
rules for *brand* (as opposed to *interface*) use. Machine values live in `tokens/`.

### 3.1 Core

| Role | Token | Hex | Brand intent |
|---|---|---|---|
| Primary — Iris | `--p-iris-500` | `#6557F5` | the brand colour; trust + creative confidence; primary actions, links, focus, brand fields |
| Creative accent — Ember | `--p-ember-500` | `#FF6B3D` | the spark; reserved for the single creative-go moment and the logo spark |
| Canvas — warm graphite | `--p-ink-850` / `--p-ink-25` | `#1A1815` / `#FAFAF8` | the studio surround; calm, near-neutral so media reads truthfully |

### 3.2 Neutrals

The warm-graphite `--p-ink-*` ramp (§4.1 of `DESIGN.md`) carries all chrome, text, borders,
and surfaces. Brand layouts default to the neutral canvas; colour is earned, not sprayed.

### 3.3 Semantic (status) colours are not brand colours

Green / amber / red / cyan / slate / the violet `unknown` hatch belong to the **status
system** (`DESIGN.md` §10). They communicate machine state and **must not** be used
decoratively in brand or marketing surfaces. A green panel in a deck reads as "success
state" to anyone who uses the product; do not borrow it for mood.

### 3.4 Discipline

- One bold colour per surface. Iris leads; Ember appears at most once.
- Per-workspace accent tints (`DESIGN.md` §4.6) are an *interface* device for tenant safety,
  never a brand colour, and never appear in marketing.
- Always verify contrast (§7 of `DESIGN.md`): brand layouts meet the same AA floor as the app.

---

## 4. Typography

Sourced from **Fontshare / Indian Type Foundry** — a deliberate, India-grounded choice for an
India-first product.

| Role | Typeface | Use |
|---|---|---|
| Display | **Clash Display** (500 / 600) | the wordmark, hero statements, page titles. Used with restraint. |
| Text / UI | **Satoshi** (400 / 500 / 700) | all body, labels, buttons, tables. The workhorse. |
| Data / mono | **JetBrains Mono** (400 / 500) | IDs, content hashes, currency, timestamps. Tabular by contract. |

Rules:

- Headlines are **sentence case**, not Title Case, everywhere (matches the product voice, §5).
- Numerals that represent money, counts, durations, or percentages are **tabular** and, where
  exactness matters (IDs, money, hashes), set in JetBrains Mono.
- Never substitute a system serif or a different sans for the wordmark.
- Body text never sets below 16px in marketing or 14px for anything actionable in product.

---

## 5. Voice and tone

Our voice is a calm, precise studio professional who is honest about what is known and what is
not. We are confident about craft and scrupulous about claims.

### 5.1 Attributes

- **Calm.** We work with money, irreversible publishing, and uncertainty. We never hype, never
  alarm. The interface and the marketing share one steady register.
- **Precise.** We name things by what the user controls, in plain India English. We are
  specific over clever.
- **Honest about uncertainty.** When something is estimated, queued, unknown, or low-confidence,
  we say so plainly. Uncertainty is a feature of the product, not an embarrassment.
- **Action-consistent.** A verb keeps its form across the whole flow: `Publish` → `Publishing…`
  → `Published`. `Reserve & generate` → `Reserving…` → `Reserved · generating`.

### 5.2 Tone shifts by moment

| Moment | Tone |
|---|---|
| Onboarding / empty states | warm, directive — "here's the one thing to do next" |
| Money / irreversible confirmations | grave, exact, reassuring about limits ("you won't be charged above ₹480") |
| Errors | factual and helpful — what happened, why (if safe), what to do next. Never apologetic, never vague, never blaming the user. |
| Uncertainty (`unknown`, low confidence) | steady and transparent — "we're checking with the provider; you won't be charged twice" |
| Success | quiet and specific — "Published and verified" with the post link, not confetti |

### 5.3 India-first English

- India English spelling and idiom; ₹ INR by default with Indian digit grouping where
  appropriate; IST shown with an explicit timezone; dates as `dd MMM yyyy`.
- Avoid US-centric idioms and slang. Keep sentences short and plain.

---

## 6. Words and claims to avoid

This list is binding. It exists because the product's claim boundary (`V0.md`) and Sakhaa's
research-prior terminology (ADR-011) are commitments, not stylistic preferences.

### 6.1 Never claim

- **Virality / reach / conversion guarantees:** "go viral", "will go viral", "guaranteed
  reach", "guaranteed views/leads/sales", "proven to convert", "X× more engagement"
  (as a promise rather than an observed past instance with its source).
- **Causal / predictive language about outcomes:** "this video *will* perform", "predicts
  success", "ensures", "drives results". Sakhaa Forge *assists using observed patterns*; Sakhaa
  produces **research-prior indices** with uncertainty and **directional** effects — never a
  prediction or a guarantee.
- **Scientific / neuroscience / brain-response claims:** no "scientifically proven", no
  "measures attention/emotion/brain response", no individual physiological claims. (Sakhaa's
  TRIBEv2/HCP/A-Q work has its own strict claim register; marketing never gets ahead of it.)
- **Absolute superlatives:** "the best", "fully automated", "zero effort", "no risk".

### 6.2 Prefer instead

| Avoid | Prefer |
|---|---|
| "go viral" | "built on patterns from content that spread" |
| "guaranteed reach" | "assists production; outcomes are not guaranteed" |
| "predicts the winner" | "ranks a recommended next revision, with uncertainty" |
| "scientifically proven" | "research-prior indices; directional, not predictive" |
| "fully automated, no review" | "a repeatable workflow with human approval at the key steps" |

### 6.3 Estimates and uncertainty are always marked

Any number that is an estimate carries `~` and the word "estimate"; any index carries its
uncertainty band; any provider time is a range, never a fixed promise. This is a brand rule,
not only an interface rule.

---

## 7. Visual style and imagery

- **Media is the hero.** Lead with real **9:16 frames** on the neutral studio surround. The
  product's output is a beautiful vertical short; show it.
- **Show real states.** Where we depict the product, depict honest states — including
  `queued`, `running`, and `unknown` — not an unbroken stream of green successes. Honesty is
  the brand.
- **India-first, real context.** The pilot is India-first real-estate; imagery should reflect
  real Indian places, properties, and people (with rights/consent), not generic global stock.
- **No fake metrics.** Never mock up dashboards showing invented "10M views" or guaranteed
  numbers. Any metric shown must be plausibly an observed past snapshot with a clear "observed"
  framing, never a promise.
- **Avoid AI-cliché aesthetics:** no neon-grid "AI brain" imagery, no glowing blue circuitry,
  no slot-machine confetti. The look is a colourist's suite, not a sci-fi HUD.
- **Diagrams** use the design-system tokens so a diagram in a deck and a diagram in the app are
  visibly the same product.

---

## 8. Light / dark background usage

- The product ships light and dark; the brand reads in both.
- On **light**, lead with the warm paper canvas, ink text, Iris accents.
- On **dark**, lead with warm graphite, paper text, the dark-mode Iris (`--p-iris-400`) and
  Ember (`--p-ember-400`) so contrast holds.
- On **media**, the mark and any overlaid text sit on a neutral scrim; never place coloured
  brand elements directly on a busy frame.
- Verify every brand/background pairing at the AA contrast floor before shipping.

---

## 9. Social, favicon, and application assets

> Approved exports live in `packages/ui/brand/`. Specs below define what must exist.

| Asset | Spec |
|---|---|
| Favicon | icon-only, `16/32/48px` ICO + `32px` SVG; ink frame + Ember spark on transparent; a dark-mode variant via `prefers-color-scheme` |
| App icon (PWA/maskable) | `512×512` and `192×192`, maskable safe-zone respected; icon on Iris field, paper mark |
| macOS/iOS app icon | rounded-rect platform mask; icon on Iris; no embedded wordmark |
| Social avatar | icon on Iris, square; paper mark |
| OG / share image | `1200×630`; warm graphite canvas, wordmark, one 9:16 frame; never a fake-metric screenshot |
| Email logo | icon + wordmark, `≤200px` wide, hosted PNG with alt text "Sakhaa Forge"; dark-mode-safe colours |
| Rendered-media lower-third (optional product watermark) | derives from the same tokens so a generated MP4's branding matches the app; never overpowers the customer's brand on customer output |

Rules:

- The favicon/app icon is **always the icon alone** — the wordmark never appears at favicon
  scale.
- Social and OG assets follow §6 — no claims, no fake metrics, no guarantees.
- Every shipped asset has a documented source file; nobody recreates the mark by eye.

---

## 10. Governance

- The brand tokens are the `DESIGN.md` tokens. A colour or type change moves both documents in
  the same pull request.
- New brand assets are added only to `packages/ui/brand/` and referenced from there; ad-hoc
  copies are a review failure.
- Marketing and product copy are both bound by §6 (claims). A claims change requires an
  approved update to the product claim boundary, not a copy edit.
- When in doubt about a claim, default to the weaker, more honest statement. Honesty about
  uncertainty is the brand's distinguishing asset; protect it.

---

*Our identity in one line: a calm, precise studio instrument for short-form video — confident
about craft, honest about outcomes.*
