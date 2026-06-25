# Implemented changes: V0-P4 multimodal scene blueprint sprint

## Scope

Implemented V0-P4 multimodal scene blueprint behaviour for authorised viral candidates
after P3 media acquisition.

## Product behaviour

- Added `POST /viral-candidates/{candidate_id}/scene-blueprint`.
- Added generated client method `createSceneBlueprint`.
- Created deterministic stage graph for `scene_detect`, `transcribe`,
  `keyframe_extract`, `vision_analyze` and `ocr_extract`.
- Persisted stage jobs, dependency edges, private stage artifacts, `VideoBlueprint` and
  `BlueprintScene` records.
- Classified empty transcript, malformed model JSON, worker timeout and OOM without
  promoting incomplete evidence to a complete blueprint.
- Added web shell evidence for independent stage progress, CPU/GPU isolation and blocked
  states.

## Data and security

- Added Prisma models and migration for `video_blueprints` and `blueprint_scenes`.
- Added tenant-leading indexes, source-hash checks, timing checks and RLS policies.
- Kept stage artifacts private; no object keys or worker credentials are exposed in UI.

## Tests

Red first:

```text
node --test tests\integration\multimodal-scene-blueprint-p4.test.mjs
TypeError: client.createSceneBlueprint is not a function
```

Focused verification:

```text
node --test tests\integration\multimodal-scene-blueprint-p4.test.mjs
node --test tests\contract\openapi-generation.test.mjs
node --test tests\unit\db-schema.test.mjs
node --test tests\e2e\web-workspace.test.mjs
node --test tests\unit\verify-script.test.mjs
node packages\db\scripts\db-validate.mjs
```
