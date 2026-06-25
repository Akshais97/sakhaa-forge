# V0-P4 local verification - multimodal scene blueprint

Date: 2026-06-24

## Red evidence

Command:

```text
node --test tests\integration\multimodal-scene-blueprint-p4.test.mjs
```

Expected failure observed:

```text
TypeError: client.createSceneBlueprint is not a function
```

## Behaviour covered

- `POST /viral-candidates/{candidate_id}/scene-blueprint` creates separate
  `scene_detect`, `transcribe`, `keyframe_extract`, `vision_analyze` and `ocr_extract`
  jobs.
- Stage dependencies are retained and show CPU/GPU resource-class isolation.
- Stage artifacts retain schema versions and SHA-256 hashes.
- `VideoBlueprint` and `BlueprintScene` records preserve timing, transcript, shot,
  motion, on-screen text and replacement guidance.
- Empty transcript, malformed model JSON, worker timeout and OOM stay blocked or failed;
  none can report a complete `ocr_done` blueprint.

## Verification commands

```text
node --test tests\integration\multimodal-scene-blueprint-p4.test.mjs
node --test tests\contract\openapi-generation.test.mjs
node --test tests\unit\db-schema.test.mjs
node --test tests\e2e\web-workspace.test.mjs
node --test tests\unit\verify-script.test.mjs
node packages\db\scripts\db-validate.mjs
```

Full verification and runtime table proof are recorded in the sprint closure response.
