# Design colour reference intake

**Status:** reference-only input for `../DESIGN.md`  
**Source evidence:** `../../../trypencil_design_extraction/DESIGN_colors.md` and
`references for only design and not TEXT/`  
**Applies to:** landing-page visual exploration and carefully adapted application details

The extracted reference palette uses a bright yellow primary (`#FFF310`), amber secondary
(`#F8B133`), white surface (`#FFFFFF`) and near-black text (`#0C0B02`). This creates a
high-energy, high-contrast creative-tool feel. It can fit the V0 landing page as a visual
influence, but it does not replace the authoritative V0 application palette, state system,
money system or accessibility rules in `../DESIGN.md`.

## Adaptation rules

- Landing page surfaces may borrow the reference energy through high contrast, disciplined
  yellow/amber accents, clear grid rhythm, tight radii and confident type scale.
- Authenticated V0 application surfaces continue to use the Studio Instrument system in
  `../DESIGN.md`: warm-neutral graphite, Iris primary, Ember creative accent and the
  canonical status palette.
- Yellow and amber from the reference must not be used as success, warning, money or
  provider-status semantics unless `../DESIGN.md` defines that semantic token.
- Do not use reference-site copy, labels, product claims, IA or workflow behaviour. User-facing
  language comes from `PROJECT_CONTENT_AND_LANGUAGE_GUIDE.md` and V0 contracts.
- Any imported visual treatment must meet WCAG 2.2 AA contrast, reduced-motion, focus,
  keyboard and target-size requirements before use.
- Any token adoption requires updating `../DESIGN.md` and generated design-token sources in
  the same change.

## Recommended use

Use the reference colors as inspiration for landing-page emphasis and marketing composition,
not as raw tokens in product code. When a visual idea proves useful for V0, translate it into
semantic tokens and component rules owned by `../DESIGN.md`.
