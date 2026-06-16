## Deciphering Videos from [[Viral video finder]] into Usable Blueprints

 Branch 4  selected: 

**Branch 1 — Pure metadata analysis (no video processing)**  
Use only what comes with the video record: title, description, tags, duration, category, engagement ratio, publish time. Once data is pulled, parse the JSON and extract: Title, tags, description... Engagement ratio = (likes + comments) / views. _What this gives you:_ topic/niche signals, title-phrasing patterns, optimal length/timing data. _What it misses:_ the actual visual/structural blueprint — the hook timing, pattern-interrupt cadence, shot composition that you need for a HeyGen prompt. _Verdict:_ necessary but not sufficient — covers buckets 1-3's _topical_ targeting but not bucket 4's _structural_ blueprint. [Medium](https://medium.com/@jagadish_akiri/how-i-analyzed-youtube-trends-using-python-youtube-api-a-data-project-walkthrough-e8fb4ddc0159)

**Branch 2 — Frame-sampling + vision-LLM scene description**  
Download the video (legitimately, per chosen acquisition option) → extract frames at regular intervals (e.g., every 1-2 seconds, or at detected cut points) → feed frame sequence to a vision-capable LLM with a prompt asking it to describe: shot type, framing, lighting, on-screen text, scene changes, estimated cut timing. _Output format:_ exactly the markdown blueprint structure you described in your earlier message (Scenery, Lighting, Shot framing/motion, Character description, Action). _Pro:_ this directly produces HeyGen/Higgsfield-ready prompt material — vision LLMs are good at this kind of structured visual description. _Con:_ requires the video file itself (not just metadata) and per-video LLM vision calls (cost scales with volume).

**Branch 3 — Audio transcript + caption-timing analysis**  
Extract the spoken/caption track → transcribe (if not already captioned) → align timestamps to identify: hook line (0-3s), where the "reveal" happens, CTA placement and exact wording. _Output:_ the verbal-hook and CTA-language components of the blueprint, with precise timing — directly maps to the "High-Velocity Hook" / "Attention Keeper" / CTA slots in your formula from earlier. _Pro:_ cheap (text-only LLM, no vision needed), directly fills the script-template variables. _Con:_ misses the visual-hook layer entirely (a strong verbal hook paired with a static frame won't replicate a video whose hook _is_ a visual surprise).

**Branch 4 — Combined multi-modal blueprint (recommended synthesis)**  
Run 1 + 2 + 3 together per video, output a single structured document per video with sections matching exactly what you specified: a timeline broken into segments (0-3s, 3-7s, 7-14s, 14s-end), each segment annotated with: visual description (from Branch 2), spoken/caption text (from Branch 3), shot type/camera motion, and a tag for which "formula slot" it fills (Hook / Pattern-Interrupt / Problem-Contrast / Attention-Keeper / CTA). Metadata (Branch 1) attaches at the document level (niche, engagement ratio, source bucket).

This combined document _is_ the blueprint — and it's directly usable as a HeyGen/Higgsfield prompt template by substitution: keep the timeline structure, shot types, and pacing fixed; swap the visual subject (your avatar/product), spoken lines (your USP-filled script from the brand profile), and on-screen text (your CTA language) into each timestamped slot.

**Branch 5 — Clustering blueprints into a template library (the bucket-4 payoff)**  
Once you have many Branch-4 documents, cluster them by structural similarity (same segment-timing pattern, same shot-type sequence) rather than by topic. Clusters that recur across many _different-topic_ videos are your genuine "Template-Type" formats — these become the reusable entries in your structural template library from Part 1, each backed by multiple real examples rather than a single guess.

Decided:
**Recommendation: Branch 4 for per-video processing, Branch 5 for building the lasting template library.** This is also where Part 2's "3c" (detecting accelerating structural patterns) becomes concrete: if Branch 5's clustering shows a structural cluster's member-count growing fast over a rolling window, that's your early-trend signal — derived entirely from your own deciphering pipeline, not from any platform's "trending" label.
