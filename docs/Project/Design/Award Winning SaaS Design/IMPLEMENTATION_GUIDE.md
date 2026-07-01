# Implementation guide

No frontend is implemented by this guide.

## Next.js and TypeScript guidance

- Use generated `/api/v0` clients only.
- Keep read surfaces server-rendered where possible.
- Use explicit client components for forms, media, live jobs and mutations.
- Do not duplicate transport types by hand.
- Use semantic CSS variables from design tokens.
- No arbitrary hex or off-scale spacing in components.
- No optimistic UI for paid, publishing, schedule, approval or verification actions.
- Media components own signed URL refresh and never expose URLs in copy, attributes or analytics.

## Verification guidance

Future frontend work must verify:

- route-level accessibility;
- mobile text fit;
- keyboard path;
- reduced motion;
- no secrets or signed URLs in DOM;
- generated status mapping coverage;
- Playwright screenshots for critical screens.

