# Product V0: Sakhaa Forge Specification

**Product version:** V0 — Sakhaa Forge, the predecessor system built before V2 scoring  
**Status:** Standalone V0 Definition  
**Scope:** Self-contained. All product, engineering, prompt, billing, review, avatar, and publishing decisions needed for standalone V0 are included here.

## Version Lineage

This document defines the first product to build: **Product V0, Sakhaa Forge**. It
creates, reviews, publishes, and records outcomes for short-form videos.

Its outputs later become inputs to **Product V2**, whose canonical documentation lives in
`../V2/`. V2 evaluates rendered revisions, recommends the next creative change, produces
constrained generation briefs, and learns from linked campaign outcomes.

Product V1 is the additive production-maturity release of this same application. It adds
deferred V0 capabilities such as template clustering, broader providers/platforms,
isolated-variable testing, quality improvements, scale and stable V2 export contracts.
It is not required for V0 acceptance. Product V2 remains a separate intelligence product.

```text
Product V0: Sakhaa Forge production engine
  -> rendered and published videos
  -> exact creative lineage and generation metadata
  -> review decisions and campaign outcomes
  -> Product V1: mature production engine and stable exports
  -> Product V2: Sakhaa scoring and revision intelligence
```

Implementation documents:

- `V0_ARCHITECTURE.md`
- `V0_DATA_MODELS.md`
- `V0_PRISMA_SCHEMA.md`
- `V0_API.md`
- `V0_JOBS.md`
- `V0_SECURITY.md`
- `V0_TESTING.md`
- `V0_DEPLOYMENT.md`
- `V0_IMPLEMENTATION_PLAN.md`
- `V0_STATUS_ENUMS.md`
- `V0_RISKS_AND_GATES.md`
- `V0_SETUP_RUNBOOK.md`
- `V0_PERMISSIONS.md`
- `V0_INFORMATION_ARCHITECTURE.md`
- `V0_SCREEN_AND_STATE_INVENTORY.md`
- `V0_TEST_PERSONAS_AND_SEED_FIXTURES.md`
- `V0_ERROR_CATALOG.md`
- `V0_ANALYTICS_EVENT_TAXONOMY.md`
- `V0_CUSTOMER_BRAND_INTAKE_TEMPLATE.md`
- `V0_BRAND_PROFILE_CONTRACT.md`
- `../V1/V1_EVOLUTION.md`

---

## Acceptance Criteria (Read First)

V0 is complete when this full journey executes end-to-end without manual intervention in the pipeline:

```
Client website URL + approved brand kit
  → Xpoz viral candidate (video URL + media URL + thumbnail)
  → Thumbnail deciphered
  → Video deciphered into scene blueprint
  → Blueprint → director prompt with [REPLACE] slots
  → 10–20 script variants generated and scored
  → Top variant selected
  → HeyGen generates avatar-led video
  → AE layer stitches final branded MP4
  → Review board receives video
  → Approval → content calendar
  → Scheduled post published
  → Audience-view verification confirms the live post
  → Posting confirmation notification sent
  → Credits deducted exactly once
```

Minimum demo requires one real estate client brand running the full path above, producing one reviewed, scheduled post with a correct credit ledger entry.

---

## 1. What This System Does

Sakhaa Forge learns a client brand, finds high-performing viral video structures from
Xpoz, extracts the reusable creative patterns, generates brand-specific scripts, produces
videos through the appropriate generation route, polishes them through After Effects,
routes them through approval, and schedules them.

The system does **not** copy videos. It extracts structure—hook timing, scene rhythm, caption pattern, CTA style, pacing formula—and replaces original content with the client's brand, product, offer, avatar, and assets.

Output is not a video. Output is a **repeatable production system**:

```
Brand Memory → Viral Blueprint → Script Tournament → Generation → Review → Calendar
```

---

## 2. Core Principle: Structure, Not Content

What is extracted from a viral video:

- hook timing and verbal hook style
- scene rhythm and pattern interrupt cadence
- thumbnail visual formula
- camera/framing pattern
- caption placement and density
- attention-keeper timing
- CTA structure and funnel stage match
- emotional tone and pacing formula

What replaces the original:

- client brand, product, offer, USP, CTA
- approved logo, colors, fonts, visual assets
- client avatar and voice

The product communicates this as structural remixing, not ownership of original content.

---

## 3. V0 Flow

```
CLIENT WEBSITE / BRAND ASSETS
  ↓
Brand Crawler + Upload Parser
  ↓
Brand Asset Candidates + Messaging Extraction
  ↓
Human Approval (required gate)
  ↓
Creative Brain / Brand Memory
  ↓
BLUEPRINT SELECTION (user decision point)
  ├── A: SELECT EXISTING BLUEPRINT
  │     └── Browse Blueprint Library → Pick saved blueprint → Skip to Formula Derivation
  │
  └── B: EXTRACT FROM VIRAL VIDEO
        ┌──────────────────────────────────────────────────────┐
        │              XPOZ VIRAL DISCOVERY                    │
        │  Video URL + Media URL + Thumbnail + Metrics         │
        │  ↓                                                   │
        │  Viral Candidate Ranking                             │
        └──────────────────────────────────────────────────────┘
        ↓
        Thumbnail Deciphering ←── runs separately from video
        ↓
        Video Blueprint Deciphering (multi-modal)
        ↓
        Raw Scene Blueprint
  ↓ (both paths converge here)
Formula Derivation
  ↓
Director Prompt with [REPLACE] slots
  ↓
Script Tournament (10–20 variants, text only)
  ↓
Top Script + Visual Direction
  ↓
Generation Route Selection
  ├── HeyGen (primary)
  └── Manual approved-media upload/export fallback
  ↓
Generated Video Segments
  ↓
After Effects Web UI: User provides direction → LLM translates → AE stitches + Captions + Brand Polish → MP4
  ↓
White-Label Review Board
  ↓
Approved Video → Content Calendar → Publishing API / Manual Export
  ↓
Audience Test Viewer → Verify Live Post → Notify Success / Escalate Failure
  ↓
Performance Data (retained for V1 export and later Product V2 analysis)
```

**Hand-off rules between stages:**

- Each stage writes a named artifact (see §13). The next stage consumes that artifact explicitly, not implicitly from memory.
- If a stage fails, it must emit a `failed` status with an error code. Downstream stages must not proceed.
- Credit reservation happens before generation starts. Release on any failure. Never capture on failure.

---

## 4. Inputs

### 4.1 Brand Inputs

| Input | Purpose |
|---|---|
| Client website URL | Crawl and extract brand context |
| Logo upload | Approved brand logo for generated video |
| Brand guidelines | Extract brand rules if available |
| Product/service pages | Understand what the brand sells |
| Existing marketing copy | Tone, CTA style, offer language, positioning |
| Product images | Approved visual assets |
| Social links | Active channels and publishing targets |
| Human-approved brand kit | Final source of truth — nothing generates without this |

### 4.2 Xpoz Discovery Inputs

| Xpoz Field | Use |
|---|---|
| Video URL | Source reference and fallback acquisition path |
| Media URL | Preferred processing route |
| Cover image / thumbnail | Separate thumbnail deciphering input |
| Title, description, tags | Metadata pattern and topical signal |
| Duration | Pacing and template length signal |
| Publish time | Recency and trend acceleration signal |
| Views, likes, comments, shares | Engagement baseline |
| Comment-to-like ratio | Conversation trigger signal |
| View velocity | Early momentum signal |

### 4.3 User Creative Inputs

User/client may specify: target product, target audience, funnel stage, platform, video length, avatar type, voice/tone, CTA type, offer, selected blueprint or default formula, single video or variants.

---

## 5. Brand Learning and Creative Brain

### 5.1 Brand Extraction Flow (Firecrawl)

```
Client Website URL
  → Safe URL, scope, robots/policy and source-use attestation
  → Optional user-selected brand type
  → Firecrawl universal pass from Features/Firecrawl/brand-crawl-universal.md
  → Detected vertical evidence from schema.org type and vertical signals
  → One selected or detected vertical pass from Features/Firecrawl/brand-crawl-verticals.md
  → Retain eligible images, screenshots and documents through quarantine and validation
  → Extract universal and vertical brand candidates with evidence
  → Store candidates in brand asset library
  → Human approves final brand kit  ← required gate
  → Approved assets activate in Creative Brain
```

**Human approval is a hard gate.** No video workflow starts until a human has approved the brand kit. Crawling discovers candidates; it does not approve them.

### 5.2 Firecrawl Extraction Scope

| Asset / Signal | Phase 1 Handling |
|---|---|
| Logo, favicon and OG image | Extract through universal `branding`, `images`, metadata and retained asset evidence |
| Product/hero images | Collect from universal and vertical image passes; retain only through rights, quarantine and validation |
| Brand colors | Extract from Firecrawl `branding.colors` and screenshots, then approve by role before production use |
| Fonts and typography | Extract from Firecrawl `branding.typography`; approve licence/source/fallback before production use |
| Page copy/tone | Extract hero copy, CTAs, pain points, testimonials, FAQ, vocabulary and writing style with source evidence |
| Social links | Retain public outbound profile links as publishing/social candidates, never credentials |
| Downloadable files | Brochures, legal documents, price sheets and brand guidelines are collected only when crawl permission allows it |
| Vertical details | Run one vertical group such as real estate, SaaS or healthcare after universal extraction |
| Crawl cost evidence | Retain Firecrawl credit/timing telemetry for operations; it is not approved brand truth |

If a user-selected brand type disagrees with the universal pass detection, the system
retains both as conflict evidence and requires human review. It must not silently override
the selected type or detected type.

### 5.3 Creative Brain / Brand Memory

Stored and referenced by every downstream stage:

| Memory Item | Example |
|---|---|
| Logos | Primary, light, dark |
| Colors | Primary, secondary, accent, background |
| Fonts | Heading, body, fallback |
| USPs | "zero brokerage", "24-hour delivery" |
| Audience | Home buyers, founders, real estate investors |
| Tone | Premium, friendly, direct, educational |
| CTAs | "Book a visit", "DM for pricing" |
| Brand visuals | Approved product/office/founder images |
| Language style | English, Hinglish, regional, premium copy |
| Do-not-use rules | Banned colors, words, claims, competitor references |

Used by: script generation, prompt generation, avatar selection, CTA matching, visual
generation, review checks, calendar captions, and V2-approved successor briefs.

---

## 6. Blueprint Selection

Blueprint Selection is the default first creative step after Brand Memory is approved and appears **before Viral Discovery**. The system must not automatically begin Xpoz discovery. The user first chooses how to source the creative blueprint through a two-option selection area. This is a hard fork in the UI: one path reuses an existing blueprint, while the other discovers a viral video and extracts a new blueprint.

### 6.1 Two Paths

**Path A — Use Existing Blueprint**

The user browses the Blueprint Library, which contains all previously extracted and saved blueprints from past Xpoz candidates. They select one and proceed directly to Formula Derivation (§10). No new video acquisition or deciphering runs.

Use when: a proven structure already exists, a client wants to reuse a high-performing blueprint, or speed matters more than freshness.

**Path B — Extract from Viral Video**

The user selects a new Xpoz candidate. The system runs the full thumbnail deciphering and video blueprint pipeline (§§7–9), derives the formula, and stores the resulting blueprint in the library for future reuse.

Use when: no suitable blueprint exists, the user wants to chase a fresh trend, or the existing library doesn't cover the required niche/format.

### 6.2 Blueprint Selection Flow

```
User begins video creation
  ↓
Default Blueprint Selection area (required before Viral Discovery)
  ├── "Use Existing Blueprint"
  │     → Show Blueprint Library (filterable by niche, format, platform, date)
  │     → User selects blueprint
  │     → Load saved formula_derivation.md + director_prompt.md
  │     → Proceed to Script Tournament
  │
  └── "Discover & Extract New Blueprint"
        → Proceed to Xpoz Viral Discovery (§7)
        → Run full thumbnail + video deciphering pipeline
        → Save resulting blueprint to library
        → Proceed to Script Tournament
```

### 6.3 Blueprint Library Record

Each saved blueprint must store:

| Field | Description |
|---|---|
| Blueprint ID | Unique identifier |
| Source niche/category | Real estate, ecommerce, SaaS, etc. |
| Platform | Reels, Shorts, TikTok-style, etc. |
| Video duration range | Short (0–15s), Medium (15–30s), Long (30s+) |
| Hook type | Problem-agitation, curiosity gap, social proof, etc. |
| Formula slots | Saved formula_derivation.md |
| Director prompt | Saved director_prompt.md with [REPLACE] slots |
| Times used | How many videos generated from this blueprint |
| Performance avg | Aggregate CTR/engagement from videos using it (populated over time) |
| Created date | When the blueprint was extracted |
| Source video flag | Rights/usage warning inherited from original candidate |

### 6.4 Convergence Rule

Both paths must produce an identical input contract for Formula Derivation: a valid `formula_derivation.md` and `director_prompt.md`. Downstream stages do not care which path produced them.

### 6.5 Selection UX and Routing Rules

- Present both choices with equal visual priority so Viral Discovery is an intentional choice, not an automatic default.
- Show a short explanation, expected processing time, freshness, and estimated credit impact for each path.
- Preserve the user's selection in the creation job so refreshes or retries do not silently switch routes.
- If an existing blueprint is unavailable, invalid, or incompatible with the requested platform/length, return the user to the selection area with the reason and recommended filters.
- If viral extraction fails, keep the candidate and failure artifact available; do not silently fall back to an unrelated existing blueprint.

---

## 7. Xpoz Viral Video Discovery

### 7.1 Purpose

Fetches and ranks high-performing content candidates. Phase 1 initial focus: **real estate business accounts**. This defines a clear niche and avoids building a vague generalized trend engine.

### 7.2 Discovery Flow

```
Xpoz API key
  → Query for selected niche/business-account criteria
  → Raw candidate list
  → Filter by performance metrics
  → Ranked viral candidates stored
  → User selects candidate for blueprint extraction
```

### 7.3 Ranking Signals

| Signal | Reason |
|---|---|
| View velocity | Finds videos gaining traction now |
| Shares | Strongest virality signal |
| Comments | Emotional response and conversation depth |
| Comment-to-like ratio | Triggers opinions and questions |
| Engagement ratio | `(likes + comments) / views` — useful composite |
| Duration | Maps to template length |
| Publish recency | Detects fresh trend structures |
| Category/niche | Keeps library relevant to client market |

### 7.4 Viral Candidate Record

Each candidate stored as `viral_video_candidate`:

- source platform, niche/category
- video URL, media URL, cover image/thumbnail URL
- title, description, tags, duration, publish time
- metrics snapshot, ranking score
- rights/usage warning flag
- blueprint status

---

## 8A. Thumbnail Deciphering

### 8A.1 Why It Runs Separately

The thumbnail is not a preview. In short-form content it is the **0th hook layer**. It determines whether the video gets clicked before a single frame plays. Xpoz provides it as a separate field and it must be deciphered before merging with the video blueprint.

### 8A.2 Processing Flow

```
Xpoz Cover Image / Thumbnail URL
  → Download safely
  → Vision analysis
  → OCR
  → Layout + hook analysis
  → Thumbnail blueprint
  → Merge into full video blueprint as 0th hook layer
```

**Failure path:** If thumbnail URL is unreachable, flag candidate as `thumbnail_blocked`. Blueprint can still proceed on video alone but quality score is reduced.

### 8A.3 Signals to Extract

| Signal | Description |
|---|---|
| Main subject | Person, product, property, text card, before/after |
| Face/emotion | Surprise, urgency, authority, curiosity |
| On-image text (OCR) | Words, visual weight, position |
| Text readability | Size, contrast, mobile readability |
| Primary visual promise | What the viewer expects the video to reveal |
| Pattern interrupt | Unusual visual, contrast, expression, or claim |
| Color contrast | Whether the thumbnail pops in a feed |
| Composition | Close-up, split-screen, rule-of-thirds |
| Clickbait risk | Whether the promise appears misleading |
| Replication instruction | How to recreate the structure with new brand content |

### 8A.4 Thumbnail Blueprint Output

```markdown
# Thumbnail Blueprint

## Visual Summary
- Main subject:
- Background:
- Composition:
- Color/contrast:
- Face/emotion:
- Product/brand visibility:

## OCR Text
- Exact text detected:
- Text position:
- Readability score:

## Hook Hypothesis
- What curiosity/problem/promise this thumbnail creates:
- Why it likely drives clicks:
- What must change for the client brand:

## Director Translation
- New thumbnail structure:
- Replacement subject:
- Replacement text:
- Brand colors/assets to use:
- Safe version that avoids copying the original:
```

### 8A.5 Merge Rule

```
Thumbnail / Cover Image = 0th hook layer
0–3s   = playback hook
3–7s   = setup
7–14s  = attention keeper
14s–end = value / CTA
```

---

## 8B. Video Blueprint Deciphering

### 8B.1 Strategy: Combined Multi-Modal

Phase 1 does not rely on metadata alone, frames alone, or transcript alone. All layers are required.

**Decision tree for extraction approach:**

```
Has usable media URL?
  ├── YES → Direct processing pipeline
  └── NO → Has video URL with allowed retrieval?
        ├── YES → Acquire via approved path
        └── NO → Has user-provided upload?
              ├── YES → Use upload
              └── NO → Mark blueprint as BLOCKED; store metadata + thumbnail only
```

### 8B.2 Processing Pipeline

```
Xpoz video URL + media URL + thumbnail
  → Media acquired (see acquisition rule below)
  → PySceneDetect → cut_list.csv
  → faster-whisper → transcript.json (with word timestamps)
  → ffmpeg → key_frames/
      - first frame per scene
      - pre-cut frame per scene
      - optional 1–2s interval frames
  → Vision LLM pass on frame grids + transcript segments
      → layer1_observations.md
  → OCR pass on key frames + thumbnail
      → on_screen_text.md + thumbnail_blueprint.md
  → Merge: metadata + visuals + transcript + OCR + thumbnail
      → raw_blueprint.md
  → LLM Pass 2 → formula_derivation.md
  → LLM Pass 3 → director_prompt.md / heygen_prompt.md
```

**Error propagation:** Any stage producing empty or low-confidence output must set a quality flag (`low_confidence: true`) and the merge step must surface this in the blueprint status rather than silently proceeding.

### 8B.3 Acquisition Priority

1. Xpoz media URL (direct)
2. Xpoz video URL via approved retrieval
3. User-provided upload
4. Internal team manual upload
5. Blocked — store metadata + thumbnail only; mark `blueprint_status: blocked`

### 8B.4 Scene Segmentation

Default creative segments (not technical cut boundaries):

| Segment | Purpose |
|---|---|
| Thumbnail / cover | Pre-click or first-impression hook |
| 0–3s | High-velocity hook |
| 3–7s | Setup / problem / contrast |
| 7–14s | Attention keeper, reveal, pattern interrupt |
| 14s–end | Value delivery, proof, CTA, final memory |

For videos over 30s, add repeating blocks every 3–5s.

### 8B.5 Per-Scene Blueprint Fields

| Field | Description |
|---|---|
| Scene number | Ordered index |
| Start / end / duration | Exact timestamps |
| Formula slot | Hook, Pattern Interrupt, Problem/Contrast, Value Reveal, Attention Keeper, CTA |
| Shot type | Close-up, medium, wide, product, screen recording |
| Camera motion | Static, handheld, push-in, zoom, pan, whip, cut |
| Subject position | Centered, left-third, walking toward camera |
| Lighting | Natural, bright flat, cinematic, warm, luxury |
| Key visual | What creates attention or comprehension |
| Character notes | Expression, posture, gesture, outfit |
| Background | Office, street, property, plain wall, generated scene |
| Spoken line | Transcript segment or replacement goal |
| On-screen text | OCR/caption text and placement |
| Transition | Hard cut, zoom cut, match cut, text pop, B-roll insert |
| Replacement instruction | What the client version must substitute |
| Brand insertion point | Logo/product/USP/CTA placement |

---

## 9. Formula Derivation

Converts raw observations into reusable creative logic. Must answer:

- What made the hook work?
- What changed visually every 2–5 seconds?
- Where was the problem made explicit and the value revealed?
- What prevented mid-roll drop-off?
- Which parts are structurally reusable vs. must be replaced?

### 9.1 Required Formula Slots

| Slot | Timing | Function |
|---|---|---|
| Thumbnail Hook | Before play | Visual promise before video starts |
| High-Velocity Hook | 0–3s | Bold claim or visual surprise; stops scroll |
| Pattern Interrupt | Every 2–5s | Zoom, B-roll, text overlay, new scene, motion shift |
| Problem/Contrast | 3–7s | Pain point, before-state, or gap |
| Value Reveal | 7–14s | Product/service as the resolution |
| Attention Keeper | 7–14s or mid-roll | Secondary surprise to prevent drop-off |
| Caption-First Message | Full video | Each line must work without sound |
| CTA | Final or embedded | Matched to funnel stage and intent level |

### 9.2 Default Fallback Formula

When no source blueprint exists:

1. **0–3s:** Bold claim or question + visual surprise.
2. **Hook variants:** Problem-agitation, curiosity gap, social proof.
3. **Pattern interrupt:** Visual/cut/text/zoom change every 2–5s.
4. **3–7s:** Pain or before-state before product reveal.
5. **7–14s:** Product tied to clear USP; mid-roll interrupt.
6. **Captions:** Every line works as on-screen text.
7. **CTA:** Soft for cold/mid funnel; hard for high-intent retargeting.
8. **Engagement trigger:** Question, resource comment, opinion, tag, or puzzle.
9. **Hook testing:** Keep body/avatar/CTA constant; change only 0–3s.

---

## 10. Prompt System

Three prompt families are required.

### 10.1 Script Prompt

Generates short-form scripts using selected hook formula + Creative Brain data. Produces 10–20 cheap text variants before spending video-generation credits.

**Minimum output per variant:**

```markdown
# Script Variant

## Hook Type
Problem-agitation / curiosity gap / social proof / direct address / visual interrupt

## Target Audience
...

## Script
0–3s:     ...
3–7s:     ...
7–14s:    ...
14s–end:  ...

## Captions
...

## CTA
...

## Visual Notes
...
```

### 10.2 Blueprint Generator Prompt

Purpose: read observations → create scene-by-scene blueprint → separate original content from reusable structure.

Minimum instruction:

```
Analyze the provided metadata, thumbnail analysis, frame observations, OCR text, and transcript.
Create a structured creative blueprint. Do not rewrite the original video. Extract the reusable
structure: timing, shot style, pattern interrupts, spoken function, on-screen text function, CTA
function, and replacement instructions.
```

### 10.3 Director Prompt for Generation

Translates blueprint into production instructions with `[REPLACE]` slots. Describes what to achieve, not what the original video contained.

```
Convert this scene-by-scene analysis into a production prompt document for recreating the video's
structure with new content. For each scene, write a director's note: Shot type → Camera motion →
Subject position → Lighting → Key visual → Spoken line [REPLACE WITH: what the line must achieve]
→ On-screen text [REPLACE WITH: brief description]. Do not describe the original video's content.
```

Example scene output:

```
SCENE 2 | 1.8s → 4.2s | 2.4s

DIRECTOR NOTE:
  Shot:       Tight close-up, eyes directly to camera
  Motion:     Static
  Position:   Subject centered, fills 60% of frame
  Lighting:   Bright flat — native phone-camera feel
  Key visual: Expression shifts neutral → raised eyebrow at the word naming the problem
  Spoken:     [REPLACE: One-sentence viewer pain point, casual, under 8 words, slightly faster]
  Text:       [REPLACE: Same pain point in 3 words max, bottom-third, large bold caps]
  Transition: Hard cut OUT at word boundary
```

---

## 11. Script Tournament

### 11.1 Purpose

Video generation credits are expensive relative to text. Generate and score many script variants first; spend generation credits only on likely winners.

### 11.2 Flow

```
Blueprint (or default formula) + Creative Brain data
  → Generate 10–20 script variants
  → Score variants against checklist
  → Retain top 10–20%
  → Optional human review
  → Generate video only for selected winners
```

### 11.3 Scoring Checklist

| Factor | What to Score |
|---|---|
| Hook strength | Does 0–3s stop the scroll? |
| Hook clarity | Is the promise immediately understood? |
| Visual hook | Does the scene have visual surprise or contrast? |
| Rhythm | Does pacing refresh every 2–5 seconds? |
| USP fit | Is product tied to a real, specific benefit? |
| Caption-first | Does the script work without audio? |
| CTA fit | Does CTA match funnel stage? |
| Engagement trigger | Does it invite comment/share/tag interaction? |
| Brand safety | Avoids misleading claims and off-brand language? |

### 11.4 Hook Testing Rule

When testing hooks: hold script body, avatar, CTA, and offer constant. Change only the opening 3 seconds. Isolated-variable testing only.

---

## 12. Avatar System

### 12.1 Phase 1 Avatar Types

| Type | Description | Handling |
|---|---|---|
| Own AI Avatars | Platform-owned avatars via HeyGen | Default premium option |
| Brand Ambassador Avatars | High-definition, brand-oriented avatars | Paid add-on ~₹5,000; unique avatars quoted separately |
| Custom Real-Life Avatars | Founder, CEO, or creator persona from real person | Contact-us quote; high-price custom service |
| Generic HeyGen Avatars | Built-in generic avatars | Available; discouraged in product copy — generic faces reduce crowd pull |

### 12.2 Brand Ambassador Flow

```
Client selects avatar package
  → Brand description + assets pulled from Creative Brain
  → User picks template direction or requests custom model
  → Avatar generated/configured
  → Audio + visual library stored
  → Avatar reusable in HeyGen generation
```

Delivery promise: 24–48 hours or less depending on complexity.

### 12.3 Custom Real-Life Avatar Rules

- Likeness is not guaranteed to be 100%; target ~90%.
- Consent/permission must be verified before generation starts.
- Route requires a contact-us quote.
- Product copy must state these limits explicitly.

---

## 13. Generation Routes

### 13.1 V0 Selection Logic

```
Is the approved concept compatible with V0's avatar-led route?
  ├── YES → HeyGen
  └── NO → Manual approved-media upload/export fallback
```

Both routes require the same review, rights, lineage, AE composition, billing where
applicable, publishing and verification controls. Google Flow, KlingAI, Higgsfield,
Magnific and other automated generation providers are V1 capabilities, not hidden V0
dependencies.

### 13.2 Route Summary

| Route | Best For | V0 Role |
|---|---|---|
| HeyGen | Avatar-led UGC, talking-head ads, brand ambassador | Required automated provider |
| Approved media upload/export | Concepts outside the HeyGen route or provider outage | Required fallback |
| After Effects | Final stitching, captions, brand polish | Required final layer |

### 13.3 HeyGen Route

```
Brand Inputs + Script / Blueprint
  → Select or create AI avatar model
  → Create background/frame-based images if needed
  → Generate avatar-led video segments
  → Select best segments
  → AE/video designer stitch
  → Final MP4
```

### 13.4 Deferred Automated Routes

Google Flow, KlingAI, Higgsfield, Magnific and equivalent providers are retained only as
V1 product research. V0 must not contain production credentials, provider operations,
cost rules, queues or release gates for them.

---

## 14. After Effects / Video Designer Layer

Handles: clip stitching, captions, logo placement, CTA overlays, brand color insertion, transitions, voice/audio sync, silence trimming, vertical format enforcement, MP4 export, thumbnail export.

The After Effects step is exposed as a guided **web UI**, not as a requirement for the user to operate After Effects directly. The user enters natural-language instructions or selects structured controls such as pacing, caption style, transition intensity, logo placement, CTA treatment, music, and brand polish. An LLM converts that intent, together with the selected blueprint, approved brand kit, generated clips, and template constraints, into a validated timeline JSON and AE execution plan. The AE render worker then fills the approved template, stitches the composition, and exports the result.

### 14.1 Web UI → LLM → AE Flow

```
Generated clips + selected blueprint + approved brand kit
  → After Effects Web UI
  → User enters direction or adjusts structured controls
  → LLM interprets intent against available assets and AE template capabilities
  → LLM produces timeline JSON + change summary
  → Schema, asset, duration, and template validation
  → User sees planned stitch and cost/time impact
  → User confirms
  → AE render worker stitches composition
  → Automated media quality checks
  → Preview returned to Review Board
```

**Interaction rules:**

- The LLM may only reference uploaded/generated assets and supported AE template operations; it must not invent missing files, effects, fonts, or plugins.
- Ambiguous instructions must produce a visible assumption or clarification in the change summary before rendering.
- Every confirmed instruction set creates a versioned AE plan so the user can compare, revise, or roll back without rebuilding upstream generation.
- Validation failures return actionable errors to the web UI and do not start the AE render or consume render credits.
- Revisions should modify the existing timeline plan when possible instead of regenerating all video segments.

### 14.2 AE Template Placeholders

```
HOOK_TEXT | LOGO | CLIP_01 | CLIP_02 | CLIP_03
CTA_TEXT | BRAND_COLOR_PRIMARY | BRAND_COLOR_SECONDARY
CAPTION_STYLE | THUMBNAIL_TEXT | BACKGROUND_ASSET
```

### 14.3 Timeline JSON (AI → AE)

```json
{
  "format": "9:16",
  "duration_seconds": 30,
  "brand": {
    "logo": "approved_logo_url",
    "primary_color": "#...",
    "caption_style": "bold bottom-third"
  },
  "scenes": [
    {
      "scene": 1,
      "start": 0,
      "end": 3,
      "clip": "clip_01.mp4",
      "caption": "...",
      "overlay": "...",
      "transition_out": "hard_cut"
    }
  ]
}
```

AE scripting or a backend render worker fills placeholders and exports.

### 14.4 AE Plan Validation

Before rendering, verify that every referenced clip and asset exists, scene times do not overlap incorrectly, total duration matches the requested format, fonts/plugins are available, captions remain inside mobile-safe zones, and all effects belong to the template's supported capability list. The validated plan and the final render must retain the same version ID for traceability.

---

## 15. Review Board

Videos never go directly from generation to publishing.

### 15.1 Review Flow

```
Generated video
  → Internal review
  → Client review board
  → Requested edits OR approval
  → Final approval → Calendar scheduling
```

### 15.2 Required Features

| Feature | Phase 1 |
|---|---|
| Video preview | Required |
| Thumbnail preview | Required |
| Caption/script view | Required |
| Approve video | Required |
| Request changes | Required |
| Approve calendar batch | Required |
| White-label workspace | Required |
| Version history | Recommended |
| Comment thread | Recommended |

---

## 16. Content Calendar and Publishing

### 16.1 Calendar Flow

```
Approved video
  → Calendar draft
  → Platform selection
  → Caption + hashtags + thumbnail assigned
  → Schedule date/time
  → Publish via API where available
  → Fallback: manual download if API unavailable
  → On API publish success, queue Audience Test Viewer
  → Open the returned public post URL as an audience member
  → Verify post identity, visibility, media, and publication state
  → VERIFIED → Mark published_verified + send "Posting completed" notification
  → NOT FOUND / INCOMPLETE → Retry with backoff
  → RETRIES EXHAUSTED → Mark verification_failed + notify Admin/Client Manager
```

The publishing API response is not sufficient proof that a post is actually visible. The Audience Test Viewer is a separate verification step that checks the public or audience-facing result after publishing.

### 16.2 Audience Test Viewer

The viewer runs with the least-privileged audience context supported by the platform and verifies:

| Check | Required Result |
|---|---|
| Public post URL resolves | Post can be opened without an author-only draft context |
| Platform post ID | Matches the ID returned by the publishing integration |
| Account identity | Post belongs to the intended client account/page/channel |
| Media identity | Expected video or stable media fingerprint is present |
| Caption/title | Matches the scheduled content within platform transformations |
| Visibility state | Published and audience-viewable, not draft, processing, restricted, or deleted |
| Publish timing | Actual publish timestamp is within the accepted schedule window |

**OODA verification loop:**

1. **Observe:** Read the publish response, then inspect the audience-facing post.
2. **Orient:** Compare platform state against the expected `calendar_post` record and account context.
3. **Decide:** Mark verified, wait because the platform is still processing, retry, or escalate a mismatch.
4. **Act:** Update status, store evidence, and send the appropriate notification.

Use bounded retries with exponential backoff because platforms may acknowledge a post before media processing or public propagation is complete. A suggested Phase 1 policy is immediate verification, then retries at 1, 3, 7, and 15 minutes. The retry policy must be configurable per platform.

For manual-export publishing, the system cannot automatically claim success. The Client Manager, Admin or Owner must provide the live post URL; the Audience Test Viewer then runs the same verification before sending a completion notification.

### 16.3 Publishing Integration Priority

Build in this order:

1. **Facebook Pages + Instagram** — high demand, official APIs; Meta app review is slow; start here.
2. **YouTube / Shorts** — strong API; enforce ~3 uploads/day/client until quota strategy is confirmed.
3. **Threads** — rides Meta integration path.
4. **Pinterest** — strong for real estate, ecommerce, lifestyle.
5. **X** — feasible but paid per post; cost model must be confirmed.
6. **TikTok** — valuable; requires TikTok Direct Post audit approval before building.
7. **LinkedIn** — add once business use case and review path are confirmed.

**Second-order reality:** YouTube quota limits and TikTok audit delays are not edge cases — they directly constrain how many clients can be served and when. Calendar capacity projections must account for these before the platform is sold.

### 16.4 Calendar Record Schema

- video file URL, thumbnail URL, title/caption, hashtags
- platform(s), scheduled time, publish status, approval status
- reviewer, client, source blueprint ID, generated variant ID, credit spend ID
- platform post ID, public post URL, API publish response timestamp
- verification status, verification attempts, last verification time, verified time
- verification evidence reference, mismatch/error code, notification status

### 16.5 Posting Notifications

- Send success only after `published_verified`, never solely from an API acceptance response.
- Success message: posting completed, platform/account, actual publish time, and public post link.
- Processing message: posting accepted but audience visibility is still being verified.
- Failure message: verification failed, reason, attempts made, post link if available, and required Admin or Client Manager action.
- Notification delivery must be idempotent so retries do not send duplicate completion messages.

---

## 17. Credit System and Billing

### 17.1 Access Model

Monthly retainer covers: brand learning, Creative Brain, Sakhaa Forge access, white-label review boards, AI explanations, and future successor features.

Creator Credits cover V0 variable production costs: LLM tokens, HeyGen, media processing,
AE rendering and explicitly priced publishing-related operations. New provider cost
types require a V1 price-version migration.

### 17.2 Pricing Rule

Charge credits at **1.25× of underlying API cost** for generation routes. Cost ceiling per job must be set and surfaced to the user before confirmation.

### 17.3 Billing Providers

| Region | Provider |
|---|---|
| Indian clients | Razorpay |
| International clients | Stripe |

### 17.4 Idempotency Requirement

All credit operations must be idempotent. Prevents double charging, double deduction, duplicate billing on retry, and webhook duplication.

**Credit ledger events:**

| Event | Description |
|---|---|
| `credit_purchase_initiated` | User starts payment |
| `credit_purchase_success` | Payment confirmed |
| `credit_purchase_failed` | Payment failed |
| `generation_credit_reserved` | Credits reserved before job starts |
| `generation_credit_captured` | Credits charged after successful job |
| `generation_credit_released` | Credits returned on job failure |
| `generation_credit_adjusted` | Manual/admin correction |

### 17.5 Credit Spend Flow

```
User selects generation route
  → Estimate credit cost (shown to user)
  → User confirms
  → Reserve credits (idempotency key)
  → Run generation job
  → SUCCESS → Capture credits
  → FAILURE → Release credits (or partial charge only if policy explicitly allows)
  → Attach credit spend record to generated asset
```

---

## 18. Future V1-to-V2 Handoff / Successor Execution

V0 builds complete internal lineage but does not require V2 integration. Product
V1 stabilizes the export and brief contracts. Product V2 Sakhaa owns analytical scoring,
recommendation logic, fatigue/winner evaluation, calibration, and learned successor
decisions. The V1 production engine executes an approved V2 generation brief through its existing
brand, rights, credit, generation, review, and publishing controls.

### 18.1 Flow

```
Published creative
  → V0 records publication identity and performance source data
  → V1 exports immutable revision lineage and outcomes to Product V2
  → V2 scores evidence, uncertainty, fatigue, and winning patterns
  → Human accepts or edits a V2 recommendation
  → V2 emits a versioned generation brief
  → V1 validates and generates the approved successor
```

### 18.2 Trigger Conditions

| V2 signal | V1 production-engine action |
|---|---|
| Approved fatigue recommendation | Generate the approved refreshed variant set |
| Approved hook or thumbnail recommendation | Apply the exact versioned change |
| Approved winner-adjacent recommendation | Hold specified factors constant |
| Rejected, low-confidence, or unapproved recommendation | Do not generate |

---

## 19. Data Model

### 19.1 Core Entities

| Entity | Purpose |
|---|---|
| `clients` | Brand owner account |
| `brand_profiles` | Tone, USP, audience, CTA, assets summary |
| `brand_assets` | Approved logos, colors, fonts, images, guidelines |
| `viral_video_candidates` | Xpoz-discovered videos with metrics |
| `thumbnail_blueprints` | Deciphered cover image structures |
| `video_blueprints` | Scene-by-scene structural blueprints |
| `script_variants` | Generated text variants pre-video |
| `generation_jobs` | HeyGen generation jobs and approved manual-fallback lineage |
| `generated_assets` | Final/partial videos, clips, thumbnails, captions |
| `avatar_models` | Own, brand ambassador, custom, generic |
| `credit_wallets` | Client credit balance |
| `credit_ledger` | Purchase/reserve/capture/release records |
| `review_items` | Videos pending approval |
| `calendar_posts` | Approved posts scheduled for publishing |
| `post_verifications` | Audience-view checks, attempts, evidence, and final verification result |
| `notifications` | Idempotent posting success, processing, and failure notifications |
| `performance_snapshots` | CTR, ROAS, frequency, comments, shares |
| `successor_variants` | V1 outputs generated from approved V2 briefs |

### 19.2 Key Relationships

```
Client
  → Brand Profile → Brand Assets → Avatar Models
  → Script Variants → Generation Jobs → Generated Assets
  → Review Items → Calendar Posts → Performance Snapshots → Successor Variants

Viral Video Candidate
  → Thumbnail Blueprint
  → Video Blueprint → Formula Derivation → Director Prompt
  → Script Variants → Generated Assets
```

### 19.3 Status Enums

**Blueprint Status:**
`pending` → `media_acquired` → `thumbnail_deciphered` → `scene_detection_done` → `transcript_done` → `vision_done` → `ocr_done` → `merged` → `formula_done` → `director_prompt_done`
Terminal: `failed` | `blocked`

**Generation Job Status:**
`draft` → `estimating_credits` → `credits_reserved` → `queued` → `generating` → `generated` → `ae_planning` → `ae_plan_validated` → `ae_stitching` → `ready_for_review` → `approved` → `scheduled` → `publishing` → `published_unverified` → `published_verified`
Terminal: `failed` | `cancelled`

**Review Status:**
`internal_review` → `client_review` → `change_requested` | `approved` | `rejected` | `archived`

**Post Verification Status:**
`pending` → `checking` → `processing_wait` → `retry_scheduled` → `verified`
Terminal: `verification_failed` | `identity_mismatch` | `visibility_restricted` | `manual_url_required`

---

## 20. Service Architecture

### 20.1 Phase 1 Services

| Service | Responsibility |
|---|---|
| Brand Ingestion Service | Crawl and parse brand assets/context |
| Xpoz Discovery Service | Fetch and rank viral candidates |
| Thumbnail Analysis Service | Vision analysis, OCR, hook extraction |
| Video Processing Worker | Scene detection, audio extraction, keyframes |
| Transcription Worker | faster-whisper with word timestamps |
| Vision Blueprint Worker | Vision LLM scene descriptions |
| Blueprint Merge Service | Merge metadata, thumbnail, OCR, transcript, vision |
| Formula Derivation Service | Raw blueprint → reusable creative formula |
| Prompt Generation Service | Director notes and generation prompts |
| Script Tournament Service | Generate, score, filter script variants |
| Generation Orchestrator | Submit and reconcile HeyGen jobs; record manual fallback |
| AE Plan Service | Convert web UI instructions into versioned, validated timeline JSON |
| AE Render/Stitch Service | Template fill, stitching, captions, export |
| Review Board Service | Approval workflow |
| Calendar Service | Scheduling and publishing |
| Audience Test Viewer Service | Verify the live audience-facing post after publishing |
| Notification Service | Send idempotent posting success, processing, and failure notifications |
| Billing/Credit Service | Wallet, reserve/capture/release, payments |
| Future V2 Integration Module | V1 export of lineage/outcomes and execution of approved V2 briefs |

### 20.2 Job Queue Pattern

Video generation is not synchronous. Use async jobs with status tracking.

```
POST /generation-jobs
  → Create job record (status: draft)
  → Reserve credits (status: credits_reserved)
  → Queue job
  → Worker processes
  → Store output (status: generated)
  → Capture or release credits
  → Notify review board (status: ready_for_review)
```

**Cost ceiling check:** If estimated cost exceeds configured threshold, hold and notify rather than auto-queue.

---

## 21. Generated Artifacts Per Video Candidate

```
metadata.json
thumbnail_blueprint.md
cut_list.csv
transcript.json
key_frames/
layer1_observations.md
on_screen_text.md
raw_blueprint.md
formula_derivation.md
director_prompt.md
script_variants.json
selected_script.md
generation_job.json
final_video.mp4
calendar_post.json
post_verification.json
```

---

## 22. Quality Gates

### Blueprint
Must include: thumbnail analysis, metadata summary, scene timings, visual descriptions, transcript segments, OCR text, formula slot mapping, replacement instructions, director notes, CTA identification. Missing any → `quality_flag: incomplete`.

### Script
Must pass: hook clear within 0–3s, captions work without audio, USP is specific, CTA matches funnel stage, brand tone preserved, no unsupported claims, visuals change every 2–5s, engagement trigger present when applicable.

### Generated Video
Must pass: 9:16 format for Reels/Shorts, captions readable on mobile, logo/brand usage approved, avatar matches selected route, CTA visible or spoken clearly, audio and captions synced, thumbnail/first frame matches hook, no source video assets reused without permission, routed through review before publishing.

### Published Post
Must pass: intended platform account, matching platform post ID, audience-facing URL resolves, expected video is present, caption/title materially matches, post is not draft or still processing, and publish time is within the accepted window. Only then may the calendar record become `published_verified` and the system send the posting-completed notification.

---

## 23. Risks and Controls

| Risk | Control |
|---|---|
| Copying original video too closely | Director abstraction and `[REPLACE]` tags; never reuse original footage |
| Using unapproved brand assets | Hard gate: human approval before Creative Brain activates |
| Wasting credits on weak variants | Script tournament before video generation |
| Duplicate credit charges | Idempotent reserve/capture/release ledger |
| Generic avatar underperformance | Position as lower-preference; push brand/own avatars |
| API publishing blocked | Manual export fallback required |
| Publishing API reports success but post is not visible | Audience Test Viewer verifies independently before success notification |
| Platform propagation is delayed | Configurable bounded retries with exponential backoff |
| Wrong account or media is published | Verify account, platform post ID, media identity, and caption before confirmation |
| Duplicate posting notifications | Idempotency key per calendar post + notification type |
| YouTube quota constraints | Default to ~3 uploads/day/client; plan scaling explicitly |
| Misleading thumbnail or claim | Clickbait/claim risk checks in thumbnail and script review |
| Transcription failure producing empty blueprint | `low_confidence` flag; surface to Client Manager/Admin, do not silently proceed |
| Vision LLM hallucination in scene analysis | Cross-reference with transcript timestamps; flag conflicts |
| Cost overrun on LLM/generation calls | Per-job cost ceiling with hold-and-notify before auto-queue |

---

## 24. Build Order

1. Brand profile + asset approval system (Firecrawl universal/vertical crawl, upload, Creative Brain storage)
2. Default Blueprint Selection area (existing Blueprint Library or viral extraction path)
3. Xpoz viral candidate ingestion (fetch, rank, Trending Content Library)
4. Thumbnail deciphering (download, vision, OCR, director translation)
5. Video blueprint engine (acquisition, scene detection, transcription, keyframes, vision, OCR, merge)
6. Formula derivation + director prompt (`[REPLACE]` tags)
7. Script tournament (generate, score, retain top 10–20%)
8. HeyGen primary generation route (avatar selection, script → video)
9. AE web UI + LLM plan service + AE stitch layer (validate, caption, brand, export)
10. Credits and billing (wallet, ledger, Razorpay/Stripe, reserve/capture/release)
11. Review board (preview, approve, request changes, batch calendar approval)
12. Calendar MVP (Instagram/Facebook first; YouTube/Shorts second with quota limits; manual export fallback)
13. Audience Test Viewer + posting notifications (verify live post before confirming completion)
14. Export-ready lineage and outcome records; V1 later adds signed delivery and
    approved-brief execution

---

## 25. Product V0 vs Product V1 Capabilities

### Product V0 Delivers
Brand learning, Creative Brain, default Blueprint Selection, Xpoz ingestion, thumbnail deciphering, multi-modal blueprint, default script fallback, script tournament, HeyGen primary route, avatar selection, AE web UI with LLM-directed stitching, Creator Credits, Razorpay/Stripe billing, white-label review board, calendar scheduling, audience-facing post verification, and posting completion notifications.

### Product V0 Prepares For
Template clustering at scale, broader platform publishing, automated A/B testing, and
deeper Product V2 recommendation integration. These production improvements form Product
V1 and remain part of the Sakhaa Forge product line.

### Named Gaps (Deferred)
- Product V2 successor intelligence is outside V0. V0 only retains complete lineage.
  Stable export and approved-brief integration are introduced in V1.
- TikTok Direct Post requires platform audit approval before integration can begin.
- Template clustering requires enough blueprint volume to be statistically useful.

---

*The V0 output is a production system, not a single video. Every component — thumbnail hook, blueprint, script tournament, generation route, AE polish, review workflow, calendar, credit ledger — is part of the same pipeline. None is optional.*
