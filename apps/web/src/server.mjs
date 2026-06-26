import http from "node:http";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const port = Number.parseInt(process.env.PORT || "3000", 10);
const here = dirname(fileURLToPath(import.meta.url));
const v0ClientPath = join(here, "..", "..", "..", "packages", "contracts", "generated", "v0-client.mjs");
const workflowPath = join(here, "script-tournament-workflow.mjs");
const avatarWorkflowPath = join(here, "avatar-workflow.mjs");
const walletLedgerWorkflowPath = join(here, "wallet-ledger-workflow.mjs");
const generationConfirmationWorkflowPath = join(here, "generation-confirmation-workflow.mjs");
const generationSubmissionWorkflowPath = join(here, "generation-submission-workflow.mjs");
const generationSettlementWorkflowPath = join(here, "generation-settlement-workflow.mjs");

const page = `<!doctype html>
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
      button[disabled] {
        background: #b4b0a7;
        color: #5d574e;
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
        padding: 4px 10px;
        font-size: 0.875rem;
        font-weight: 650;
        margin-block: 12px;
      }
      .workflow-status {
        display: block;
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
      [data-state="empty"] {
        background: #ece8df;
        color: #5d574e;
      }
      [data-state="loading"] {
        background: #e7eef5;
        color: #2c4a6b;
      }
      [data-state="ready"] {
        background: #e6efe6;
        color: #2c5b2c;
      }
      [data-state="error"] {
        background: #fcebea;
        color: #8f1d14;
      }
      [data-state="invalid"] {
        background: #efebf3;
        color: #5b2b76;
      }
      [data-state="success"] {
        background: #e6efe6;
        color: #2c5b2c;
      }
      [data-state="already-selected"] {
        background: #fbf1da;
        color: #6d4b00;
      }
      [data-state="expired"] {
        background: #fbf1da;
        color: #6d4b00;
      }
      [data-state="revoked"] {
        background: #fcebea;
        color: #8f1d14;
      }
      [data-state="consent-missing"] {
        background: #efebf3;
        color: #5b2b76;
      }
      [data-state="service-pending"] {
        background: #e7eef5;
        color: #2c4a6b;
      }
      [data-state="forbidden"] {
        background: #fcebea;
        color: #8f1d14;
      }
      [data-state="blocked-hidden"] {
        background: #ece8df;
        color: #5d574e;
      }
      [data-state="blocked-brand"] {
        background: #fbf1da;
        color: #6d4b00;
      }
      [data-state="purchase"] {
        background: #e6efe6;
        color: #2c5b2c;
      }
      [data-state="refund"] {
        background: #fbf1da;
        color: #6d4b00;
      }
      [data-state="adjustment"] {
        background: #e7eef5;
        color: #2c4a6b;
      }
      [data-state="matched"] {
        background: #e6efe6;
        color: #2c5b2c;
      }
      [data-state="mismatched"] {
        background: #fcebea;
        color: #8f1d14;
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
        <p>Ten to twenty formula- and brand-constrained variants are generated, evaluated and retained; raw prompts and script text never enter analytics. Fewer than ten valid scripts after prohibited-claim or brand-rule refusal stops advancement. An unapproved brand profile or a draft blueprint cannot enter script generation. Prompt v0.director-prompt.1 · model v0.script-model.1 · prompt/model provenance with a source hash · analytics buckets only.</p>
        <form data-testid="script-tournament-form" id="script-tournament-form">
          <label for="st-workspace">Workspace id</label>
          <input id="st-workspace" name="workspaceId" autocomplete="off" required>
          <label for="st-blueprint">Ready blueprint request id</label>
          <input id="st-blueprint" name="blueprintRequestId" autocomplete="off" required>
          <label for="st-variant-count">Variant count (10-20)</label>
          <input id="st-variant-count" name="variantCount" type="number" min="10" max="20" value="10">
          <label for="st-token">Session token</label>
          <input id="st-token" name="sessionToken" type="password" autocomplete="off" placeholder="Supabase JWT">
          <button type="submit">Run script tournament</button>
        </form>
        <p class="status workflow-status" data-testid="script-tournament-status" data-state="empty">No tournament loaded.</p>
        <div class="candidate-grid" data-testid="script-tournament-variants"></div>
      </section>
      <section aria-labelledby="script-selection-title" data-testid="script-selection-contract">
        <h2 id="script-selection-title">Script selection contract</h2>
        <p>The client manager compares evaluated variants and selects one exact immutable script version for generation. One canonical, immutable selected script is retained per tournament with actor, tournament, variant and version provenance. An optimistic-version guard rejects a selection made from a stale comparison tab. An unevaluated, refused, superseded or cross-workspace variant cannot be selected; selection never implies generation approval or credit reservation. Schema v0.selected-script.1 · analytics script_selected bucket only.</p>
        <p class="status workflow-status" data-testid="script-selection-status" data-state="empty">No selection made.</p>
        <div class="candidate-grid">
          <article class="candidate">
            <h3>Selected immutable script</h3>
            <p>One canonical, immutable selected script is retained per tournament with actor, tournament, variant and version provenance.</p>
            <p class="source">Schema v0.selected-script.1 · analytics script_selected bucket only</p>
            <span class="status" data-state="approved">Selected</span>
          </article>
          <article class="candidate">
            <h3>Stale comparison tab</h3>
            <p>An optimistic-version guard rejects a selection made from a stale comparison tab.</p>
            <span class="status" data-state="stale">Stale</span>
          </article>
          <article class="candidate">
            <h3>Ineligible variant</h3>
            <p>An unevaluated, refused, superseded or cross-workspace variant cannot be selected; selection never implies generation approval or credit reservation.</p>
            <span class="status" data-state="blocked">Blocked</span>
          </article>
        </div>
      </section>
      <section aria-labelledby="avatar-catalog-title" data-testid="avatar-catalog-contract">
        <h2 id="avatar-catalog-title">Avatar catalogue</h2>
        <p>Generic, brand-ambassador and consented real-person avatars are bound to the approved brand profile. Eligibility is derived from consent evidence, expiry, revocation and service-fulfillment state; expired, revoked, missing-evidence or service-pending avatars cannot enter a generation estimate or job. Consent evidence itself is never shown.</p>
        <form data-testid="avatar-catalog-form" id="avatar-catalog-form">
          <label for="av-workspace">Workspace id</label>
          <input id="av-workspace" name="workspaceId" autocomplete="off" required>
          <label for="av-brand-profile">Approved brand profile id</label>
          <input id="av-brand-profile" name="brandProfileId" autocomplete="off" required>
          <label for="av-token">Session token</label>
          <input id="av-token" name="sessionToken" type="password" autocomplete="off" placeholder="Supabase JWT">
          <button type="submit">Load avatar catalogue</button>
        </form>
        <p class="status workflow-status" data-testid="avatar-catalog-status" data-state="empty">No avatar catalogue loaded.</p>
        <div class="candidate-grid" data-testid="avatar-catalog-grid"></div>
      </section>
      <section aria-labelledby="wallet-ledger-title" data-testid="wallet-ledger-contract">
        <h2 id="wallet-ledger-title">Creator wallet and credit ledger</h2>
        <p>Verified credit purchases credit an integer-minor-unit wallet through an append-only ledger; refunds and disputes debit it as negative entries and Owner adjustments are compensating entries. History is never edited. Payment instrument details are never stored or shown, and the provider financial reconciliation summary is visible only to roles that can view it.</p>
        <form data-testid="wallet-ledger-form" id="wallet-ledger-form">
          <label for="wl-workspace">Workspace id</label>
          <input id="wl-workspace" name="workspaceId" autocomplete="off" required>
          <label for="wl-wallet">Wallet id</label>
          <input id="wl-wallet" name="walletId" autocomplete="off" required>
          <label for="wl-token">Session token</label>
          <input id="wl-token" name="sessionToken" type="password" autocomplete="off" placeholder="Supabase JWT">
          <button type="submit">Load wallet ledger</button>
        </form>
        <p class="status workflow-status" data-testid="wallet-ledger-status" data-state="empty">No wallet ledger loaded.</p>
        <div class="candidate-grid" data-testid="wallet-ledger-entries"></div>
      </section>
      <section aria-labelledby="generation-confirmation-title" data-testid="generation-confirmation-contract">
        <h2 id="generation-confirmation-title">Generation estimate and credit reservation</h2>
        <p>Confirming a versioned estimate atomically reserves the maximum authorized credits in integer minor units through one RESERVE ledger entry, creates one queued generation job and one active reservation, and debits the wallet before any provider network I/O. Reservation is not provider submission. Stale, changed, insufficient or already-reserved estimates are rejected without a second debit, and the input hash is a server-side validation secret that is never shown.</p>
        <form data-testid="generation-confirmation-form" id="generation-confirmation-form">
          <label for="gc-workspace">Workspace id</label>
          <input id="gc-workspace" name="workspaceId" autocomplete="off" required>
          <label for="gc-estimate">Estimate id</label>
          <input id="gc-estimate" name="estimateId" autocomplete="off" required>
          <label for="gc-version">Estimate version</label>
          <input id="gc-version" name="version" type="number" min="1" step="1" autocomplete="off" required>
          <label for="gc-script">Selected script id</label>
          <input id="gc-script" name="selectedScriptId" autocomplete="off" required>
          <label for="gc-avatar">Avatar profile id</label>
          <input id="gc-avatar" name="avatarProfileId" autocomplete="off" required>
          <label for="gc-duration">Duration seconds</label>
          <input id="gc-duration" name="durationSeconds" type="number" min="1" max="30" step="1" autocomplete="off" required>
          <label for="gc-idem">Idempotency key</label>
          <input id="gc-idem" name="idempotencyKey" autocomplete="off" required>
          <label for="gc-token">Session token</label>
          <input id="gc-token" name="sessionToken" type="password" autocomplete="off" placeholder="Supabase JWT" required>
          <button type="submit">Confirm estimate and reserve credits</button>
        </form>
        <p class="status workflow-status" data-testid="generation-confirmation-status" data-state="empty">No generation estimate loaded.</p>
      </section>
      <section aria-labelledby="generation-submission-title" data-testid="generation-submission-contract">
        <h2 id="generation-submission-title">Provider submission</h2>
        <p>A queued generation job is submitted to the HeyGen simulator exactly once: a durable provider operation is recorded before network I/O, the provider external reference and estimated maximum are bound, and a timeout after possible acceptance is reported as unknown and must be reconciled before any retry. Verified callbacks drive the operation to completed; replays never transition twice. Cancellation of an uncertain operation reconciles first. The request hash and provider payloads are server-side secrets that are never shown.</p>
        <form data-testid="generation-submit-form" id="generation-submit-form">
          <label for="gs-workspace">Workspace id</label>
          <input id="gs-workspace" name="workspaceId" autocomplete="off" required>
          <label for="gs-job">Generation job id</label>
          <input id="gs-job" name="jobId" autocomplete="off" required>
          <label for="gs-idem">Idempotency key</label>
          <input id="gs-idem" name="idempotencyKey" autocomplete="off" required>
          <label for="gs-token">Session token</label>
          <input id="gs-token" name="sessionToken" type="password" autocomplete="off" placeholder="Supabase JWT" required>
          <button type="submit">Submit generation to provider</button>
        </form>
        <form data-testid="generation-reconcile-form" id="generation-reconcile-form">
          <label for="gr-workspace">Workspace id</label>
          <input id="gr-workspace" name="workspaceId" autocomplete="off" required>
          <label for="gr-job">Generation job id</label>
          <input id="gr-job" name="jobId" autocomplete="off" required>
          <label for="gr-idem">Idempotency key</label>
          <input id="gr-idem" name="idempotencyKey" autocomplete="off" required>
          <label for="gr-token">Session token</label>
          <input id="gr-token" name="sessionToken" type="password" autocomplete="off" placeholder="Supabase JWT" required>
          <button type="submit">Reconcile uncertain operation</button>
        </form>
        <form data-testid="generation-cancel-form" id="generation-cancel-form">
          <label for="gc2-workspace">Workspace id</label>
          <input id="gc2-workspace" name="workspaceId" autocomplete="off" required>
          <label for="gc2-job">Generation job id</label>
          <input id="gc2-job" name="jobId" autocomplete="off" required>
          <label for="gc2-idem">Idempotency key</label>
          <input id="gc2-idem" name="idempotencyKey" autocomplete="off" required>
          <label for="gc2-token">Session token</label>
          <input id="gc2-token" name="sessionToken" type="password" autocomplete="off" placeholder="Supabase JWT" required>
          <button type="submit">Cancel generation</button>
        </form>
        <p class="status workflow-status" data-testid="generation-submission-status" data-state="empty">No generation submission loaded.</p>
        <article class="candidate" data-testid="generation-submission-job" data-state="empty"></article>
      </section>
      <section aria-labelledby="generation-settlement-title" data-testid="generation-settlement-contract">
        <h2 id="generation-settlement-title">Generation settlement</h2>
        <p>A terminal provider operation is settled once: completed media is copied into private V0 storage through the adapter only, quarantined, validated and hashed, then bound to a retained segment, versioned asset and creative lineage. The reconciled provider cost is compared with the authorized maximum; credits are captured once on success (the unused remainder is returned) or released once on failure (the full reservation is returned). Settlement is idempotent and crash-recoverable: a replay never settles twice and a crash between media retention and ledger settlement is recovered on retry. The transient provider URL and provider payloads are never shown.</p>
        <form data-testid="generation-settle-form" id="generation-settle-form">
          <label for="gst-workspace">Workspace id</label>
          <input id="gst-workspace" name="workspaceId" autocomplete="off" required>
          <label for="gst-job">Generation job id</label>
          <input id="gst-job" name="jobId" autocomplete="off" required>
          <label for="gst-idem">Idempotency key</label>
          <input id="gst-idem" name="idempotencyKey" autocomplete="off" required>
          <label for="gst-token">Session token</label>
          <input id="gst-token" name="sessionToken" type="password" autocomplete="off" placeholder="Supabase JWT" required>
          <button type="submit">Settle generation</button>
        </form>
        <p class="status workflow-status" data-testid="generation-settlement-status" data-state="empty">No generation settlement loaded.</p>
        <article class="candidate" data-testid="generation-settlement-media" data-state="empty"></article>
        <article class="candidate" data-testid="generation-settlement-ledger" data-state="empty"></article>
        <article class="candidate" data-testid="generation-settlement-reservation" data-state="empty"></article>
        <article class="candidate" data-testid="generation-settlement-wallet" data-state="empty"></article>
      </section>
    </main>
    <script type="module" src="/script-tournament-workflow.mjs"></script>
    <script type="module" src="/avatar-workflow.mjs"></script>
    <script type="module" src="/wallet-ledger-workflow.mjs"></script>
    <script type="module" src="/generation-confirmation-workflow.mjs"></script>
    <script type="module" src="/generation-submission-workflow.mjs"></script>
    <script type="module" src="/generation-settlement-workflow.mjs"></script>
  </body>
</html>
`;

const server = http.createServer(async (request, response) => {
  const url = request.url.split("?")[0];
  if (url === "/script-tournament-workflow.mjs") {
    return serveModule(response, workflowPath);
  }
  if (url === "/avatar-workflow.mjs") {
    return serveModule(response, avatarWorkflowPath);
  }
  if (url === "/wallet-ledger-workflow.mjs") {
    return serveModule(response, walletLedgerWorkflowPath);
  }
  if (url === "/generation-confirmation-workflow.mjs") {
    return serveModule(response, generationConfirmationWorkflowPath);
  }
  if (url === "/generation-submission-workflow.mjs") {
    return serveModule(response, generationSubmissionWorkflowPath);
  }
  if (url === "/generation-settlement-workflow.mjs") {
    return serveModule(response, generationSettlementWorkflowPath);
  }
  if (url === "/v0-client.mjs") {
    return serveModule(response, v0ClientPath);
  }
  response.writeHead(200, {
    "content-type": "text/html; charset=utf-8",
    "cache-control": "no-store"
  });
  response.end(page);
});

async function serveModule(response, filePath) {
  try {
    const body = await readFile(filePath, "utf8");
    response.writeHead(200, {
      "content-type": "text/javascript; charset=utf-8",
      "cache-control": "no-store"
    });
    response.end(body);
  } catch (error) {
    response.writeHead(404, { "content-type": "text/plain; charset=utf-8" });
    response.end(error.code === "ENOENT" ? "Module not found." : "Module could not be read.");
  }
}

server.listen(port, () => {
  console.log(`Sakhaa Forge web shell listening on http://localhost:${port}`);
});
