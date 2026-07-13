# V0 Animation Improvements Plan

**Date:** 2026-07-13  
**Scope:** Sakhaa Forge Product V0 frontend (apps/web) — strictly research and documentation. No code changes.  
**Authoring lens:**
- `.claude/skills/emil-design-eng/SKILL.md`
- `.claude/skills/apple-design/SKILL.md`
- `.claude/skills/animation-vocabulary/SKILL.md`

**Authoritative contracts referenced:**
- `docs/Project/DESIGN.md` §8 Motion and reduced motion, §10 Status system, §11 Job/evidence panels
- `docs/Project/Design/PROJECT_CONTENT_AND_LANGUAGE_GUIDE.md`
- `docs/V0/V0_STATUS_ENUMS.md`
- `docs/V0/V0_VERTICAL_OUTCOME_SLICES.md`

---

## 1. Scope and method

This document records a page-by-page animation audit of the V0 web frontend. The goal is to identify where motion can improve orientation, state honesty, feedback, and perceived quality without violating the V0 design system's strict rules on status truth, reduced motion, and claim boundaries.

**Method:**
1. Read every route (`apps/web/app/**/page.tsx`) and every shared component under `apps/web/src/components/` and `apps/web/app/**/_components/`.
2. Map existing motion (library, easing, duration, trigger, purpose).
3. Apply the three skill lenses:
   - *Emil:* decision framework (frequency → purpose → easing → speed), no `ease-in`, no `scale(0)`, origin-aware popovers, press feedback, stagger, `@starting-style`.
   - *Apple:* response, direct manipulation, interruptibility, springs (damping/response), velocity handoff, spatial consistency, materials/depth, reduced motion.
   - *Animation vocabulary:* name each effect precisely so the design system stays consistent.
4. For each page, use chain-of-thought reasoning to state what the user is doing, what information motion must preserve, and what would mislead. Use tree-of-thought reasoning when choosing between animation options, scoring each against V0 constraints.
5. No implementation. All suggestions are ranked and tagged by risk, effort, and V0 contract impact.

---

## 2. Motion contract from DESIGN.md

The following rules are non-negotiable for every suggestion:

| Token / rule | Value | Meaning |
| --- | --- | --- |
| `--motion-instant` | 80ms | Press feedback |
| `--motion-fast` | 140ms | Hover, small reveals |
| `--motion-base` | 220ms | Enter/exit, accordions |
| `--motion-slow` | 360ms | Dialog, drawer, page section |
| `--ease-standard` | `cubic-bezier(.2, 0, 0, 1)` | Most transitions |
| `--ease-decel` | `cubic-bezier(.05, .7, .1, 1)` | Entering |
| `--ease-accel` | `cubic-bezier(.3, 0, .8, .15)` | Exiting |
| Running state | activity ring only | Calm, continuous, low-energy |
| Unknown state | static hatch + label | Must not animate as if working |
| Reduced motion | opacity crossfade or instant swap | No position/transform motion |
| Honesty | motion must not fake progress | No synthetic progress bars for paid/provider work |

**Hard no's for V0:**
- No bounce/overshoot on status changes.
- No `scale(0)` entrances.
- No `ease-in` for UI responses.
- No motion that implies success before verification.
- No animation that conveys information by motion alone.

---

## 3. Current motion inventory

### 3.1 Library and tokens
- `motion/react` (Framer Motion successor) is used throughout: `motion.div`, `AnimatePresence`, `useSpring`, `animate`.
- Tailwind v4 custom theme in `apps/web/app/globals.css` and `apps/web/src/index.css`.
- Custom motion primitives live in `apps/web/src/components/MotionBits.tsx`: `Magnet`, `Spotlight`, `RotatingText`, `RotatingWordPair`.
- Most current easing uses `[0.22, 1, 0.36, 1]` — a strong ease-out close to Emil's `--ease-out` and DESIGN.md's `--ease-decel`. This is already good.

### 3.2 Existing animation by area

| Area | Existing motion | Gaps |
| --- | --- | --- |
| Landing page (`src/App.tsx`, `HeroScene.tsx`, `ProblemScene.tsx`, `NarrativePanel.tsx`, `DynamicMockup.tsx`) | Page-stage `AnimatePresence` crossfade, `Magnet` buttons, `Spotlight` cards, rotating tagline, floating scattered cards, laser trace, progress bar width, mock player pulse, waveform bars, typewriter | Stage direction inconsistent (some slide `x`, some fade), reduced-motion not honored, no keyboard navigation affordance |
| Brand-extract studio (`app/brand-extract/_components/components/BrandExtractionStudio.tsx`) | 6-step `AnimatePresence` with `x` slide, polling progress bar, candidate approve/reject, evidence accordion, approval success crossfade | Stepper spine is static, drawer context switches instantly, asset-pack grid has only hover scale, form sections appear instantly |
| Brand atelier (`app/app/branding/_components/*`) | `BrandStatusChip` crossfade + `animate-ping`, `BrandScanConsole` log stagger, `BrandStageRail` width animation, `BrandEvidenceDossier` staggered sections + readiness bar | Source panel accordion exists but subtle, tab transitions absent, approval success is instant |
| Workspace workflow shell (`src/components/ForgeWorkspaceApp.tsx`, `src/workflow/v0-screens.tsx`) | Almost none — only CSS transitions on links | Step rail has no active indicator motion, form fields appear instantly, evidence/state panels swap instantly, empty/loading states are static |
| Static/auth pages (`sign-in`, `signup`, `onboarding`, `profile`, `access-denied`, `auth/callback`) | None | Form entry, validation feedback, and state changes are abrupt |
| Shared primitives (`MotionBits.tsx`, `Header.tsx`, `ProgressBar.tsx`, `AccessModal.tsx`) | Mouse-follow spring, spotlight border, rotating text, modal spring enter/exit | `Magnet` lacks reduced-motion gating; spotlight is CSS-only and cannot animate |

---

## 4. Page-by-page analysis and recommendations

### 4.1 Landing page (`/`, `src/App.tsx` + components)

**Chain-of-thought:**
- The landing page is a marketing surface whose job is to explain the product and earn trust before signup. It is not a system-of-record for paid work, so motion can be more expressive here than inside the app.
- Current state: `App.tsx` uses `AnimatePresence mode="wait"` to swap between `HeroScene` (stage 0) and a side-by-side command center (stages 1-5). Each stage crossfades with opacity and sometimes `x` translation.
- Problem: the direction of motion is not consistent. `HeroScene` and command-center stages use different transition directions, so the user loses the sense of forward progression through a narrative. The progress bar animates width, but the stage content does not reinforce that direction.
- Emil lens: this animation is occasional (first visit / demo), so it can use a slower, explanatory rhythm. Apple lens: motion must be interruptible; the user can click the progress spine or use keyboard to jump stages, so animations must not lock input.

**Tree-of-thought options for stage transitions:**

| Option                       | Description                                                              | Pros                                                       | Cons                                                                       | Verdict      |
| ---------------------------- | ------------------------------------------------------------------------ | ---------------------------------------------------------- | -------------------------------------------------------------------------- | ------------ |
| A. Direction-aware slide     | Content exits `x: -20`, enters `x: 20` on next stage; reverse on back.   | Reinforces narrative direction; Apple spatial consistency. | Requires careful reduced-motion fallback; can feel heavy on mobile.        | **Selected** |
| B. Crossfade only            | Opacity fade, no position change.                                        | Safe, calm, easy reduced-motion.                           | Does not communicate "moving forward" in a multi-stage demo.               | Fallback     |
| C. Shared element transition | A persistent shape (e.g., the 9:16 player) morphs between stage mockups. | High craft, explains continuity.                           | Complex, may fight with mock content differences; overkill for V0 landing. | Defer        |

**Selected recommendations for landing page:**

1. **Direction-aware stage slide (option A).**
   - Implement `AnimatePresence` with custom `variants` so stage N exits to `-x` and stage N+1 enters from `+x`. Back navigation reverses.
   - Use `--motion-slow` (360ms) and `--ease-decel` for enter, `--ease-accel` for exit.
   - Reduced motion: replace with opacity crossfade (option B).
   - File: `apps/web/src/App.tsx:47-90` and stage components.

2. **Progress bar spine → stage pulse coupling.**
   - When the active stage changes, briefly brighten the active spine node and dim completed nodes. This connects the progress bar and the content without inventing progress.
   - Duration: `--motion-base` (220ms); no bounce.
   - File: `apps/web/src/components/ProgressBar.tsx`.

3. **Staggered entrance for HeroScene copy and mock elements.**
   - The hero already has a rotating word pair and ambient glow. Add a controlled stagger for headline, subhead, CTA, and mock player so the page loads with deliberate hierarchy rather than everything at once.
   - Delay: 60-100ms between items (Emil stagger range). Use `translateY(12px) → 0` + opacity.
   - File: `apps/web/src/components/HeroScene.tsx`.

4. **Reduced-motion gate for `Magnet` and floating cards.**
   - `Magnet` (mouse-follow spring) and the floating scattered cards in `ProblemScene.tsx` should be disabled when `prefers-reduced-motion: reduce` is true.
   - File: `apps/web/src/components/MotionBits.tsx` and `apps/web/src/components/ProblemScene.tsx`.

5. **Press feedback on all landing CTAs.**
   - Current buttons use hover opacity. Add `:active { transform: scale(0.97) }` with `transition: transform 80ms var(--ease-standard)`.
   - File: `apps/web/app/globals.css` primary-action rule and `apps/web/src/components/HeroScene.tsx` CTAs.

---

### 4.2 Brand-extract studio (`/brand-extract`, `BrandExtractionStudio.tsx`)

**Chain-of-thought:**
- This is a production-critical surface. It guides a user through brand source → crawl setup → live scan → candidate dossier → asset pack → approval. Motion must reinforce *state truth* and *progress honesty*, never invent certainty.
- Current state: a 6-step vertical stepper with `AnimatePresence` sliding step screens left/right. The polling progress bar is honest (driven by backend status). Candidate approve/reject uses status badges.
- Problems:
  - The vertical stepper spine is static. It does not animate the active step transition, so the user has to read text labels to know the step changed.
  - The right-hand "Traceability Inspector" drawer swaps content instantly when the step changes. This is a missed orientation cue.
  - The candidate dossier list and asset pack grid appear instantly; stagger would improve scannability without delaying interaction.
  - The approval form is long and dense; section entrances are abrupt.

**Tree-of-thought options for stepper spine motion:**

| Option | Description | Pros | Cons | Verdict |
| --- | --- | --- | --- | --- |
| A. Traveling active indicator | A small pill or dot slides vertically to the active step. | Clear, Apple-style spatial consistency; does not invent progress. | Must not slide through disabled future steps in a way that implies they are reachable. | **Selected** |
| B. Fade step numbers only | Step numbers crossfade. | Minimal. | Weak orientation cue. | Not selected |
| C. Expand active step card | Active step grows; others shrink. | Clear hierarchy. | Triggers layout; can feel like the step is "done" when it expands. | Defer |

**Selected recommendations for brand-extract studio:**

1. **Traveling active-step indicator on the stepper spine.**
   - Use a `layoutId` (shared layout animation in Motion) so a small Ember/Iris pill glides from the previous active step to the new one.
   - Spring: critically damped, `type: "spring", bounce: 0, duration: 0.3` (Apple default).
   - Disabled future steps must not be passed over visually; the indicator should only move among enabled steps.
   - File: `apps/web/app/brand-extract/_components/components/BrandExtractionStudio.tsx` stepper JSX.

2. **Direction-aware step-screen transitions aligned with spine.**
   - Current `x: -10/10` slide is already good. Make it consistent: forward steps enter from right, back steps enter from left. Ensure the exit animation is faster than enter (Apple/Emil asymmetric timing: exit ~140ms, enter ~220ms).
   - Reduced motion: instant opacity crossfade.

3. **Traceability Inspector drawer: staggered content swap.**
   - When the step changes, fade the drawer heading, then stagger the info blocks in by 40ms each.
   - This orients the user to the new context without blocking the main step transition.
   - File: right-hand drawer in `BrandExtractionStudio.tsx`.

4. **Candidate dossier list stagger.**
   - On entering step 4, stagger candidate cards in from `y: 8`, opacity 0, with 40ms delay per item.
   - Approve/reject state change should use a calm crossfade of the status chip and a subtle border-color transition (not bounce).
   - File: candidate list render block.

5. **Asset pack grid stagger + hover lift.**
   - On entering step 5, stagger asset cards in by 50ms. Add `:hover` translateY(-2px) + border highlight using CSS transitions, not springs (frequent hover).
   - Keep the existing `group-hover:scale-105` on thumbnails; it is already subtle and appropriate.
   - File: asset pack grid.

6. **Approval form section reveals.**
   - The form is tall. On entering step 6, reveal each collapsible section with a `clip-path` or height reveal from top to bottom, 80ms stagger.
   - This communicates "building the final profile" without faking work.
   - File: step 6 approval form JSX.

7. **Success state: calm commit celebration.**
   - After approval submission, the success card currently scales in from 0.95. Add a short SVG checkmark line-drawing animation and a gentle "seal" pulse on the version hash.
   - Must not use confetti or bounce. Calm confidence is the V0 emotion.
   - File: approval success card.

---

### 4.3 Brand atelier (`/app/branding`, `BrandAtelier.tsx` + subcomponents)

**Chain-of-thought:**
- This is the mock/demo brand scan pipeline: idle → sourceLocked → crawling → extracting → candidatesReady → approved. It is closely related to the brand-extract studio but simpler and more theatrical.
- Current state: `BrandStatusChip` has a nice crossfade + `animate-ping` on the running dot. `BrandScanConsole` staggers log entries. `BrandStageRail` animates width. `BrandEvidenceDossier` staggers sections and the readiness bar.
- Problems:
  - `BrandSourcePanel` accordion uses height animation but the chevron rotation is linear and could use a spring.
  - The dossier tab list (in `BrandAssetPack.tsx`, rendered by `BrandAtelier`) has no tab-content transition; switching tabs snaps.
  - Approval is instant; there is no "commit" motion even though this is a high-stakes action.

**Tree-of-thought options for tab transitions in the dossier:**

| Option | Description | Pros | Cons | Verdict |
| --- | --- | --- | --- | --- |
| A. Crossfade content | Fade old tab out, fade new tab in. | Calm, easy reduced-motion. | Does not reinforce tab relationship. | **Selected** |
| B. Horizontal slide | Content slides left/right per tab index. | Reinforces order. | Can feel like navigation, not filtering; more complex. | Fallback |
| C. Clip-path active tab reveal | Use Emil's duplicated tab list + clip-path technique for perfect active underline/color morph. | Polished. | Overkill for a small tab bar; adds DOM. | Defer |

**Selected recommendations for brand atelier:**

1. **Accordion chevron spring.**
   - Replace the linear rotation with a spring: `type: "spring", bounce: 0, duration: 0.25`.
   - File: `apps/web/app/app/branding/_components/BrandSourcePanel.tsx:89-91`.

2. **Dossier tab content crossfade (option A).**
   - Wrap tab content in `AnimatePresence mode="wait"` with opacity crossfade over `--motion-base`.
   - Reduced motion: instant swap.
   - File: `apps/web/src/components/BrandAssetPack.tsx` tab content area.

3. **Status chip motion consistency.**
   - The chip already crossfades. Ensure `retrying` uses a slow rotate (not ping), `failed` uses a calm settle, and `unknown` is static per DESIGN.md.
   - File: `apps/web/app/app/branding/_components/BrandStatusChip.tsx`.

4. **Scan console log line entrance.**
   - Existing stagger is good. Add a subtle `x` slide (4px) per line so new logs "arrive" from the provider side.
   - File: `apps/web/app/app/branding/_components/BrandScanConsole.tsx`.

5. **Approval commit motion.**
   - On the "Approve profile" button press, add a hold-to-confirm or brief progress fill (clip-path inset) over 400ms, then transition to a success card.
   - This signals irreversibility. Must not be a synthetic delay; it should coincide with the actual state transition if wired to real API later.
   - File: `BrandAssetPack.tsx` approve button and success state.

---

### 4.4 Workspace workflow shell (`/w/[workspaceSlug]/*`, `ForgeWorkspaceApp.tsx`, `v0-screens.tsx`)

**Chain-of-thought:**
- This is the actual production command center. It is currently almost motionless. Motion here must be extremely conservative: the user will spend the most time in this surface, and any animation will be seen repeatedly.
- Current state: `ForgeWorkspaceApp.tsx` has a two-column layout (rail + main). `v0-screens.tsx` renders workflow screens, form fields, evidence panel, state panel, empty state. Only CSS link transitions exist.
- Problems:
  - No indication of active step in the rail beyond color.
  - Form sections and evidence panels appear instantly, hurting orientation.
  - Empty/loading/error states are static cards.
  - There is no transition when the workflow advances to the next step.

**Tree-of-thought options for workflow step transitions:**

| Option | Description | Pros | Cons | Verdict |
| --- | --- | --- | --- | --- |
| A. Rail indicator slide + content crossfade | A small indicator slides in the rail; main content crossfades. | Clear, calm, professional. | Requires wiring active step to shared layout. | **Selected** |
| B. Full page slide | Entire main panel slides left/right. | Strong direction. | Too much motion for a tool used repeatedly; can cause seasickness. | Reject |
| C. No transition | Keep instant swaps. | Fast. | Loses orientation; feels unfinished. | Reject |

**Selected recommendations for workspace shell:**

1. **Rail active-step indicator slide.**
   - A 3px Iris line slides vertically to the active step using `layoutId`. Spring, critically damped, 0.3s response.
   - Completed steps get a calm checkmark fade-in; future steps remain muted.
   - File: `apps/web/src/components/ForgeWorkspaceApp.tsx` and `apps/web/src/workflow/v0-workflow.ts` step definitions.

2. **Workflow screen content crossfade.**
   - When `ForgeWorkspaceApp` receives a new `activeStep`, crossfade the main panel content over `--motion-base`.
   - Exit should be faster than enter (140ms / 220ms).
   - Reduced motion: instant.

3. **Staggered form field entrance.**
   - On first render of a workflow screen, stagger form fields in by 30ms. Delay must be short because this is a frequent action.
   - Use `translateY(6px)` + opacity; no scale.
   - File: `apps/web/src/workflow/v0-screens.tsx` form rendering.

4. **Evidence panel expand/collapse.**
   - Add a height accordion for evidence panels with `--motion-base` duration. Use `AnimatePresence` with `height: "auto"`.
   - File: evidence panel in `v0-screens.tsx`.

5. **Empty/loading/error state micro-animations.**
   - Empty state: icon gently pulses (opacity only, 3s loop) — no scale.
   - Loading state: skeleton shimmer or a calm indeterminate track per DESIGN.md §8.2.
   - Error state: a subtle horizontal shake (4px, 200ms) on the error card to signal "rejected input" without being alarming.
   - File: `v0-screens.tsx` empty/loading/error branches.

6. **Save/continue button press feedback.**
   - Add `:active scale(0.97)` to primary workflow buttons. This is the lowest-effort, highest-impact improvement.
   - File: `v0-screens.tsx` and `ForgeWorkspaceApp.tsx` buttons.

---

### 4.5 Static and auth pages (`/sign-in`, `/app/signup`, `/app/onboarding`, `/app/profile`, `/access-denied`, `/auth/callback`)

**Chain-of-thought:**
- These pages are currently bare forms with no motion. They are seen on first entry and during error recovery. Motion here should be calm, helpful, and never celebratory.
- `sign-in` is a placeholder page; `signup`, `onboarding`, `profile` are functional forms; `access-denied` and `auth/callback` are status pages.

**Selected recommendations:**

1. **Form entrance stagger.**
   - On mount, stagger heading, description, form card, and fields by 50ms. Use `translateY(10px)` + opacity.
   - This is first-viewport content, so a slightly slower `--motion-slow` for the heading is acceptable.
   - Files: `apps/web/app/sign-in/page.tsx`, `apps/web/app/app/signup/page.tsx`, `apps/web/app/app/onboarding/page.tsx`, `apps/web/app/app/profile/page.tsx`.

2. **Input focus lift.**
   - Current inputs have `focus:border-white/20`. Add a subtle `box-shadow` glow using the Iris color and a `translateY(-1px)` on focus.
   - Duration: `--motion-fast`.
   - File: shared via `apps/web/app/globals.css` input rule.

3. **Validation error shake.**
   - When a field fails validation, shake the input horizontally by 4px over 200ms (Emil "shake/wiggle"), then settle.
   - Must be paired with `aria-invalid` and an error message.
   - Files: all form pages.

4. **Button press feedback.**
   - Add `:active scale(0.97)` to all submit buttons. Current buttons have no press state.
   - Files: all form pages.

5. **Auth callback pending state.**
   - The callback page is static. Add a calm activity ring (not a spinner) to show "Checking authentication…". This is the only running-state animation in this area and must follow DESIGN.md §8.2.
   - File: `apps/web/app/auth/callback/page.tsx`.

6. **Access denied error card.**
   - Add a subtle entrance scale from 0.98 + opacity, then a static warning icon. No looping animation.
   - File: `apps/web/app/access-denied/page.tsx`.

---

### 4.6 Shared primitives (`MotionBits.tsx`, `Header.tsx`, `ProgressBar.tsx`, `AccessModal.tsx`)

**Chain-of-thought:**
- These primitives are reused across pages. Improving them has broad impact.
- `Magnet` is decorative mouse-follow; `Spotlight` is a CSS radial-gradient border; `RotatingText`/`RotatingWordPair` are looping marketing elements; `Header` has a rotating logo; `ProgressBar` animates width; `AccessModal` uses spring enter/exit.

**Selected recommendations:**

1. **`Magnet` reduced-motion gate.**
   - The spring mouse-follow should be disabled when `prefers-reduced-motion: reduce` is active. Replace with static transform or no effect.
   - File: `apps/web/src/components/MotionBits.tsx`.

2. **`Spotlight` border subtle pulse option.**
   - The spotlight card uses a static CSS radial-gradient. Optionally animate the gradient position slowly (8s loop, opacity only) for ambient life on landing cards.
   - Must be disabled under reduced motion and must not animate on workflow cards (too distracting).
   - File: `apps/web/src/components/MotionBits.tsx`.

3. **`RotatingWordPair` pause on hover / reduced motion.**
   - The rotating tagline should pause on hover so users can read it, and respect reduced motion by showing the first word statically.
   - File: `apps/web/src/components/MotionBits.tsx`.

4. **`Header` logo rotation.**
   - The rotating logo square is currently a continuous spin. Add a hover speed-up and a reduced-motion fallback (static).
   - File: `apps/web/src/components/Header.tsx` and `apps/web/app/brand-extract/_components/components/Header.tsx`.

5. **`ProgressBar` step node pulse.**
   - When the active stage changes, the active node should gently pulse once (opacity 0.6 → 1) and completed nodes should fade to a dim checkmark.
   - File: `apps/web/src/components/ProgressBar.tsx`.

6. **`AccessModal` spring tuning.**
   - Current modal uses spring enter/exit. Ensure it uses critically damped spring (`bounce: 0`) and exits faster than it enters. Add a backdrop fade.
   - Reduced motion: disable scale; use opacity crossfade only.
   - Files: `apps/web/src/components/AccessModal.tsx` and `apps/web/app/brand-extract/_components/components/AccessModal.tsx`.

---

## 5. Cross-cutting animation system recommendations

### 5.1 Standardize on a small motion vocabulary

Introduce a shared vocabulary file (documentation only for now) that maps each effect to its allowed context:

| Effect | Vocabulary term | Use when | Avoid when |
| --- | --- | --- | --- |
| Stage/step content change | Direction-aware transition | Landing demo, workflow steps | Status changes |
| Card/list arrival | Stagger | Infrequent reveals (dossier, asset pack) | Keyboard-driven lists |
| Button press | Press feedback | Every clickable primary/secondary action | None |
| Hover lift | Hover effect | Cards, thumbnails, links | Status chips, running indicators |
| Active indicator glide | Layout animation | Steppers, rails, tabs | None |
| Modal/overlay | Scale-in + backdrop fade | Access modal, confirmation dialogs | Toasts used repeatedly |
| Loading/running | Activity ring / indeterminate track | Real backend work | Unknown state, synthetic delays |
| Success | Calm seal / check draw | Approval, verification | Before actual verification |
| Error | Shake / wiggle | Validation, recoverable error | System fatal errors |

### 5.2 Create a `useReducedMotion` hook

Both Emil and Apple skills insist on respecting `prefers-reduced-motion`. The codebase currently has a media query in CSS but no React hook. A shared `useReducedMotion` hook should gate all JS-driven motion (`Magnet`, rotating text, mouse-follow, springs).

- Location: `apps/web/src/hooks/useReducedMotion.ts` (future implementation).
- Usage: all `motion/react` components that move by position or scale should read this hook.

### 5.3 Adopt exact DESIGN.md tokens

Several components hard-code durations (0.22s, 0.3s, 0.35s). Align them to tokens:

| Hard-coded | Replace with |
| --- | --- |
| `duration: 0.22` | `var(--motion-base)` or 220ms |
| `duration: 0.3` | `var(--motion-slow)` or 360ms when appropriate |
| `duration: 0.35` | `var(--motion-slow)` |
| Hover transitions `duration-300` | `var(--motion-fast)` (140ms) for hover |

### 5.4 No `scale(0)` policy

Audit all `initial={{ scale: 0... }}` patterns. None currently exist in the inspected files, but any future modal/toast should start at `scale: 0.95` with `opacity: 0`.

### 5.5 No `ease-in` policy

All enter/exit animations should use `--ease-decel` / `--ease-accel` or the existing `[0.22, 1, 0.36, 1]` curve. No UI animation should start slowly.

---

## 6. Implementation priority

**Priority 1 — quick wins, low risk, high impact:**
1. Add `:active scale(0.97)` to all primary/secondary buttons across `src/components/`, `app/app/branding/`, and `app/brand-extract/`.
2. Add reduced-motion gating to `Magnet` and rotating text primitives.
3. Stagger form fields in workspace workflow screens.
4. Add direction-aware transitions to landing page stages.

**Priority 2 — medium effort, strong orientation value:**
5. Traveling active-step indicator in brand-extract studio stepper.
6. Traceability Inspector drawer content swap stagger.
7. Rail active-step indicator in workspace shell.
8. Dossier tab content crossfade in brand atelier.

**Priority 3 — larger polish, defer until P1/P2 are stable:**
9. Approval form section reveals in brand-extract studio.
10. Asset pack grid stagger + hover lift.
11. Spotlight ambient pulse (landing only).
12. Auth callback activity ring and access-denied entrance.

---

## 7. Accessibility and reduced-motion requirements

Every recommendation must satisfy:

1. **`prefers-reduced-motion: reduce`**: all position/transform motion becomes an opacity crossfade or instant swap. Running activity rings become static rings with running color.
2. **`prefers-reduced-transparency: reduce`**: translucent backdrops become more opaque; blur is reduced.
3. **`prefers-contrast: more`**: focus rings and borders meet increased contrast requirements.
4. **No information by motion alone:** if an animation is disabled, the status/icon/label still communicates state.
5. **Keyboard parity:** any animation that reveals content must be matched by focus management and screen-reader announcements.
6. **No flashing:** no element flashes more than 3 times per second.
7. **Target size:** any new interactive element added for animation must be ≥44px on touch, ≥24px on desktop.

---

## 8. Files touched by this audit

- `apps/web/app/page.tsx`
- `apps/web/app/sign-in/page.tsx`
- `apps/web/app/app/signup/page.tsx`
- `apps/web/app/app/onboarding/page.tsx`
- `apps/web/app/app/profile/page.tsx`
- `apps/web/app/access-denied/page.tsx`
- `apps/web/app/auth/callback/page.tsx`
- `apps/web/app/w/[workspaceSlug]/page.tsx`
- `apps/web/app/w/[workspaceSlug]/create/page.tsx`
- `apps/web/app/w/[workspaceSlug]/[...segments]/page.tsx`
- `apps/web/app/branding/page.tsx`
- `apps/web/app/app/branding/page.tsx`
- `apps/web/app/brand-extract/page.tsx`
- `apps/web/src/App.tsx`
- `apps/web/src/components/HeroScene.tsx`
- `apps/web/src/components/ProblemScene.tsx`
- `apps/web/src/components/NarrativePanel.tsx`
- `apps/web/src/components/DynamicMockup.tsx`
- `apps/web/src/components/MotionBits.tsx`
- `apps/web/src/components/Header.tsx`
- `apps/web/src/components/ProgressBar.tsx`
- `apps/web/src/components/AccessModal.tsx`
- `apps/web/src/components/ForgeWorkspaceApp.tsx`
- `apps/web/src/components/BrandIntakeSection.tsx`
- `apps/web/src/components/BrandAssetPack.tsx`
- `apps/web/src/workflow/v0-workflow.ts`
- `apps/web/src/workflow/v0-screens.tsx`
- `apps/web/app/brand-extract/_components/BrandExtractApp.tsx`
- `apps/web/app/brand-extract/_components/components/BrandExtractionStudio.tsx`
- `apps/web/app/brand-extract/_components/components/Header.tsx`
- `apps/web/app/brand-extract/_components/components/AccessModal.tsx`
- `apps/web/app/app/branding/_components/BrandAtelier.tsx`
- `apps/web/app/app/branding/_components/BrandSourcePanel.tsx`
- `apps/web/app/app/branding/_components/BrandScanConsole.tsx`
- `apps/web/app/app/branding/_components/BrandStatusChip.tsx`
- `apps/web/app/app/branding/_components/BrandStageRail.tsx`
- `apps/web/app/app/branding/_components/BrandEvidenceDossier.tsx`
- `apps/web/app/globals.css`
- `apps/web/src/index.css`

---

## 9. Conclusion

The V0 frontend already has a strong motion foundation: the right library (`motion/react`), an appropriate dark-studio palette, and several well-judged effects. The biggest opportunity is **consistency and orientation**: making stage/step transitions directional, giving active indicators a sense of travel, and adding minimal press feedback everywhere. The second-biggest opportunity is **honest motion discipline**: gating decorative effects under reduced motion and ensuring no animation implies certainty before verification.

This plan deliberately avoids any change that would make V0 feel like a marketing toy. Every recommendation serves the product's core promise: a calm, honest system of record for an expensive creative workflow.
