# Accessibility and performance guardrails

## Accessibility

- WCAG 2.2 AA is the floor.
- Body text contrast must be at least 4.5:1.
- UI components and status indicators must be at least 3:1.
- Status is never colour-only: label, icon and shape are required.
- Focus is visible and not obscured by sticky shell elements.
- Media controls are keyboard operable and captions default on where captions exist.
- Every form input has a label and field errors use programmatic descriptions.
- Route changes move focus to the page heading.

## Performance

- Use server-rendered read surfaces where possible.
- Client boundaries are reserved for mutation, media, forms and live job state.
- Avoid heavy decorative effects in authenticated app surfaces.
- Lazy-load media previews and large generated imagery.
- No layout shift from hero imagery, 9:16 players, tables or cards.
- Signed URL refresh is internal to media components and never logged or surfaced.

## Impeccable-derived quality bar

- Avoid nested cards, decorative glassmorphism, over-rounded product surfaces, gradient text, fake metric heroes and repeated section-eyebrow scaffolding.
- Test mobile widths for text overflow and action target size.

