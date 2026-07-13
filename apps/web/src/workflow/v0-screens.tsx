"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import {
  WORKFLOW_ACTIONS,
  WORKFLOW_SECONDARY_ACTIONS,
  createGeneratedWorkflowClient,
  type WorkflowActionResult
} from "./v0-actions";
import {
  STATUS_PRESENTATION,
  WORKFLOW_STEPS,
  getStepByKey,
  getStepHref,
  type WorkflowStep,
  type WorkflowStepKey
} from "./v0-workflow";

type Field =
  | { name: string; label: string; type: "text" | "url" | "number" | "datetime-local"; required?: boolean; placeholder?: string }
  | { name: string; label: string; type: "textarea"; required?: boolean; placeholder?: string }
  | { name: string; label: string; type: "checkbox"; required?: boolean }
  | { name: string; label: string; type: "select"; required?: boolean; options: { value: string; label: string }[] };

type ScreenConfig = {
  stepKey: WorkflowStepKey;
  title: string;
  intent: string;
  input: string;
  process: string;
  output: string;
  primaryCta: string;
  secondaryCta?: string;
  evidence: string[];
  hidden: string[];
  fields: Field[];
  emptyAction?: WorkflowStepKey;
};

type JourneyState = {
  workspaceId: string;
  ids: Record<string, string | undefined>;
  values: Record<string, string | boolean | undefined>;
};

const defaultJourney: JourneyState = {
  workspaceId: "10000000-0000-4000-8000-000000000001",
  ids: {
    crawlRunId: "21000000-0000-4000-8000-000000000101",
    brandId: "20000000-0000-4000-8000-000000000001",
    brandProfileId: "21000000-0000-4000-8000-000000000003",
    blueprintRequestId: "31000000-0000-4000-8000-000000000010",
    candidateId: "32000000-0000-4000-8000-000000000020",
    mediaAcquisitionId: "33000000-0000-4000-8000-000000000030",
    thumbnailBlueprintId: "34000000-0000-4000-8000-000000000040",
    videoBlueprintId: "35000000-0000-4000-8000-000000000050",
    tournamentId: "41000000-0000-4000-8000-000000000060",
    variantId: "42000000-0000-4000-8000-000000000070",
    selectedScriptId: "43000000-0000-4000-8000-000000000080",
    avatarProfileId: "51000000-0000-4000-8000-000000000090",
    estimateId: "52000000-0000-4000-8000-000000000100",
    generationJobId: "53000000-0000-4000-8000-000000000110",
    generationAssetId: "54000000-0000-4000-8000-000000000120",
    compositionPlanId: "61000000-0000-4000-8000-000000000130",
    reviewItemId: "71000000-0000-4000-8000-000000000140",
    finalVideoId: "62000000-0000-4000-8000-000000000150",
    approvalToken: "approval-token-demo",
    calendarPostId: "81000000-0000-4000-8000-000000000160"
  },
  values: {
    websiteUrl: "https://asterheights.example",
    rightsAcknowledged: true,
    publicName: "Aster Heights",
    positioning: "Premium, practical homes for urban professionals and families.",
    targetAudience: "Urban professionals and families in Bengaluru",
    cta: "Book a site visit",
    tone: "Calm, premium, direct, informative",
    rightsAttestation: "I am authorised to approve this brand profile for production.",
    objective: "Create one short-form real-estate project walkthrough.",
    blueprintPath: "new_discovery",
    niche: "India-first premium residential real estate",
    rightsDecision: "retain_analysis_copy",
    retrievalPolicy: "approved",
    expectedSourceHash: "sha256-demo-source",
    variantCount: "10",
    account: "@asterheights",
    caption: "Aster Heights is ready for private site visits. Terms and availability apply.",
    platform: "meta",
    finalVideoSha256: "7b899a22cc3ffef0192bc9310f0e7f9df0c7c8e7f0a2a111111111111111111111",
    scheduledAt: "2026-07-03T18:30",
    manualLiveUrl: "https://www.instagram.com/reel/example",
    rawDirection: "Use approved logo in the top-right safe area and keep captions lower-third.",
    maximumAuthorizationMinor: "48000",
    finalVideoVersion: "1"
  }
};

const screenConfigs: Record<WorkflowStepKey, ScreenConfig> = {
  "brand-intake": {
    stepKey: "brand-intake",
    title: "Start brand intake",
    intent: "Begin brand extraction from the company URL and retained rights acknowledgement.",
    input: "Company URL, workspace, and authorised source-use confirmation.",
    process: "The API normalises the URL, applies crawl safety, records rights, and creates a durable crawl run.",
    output: "Crawl run, brand record, job identity, and source evidence for extraction.",
    primaryCta: "Start brand intake",
    evidence: ["Crawl run id", "Brand id", "Submitted URL", "Rights acknowledgement"],
    hidden: ["Redirect internals", "Signed upload URLs", "Storage object keys"],
    fields: [
      { name: "websiteUrl", label: "Company URL", type: "url", required: true },
      { name: "rightsAcknowledged", label: "I confirm authorised source use", type: "checkbox", required: true }
    ]
  },
  "brand-candidates": {
    stepKey: "brand-candidates",
    title: "Review extracted brand candidates",
    intent: "Inspect evidence-backed extracted values before any value becomes production truth.",
    input: "Crawl run id retained by brand intake.",
    process: "The API returns candidate values with source evidence, confidence, and extraction state.",
    output: "Candidate groups for identity, voice, CTAs, audiences, visuals, and prohibited claims.",
    primaryCta: "Load candidates",
    evidence: ["Source locator", "Excerpt hash", "Confidence", "Candidate decision"],
    hidden: ["Raw provider output", "Prompt input", "Protected crawl internals"],
    fields: []
  },
  "brand-approval": {
    stepKey: "brand-approval",
    title: "Approve exact brand profile",
    intent: "Promote resolved candidates into one immutable, approved brand profile version.",
    input: "Required brand fields, optimistic version, and rights attestation.",
    process: "The API validates required fields, conflicts, permission, version and one-active-profile rules.",
    output: "Approved profile id, version, actor, rules, and approval audit.",
    primaryCta: "Approve this profile",
    evidence: ["Profile version", "Approval actor", "Rules", "Source-backed fields"],
    hidden: ["Restricted legal details", "Raw source documents", "Cross-workspace existence"],
    fields: [
      { name: "publicName", label: "Public brand name", type: "text", required: true },
      { name: "positioning", label: "Positioning statement", type: "textarea", required: true },
      { name: "targetAudience", label: "Target audience", type: "text", required: true },
      { name: "cta", label: "Approved CTA", type: "text", required: true },
      { name: "tone", label: "Tone attributes", type: "text", required: true },
      { name: "rightsAttestation", label: "Rights attestation", type: "textarea", required: true }
    ],
    emptyAction: "brand-candidates"
  },
  "blueprint-path": {
    stepKey: "blueprint-path",
    title: "Choose blueprint path",
    intent: "Select existing blueprint, new viral discovery, or the approved default formula explicitly.",
    input: "Approved brand profile, objective, and selected path.",
    process: "The API creates one downstream blueprint request bound to brand profile version and path.",
    output: "Blueprint request id and exact path used by later blueprint/script steps.",
    primaryCta: "Create blueprint request",
    evidence: ["Brand profile version", "Path choice", "Objective", "Blueprint request id"],
    hidden: ["Cross-workspace blueprint existence"],
    fields: [
      {
        name: "blueprintPath",
        label: "Blueprint path",
        type: "select",
        options: [
          { value: "new_discovery", label: "New discovery" },
          { value: "existing_blueprint", label: "Existing blueprint" },
          { value: "default_formula", label: "Approved default formula" }
        ]
      },
      { name: "objective", label: "Production objective", type: "textarea", required: true }
    ],
    emptyAction: "brand-approval"
  },
  "blueprint-library": {
    stepKey: "blueprint-library",
    title: "Select reusable blueprint",
    intent: "Review compatible reusable blueprints before choosing one for scripts.",
    input: "Approved brand profile id and bounded pagination.",
    process: "The API returns compatible library entries only for this workspace and profile.",
    output: "Reusable blueprint entries with compatibility metadata and readiness state.",
    primaryCta: "Load reusable blueprints",
    evidence: ["Compatibility metadata", "Library entry id", "Status", "Formula summary"],
    hidden: ["Archived cross-workspace entries", "Raw director prompt internals"],
    fields: [],
    emptyAction: "blueprint-path"
  },
  "blueprint-discovery": {
    stepKey: "blueprint-discovery",
    title: "Discover viral candidate",
    intent: "Search for a source candidate with immutable metric snapshots and rights warnings.",
    input: "Blueprint request, niche, objective, and deterministic simulator mode.",
    process: "The API ranks candidates and retains metric snapshots without exposing raw provider payloads.",
    output: "Candidate list with source, metrics, observation time, and rights warning.",
    primaryCta: "Search candidates",
    evidence: ["Candidate id", "Metric snapshot", "Observation time", "Rights warning"],
    hidden: ["Raw provider payload", "Adapter credentials"],
    fields: [
      { name: "niche", label: "Real-estate niche", type: "text", required: true },
      {
        name: "simulatorMode",
        label: "Simulator mode",
        type: "select",
        options: [
          { value: "success", label: "Success" },
          { value: "timeout", label: "Timeout" },
          { value: "outage", label: "Provider outage" }
        ]
      }
    ],
    emptyAction: "blueprint-path"
  },
  "blueprint-acquisition": {
    stepKey: "blueprint-acquisition",
    title: "Acquire candidate media",
    intent: "Retain or block source media using rights and source-hash checks.",
    input: "Candidate id, rights decision, retrieval policy, and expected source hash.",
    process: "The API creates media acquisition, clean artifacts, thumbnail blueprint, or a blocked state.",
    output: "Media acquisition id, thumbnail blueprint, source hash, and retained artifact evidence.",
    primaryCta: "Acquire media",
    evidence: ["Source hash", "Rights decision", "Artifact id", "Thumbnail OCR confidence"],
    hidden: ["Protected source copy", "Object key", "Raw provider payload"],
    fields: [
      {
        name: "rightsDecision",
        label: "Rights decision",
        type: "select",
        options: [
          { value: "retain_analysis_copy", label: "Retain analysis copy" },
          { value: "reference_only", label: "Reference only" }
        ]
      },
      { name: "expectedSourceHash", label: "Expected source hash", type: "text", required: true }
    ],
    emptyAction: "blueprint-discovery"
  },
  "blueprint-scene": {
    stepKey: "blueprint-scene",
    title: "Extract scene structure",
    intent: "Run scene, transcript, keyframe, vision and OCR stages independently.",
    input: "Candidate, media acquisition, thumbnail blueprint, and expected source hash.",
    process: "The API creates separate stage jobs and retains partial or blocked evidence honestly.",
    output: "Scene-level blueprint with independent stage status and evidence.",
    primaryCta: "Extract scene blueprint",
    evidence: ["Scene stages", "Transcript state", "OCR state", "Worker job ids"],
    hidden: ["Raw model JSON", "Worker credentials"],
    fields: [{ name: "expectedSourceHash", label: "Expected source hash", type: "text", required: true }],
    emptyAction: "blueprint-acquisition"
  },
  "blueprint-ready": {
    stepKey: "blueprint-ready",
    title: "Make blueprint ready",
    intent: "Freeze immutable blueprint, formula and provider-neutral director prompt.",
    input: "Blueprint request and extracted/default/existing readiness source.",
    process: "The API validates required stages and formula slots before creating immutable script input.",
    output: "Ready blueprint, formula derivation, director prompt and library entry identities.",
    primaryCta: "Make blueprint ready",
    evidence: ["Formula slots", "Director prompt version", "Replacement instructions", "Lineage"],
    hidden: ["Raw prompt payload if not returned"],
    fields: [
      {
        name: "readySource",
        label: "Ready source",
        type: "select",
        options: [
          { value: "extracted_blueprint", label: "Extracted blueprint" },
          { value: "default_formula", label: "Default formula" },
          { value: "existing_blueprint", label: "Existing blueprint" }
        ]
      }
    ],
    emptyAction: "blueprint-scene"
  },
  "scripts-tournament": {
    stepKey: "scripts-tournament",
    title: "Run script tournament",
    intent: "Generate and evaluate 10-20 brand- and formula-constrained script variants.",
    input: "Ready blueprint request, variant count, and simulator mode.",
    process: "The API generates variants, evaluates hook/timing/CTA/claims, and retains provenance.",
    output: "Tournament id, variants, evaluations, manifest, job and audit evidence.",
    primaryCta: "Generate scripts",
    evidence: ["Tournament id", "Variants", "Evaluations", "Prompt/model version"],
    hidden: ["Raw prompt text in analytics", "Raw model payload"],
    fields: [
      { name: "variantCount", label: "Variant count", type: "number", required: true },
      {
        name: "simulatorMode",
        label: "Simulator mode",
        type: "select",
        options: [
          { value: "success", label: "Success" },
          { value: "refused", label: "Policy refusal" },
          { value: "malformed", label: "Malformed output" }
        ]
      }
    ],
    emptyAction: "blueprint-ready"
  },
  "scripts-selection": {
    stepKey: "scripts-selection",
    title: "Select exact script",
    intent: "Select one immutable evaluated script for paid generation.",
    input: "Tournament id, eligible variant id, optimistic version and human confirmation.",
    process: "The API records exactly one selected script and rejects stale or ineligible choices.",
    output: "Selected script id, actor, evaluation, and selection audit.",
    primaryCta: "Select script",
    evidence: ["Selected script id", "Variant id", "Evaluation", "Actor"],
    hidden: ["Raw analytics payload"],
    fields: [
      { name: "variantId", label: "Variant id", type: "text", required: true },
      { name: "humanOverride", label: "Human confirms this variant", type: "checkbox" }
    ],
    emptyAction: "scripts-tournament"
  },
  avatars: {
    stepKey: "avatars",
    title: "Choose eligible avatar",
    intent: "Choose a likeness and voice that are eligible for the approved brand profile.",
    input: "Approved brand profile id and bounded catalogue read.",
    process: "The API derives consent eligibility and blocks revoked, expired, missing or pending consent.",
    output: "Avatar catalogue with consent state and disabled reasons.",
    primaryCta: "Load avatar catalogue",
    evidence: ["Avatar id", "Eligibility reason", "Consent expiry", "Revocation state"],
    hidden: ["Consent evidence reference", "Secret manager reference"],
    fields: [],
    emptyAction: "scripts-selection"
  },
  "generation-estimate": {
    stepKey: "generation-estimate",
    title: "Review cost estimate",
    intent: "Show estimate and maximum authorisation before credits are reserved.",
    input: "Approved brand profile, selected script and eligible avatar.",
    process: "The API creates an estimate and the secondary action confirms reservation exactly once.",
    output: "Estimate, price version, maximum authorisation, wallet state and reservation.",
    primaryCta: "Create estimate",
    secondaryCta: "Reserve credits and generate",
    evidence: ["Estimate id", "Price version", "Maximum authorisation", "Reservation"],
    hidden: ["Provider private cost payload"],
    fields: [{ name: "maximumAuthorizationMinor", label: "Maximum authorisation in minor units", type: "number", required: true }],
    emptyAction: "avatars"
  },
  "generation-job": {
    stepKey: "generation-job",
    title: "Track HeyGen generation",
    intent: "Submit and reconcile a paid provider operation without duplicate paid work.",
    input: "Generation job id, simulator mode and idempotency key.",
    process: "The API persists provider operation before network I/O and preserves Unknown — checking.",
    output: "Generation job status, provider operation, callback or reconciliation evidence.",
    primaryCta: "Submit generation",
    secondaryCta: "Reconcile generation",
    evidence: ["Provider operation id", "Generation job id", "Reservation state", "Reconciliation"],
    hidden: ["Request hash", "Raw provider payload", "Provider secret"],
    fields: [
      {
        name: "simulatorMode",
        label: "Simulator mode",
        type: "select",
        options: [
          { value: "success", label: "Success" },
          { value: "unknown", label: "Unknown — checking" },
          { value: "failed", label: "Failed" }
        ]
      }
    ],
    emptyAction: "generation-estimate"
  },
  "composition-plan": {
    stepKey: "composition-plan",
    title: "Create AE plan",
    intent: "Turn user direction into a validated AE timeline plan bound to retained media.",
    input: "Generated asset id and composition direction.",
    process: "The API validates schema, assets, fonts, plugins, capabilities and timing.",
    output: "Composition instruction, AE plan, validation state and evidence.",
    primaryCta: "Create composition plan",
    evidence: ["AE plan id", "Validation result", "Asset ids", "Capability version"],
    hidden: ["Signed URLs", "Plan artifact object key"],
    fields: [{ name: "rawDirection", label: "Composition direction", type: "textarea", required: true }],
    emptyAction: "generation-job"
  },
  "composition-render": {
    stepKey: "composition-render",
    title: "Render final video",
    intent: "Render a retained, fingerprinted 9:16 final MP4 revision.",
    input: "Validated composition plan and idempotency key.",
    process: "The API creates a render attempt and immutable final video revision.",
    output: "Final video id, version, sha256, thumbnail/captions and render attempt.",
    primaryCta: "Render final video",
    evidence: ["Final video sha256", "Render attempt", "Revision lineage", "Captions"],
    hidden: ["Render logs payload", "Object key", "Signed URLs"],
    fields: [],
    emptyAction: "composition-plan"
  },
  review: {
    stepKey: "review",
    title: "Approve exact version",
    intent: "Bind comments and decisions to the exact final-video version.",
    input: "Review item id, decision, reason and expected final-video version.",
    process: "The API records one terminal decision or rejects stale/superseded versions.",
    output: "Decision, approval token on approve, actor and exact media hash.",
    primaryCta: "Record decision",
    evidence: ["Review item id", "Final video hash", "Comments", "Decision"],
    hidden: ["Signed media URLs"],
    fields: [
      {
        name: "reviewDecision",
        label: "Decision",
        type: "select",
        options: [
          { value: "approve", label: "Approve" },
          { value: "reject", label: "Reject" },
          { value: "request_changes", label: "Request changes" }
        ]
      },
      { name: "reviewReason", label: "Decision reason", type: "textarea", required: true }
    ],
    emptyAction: "composition-render"
  },
  calendar: {
    stepKey: "calendar",
    title: "Schedule approved post",
    intent: "Create a calendar post bound to approved exact media, account and caption.",
    input: "Approved final video, platform, account, caption and schedule.",
    process: "The API validates approval, media currency, timezone, account and conflict rules.",
    output: "Calendar post id, schedule state, manual export artifact if selected.",
    primaryCta: "Schedule post",
    evidence: ["Approval token", "Final video hash", "Platform", "Schedule"],
    hidden: ["Publishing credential metadata", "Account tokens"],
    fields: [
      {
        name: "platform",
        label: "Platform",
        type: "select",
        options: [
          { value: "meta", label: "Meta" },
          { value: "youtube-shorts", label: "YouTube Shorts" }
        ]
      },
      { name: "account", label: "Publishing account", type: "text", required: true },
      { name: "caption", label: "Approved caption", type: "textarea", required: true },
      { name: "scheduledAt", label: "Schedule time", type: "datetime-local", required: true }
    ],
    emptyAction: "review"
  },
  publish: {
    stepKey: "publish",
    title: "Submit for publication",
    intent: "Submit a scheduled post idempotently or reconcile unknown provider state.",
    input: "Calendar post, bound account and idempotency key.",
    process: "The API persists publish operation before network I/O and never treats acknowledgement as final success.",
    output: "Publish operation, external id, public URL once live, and verification pending state.",
    primaryCta: "Publish post",
    secondaryCta: "Reconcile publish operation",
    evidence: ["Publish operation id", "External id", "Provider state", "Public URL when live"],
    hidden: ["Request hash", "Raw provider payload", "Credential secret"],
    fields: [{ name: "account", label: "Publishing account", type: "text", required: true }],
    emptyAction: "calendar"
  },
  verify: {
    stepKey: "verify",
    title: "Verify live post",
    intent: "Independently confirm account, media identity, caption, visibility and publish time.",
    input: "Calendar post and manual live URL when required.",
    process: "The API observes the audience-facing post and sends completion notification only after verification.",
    output: "Verification row, evidence artifact, notification and initial performance snapshot.",
    primaryCta: "Check live post",
    evidence: ["Account match", "Media hash match", "Caption match", "Visibility", "Evidence artifact"],
    hidden: ["Observed raw account", "Observed media hash", "Observed caption raw payload"],
    fields: [{ name: "manualLiveUrl", label: "Manual live URL if required", type: "url" }],
    emptyAction: "publish"
  },
  lineage: {
    stepKey: "lineage",
    title: "Inspect lineage",
    intent: "Inspect the complete retained ancestry, cost and evidence record.",
    input: "Final video id and workspace.",
    process: "The API exports bounded, redacted lineage and performance observations.",
    output: "Manifest hash, ancestry entries, missing/mismatch states, cost and provider timestamps.",
    primaryCta: "Load lineage",
    evidence: ["Manifest sha256", "Artifact hashes", "Cost attribution", "Publication proof"],
    hidden: ["Object keys", "Signed URLs", "Raw provider payload", "Cross-workspace references"],
    fields: [],
    emptyAction: "verify"
  }
};

export function WorkflowScreenRenderer({ workspaceSlug, activeStep }: { workspaceSlug: string; activeStep: WorkflowStep }) {
  const config = screenConfigs[activeStep.key];
  return <WorkflowFunctionalScreen workspaceSlug={workspaceSlug} config={config} />;
}

function WorkflowFunctionalScreen({ workspaceSlug, config }: { workspaceSlug: string; config: ScreenConfig }) {
  const [journey, setJourney] = useState<JourneyState>(defaultJourney);
  const [pending, setPending] = useState<"primary" | "secondary" | null>(null);
  const [result, setResult] = useState<WorkflowActionResult | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const step = getStepByKey(config.stepKey);
  const nextStep = useMemo(() => {
    const index = WORKFLOW_STEPS.findIndex((candidate) => candidate.key === config.stepKey);
    return WORKFLOW_STEPS[index + 1];
  }, [config.stepKey]);

  async function runAction(kind: "primary" | "secondary") {
    setPending(kind);
    setProblem(null);
    try {
      const client = await createGeneratedWorkflowClient();
      const action = kind === "primary" ? WORKFLOW_ACTIONS[config.stepKey] : WORKFLOW_SECONDARY_ACTIONS[config.stepKey];
      if (!action) {
        setProblem("This action is not available for the current state.");
        return;
      }
      const response = await action({
        client,
        workspaceId: journey.workspaceId,
        ids: journey.ids,
        values: journey.values
      });
      setResult(response);
      if (!response.ok) {
        setProblem(readProblem(response.body));
      }
    } catch (error) {
      setProblem(error instanceof Error ? error.message : "We could not complete this action. Use the reference if you contact support.");
    } finally {
      setPending(null);
    }
  }

  function updateValue(name: string, value: string | boolean) {
    setJourney((current) => ({
      ...current,
      values: {
        ...current.values,
        [name]: value
      }
    }));
  }

  return (
    <section data-workflow-screen={config.stepKey} className="space-y-5">
      <div className="rounded-[1.5rem] border border-white/10 bg-[#101014] p-5 shadow-2xl shadow-black/30">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="font-mono text-[10px] uppercase tracking-[0.28em] text-zinc-500">{step.group}</p>
            <h1 className="mt-3 font-display text-3xl font-semibold text-white md:text-4xl">{config.title}</h1>
            <p className="mt-3 max-w-3xl text-sm leading-6 text-zinc-300">{config.intent}</p>
          </div>
          <StatusPill label={STATUS_PRESENTATION.draft.label} />
        </div>
      </div>

      {problem ? <ProblemBanner message={problem} /> : null}

      <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_360px]">
        <form
          className="rounded-[1.5rem] border border-white/10 bg-black/30 p-5"
          onSubmit={(event) => {
            event.preventDefault();
            void runAction("primary");
          }}
        >
          <div className="grid gap-4 md:grid-cols-3">
            <InfoPanel label="User input" value={config.input} />
            <InfoPanel label="System processing" value={config.process} />
            <InfoPanel label="Expected output" value={config.output} />
          </div>

          <div className="mt-6 grid gap-4">
            {config.fields.length === 0 ? (
              <EmptyState
                title="No extra input required"
                body="This step uses the retained workspace and predecessor identities shown in the evidence panel."
                action={config.emptyAction ? getStepHref(workspaceSlug, getStepByKey(config.emptyAction)) : undefined}
              />
            ) : (
              config.fields.map((field) => (
                <WorkflowField key={field.name} field={field} value={journey.values[field.name]} onChange={updateValue} />
              ))
            )}
          </div>

          <div className="mt-6 flex flex-wrap gap-3">
            <button
              type="submit"
              disabled={pending !== null}
              className="rounded-full bg-white px-5 py-3 text-sm font-semibold text-black transition hover:bg-zinc-200 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {pending === "primary" ? `${config.primaryCta}...` : config.primaryCta}
            </button>
            {config.secondaryCta ? (
              <button
                type="button"
                disabled={pending !== null}
                className="rounded-full border border-white/15 px-5 py-3 text-sm font-semibold text-white transition hover:border-white/30 disabled:cursor-not-allowed disabled:opacity-50"
                onClick={() => void runAction("secondary")}
              >
                {pending === "secondary" ? `${config.secondaryCta}...` : config.secondaryCta}
              </button>
            ) : null}
            {nextStep ? (
              <Link href={getStepHref(workspaceSlug, nextStep)} className="rounded-full border border-white/10 px-5 py-3 text-sm font-semibold text-zinc-300 hover:text-white">
                Next: {nextStep.title}
              </Link>
            ) : null}
          </div>
        </form>

        <aside className="space-y-5">
          <EvidencePanel evidence={config.evidence} hidden={config.hidden} result={result} />
          <StatePanel stepKey={config.stepKey} />
        </aside>
      </div>
    </section>
  );
}

function WorkflowField({
  field,
  value,
  onChange
}: {
  field: Field;
  value: string | boolean | undefined;
  onChange: (name: string, value: string | boolean) => void;
}) {
  const id = `field-${field.name}`;
  if (field.type === "checkbox") {
    return (
      <label htmlFor={id} className="flex items-start gap-3 rounded-2xl border border-white/10 bg-white/[0.035] p-4 text-sm text-zinc-200">
        <input
          id={id}
          name={field.name}
          type="checkbox"
          checked={value === true}
          required={field.required}
          className="mt-1"
          onChange={(event) => onChange(field.name, event.target.checked)}
        />
        <span>{field.label}</span>
      </label>
    );
  }

  if (field.type === "select") {
    return (
      <label htmlFor={id} className="grid gap-2 text-sm font-medium text-zinc-200">
        {field.label}
        <select
          id={id}
          name={field.name}
          required={field.required}
          value={String(value ?? field.options[0]?.value ?? "")}
          className="rounded-2xl border border-white/10 bg-[#111114] px-4 py-3 text-white outline-none focus:border-white/40"
          onChange={(event) => onChange(field.name, event.target.value)}
        >
          {field.options.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
      </label>
    );
  }

  if (field.type === "textarea") {
    return (
      <label htmlFor={id} className="grid gap-2 text-sm font-medium text-zinc-200">
        {field.label}
        <textarea
          id={id}
          name={field.name}
          required={field.required}
          value={String(value ?? "")}
          placeholder={field.placeholder}
          rows={4}
          className="rounded-2xl border border-white/10 bg-[#111114] px-4 py-3 text-white outline-none focus:border-white/40"
          onChange={(event) => onChange(field.name, event.target.value)}
        />
      </label>
    );
  }

  return (
    <label htmlFor={id} className="grid gap-2 text-sm font-medium text-zinc-200">
      {field.label}
      <input
        id={id}
        name={field.name}
        type={field.type}
        required={field.required}
        value={String(value ?? "")}
        placeholder={field.placeholder}
        className="rounded-2xl border border-white/10 bg-[#111114] px-4 py-3 text-white outline-none focus:border-white/40"
        onChange={(event) => onChange(field.name, event.target.value)}
      />
    </label>
  );
}

function EvidencePanel({
  evidence,
  hidden,
  result
}: {
  evidence: string[];
  hidden: string[];
  result: WorkflowActionResult | null;
}) {
  return (
    <section aria-label="Evidence" className="rounded-[1.5rem] border border-white/10 bg-[#101014] p-5">
      <h2 className="font-display text-xl font-semibold text-white">Evidence</h2>
      <div className="mt-4 grid gap-2">
        {evidence.map((item) => (
          <div key={item} className="rounded-2xl border border-white/10 bg-white/[0.035] p-3 text-sm text-zinc-200">
            {item}
          </div>
        ))}
      </div>
      <h3 className="mt-5 text-sm font-semibold text-zinc-100">Hidden from the user</h3>
      <p className="mt-2 text-sm leading-6 text-zinc-400">{hidden.join(", ")}</p>
      {result ? (
        <pre className="mt-5 max-h-72 overflow-auto rounded-2xl border border-white/10 bg-black/40 p-4 text-xs leading-5 text-zinc-300">
          {JSON.stringify(result.redactedBody, null, 2)}
        </pre>
      ) : null}
    </section>
  );
}

function StatePanel({ stepKey }: { stepKey: WorkflowStepKey }) {
  const publicationNote =
    stepKey === "publish"
      ? "Provider acknowledgement is not final success. Continue to verification before claiming publication."
      : stepKey === "verify"
        ? "Published and verified means account, media and visibility were independently confirmed."
        : "Unknown — checking is preserved whenever the provider may have accepted work.";
  return (
    <section className="rounded-[1.5rem] border border-white/10 bg-black/30 p-5">
      <h2 className="font-display text-xl font-semibold text-white">State handling</h2>
      <p className="mt-3 text-sm leading-6 text-zinc-300">{publicationNote}</p>
      <div className="mt-4 flex flex-wrap gap-2">
        <StatusPill label="Loading" />
        <StatusPill label="Empty" />
        <StatusPill label="Success" />
        <StatusPill label="Failed" />
        <StatusPill label="Unknown — checking" />
      </div>
    </section>
  );
}

function InfoPanel({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-white/10 bg-white/[0.035] p-4">
      <p className="font-mono text-[10px] uppercase tracking-[0.22em] text-zinc-500">{label}</p>
      <p className="mt-2 text-sm leading-6 text-zinc-300">{value}</p>
    </div>
  );
}

function ProblemBanner({ message }: { message: string }) {
  return (
    <div role="alert" className="rounded-[1.25rem] border border-red-300/30 bg-red-300/[0.08] p-4 text-sm text-red-100">
      {message}
    </div>
  );
}

function EmptyState({ title, body, action }: { title: string; body: string; action?: string }) {
  return (
    <div className="rounded-2xl border border-dashed border-white/15 bg-white/[0.025] p-5">
      <h2 className="text-base font-semibold text-white">{title}</h2>
      <p className="mt-2 text-sm leading-6 text-zinc-400">{body}</p>
      {action ? (
        <Link href={action} className="mt-4 inline-flex rounded-full border border-white/15 px-4 py-2 text-sm font-semibold text-zinc-200 hover:text-white">
          Open required step
        </Link>
      ) : null}
    </div>
  );
}

function StatusPill({ label }: { label: string }) {
  return <span className="rounded-full border border-white/10 bg-white/[0.04] px-3 py-1 text-xs font-semibold text-zinc-200">{label}</span>;
}

function readProblem(body: unknown): string {
  if (body && typeof body === "object") {
    const problem = body as { detail?: unknown; code?: unknown; title?: unknown };
    const title = typeof problem.title === "string" ? problem.title : "Action failed";
    const detail = typeof problem.detail === "string" ? problem.detail : "Review the highlighted state and try the documented recovery path.";
    const code = typeof problem.code === "string" ? ` Reference: ${problem.code}.` : "";
    return `${title}. ${detail}.${code}`;
  }
  return "We could not complete this action. Use the reference if you contact support.";
}

export function BrandIntakeScreen(props: { workspaceSlug: string }) {
  return <WorkflowFunctionalScreen {...props} config={screenConfigs["brand-intake"]} />;
}
export function BrandCandidatesScreen(props: { workspaceSlug: string }) {
  return <WorkflowFunctionalScreen {...props} config={screenConfigs["brand-candidates"]} />;
}
export function BrandApprovalScreen(props: { workspaceSlug: string }) {
  return <WorkflowFunctionalScreen {...props} config={screenConfigs["brand-approval"]} />;
}
export function BlueprintPathScreen(props: { workspaceSlug: string }) {
  return <WorkflowFunctionalScreen {...props} config={screenConfigs["blueprint-path"]} />;
}
export function BlueprintLibraryScreen(props: { workspaceSlug: string }) {
  return <WorkflowFunctionalScreen {...props} config={screenConfigs["blueprint-library"]} />;
}
export function ViralDiscoveryScreen(props: { workspaceSlug: string }) {
  return <WorkflowFunctionalScreen {...props} config={screenConfigs["blueprint-discovery"]} />;
}
export function MediaAcquisitionScreen(props: { workspaceSlug: string }) {
  return <WorkflowFunctionalScreen {...props} config={screenConfigs["blueprint-acquisition"]} />;
}
export function SceneBlueprintScreen(props: { workspaceSlug: string }) {
  return <WorkflowFunctionalScreen {...props} config={screenConfigs["blueprint-scene"]} />;
}
export function ReadyBlueprintScreen(props: { workspaceSlug: string }) {
  return <WorkflowFunctionalScreen {...props} config={screenConfigs["blueprint-ready"]} />;
}
export function ScriptTournamentScreen(props: { workspaceSlug: string }) {
  return <WorkflowFunctionalScreen {...props} config={screenConfigs["scripts-tournament"]} />;
}
export function ScriptSelectionScreen(props: { workspaceSlug: string }) {
  return <WorkflowFunctionalScreen {...props} config={screenConfigs["scripts-selection"]} />;
}
export function AvatarCatalogueScreen(props: { workspaceSlug: string }) {
  return <WorkflowFunctionalScreen {...props} config={screenConfigs.avatars} />;
}
export function GenerationEstimateScreen(props: { workspaceSlug: string }) {
  return <WorkflowFunctionalScreen {...props} config={screenConfigs["generation-estimate"]} />;
}
export function GenerationJobScreen(props: { workspaceSlug: string }) {
  return <WorkflowFunctionalScreen {...props} config={screenConfigs["generation-job"]} />;
}
export function CompositionPlanScreen(props: { workspaceSlug: string }) {
  return <WorkflowFunctionalScreen {...props} config={screenConfigs["composition-plan"]} />;
}
export function CompositionRenderScreen(props: { workspaceSlug: string }) {
  return <WorkflowFunctionalScreen {...props} config={screenConfigs["composition-render"]} />;
}
export function ReviewScreen(props: { workspaceSlug: string }) {
  return <WorkflowFunctionalScreen {...props} config={screenConfigs.review} />;
}
export function CalendarScreen(props: { workspaceSlug: string }) {
  return <WorkflowFunctionalScreen {...props} config={screenConfigs.calendar} />;
}
export function PublishScreen(props: { workspaceSlug: string }) {
  return <WorkflowFunctionalScreen {...props} config={screenConfigs.publish} />;
}
export function VerifyScreen(props: { workspaceSlug: string }) {
  return <WorkflowFunctionalScreen {...props} config={screenConfigs.verify} />;
}
export function LineageScreen(props: { workspaceSlug: string }) {
  return <WorkflowFunctionalScreen {...props} config={screenConfigs.lineage} />;
}
