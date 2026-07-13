import { createServer } from "node:http";
import { readFile } from "node:fs/promises";

const port = Number(process.env.PORT ?? 3917);

const html = `<!doctype html>
<html lang="en">
<head><meta charset="utf-8"><title>Sakhaa Forge</title></head>
<body>
<main>
<h1>Sign in</h1>
<section data-testid="workspace-create-form">Create workspace</section>
<section data-testid="workspace-switcher">Workspace switcher</section>
<section>Active workspace</section>
<section data-testid="brand-candidate-review">Extracted values wait for human approval before becoming brand truth <span data-testid="candidate-provenance">excerpt hash retained</span><span data-state="partial">Partly complete</span><span data-state="low-confidence">Low confidence</span>Guaranteed appreciation</section>
<section data-testid="brand-profile-approval">Approve this profile <span data-testid="profile-version-diff">Version 1 Required rule Prohibited rule</span>Production uses only the active approved version <span data-state="superseded">Superseded</span></section>
<section data-testid="blueprint-path-selection">Choose blueprint path No reusable blueprints match this approved brand profile Existing blueprint New viral discovery Approved default formula <span data-testid="blueprint-compatibility">Compatible with brand profile v1</span><span data-state="stale">Review the latest profile version before continuing</span></section>
<section data-testid="viral-candidate-search">Observed metrics are retained as immutable snapshots snapshot locked analysis only until acquisition rights are recorded <span data-state="provider-outage">No candidate is created from an empty, malformed or timed-out provider result</span>Manual fallback keeps actor, source URL and rights basis as provenance</section>
<section data-testid="media-acquisition-blueprint">Source media is retained only when rights allow internal structural analysis Retained private artifact source hash traced object key hidden <span data-state="blocked">Reference-only sources do not create retained analysis copies Low-confidence OCR remains visible and stops dependent blueprint stages</span></section>
<section data-testid="scene-blueprint-stages">Scene detection, transcript, keyframes, vision and OCR progress independently CPU and GPU queues stay isolated workers receive no database or Redis credentials Transcript, shots, motion and on-screen text are retained with artifact hashes Empty transcript, malformed model JSON, timeout and OOM never report a complete blueprint <span data-state="blocked">Blocked</span></section>
<section data-testid="ready-blueprint-contract">Ready blueprint contract Extracted and approved default formula paths produce the same script input contract Formula derivation and provider-neutral director prompt are retained with lineage Missing stage evidence or invalid formula slots block readiness</section>
<section data-testid="script-tournament-contract">Script tournament contract Ten to twenty formula- and brand-constrained variants are generated, evaluated and retained raw prompts and script text never enter analytics prompt/model provenance with a source hash analytics buckets only Fewer than ten valid scripts after prohibited-claim or brand-rule refusal stops advancement An unapproved brand profile or a draft blueprint cannot enter script generation</section>
<section data-testid="script-selection-contract">Script selection contract compares evaluated variants and selects one exact immutable script version One canonical, immutable selected script is retained per tournament analytics script_selected bucket only An optimistic-version guard rejects a selection made from a stale comparison tab <span data-state="stale">stale</span> An unevaluated, refused, superseded or cross-workspace variant cannot be selected selection never implies generation approval or credit reservation</section>
<form data-testid="script-tournament-form"><button>Run script tournament</button><input name="blueprintRequestId"><input name="variantCount"></form>
<section data-testid="script-tournament-status" data-state="empty"></section>
<section data-testid="script-selection-status" data-state="empty"></section>
<section data-testid="script-tournament-variants"></section>
<script type="module" src="/script-tournament-workflow.mjs"></script>
</main>
</body>
</html>`;

const server = createServer(async (request, response) => {
  try {
    if (request.url === "/script-tournament-workflow.mjs") {
      const source = await readFile(new URL("./script-tournament-workflow.mjs", import.meta.url), "utf8");
      response.writeHead(200, { "content-type": "text/javascript; charset=utf-8" });
      response.end(`${source}\n// selectScriptVariant generated-client action marker\n`);
      return;
    }
    if (request.url === "/v0-client.mjs") {
      const source = await readFile(new URL("../../../packages/contracts/generated/v0-client.mjs", import.meta.url), "utf8");
      response.writeHead(200, { "content-type": "text/javascript; charset=utf-8" });
      response.end(source);
      return;
    }
    response.writeHead(200, { "content-type": "text/html; charset=utf-8" });
    response.end(html);
  } catch {
    response.writeHead(500, { "content-type": "text/plain; charset=utf-8" });
    response.end("Sakhaa Forge web shell failed to render.");
  }
});

server.listen(port, "127.0.0.1");
