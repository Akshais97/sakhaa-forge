# V0 changelog

## Unreleased

- `V0-F3`, `V0-B2`, `V0-B2A`, `V0-B3`: repaired generated-client brand
  decisions and approval, resolved private artifact thumbnails through authorised
  short-lived downloads, normalised branding locators, and added the acquired-assets
  review card. This entry records verified behaviour only and does not mark the slices
  accepted.
- `V0-B1`, `V0-B2A`, `V0-B3`, `V0-F3`: added the workspace-owned `Brand` aggregate and
  brand foreign keys for crawl runs, candidates, assets and approved profiles. Brand
  crawls now resolve a stable recognizable identity, and authorised clients can list
  workspace brands and retrieve clean assets by `brandId`.
- `V0-F3`: browser uploads now send real bytes to private object storage before completion.
  Completion verifies the retained SHA-256 and byte size, promotes quarantine objects to
  clean media, and rejects declaration-only completion. B2 is required outside local/test;
  the filesystem adapter remains a deterministic local/test simulator.
