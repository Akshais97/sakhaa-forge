# Design Review: `/brand-extract` (Brand Extraction Studio)

**Scope:** `apps/web/app/brand-extract`  
**Review date:** 2026-07-08  
**Reviewer:** Frontend Design Lead + V0 Design System  
**Authoritative sources:**
- `docs/Project/DESIGN.md`
- `docs/Project/Design/PROJECT_CONTENT_AND_LANGUAGE_GUIDE.md`
- `docs/V0/V0_INFORMATION_ARCHITECTURE.md`
- `docs/V0/V0_STATUS_ENUMS.md`

---

## 1. The brief, pinned

| Axis | Choice |
|---|---|
| **Concrete subject** | Brand extraction studio for Sakhaa Forge V0 |
| **Audience** | Client Partner / Client Manager reviewing crawled brand evidence |
| **Single job** | Let a human review, resolve vertical conflicts, and lock an approved brand profile before it becomes immutable downstream truth |

The page is an **authenticated application surface** (not the landing page), so `DESIGN.md`'s *Studio Instrument* system is the mandatory base. The reference-site energy belongs to the landing page only.

---

## 2. Validation of the layout/scroll fix recommendations

The clipping shown in `docs/Errors_Screenshot/screenshot1.png` and `screenshot2.png` is a **real, release-blocking usability defect**. The root cause is correctly identified in the prior analysis:

- `apps/web/app/globals.css` sets `body { overflow: hidden; }` and `#sakhaa-forge-app { height: 100dvh; max-height: 100dvh; }`, which locks the entire app to one viewport height.
- `BrandExtractApp.tsx` adds `overflow-hidden` on `<main>`, clipping any overflow.
- `brand-extract/page.tsx` tries to compensate with `h-dvh overflow-y-auto`, but the inner app still cannot grow.

This violates `DESIGN.md` §1.1: the interface must feel **calm, legible, and honest**. Content that is cut off without a scrollbar is the opposite — it hides state from the user without saying so.

### Recommended scroll fix (valid)

1. **Option A — natural document scroll** is preferred for V0. It is the simplest, most accessible, and matches the existing content-heavy form layout.
2. Remove or scope `body { overflow: hidden; }` so that `/brand-extract` can scroll normally.
3. Change `#sakhaa-forge-app` from a fixed `100dvh` cage to `min-height: 100dvh;` (or scope the cage to full-screen landing pages only).
4. Remove `overflow-hidden` from `BrandExtractApp`'s `<main>`.
5. Add a Playwright regression test that asserts `document.documentElement.scrollHeight > window.innerHeight` on `/brand-extract` and that the primary step action remains visible after scrolling.

### What the scroll fix does *not* solve

The scroll fix restores basic usability but leaves deeper design-system debt. The rest of this review covers that debt.

---

## 3. Design-system findings

### 3.1 Color and tokens — critical

The current page uses hardcoded palette values throughout (`#050507`, `#D4AF37`, `zinc-950`, `white/5`, etc.) instead of the token system defined in `DESIGN.md` §3–§4.

**Specific problems:**
- The near-black canvas + bright amber/gold primary strongly matches the *rejected* default "near-black with a single bright acid or vermilion accent" described in `DESIGN.md` §1.2. The system explicitly rejects this look for the authenticated application.
- The per-workspace accent (`activeBrand.primaryColor`) is being used as the primary action color on buttons. `DESIGN.md` §4.6 states the workspace seed tint must appear only in low-stakes identity locations; it must **never** be used where status or interactivity color is expected.
- Status indicators are hand-rolled with arbitrary Tailwind colors (`emerald-500`, `amber-500`, `red-500`) rather than the generated `status-tokens.ts` mapping.
- The "traceability inspector" right rail uses ad-hoc surface colors instead of `--surface-raised` / `--border-subtle`.

**Required change:** A full token pass. Every color must reference a semantic token. Primary actions use Iris. The creative forward-motion accent (generate, start crawl) uses Ember. Status uses the generated status palette. Workspace tint is reduced to identity affordances only.

### 3.2 Typography — critical

The page currently loads Inter + Space Grotesk from Google Fonts. `DESIGN.md` §5.1 mandates:
- **Display:** Clash Display
- **Text/UI:** Satoshi
- **Mono/Data:** JetBrains Mono

**Specific problems:**
- Multiple labels render at `8px`, `9px`, and `10px`. `DESIGN.md` §5.2 says: **never below 12px for any user-facing text; never below 14px for any text a person must act on.** The current inspector labels, status meta, and stepper text are too small to be legible or meet WCAG 2.2 target-size requirements.
- Over-use of `tracking-widest uppercase` for labels. This is acceptable for rare overlines, but it is applied to almost every label in the form and inspector, reducing readability and feeling templated rather than deliberate.
- No evidence of the documented type scale (`--text-h1`, `--text-body`, `--text-caption`, etc.).

**Required change:** Adopt the documented font stack and type scale. Cap labels at `12px` minimum. Reserve uppercase tracking for genuine overlines, not form labels.

### 3.3 Application shell and layout — major

`DESIGN.md` §9.3 defines the application shell: workspace rail, role-aware primary nav, stage spine, and object-detail URLs. The current `/brand-extract` page does not use this shell.

**Specific problems:**
- There is no workspace identity block (name + accent seed + avatar) in the header.
- There is no role-aware primary nav.
- Navigation is duplicated: a horizontal stepper inside `BrandExtractionStudio` plus a separate bottom "production timeline rail" in `BrandExtractApp`. Users see two different progress devices for the same six steps.
- The bottom rail is not the documented **stage spine** (§11.2). It lacks real status per node and does not navigate to artifacts.
- The page URL is `/brand-extract` rather than `/w/:workspace/brands/:id/extract`, which breaks the stable-shareable-URL rule.

**Required change:**
- Replace the two competing progress devices with a single stage spine component.
- If V0 shell components are not ready, add at minimum a workspace identity block and a single, honest stepper.
- Remove the bottom fixed rail until it can be the real stage spine.

### 3.4 Status system — major

`DESIGN.md` §10 says status is always `{shape + color + icon + label}` and is generated from the backend enum.

**Specific problems:**
- Status indicators are inline colored text or small colored pills without icons (e.g., `PENDING_USER_INPUT` in red).
- The "readiness score" and basis breakdown (identity / visuals / copy / proof) are not expressed in the status grammar.
- `blocked`, `failed`, `running`, and `unknown` are not mapped to the canonical labels from `PROJECT_CONTENT_AND_LANGUAGE_GUIDE.md` §4.

**Required change:** Use the generated `status-tokens.ts` mapping for every status. Ensure each status is distinguishable in grayscale and with motion off.

### 3.5 Content and language — major

`PROJECT_CONTENT_AND_LANGUAGE_GUIDE.md` requires sentence case, active voice, one term per concept, and India-first formatting.

**Specific problems:**
- Buttons use title case and ampersands: `Save & Continue`, `Start Brand Crawl`. Preferred: `Save and continue`, `Start brand crawl`.
- Labels use all-caps tracking-widest text everywhere, which is not sentence case.
- "Lawful rights acknowledgment" is passive. Active form: `Acknowledge crawl and lineage rights`.
- The phrase "Production Command Centre" and aggressive uppercase microcopy make the interface feel like a template rather than a calm studio instrument.
- "Credits: 480.00 Credits" does not follow the money rules in `DESIGN.md` §13. If these are creator credits, the formatting and terminology should be explicit; if they are INR, the symbol and grouping must be shown.

**Required change:** A copy audit against the content guide. Every label and button should pass the checklist at the end of `PROJECT_CONTENT_AND_LANGUAGE_GUIDE.md`.

### 3.6 Motion — moderate

`DESIGN.md` §8 requires motion to communicate honest state, not to entertain.

**Specific problems:**
- The header logo rotates continuously (12s loop). This is ambient decoration, not state communication. It must stop under `prefers-reduced-motion`.
- Multiple `animate-pulse` instances are used for static status (e.g., the amber dot, the "scanning" asset status). Pulse should be reserved for genuinely indeterminate progress.
- Step transitions via `AnimatePresence` are acceptable, but durations should resolve to the design tokens (`--motion-base: 220ms`) rather than hardcoded values.

**Required change:** Replace decorative rotation/pulse with calm, token-driven motion. Ensure all motion has a static fallback under reduced motion.

### 3.7 Honesty and state truth — major

`DESIGN.md` §1.3 principle #1: **state is never a guess**. The page currently mixes real API calls with simulated fallbacks, but the UI does not always disclose when it is in simulation.

**Specific problems:**
- The inspector states: *"No synthetic setTimeouts are applied; every status update represents actual backend responses."* The code uses `setTimeout` simulations in `simulateLocalCrawl` and the asset scanning lifecycle. This statement is false and violates the honesty principle.
- Random `sha256:…` hashes are generated locally. If these are simulated evidence, the UI should label them as simulated, not present them as cryptographic truth.

**Required change:** Either remove the false claim or make the simulation mode explicit (e.g., a quiet "Sandbox mode" badge). Do not claim backend truth when the source is local mock data.

### 3.8 Accessibility — moderate to critical

`DESIGN.md` §17 is a build-enforced floor.

**Specific problems:**
- Tiny text (8–10px) fails readability and target-size requirements.
- Focus rings are not visible. Interactive elements need a 2px `--focus-ring` (Iris) with 2px offset.
- Scrollable regions inside the form (`max-h-28`, `max-h-40`, `max-h-96`, `max-h-[380px]`) need keyboard access; currently they are not focusable and rely on mouse/touch wheel.
- The right rail uses low-contrast small text that may fail WCAG AA.

**Required change:** Add visible focus rings, ensure all scrollable subregions are focusable, and verify contrast for every text-on-surface pair.

### 3.9 Money and ledger — moderate

The credit widget in the header shows a numeric balance but does not follow `DESIGN.md` §13.

**Required change:** If the number is creator credits, label it clearly. If it is INR, render it with the symbol, Indian grouping, and tabular mono font.

---

## 4. What is working

- The six-step pipeline maps to a real sequence, so a numbered stepper is appropriate (per the frontend-design skill's "Structure is information" principle).
- The two-column layout (form + contextual inspector) is the right structural idea for a system-of-record surface.
- The evidence source block (locator, excerpt, hash) is a good expression of `DESIGN.md` §14 (lineage and evidence).
- The rights-attestation checkbox before irreversible approval is correct for §11.8 and §13.

---

## 5. Recommended implementation order

1. **Fix the scroll bug first** — restore basic usability.
2. **Add the Playwright regression test** so the bug cannot return.
3. **Token pass** — replace all arbitrary hex with semantic tokens; adopt Iris/Ember/ink palette.
4. **Typography pass** — switch to Clash Display / Satoshi / JetBrains Mono; enforce 12px floor.
5. **Status pass** — use generated `status-tokens.ts` everywhere.
6. **Shell alignment** — add workspace identity; consolidate the two progress devices into one stage spine.
7. **Copy audit** — sentence case, active voice, content-guide terms, India-first formatting.
8. **Accessibility pass** — focus rings, scrollable region keyboard access, contrast verification.
9. **Honesty pass** — remove or qualify simulated-data claims.

---

## 6. Summary verdict

The scroll fix recommendations are **valid and should be applied**. They restore a basic usability contract that is currently broken.

However, `/brand-extract` also has significant design-system debt: it uses a near-black/bright-amber palette that `DESIGN.md` explicitly rejects for the authenticated app, hardcodes colors instead of using tokens, uses the wrong typefaces, relies on illegibly small text, duplicates navigation, bypasses the generated status system, and makes a false claim about backend truth in the inspector.

After the scroll fix, the next priority is a token-and-typography pass to bring the page into the *Studio Instrument* system. Without that, the page will remain visually and verbally inconsistent with the rest of V0.
