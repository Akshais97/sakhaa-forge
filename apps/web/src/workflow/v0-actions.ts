import type { WorkflowStepKey } from "./v0-workflow";

export type WorkflowResponse = {
  ok: boolean;
  status: number;
  body: unknown;
};

export type WorkflowClient = Record<string, (...args: any[]) => Promise<WorkflowResponse>>;

export type WorkflowActionContext = {
  client: WorkflowClient;
  workspaceId: string;
  ids: Record<string, string | undefined>;
  values: Record<string, string | boolean | undefined>;
};

export type WorkflowActionResult = WorkflowResponse & {
  redactedBody: unknown;
};

type WorkflowAction = (context: WorkflowActionContext) => Promise<WorkflowActionResult>;

const idempotentOptions = () => ({ idempotencyKey: makeIdempotencyKey() });

export function makeIdempotencyKey(prefix = "web-v0"): string {
  const entropy =
    typeof crypto !== "undefined" && "randomUUID" in crypto
      ? crypto.randomUUID()
      : `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  return `${prefix}-${entropy}`;
}

export async function createGeneratedWorkflowClient(options: {
  baseUrl?: string;
  authToken?: string | null;
  fetchImpl?: typeof fetch;
} = {}): Promise<WorkflowClient> {
  // @ts-ignore generated ESM client has no TypeScript declaration in this repo yet.
  const { V0Client } = await import("../../../../packages/contracts/generated/v0-client.mjs");
  const boundFetchImpl = options.fetchImpl ?? globalThis.fetch.bind(globalThis);
  return new V0Client({ ...options, fetchImpl: boundFetchImpl }) as WorkflowClient;
}

export function redactWorkflowResponse(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(redactWorkflowResponse);
  }
  if (!value || typeof value !== "object") {
    return value;
  }

  const forbiddenKeys = new Set([
    "signedUrl",
    "signed_url",
    "objectKey",
    "object_key",
    "requestHash",
    "request_hash",
    "rawProviderPayload",
    "raw_provider_payload",
    "secretRef",
    "secret_ref",
    "consentEvidenceRef",
    "consent_evidence_ref",
    "apiKey",
    "password",
    "token"
  ]);

  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>).map(([key, entry]) => [
      key,
      forbiddenKeys.has(key) ? "[redacted]" : redactWorkflowResponse(entry)
    ])
  );
}

async function withRedaction(request: Promise<WorkflowResponse>): Promise<WorkflowActionResult> {
  const response = await request;
  return {
    ...response,
    redactedBody: redactWorkflowResponse(response.body)
  };
}

export const WORKFLOW_ACTIONS: Record<WorkflowStepKey, WorkflowAction> = {
  "brand-intake": ({ client, workspaceId, values }) =>
    withRedaction(
      client.createBrandCrawlRun(
        {
          workspaceId,
          websiteUrl: values.websiteUrl,
          rightsAcknowledged: values.rightsAcknowledged === true
        },
        idempotentOptions()
      )
    ),

  "brand-candidates": ({ client, ids }) => withRedaction(client.listBrandCandidates(ids.crawlRunId)),

  "brand-approval": ({ client, workspaceId, ids, values }) =>
    withRedaction(
      client.approveBrandProfile(ids.brandId, {
        workspaceId,
        crawlRunId: ids.crawlRunId,
        optimisticProfileVersion: Number(values.optimisticProfileVersion || 1),
        rightsAttestation: values.rightsAttestation,
        approvedFields: {
          publicName: values.publicName,
          industry: "real_estate",
          positioning: values.positioning,
          targetAudience: values.targetAudience,
          cta: values.cta,
          tone: values.tone
        },
        rules: {
          required: values.requiredRule ? [values.requiredRule] : [],
          prohibited: values.prohibitedRule ? [values.prohibitedRule] : []
        }
      })
    ),

  "blueprint-path": ({ client, workspaceId, ids, values }) =>
    withRedaction(
      client.createBlueprintRequest({
        workspaceId,
        brandProfileId: ids.brandProfileId,
        brandProfileVersion: Number(values.brandProfileVersion || 1),
        path: values.blueprintPath || "new_discovery",
        objectiveType: "short_form_video",
        objective: values.objective
      })
    ),

  "blueprint-library": ({ client, workspaceId, ids }) =>
    withRedaction(client.listBlueprints({ workspaceId, brandProfileId: ids.brandProfileId, limit: 20 })),

  "blueprint-discovery": ({ client, workspaceId, ids, values }) =>
    withRedaction(
      client.searchViralCandidates({
        workspaceId,
        blueprintRequestId: ids.blueprintRequestId,
        niche: values.niche,
        simulatorMode: values.simulatorMode || "success"
      })
    ),

  "blueprint-acquisition": ({ client, workspaceId, ids, values }) =>
    withRedaction(
      client.extractViralCandidateBlueprint(ids.candidateId, {
        workspaceId,
        rightsDecision: values.rightsDecision || "retain_analysis_copy",
        retrievalPolicy: values.retrievalPolicy || "approved",
        expectedSourceHash: values.expectedSourceHash
      })
    ),

  "blueprint-scene": ({ client, workspaceId, ids, values }) =>
    withRedaction(
      client.createSceneBlueprint(ids.candidateId, {
        workspaceId,
        mediaAcquisitionId: ids.mediaAcquisitionId,
        thumbnailBlueprintId: ids.thumbnailBlueprintId,
        expectedSourceHash: values.expectedSourceHash
      })
    ),

  "blueprint-ready": ({ client, workspaceId, ids, values }) =>
    withRedaction(
      client.createReadyBlueprint(ids.blueprintRequestId, {
        workspaceId,
        videoBlueprintId: ids.videoBlueprintId,
        source: values.readySource || "extracted_blueprint"
      })
    ),

  "scripts-tournament": ({ client, workspaceId, ids, values }) =>
    withRedaction(
      client.createScriptTournament(
        {
          workspaceId,
          blueprintRequestId: ids.blueprintRequestId,
          variantCount: Number(values.variantCount || 10),
          simulatorMode: values.simulatorMode || "success"
        },
        idempotentOptions()
      )
    ),

  "scripts-selection": ({ client, workspaceId, ids, values }) =>
    withRedaction(
      client.selectScriptVariant(
        ids.tournamentId,
        {
          workspaceId,
          variantId: ids.variantId || values.variantId,
          optimisticTournamentVersion: Number(values.optimisticTournamentVersion || 1),
          humanOverride: values.humanOverride === true
        },
        idempotentOptions()
      )
    ),

  avatars: ({ client, workspaceId, ids }) =>
    withRedaction(client.listAvatars({ workspaceId, brandProfileId: ids.brandProfileId, limit: 20 })),

  "generation-estimate": ({ client, workspaceId, ids, values }) =>
    withRedaction(
      client.createGenerationEstimate({
        workspaceId,
        brandProfileId: ids.brandProfileId,
        selectedScriptId: ids.selectedScriptId,
        avatarProfileId: ids.avatarProfileId || values.avatarProfileId
      })
    ),

  "generation-job": ({ client, workspaceId, ids, values }) =>
    withRedaction(
      client.submitGenerationJob(
        ids.generationJobId,
        {
          workspaceId,
          simulatorMode: values.simulatorMode || "success"
        },
        idempotentOptions()
      )
    ),

  "composition-plan": ({ client, workspaceId, ids, values }) =>
    withRedaction(
      client.createCompositionPlan({
        workspaceId,
        generationAssetId: ids.generationAssetId,
        inputMode: "direction",
        rawDirection: values.rawDirection,
        timeline: []
      })
    ),

  "composition-render": ({ client, workspaceId, ids }) =>
    withRedaction(client.renderCompositionPlan(ids.compositionPlanId, { workspaceId }, idempotentOptions())),

  review: ({ client, workspaceId, ids, values }) =>
    withRedaction(
      client.recordReviewDecision(
        ids.reviewItemId,
        {
          workspaceId,
          decision: values.reviewDecision || "approve",
          reason: values.reviewReason || "Approved for publication.",
          expectedFinalVideoVersion: Number(values.finalVideoVersion || 1)
        },
        idempotentOptions()
      )
    ),

  calendar: ({ client, workspaceId, ids, values }) =>
    withRedaction(
      client.createCalendarPost(
        {
          workspaceId,
          finalVideoId: ids.finalVideoId,
          finalVideoSha256: values.finalVideoSha256,
          finalVideoVersion: Number(values.finalVideoVersion || 1),
          approvalToken: ids.approvalToken || values.approvalToken,
          platform: values.platform || "meta",
          account: values.account,
          caption: values.caption,
          scheduledAt: values.scheduledAt,
          timezone: "Asia/Kolkata",
          manualExport: values.manualExport === true
        },
        idempotentOptions()
      )
    ),

  publish: ({ client, workspaceId, ids, values }) =>
    withRedaction(
      client.publishCalendarPost(
        ids.calendarPostId,
        {
          workspaceId,
          account: values.account
        },
        idempotentOptions()
      )
    ),

  verify: ({ client, workspaceId, ids, values }) =>
    withRedaction(
      client.verifyCalendarPost(ids.calendarPostId, {
        workspaceId,
        manualLiveUrl: values.manualLiveUrl,
        mode: values.verifyMode || "verified"
      })
    ),

  lineage: ({ client, workspaceId, ids }) =>
    withRedaction(client.getLineage(ids.finalVideoId, { workspaceId }))
};

export const WORKFLOW_SECONDARY_ACTIONS: Partial<Record<WorkflowStepKey, WorkflowAction>> = {
  "generation-estimate": ({ client, workspaceId, ids, values }) =>
    withRedaction(
      client.confirmGenerationEstimate(
        ids.estimateId,
        {
          workspaceId,
          maximumAuthorizationMinor: Number(values.maximumAuthorizationMinor || 0)
        },
        idempotentOptions()
      )
    ),
  "generation-job": ({ client, workspaceId, ids, values }) =>
    withRedaction(
      client.reconcileGenerationJob(
        ids.generationJobId,
        {
          workspaceId,
          reconcileOutcome: values.reconcileOutcome || "completed"
        },
        idempotentOptions()
      )
    ),
  publish: ({ client, workspaceId, ids, values }) =>
    withRedaction(
      client.reconcilePublishOperation(
        ids.calendarPostId,
        {
          workspaceId,
          reconcileOutcome: values.reconcileOutcome || "completed"
        },
        idempotentOptions()
      )
    ),
  lineage: ({ client, workspaceId, ids }) =>
    withRedaction(client.getLineage(ids.finalVideoId, { workspaceId }))
};

export const WORKFLOW_READ_ACTIONS: Partial<Record<WorkflowStepKey, WorkflowAction>> = {
  "generation-job": ({ client, workspaceId, ids }) =>
    withRedaction(client.getGenerationJob(ids.generationJobId, { workspaceId })),
  review: ({ client, workspaceId, ids }) =>
    ids.reviewItemId
      ? withRedaction(client.getReviewItem(ids.reviewItemId, { workspaceId }))
      : withRedaction(
          client.createReviewItem(
            {
              workspaceId,
              finalVideoId: ids.finalVideoId,
              finalVideoVersion: 1,
              reviewType: "client_review"
            },
            idempotentOptions()
          )
        ),
  calendar: ({ client, workspaceId, ids }) =>
    withRedaction(client.createReviewItem({ workspaceId, finalVideoId: ids.finalVideoId, finalVideoVersion: 1, reviewType: "client_review" }, idempotentOptions()))
};
