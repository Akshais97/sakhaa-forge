# Brand assets component preview design

## Decision

Create one in-app review route composed only of source components intended for later production reuse. Do not integrate the preview with the live Approved Brand Profile Constructor, mutate brand data, or simulate successful storage/approval operations.

## Owning V0 scope

- V0-F3 private artifact retention and authorized access
- V0-B2/B2A candidate review and retained asset evidence
- V0-B3 exact approved brand truth
- Durable brand asset route contract: `/brands/{id}/assets`

## Reusable components

### `LiquidEtherBackground`

An adapted ReactBits Liquid Ether visual layer, loaded only in the browser. It is decorative, `aria-hidden`, non-blocking, and never owns content or workflow state. It uses a static gradient when reduced motion is requested or WebGL is unavailable. The full effect is suspended when off-screen.

### `BrandIntakeStepDeck`

A controlled wizard shell derived from the ReactBits Stepper interaction model. The application owns the active step and completion rules. Completed cards can advance through the Next action or an intentional horizontal swipe. Incomplete or saving steps cannot be bypassed by a gesture. Keyboard and screen-reader navigation remain button based.

### `MagneticNextCue`

An adapted ReactBits Magnet cue around the canonical Next button. Pointer proximity may pull the decorative halo and button by a bounded distance. It does not auto-advance, imply completion, or replace the visible label. It is disabled for touch, reduced motion, disabled actions, and saving states.

### `SecureArtifactThumbnail`

A stateful media boundary for private assets. Production integration will accept an opaque artifact reference, authorize a short-lived download, attach the signed URL only to the media element, and support loading, ready, unavailable, expired/retrying, rejected, and removed states. The preview uses local deterministic placeholders and never invents a signed URL.

### `AcquiredBrandAssetsCupboard`

A compact centered asset library with horizontally scrollable shelf rows. Each row retains asset identity, category, provenance, acquisition state, rights state, and available actions. Add and remove controls are explicit; removal requires confirmation in production and must preserve evidence according to the owning retention contract. Horizontal scrolling supplements rather than replaces keyboard-accessible controls.

## Composition

The preview route shows the Liquid Ether background behind one active step card. The card demonstrates the Acquired Brand Assets step with the cupboard component and its secure-thumbnail states. The magnetic Next cue appears only when the example step is eligible to advance. A small state switcher exercises ready, loading, unavailable, and reduced-motion presentations without writing server state.

## Excluded alternatives

- ReactBits Stack is not used because its internal card reordering does not map cleanly to server-validated workflow progression.
- Card Swap is not used because it adds GSAP and automatic transitions that could falsely imply completion.
- ReactBits Pro blocks are not required.
- No diagram, marketing mockup, or separate visual-only component is produced.

## Accessibility and performance constraints

- All workflow actions are native buttons with visible focus.
- Swipe is optional enhancement; every transition has a keyboard equivalent.
- Status is conveyed by text and icon, not color alone.
- The cupboard has an accessible name and preserves logical DOM order.
- Reduced motion removes pointer pull, card translation, and fluid animation.
- The WebGL background is dynamically loaded, decorative, and isolated from input handling.
- The preview must remain usable when WebGL initialization fails.

## Review boundary

Approval of the preview confirms component direction only. It does not accept the RCA fixes, API changes, B2 integration, deletion semantics, or the V0 slice. Those require the subsequent implementation plan, public-behaviour tests, generated contracts, and fresh verification.
