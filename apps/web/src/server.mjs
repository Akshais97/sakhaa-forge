import http from "node:http";

const port = Number.parseInt(process.env.PORT || "3000", 10);

const server = http.createServer((_request, response) => {
  response.writeHead(200, {
    "content-type": "text/html; charset=utf-8",
    "cache-control": "no-store"
  });
  response.end(`<!doctype html>
<html lang="en-IN">
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>Workspace selection · Sakhaa Forge</title>
    <style>
      :root {
        color-scheme: light;
        font-family: system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
        background: #fafaf8;
        color: #211f1b;
      }
      body {
        margin: 0;
      }
      main {
        max-width: 1040px;
        margin: 0 auto;
        padding: 32px 20px;
      }
      section {
        border: 1px solid #d4d1ca;
        border-radius: 8px;
        padding: 20px;
        margin-block: 16px;
        background: #ffffff;
      }
      label {
        display: block;
        font-weight: 650;
        margin-block-end: 6px;
      }
      input, select, button {
        min-height: 40px;
        font: inherit;
      }
      input, select {
        width: min(100%, 420px);
        border: 1px solid #b4b0a7;
        border-radius: 6px;
        padding: 0 10px;
      }
      button {
        border: 0;
        border-radius: 6px;
        padding: 0 14px;
        background: #3f5b7a;
        color: #ffffff;
        font-weight: 650;
      }
      .candidate-grid {
        display: grid;
        grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
        gap: 12px;
        margin-block-start: 12px;
      }
      .candidate {
        border: 1px solid #d4d1ca;
        border-radius: 8px;
        padding: 12px;
        min-height: 120px;
        background: #fafaf8;
      }
      .candidate h3 {
        font-size: 1rem;
        margin: 0 0 8px;
      }
      .candidate p {
        margin: 0 0 8px;
      }
      .status {
        display: inline-flex;
        align-items: center;
        min-height: 28px;
        border-radius: 6px;
        padding: 0 8px;
        font-size: 0.875rem;
        font-weight: 650;
      }
      [data-state="partial"] {
        background: #fbf1da;
        color: #6d4b00;
      }
      [data-state="low-confidence"] {
        background: #fbf1da;
        color: #6d4b00;
      }
      .source {
        color: #5d574e;
        font-size: 0.875rem;
      }
      .diff-grid {
        display: grid;
        grid-template-columns: repeat(auto-fit, minmax(240px, 1fr));
        gap: 12px;
        margin-block: 12px;
      }
      .diff-item {
        border-inline-start: 4px solid #3f5b7a;
        padding: 10px 12px;
        background: #fafaf8;
      }
      .diff-item strong {
        display: block;
        margin-block-end: 4px;
      }
      [data-state="superseded"] {
        background: #ece8df;
        color: #5d574e;
      }
      [data-state="stale"] {
        background: #fbf1da;
        color: #6d4b00;
      }
      [data-state="provider-outage"] {
        background: #fcebea;
        color: #8f1d14;
      }
      [data-state="blocked"] {
        background: #efebf3;
        color: #5b2b76;
      }
    </style>
  </head>
  <body>
    <main>
      <h1>Workspace selection</h1>
      <section aria-labelledby="signin-title">
        <h2 id="signin-title">Sign in</h2>
        <p>Use a Supabase session before creating or selecting a workspace.</p>
        <label for="session-token">Session token</label>
        <input id="session-token" name="session-token" autocomplete="off" placeholder="Supabase JWT">
      </section>
      <section aria-labelledby="create-title">
        <h2 id="create-title">Create workspace</h2>
        <form data-testid="workspace-create-form">
          <label for="workspace-name">Workspace name</label>
          <input id="workspace-name" name="name" required maxlength="120" placeholder="Aster Heights">
          <button type="submit">Create workspace</button>
        </form>
      </section>
      <section aria-labelledby="switcher-title">
        <h2 id="switcher-title">Workspace switcher</h2>
        <label for="workspace-select">Active workspace</label>
        <select id="workspace-select" data-testid="workspace-switcher">
          <option>No workspace selected</option>
        </select>
      </section>
      <section aria-labelledby="candidate-review-title" data-testid="brand-candidate-review">
        <h2 id="candidate-review-title">Brand candidate review</h2>
        <p>Extracted values wait for human approval before becoming brand truth.</p>
        <div class="candidate-grid">
          <article class="candidate">
            <h3>Summary</h3>
            <p>Aster Heights offers practical homes in Bengaluru for urban professionals and families.</p>
            <p class="source" data-testid="candidate-provenance">Source: https://aster.example.com/projects/ · page section summary · excerpt hash retained</p>
            <span class="status" data-state="partial">Partly complete</span>
          </article>
          <article class="candidate">
            <h3>USP</h3>
            <p>Metro-connected location</p>
            <p class="source">Source: https://aster.example.com/projects/ · page section USPs · confidence 0.84</p>
            <span class="status" data-state="candidate">Candidate</span>
          </article>
          <article class="candidate">
            <h3>Audience</h3>
            <p>Urban professionals and families</p>
            <p class="source">Source: page title and visible copy · confidence 0.76</p>
            <span class="status" data-state="low-confidence">Low confidence</span>
          </article>
          <article class="candidate">
            <h3>Prohibited claim</h3>
            <p>Guaranteed appreciation</p>
            <p class="source">Source: avoided-claim copy · approval blocked until reviewed</p>
            <span class="status" data-state="candidate">Candidate</span>
          </article>
        </div>
      </section>
      <section aria-labelledby="profile-approval-title" data-testid="brand-profile-approval">
        <h2 id="profile-approval-title">Brand profile approval</h2>
        <p>Production uses only the active approved version.</p>
        <div class="diff-grid" data-testid="profile-version-diff">
          <article class="diff-item">
            <strong>Version 1</strong>
            <p>Public name: Aster Heights</p>
            <p>Positioning: Premium, practical homes for urban professionals and families.</p>
            <span class="status" data-state="approved">Approved</span>
          </article>
          <article class="diff-item">
            <strong>Changed fields</strong>
            <p>CTA confirmed as Book a site visit.</p>
            <p>Flexible-colour decision retained for production templates.</p>
            <span class="status" data-state="superseded">Superseded</span>
          </article>
        </div>
        <div class="candidate-grid">
          <article class="candidate">
            <h3>Required rule</h3>
            <p>Terms and availability apply</p>
            <p class="source">Scope: scripts and captions · severity warning</p>
          </article>
          <article class="candidate">
            <h3>Prohibited rule</h3>
            <p>Guaranteed appreciation</p>
            <p class="source">Unsupported claim · severity critical</p>
          </article>
        </div>
        <button type="button">Approve this profile</button>
      </section>
      <section aria-labelledby="blueprint-path-title" data-testid="blueprint-path-selection">
        <h2 id="blueprint-path-title">Choose blueprint path</h2>
        <p>No reusable blueprints match this approved brand profile. Choose new discovery or use the approved default formula.</p>
        <div class="candidate-grid">
          <article class="candidate">
            <h3>Existing blueprint</h3>
            <p>Select a ready reusable structure only when it matches the active brand profile and objective.</p>
            <p class="source" data-testid="blueprint-compatibility">Compatible with brand profile v1 · real estate · Bengaluru · site visit</p>
            <span class="status" data-state="approved">Ready</span>
          </article>
          <article class="candidate">
            <h3>New viral discovery</h3>
            <p>Create a new request for source discovery and evidence-backed extraction.</p>
            <span class="status" data-state="running">Explicit choice</span>
          </article>
          <article class="candidate">
            <h3>Approved default formula</h3>
            <p>Use the approved default formula while binding the same brand profile version.</p>
            <span class="status" data-state="running">Explicit choice</span>
          </article>
          <article class="candidate">
            <h3>Stale selection</h3>
            <p>Review the latest profile version before continuing.</p>
            <span class="status" data-state="stale">Blocked</span>
          </article>
        </div>
      </section>
      <section aria-labelledby="viral-search-title" data-testid="viral-candidate-search">
        <h2 id="viral-search-title">Viral candidate discovery</h2>
        <p>Observed metrics are retained as immutable snapshots with source and rights warnings.</p>
        <div class="candidate-grid">
          <article class="candidate">
            <h3>Site visit proof before price discussion</h3>
            <p>Rank 1 · observed 24 Jun 2026, 2:30 pm IST · snapshot locked</p>
            <p class="source">Source: Xpoz simulator · metrics snapshot retained · analysis only until acquisition rights are recorded</p>
            <span class="status" data-state="approved">Ready</span>
          </article>
          <article class="candidate">
            <h3>Provider delayed</h3>
            <p>Viral discovery is unavailable. Add a candidate manually or try later.</p>
            <p class="source">No candidate is created from an empty, malformed or timed-out provider result.</p>
            <span class="status" data-state="provider-outage">Failed</span>
          </article>
          <article class="candidate">
            <h3>Manual candidate</h3>
            <p>Manual fallback keeps actor, source URL and rights basis as provenance.</p>
            <p class="source">Source rights warning stays visible before extraction.</p>
            <span class="status" data-state="partial">Partly complete</span>
          </article>
        </div>
      </section>
      <section aria-labelledby="media-acquisition-title" data-testid="media-acquisition-blueprint">
        <h2 id="media-acquisition-title">Media acquisition and thumbnail blueprint</h2>
        <p>Source media is retained only when rights allow internal structural analysis.</p>
        <div class="candidate-grid">
          <article class="candidate">
            <h3>Authorised analysis copy</h3>
            <p>Retained private artifact · source hash traced · thumbnail blueprint ready</p>
            <p class="source">Rights basis: platform terms review and internal analysis · object key hidden</p>
            <span class="status" data-state="approved">Ready</span>
          </article>
          <article class="candidate">
            <h3>Rights blocked</h3>
            <p>This source media cannot be acquired under the current policy.</p>
            <p class="source">Reference-only sources do not create retained analysis copies.</p>
            <span class="status" data-state="blocked">Blocked</span>
          </article>
          <article class="candidate">
            <h3>OCR needs review</h3>
            <p>The blueprint is not ready. Review the incomplete stages.</p>
            <p class="source">Low-confidence OCR remains visible and stops dependent blueprint stages.</p>
            <span class="status" data-state="low-confidence">Low confidence</span>
          </article>
        </div>
      </section>
      <section aria-labelledby="scene-blueprint-title" data-testid="scene-blueprint-stages">
        <h2 id="scene-blueprint-title">Scene blueprint stages</h2>
        <p>Scene detection, transcript, keyframes, vision and OCR progress independently before scene-level blueprint evidence can be used.</p>
        <div class="candidate-grid">
          <article class="candidate">
            <h3>Stage graph</h3>
            <p>scene_detect → transcribe · keyframe_extract → vision_analyze · ocr_extract</p>
            <p class="source">CPU and GPU queues stay isolated; workers receive no database or Redis credentials.</p>
            <span class="status" data-state="running">Running</span>
          </article>
          <article class="candidate">
            <h3>Scene evidence</h3>
            <p>Transcript, shots, motion and on-screen text are retained with artifact hashes.</p>
            <p class="source">Replacement guidance uses approved brand CTA and avoids unsupported property claims.</p>
            <span class="status" data-state="approved">Ready</span>
          </article>
          <article class="candidate">
            <h3>Partial stage</h3>
            <p>The blueprint is not ready. Review the incomplete stages.</p>
            <p class="source">Empty transcript, malformed model JSON, timeout and OOM never report a complete blueprint.</p>
            <span class="status" data-state="blocked">Blocked</span>
          </article>
        </div>
      </section>
      <section aria-labelledby="ready-blueprint-title" data-testid="ready-blueprint-contract">
        <h2 id="ready-blueprint-title">Ready blueprint contract</h2>
        <p>Extracted and approved default formula paths produce the same script input contract before script generation.</p>
        <div class="candidate-grid">
          <article class="candidate">
            <h3>Immutable ready blueprint</h3>
            <p>Formula derivation and provider-neutral director prompt are retained with lineage.</p>
            <p class="source">Schema v0.script-input.1 · formula v0.formula.1 · prompt v0.director-prompt.1</p>
            <span class="status" data-state="approved">Ready</span>
          </article>
          <article class="candidate">
            <h3>Incomplete source</h3>
            <p>Missing stage evidence or invalid formula slots block readiness.</p>
            <span class="status" data-state="blocked">Blocked</span>
          </article>
        </div>
      </section>
      <section aria-labelledby="script-tournament-title" data-testid="script-tournament-contract">
        <h2 id="script-tournament-title">Script tournament contract</h2>
        <p>Ten to twenty formula- and brand-constrained variants are generated, evaluated and retained; raw prompts and script text never enter analytics.</p>
        <div class="candidate-grid">
          <article class="candidate">
            <h3>Ready for selection</h3>
            <p>Every variant keeps hook, body, CTA, captions, claims, formula slots and prompt/model provenance with a source hash.</p>
            <p class="source">Prompt v0.director-prompt.1 · model v0.script-model.1 · analytics buckets only</p>
            <span class="status" data-state="approved">Ready for selection</span>
          </article>
          <article class="candidate">
            <h3>Insufficient valid variants</h3>
            <p>Fewer than ten valid scripts after prohibited-claim or brand-rule refusal stops advancement; refused variants stay visible.</p>
            <span class="status" data-state="blocked">Blocked</span>
          </article>
          <article class="candidate">
            <h3>Draft blueprint guard</h3>
            <p>An unapproved brand profile or a draft blueprint cannot enter script generation.</p>
            <span class="status" data-state="blocked">Blocked</span>
          </article>
        </div>
      </section>
    </main>
  </body>
</html>
`);
});

server.listen(port, () => {
  console.log(`Sakhaa Forge web shell listening on http://localhost:${port}`);
});
