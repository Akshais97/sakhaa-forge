# Brand Extractor using Crawl4AI

## Goal

Use Crawl4AI as a **brand website ingestion engine** to crawl a client website and extract first-pass brand assets and marketing context for digital marketing workflows.
There will be a seperate option for Clients to Upload Brand assets as well if needed, like a brand logo, brand guidelines document, etc, that we will use. 

## What Crawl4AI Can Extract

| Asset / Signal                     |                        Can Crawl4AI help? | Implementation Notes                                                                      |
| ---------------------------------- | ----------------------------------------: | ----------------------------------------------------------------------------------------- |
| Logo images                        |                                       Yes | Extract image URLs and filter by filename, alt text, class names, and placement.          |
| Favicon / app icons                |                                       Yes | Parse `<link rel="icon">`, Apple touch icons, and manifest files.                         |
| Website images                     |                                       Yes | Extract images from crawled pages for review and asset selection.                         |
| Product images                     |                                       Yes | Crawl product/service pages and collect image candidates.                                 |
| Hero banners                       |                                       Yes | Use media extraction and screenshots to identify major visual sections.                   |
| Brand colors                       | Partly, so we do it with a different code | Crawl4AI can collect CSS/screenshots, but **we must build color extraction ourselves**.   |
| Fonts                              | Partly, so we do it with a different code | Crawl4AI can collect CSS/font references, but **we must build font detection ourselves**. |
| Page copy / tone of voice          |                                       Yes | Extract Markdown/HTML and summarize messaging, positioning, offers, and CTAs.             |
| Social links                       |                                       Yes | Extract external links to Instagram, Facebook, LinkedIn, YouTube, Threads, etc.           |
| Screenshots                        |                                       Yes | Capture page screenshots for visual review and creative analysis.                         |
| Downloadable files                 |                                       Yes | Can download files if download handling is enabled.                                       |
| Official brand guideline detection |                                    Partly | Crawl4AI can find likely pages/files, but **we must build verification ourselves**.       |


## Workflow

```text
Client Website URL
→ Crawl homepage, about, product, service, blog, and contact pages
→ Extract HTML, Markdown, media, links, metadata, and screenshots
→ Filter likely brand assets
→ Detect logo, colors, fonts, copy style, CTAs, and social links
→ Store candidates in brand asset library
→ Human reviews and approves final brand kit
→ Use approved assets in content calendars, ads, landing pages, and video workflows
```

    

## Important Constraint

Crawl4AI should be used to **discover and extract candidates**, not to blindly reuse assets. Final brand assets must go through **human approval, permission checks** before use. 
