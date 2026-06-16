Video Script Prompt based on the script:
#### The replicable formula for Virality and Engagement(synthesized from above, written as a checklist for your script template):
1. **High-Velocity Hook (0–3s)**: bold claim or question, paired with a visual surprise. Write 3 separate hook angles per script (problem-agitation, curiosity gap, social proof) — these become A/B variants. A problem-lead hook, a social proof-lead hook, and a visual or pattern-interrupt hook.
2. **Pattern Interrupt cadence**: scripted visual/cut change every 3-5 seconds — zoom, B-roll, text overlay, scene cut.
3. **Problem/Contrast block**: state the pain point or "before" state explicitly before the product appears.
4. **Value Reveal**: product as the resolution, tied directly to a USP.
5. **Attention Keeper mid-roll**: a secondary pattern interrupt around the 7-14s mark to prevent mid-video drop-off — this is the "Attention Keeper" you named.
6. **Caption-first writing**: every line must work as on-screen text alone, sound-off.
7. **CTA matched to funnel stage**: soft CTA ("see if it works for you") for cold/mid-funnel, hard CTA ("shop now") for high-intent retargeting.

Video Reading BluePrint Generator Prompt based on Hook

Video Generating Prompt for HeyGen:
"Convert this scene-by-scene video analysis into a production prompt document for recreating the video's structure with new content. For each scene, write a director's note in the format: Shot type → Camera motion → Subject position → Lighting → Key visual element → Spoken line (mark as [REPLACE WITH: brief description of what line should achieve]) → On-screen text (mark as [REPLACE WITH: brief description]). Do not describe the original video's content — describe what the _director would ask for_ to achieve the same effect."

Output per scene looks like this:
SCENE 2 | 1.8s → 4.2s | 2.4s

DIRECTOR NOTE:
  Shot:       Tight close-up on subject's face, eyes directly to camera
  Motion:     Static — no camera movement
  Position:   Subject centered, fills 60% of frame
  Lighting:   Bright flat — no shadows — feels "phone camera in good light"
  Key visual: Subject's expression shifts from neutral to slightly raised eyebrow
              at the 1s mark — this is timed to the word [REPLACE: the word that
              names the problem your product solves]
  Spoken:     [REPLACE: One-sentence statement of the viewer's pain point,
               delivered in casual first-person, under 8 words, slightly
               faster than normal speech pace]
  Text:       [REPLACE: same pain point in 3 words max, appears at 0.5s into
               the scene, bottom-third, large bold caps, white text]
  Transition: Hard cut OUT at word boundary — not mid-sentence
  
  Overall flow of just video 
  VIDEO URL
    ↓
yt-dlp  → local .mp4
    ↓
PySceneDetect → cut_list.csv (timestamp of every cut)
    ↓
Whisper (faster-whisper) → transcript.json (every word + timestamp)
    ↓
ffmpeg → key_frames/ (first frame + pre-cut frame per scene)
    ↓
GPT-4o Vision (per-scene frame grid + transcript segment) → layer1_observations.md
    ↓
OCR pass on key_frames → on_screen_text.md
    ↓
Merge → raw_blueprint.md (Layer 1: full scene document)
    ↓
LLM Pass 2 (on full raw_blueprint) → formula_derivation.md (Branch C: emergent structure)
    ↓
LLM Pass 3 (translation) → heygen_prompt.md (director notes with [REPLACE] tags)
