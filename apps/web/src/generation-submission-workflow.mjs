// V0-G4 exactly-once HeyGen submission workflow. Pure, DOM-agnostic state
// functions unit-tested in Node, plus a browser glue that wires the generated
// V0Client to the page. Provider submission is a costly, externally visible paid
// mutation, so the workflow is never optimistic: it shows loading, calls the API,
// and renders the committed provider operation and generation job or a calm
// error. A timeout after possible acceptance renders the real `unknown` state and
// tells the user not to submit again; cancellation of an uncertain operation
// renders `cancel_requested` and tells the user we are checking. The request hash,
// provider payloads, signed URLs and secrets never appear in the rendered markup.
// Browser code holds no database, Redis, provider or secret credentials beyond the
// caller's Supabase JWT. V0Client is imported dynamically inside the browser glue
// so the pure functions can be imported and tested in Node.

// Map a provider operation status (lowercase per V0_STATUS_ENUMS.md) to a stable
// UI state. Unknown is preserved as a real state, never collapsed to success or
// failure.
export function operationState(operation) {
  const status = String(operation?.status ?? "").toLowerCase();
  const known = [
    "created", "submitting", "accepted", "unknown", "processing",
    "completed", "rejected", "failed", "cancelled"
  ];
  return known.includes(status) ? status : "unknown";
}

// Map a generation job status to the lowercase V0_STATUS_ENUMS.md Generation
// contract state. V0-G4 drives submitting/accepted/unknown/generating/generated/
// failed/cancel_requested/cancelled; unknown is preserved.
export function generationJobState(job) {
  const status = String(job?.status ?? "").toLowerCase();
  const known = [
    "draft", "estimating_credits", "awaiting_confirmation", "credits_reserved",
    "queued", "submitting", "accepted", "unknown", "generating", "generated",
    "failed", "cancel_requested", "cancelled"
  ];
  return known.includes(status) ? status : "unknown";
}

// Map a submission/reconcile/cancel problem to the workflow banner state.
// Cross-workspace and missing jobs hide behind the same blocked state so the
// other workspace id never leaks; each provider guard gets its own honest state.
export function classifySubmissionError(problem) {
  if (!problem || typeof problem.code !== "string") {
    return "error";
  }
  const map = {
    WORKSPACE_ACCESS_DENIED: "blocked-hidden",
    PERMISSION_DENIED: "forbidden",
    GENERATION_JOB_NOT_SUBMITTABLE: "not-submittable",
    IDEMPOTENCY_INPUT_CONFLICT: "idempotency-conflict",
    IDEMPOTENCY_KEY_REQUIRED: "idempotency-required",
    PROVIDER_RATE_LIMITED: "rate-limited",
    PROVIDER_OUTPUT_INVALID: "provider-invalid",
    PROVIDER_CALLBACK_INVALID: "callback-invalid"
  };
  return map[problem.code] || "error";
}

// Derive the workflow descriptor from the current phase and API response. The
// descriptor is a plain object so it can be asserted in Node without a DOM; the
// browser glue renders it via submissionMarkup.
export function deriveSubmissionState({
  phase,
  job = null,
  operation = null,
  unknown = false,
  uncertain = false,
  replay = false,
  error = null
}) {
  let banner = { state: "empty", text: "No generation submission loaded." };
  if (phase === "loading") {
    banner = { state: "loading", text: "Submitting this generation to the provider." };
  } else if (phase === "error") {
    banner = { state: classifySubmissionError(error), text: submissionErrorMessage(error) };
  } else if (phase === "ready") {
    if (unknown) {
      banner = { state: "unknown", text: "We are checking whether the provider accepted this request. Do not submit again." };
    } else if (uncertain) {
      banner = { state: "cancel_requested", text: "Cancellation is requested. We must check the submitted provider operation first." };
    } else if (replay) {
      banner = { state: operation ? operationState(operation) : "ready", text: "This generation was already submitted. Showing the existing provider operation." };
    } else {
      banner = { state: operation ? operationState(operation) : "ready", text: "The provider accepted this generation. We are waiting for the completed media." };
    }
  }

  const jobCard = job
    ? {
        id: job.id,
        state: generationJobState(job),
        status: job.status,
        durationSeconds: job.durationSeconds,
        maximumAuthorizedMinor: job.maximumAuthorizedMinor,
        currency: job.currency,
        priceVersion: job.priceVersion
      }
    : null;

  const operationCard = operation
    ? {
        id: operation.id,
        state: operationState(operation),
        status: operation.status,
        provider: operation.provider,
        externalId: operation.externalId,
        estimatedMaximumMinor: operation.estimatedMaximumMinor,
        currency: operation.currency,
        lastErrorCode: operation.lastErrorCode
      }
    : null;

  return {
    phase,
    banner,
    unknown,
    uncertain,
    replay,
    job: jobCard,
    operation: operationCard
  };
}

function submissionErrorMessage(error) {
  if (!error) {
    return "Could not submit this generation. Try again.";
  }
  if (error.code === "WORKSPACE_ACCESS_DENIED") {
    return "We could not find that generation in this workspace.";
  }
  if (error.code === "PERMISSION_DENIED") {
    return "Your role cannot submit paid generation.";
  }
  if (error.code === "GENERATION_JOB_NOT_SUBMITTABLE") {
    return "This generation cannot be submitted or cancelled in its current state.";
  }
  if (error.code === "IDEMPOTENCY_INPUT_CONFLICT") {
    return "This generation was already submitted with a different request identity.";
  }
  if (error.code === "IDEMPOTENCY_KEY_REQUIRED") {
    return "This action needs a request identity. Refresh and try again.";
  }
  if (error.code === "PROVIDER_RATE_LIMITED") {
    return "The provider is busy. This job will retry at the shown time.";
  }
  if (error.code === "PROVIDER_OUTPUT_INVALID") {
    return "The provider output failed validation and was not accepted.";
  }
  if (error.code === "PROVIDER_CALLBACK_INVALID") {
    return "The provider update could not be verified.";
  }
  return error.detail || "Could not submit this generation. Try again.";
}

// Render the descriptor as HTML. The status banner, generation job and provider
// operation carry data-state attributes so the e2e suite can assert
// submitting/accepted/unknown/generating/generated/failed/cancel_requested/
// cancelled/rate-limited/provider-invalid/blocked-hidden states. The request
// hash, signed URLs, provider payloads and secrets never appear in the markup.
export function submissionMarkup(descriptor) {
  const banner = `<p class="status workflow-status" data-testid="generation-submission-status" data-state="${escapeAttribute(descriptor.banner.state)}">${escapeText(descriptor.banner.text)}</p>`;
  const job = descriptor.job
    ? `<article class="candidate" data-testid="generation-submission-job" data-job-id="${escapeAttribute(descriptor.job.id)}" data-state="${escapeAttribute(descriptor.job.state)}">
        <h3>Generation job</h3>
        <p>Status: ${escapeText(descriptor.job.status)}</p>
        <p>Duration: ${escapeText(String(descriptor.job.durationSeconds))} seconds</p>
        <p>Price version: ${escapeText(descriptor.job.priceVersion)}</p>
        <span class="status" data-state="${escapeAttribute(descriptor.job.state)}">${escapeText(jobLabel(descriptor.job.state))}</span>
      </article>`
    : "";
  const operation = descriptor.operation
    ? `<article class="candidate" data-testid="generation-submission-operation" data-operation-id="${escapeAttribute(descriptor.operation.id)}" data-state="${escapeAttribute(descriptor.operation.state)}">
        <h3>Provider operation</h3>
        <p>Provider: ${escapeText(descriptor.operation.provider)}</p>
        <p>Status: ${escapeText(descriptor.operation.status)}</p>
        ${descriptor.operation.externalId ? `<p>Provider reference: retained</p>` : ""}
        <span class="status" data-state="${escapeAttribute(descriptor.operation.state)}">${escapeText(operationLabel(descriptor.operation.state))}</span>
      </article>`
    : "";
  return { banner, job, operation };
}

function jobLabel(state) {
  const labels = {
    queued: "Queued for submission",
    submitting: "Submitting to provider",
    accepted: "Provider accepted",
    unknown: "Checking provider acceptance",
    generating: "Generating media",
    generated: "Media generated",
    failed: "Generation failed",
    cancel_requested: "Cancellation requested",
    cancelled: "Cancelled",
    unknown_state: "Unknown"
  };
  return labels[state] || "Unknown";
}

function operationLabel(state) {
  const labels = {
    created: "Operation recorded",
    submitting: "Submitting",
    accepted: "Accepted",
    unknown: "Checking acceptance",
    processing: "Processing",
    completed: "Completed",
    rejected: "Rejected",
    failed: "Failed",
    cancelled: "Cancelled"
  };
  return labels[state] || "Unknown";
}

function escapeAttribute(value) {
  return String(value).replace(/"/g, "&quot;").replace(/</g, "&lt;");
}

function escapeText(value) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

// Browser glue. Wires the submit, reconcile and cancel forms to the generated
// V0Client. Paid submission is irreversible, so the workflow never renders an
// optimistic accepted state: it shows loading, calls the API, and renders the
// committed operation or a calm error. Only runs in the browser; the pure
// functions above are exported for Node tests.
if (typeof window !== "undefined" && typeof document !== "undefined") {
  const apiBase = window.location.origin.replace(/:\d+$/, ":3001") + "/api/v0";
  const section = document.querySelector("[data-testid='generation-submission-contract']");
  let clientModulePromise = null;
  function client(token) {
    clientModulePromise ??= import("/v0-client.mjs");
    return clientModulePromise.then(({ V0Client }) => new V0Client({ baseUrl: apiBase, authToken: token }));
  }

  function readCommon(form) {
    return {
      workspaceId: form.elements.workspaceId.value.trim(),
      jobId: form.elements.jobId.value.trim(),
      idempotencyKey: form.elements.idempotencyKey.value.trim(),
      sessionToken: form.elements.sessionToken.value.trim()
    };
  }

  function render(descriptor) {
    const markup = submissionMarkup(descriptor);
    section.querySelector("[data-testid='generation-submission-status']")?.replaceWith(createBanner(markup.banner));
    const jobNode = section.querySelector("[data-testid='generation-submission-job']");
    if (markup.job) {
      jobNode?.replaceWith(createFragment(markup.job));
    }
    const operationNode = section.querySelector("[data-testid='generation-submission-operation']");
    if (markup.operation) {
      operationNode?.replaceWith(createFragment(markup.operation));
    } else if (operationNode) {
      operationNode.remove();
    }
  }

  async function handle(form, action) {
    const { workspaceId, jobId, idempotencyKey, sessionToken } = readCommon(form);
    render(deriveSubmissionState({ phase: "loading" }));
    try {
      const v0 = await client(sessionToken);
      const response = await action(v0, workspaceId, jobId, idempotencyKey);
      if (response.ok) {
        render(
          deriveSubmissionState({
            phase: "ready",
            job: response.body.job,
            operation: response.body.operation,
            unknown: response.body.unknown === true,
            uncertain: response.body.uncertain === true,
            replay: response.body.replay === true
          })
        );
      } else {
        render(deriveSubmissionState({ phase: "error", error: response.body }));
      }
    } catch (fetchError) {
      render(deriveSubmissionState({ phase: "error", error: { detail: fetchError.message } }));
    }
  }

  document.querySelector("[data-testid='generation-submit-form']")?.addEventListener("submit", (event) => {
    event.preventDefault();
    handle(event.currentTarget, (v0, workspaceId, jobId, idempotencyKey) =>
      v0.submitGenerationJob(jobId, { workspaceId }, { idempotencyKey })
    );
  });

  document.querySelector("[data-testid='generation-reconcile-form']")?.addEventListener("submit", (event) => {
    event.preventDefault();
    handle(event.currentTarget, (v0, workspaceId, jobId, idempotencyKey) =>
      v0.reconcileGenerationJob(jobId, { workspaceId }, { idempotencyKey })
    );
  });

  document.querySelector("[data-testid='generation-cancel-form']")?.addEventListener("submit", (event) => {
    event.preventDefault();
    handle(event.currentTarget, (v0, workspaceId, jobId, idempotencyKey) =>
      v0.cancelGenerationJob(jobId, { workspaceId }, { idempotencyKey })
    );
  });

  function createBanner(html) {
    const template = document.createElement("template");
    template.innerHTML = html.trim();
    return template.content.firstElementChild;
  }

  function createFragment(html) {
    const template = document.createElement("template");
    template.innerHTML = html.trim();
    return template.content;
  }
}
