We will integrate Xpoz’s free API key directly into our third-party application to seamlessly fetch and surface high-performing real estate content. By tapping into Xpoz's MCP server data stream, our application will execute automated background queries specifically targeted at business accounts within the real estate niche. Once Xpoz pulls the raw dataset, our app's internal logic will instantly filter the results by engagement metrics—such as view velocity, shares, and comment-to-like ratios—allowing us to isolate and display only the truly viral videos for our users without incurring heavy credit costs.

Yes, it actually does!

Xpoz's free API Key
		↓
VIDEO URL and MEDIA URL and COVER IMAGE
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
