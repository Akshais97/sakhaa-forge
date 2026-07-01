# Open Design research

Repository studied: https://github.com/nexu-io/open-design.

## What was useful

- Plugin/scenario structure: Open Design treats design artifacts as typed, repeatable recipes with inputs, skills, assets and generated output.
- The `open-design-landing` example demonstrates a separate template folder with an HTML preview, asset manifest, image prompts, plugin metadata and skill instructions.
- The useful design-system idea is not to copy the page wholesale, but to preserve a portable design recipe: source inputs, visual language, assets, composer behaviour and verification checklist.
- The existing vendored template in this repo already contains `example.html`, `open-design.json`, `SKILL.md` and assets under `docs/Project/Design/templates/open-design-landing/`.

## Useful patterns for Sakhaa Forge

- Treat future landing pages as generated from a design spec and content contract, not as ad hoc pages.
- Keep template inspirations isolated under `docs/Project/Design/templates/`.
- Require attribution and license notes for any copied Open Design file.
- Use a self-check list before adopting any template pattern: contrast, responsive behaviour, no broken assets, reduced motion and no copy leakage.

## What not to copy

- Open Design's own marketing text, IA, section labels and product claims.
- Editorial collage aesthetics as a replacement for Sakhaa Forge's Studio Instrument system.
- Template scripts into product runtime without a V0 implementation plan and license review.

## License note

The local `open-design-landing/open-design.json` declares the example template license as MIT and author as Open Design / nexu-io. The Open Design repository page presents the broader repository as Apache-2.0. Preserve source license files and attribution when copying any additional files.

