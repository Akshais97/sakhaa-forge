import "reflect-metadata";
import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { Controller, Get, HttpCode, HttpException, Module, Param, Patch, Post, Query, Req } from "@nestjs/common";
import { NestFactory } from "@nestjs/core";
import { FastifyAdapter } from "@nestjs/platform-fastify";
import { authenticateRequest } from "./auth.mjs";
import { getBuildInfo } from "./build-info.mjs";
import { canPerform } from "./permissions.mjs";
import { getHealth, getReadiness } from "./readiness.mjs";
import { createStore, resolvePublishCallbackAdapter } from "./workspace-store.mjs";

const currentDir = dirname(fileURLToPath(import.meta.url));
const openApiPath = resolve(currentDir, "../../../packages/contracts/generated/openapi.v0.json");

export async function createApiServer(env = process.env) {
  const { AppModule, store } = createAppModule(env);
  const app = await NestFactory.create(
    AppModule,
    new FastifyAdapter({ logger: false }),
    { logger: false }
  );

  await app.init();
  const close = app.close.bind(app);
  app.close = async () => {
    await close();
    if (typeof store.disconnect === "function") {
      await store.disconnect();
    }
  };
  // Test-only: expose the store to the in-process test harness so fault-injection hooks (e.g.
  // corruptRetainedHashForTest, addMembershipRoleForTest) can mutate retained state for proof
  // paths that no public happy-path behaviour can produce. Never attached outside APP_ENV=test.
  if (env.APP_ENV === "test") {
    testStores.set(app, store);
  }
  return app;
}

// Side channel for the in-process test harness to reach the store's test-only fault-injection
// hooks. The Nest application object is a proxy that rejects ad-hoc property writes, so the
// store is held in a WeakMap keyed by the app instance and only populated in APP_ENV=test.
const testStores = new WeakMap();

export function getTestStore(app) {
  return testStores.get(app);
}

function createAppModule(env) {
  const store = createStore(env);
  const RootController = createF0Controller(env, store, "");
  const V0Controller = createF0Controller(env, store, "api/v0");

  class AppModule {}
  Module({
    controllers: [RootController, V0Controller]
  })(AppModule);

  return { AppModule, store };
}

function createF0Controller(env, store, prefix) {
  class F0Controller {
    health() {
      return getHealth(env);
    }

    ready() {
      const readiness = getReadiness(env);
      if (readiness.status !== "ready") {
        throw new HttpException(readiness, 503);
      }
      return readiness;
    }

    version() {
      return getBuildInfo(env);
    }

    async openapi() {
      return JSON.parse(await readFile(openApiPath, "utf8"));
    }

    async createWorkspace(request) {
      const auth = authenticateRequest(request.headers, env);
      if (!auth.ok) {
        throw new HttpException(auth.problem, auth.problem.status);
      }

      const body = request.body ?? {};
      const idempotencyKey = request.headers["idempotency-key"];
      if (typeof idempotencyKey !== "string" || idempotencyKey.trim().length === 0) {
        throw new HttpException(
          problem(
            "IDEMPOTENCY_KEY_REQUIRED",
            400,
            "Idempotency key required",
            "This action needs a request identity. Refresh and try again.",
            true
          ),
          400
        );
      }
      if (typeof body.name !== "string" || body.name.trim().length === 0 || body.name.length > 120) {
        throw new HttpException(problem("VALIDATION_FAILED", 422, "Validation failed", "Check the highlighted fields."), 422);
      }

      let result;
      try {
        result = await store.runIdempotent(
          {
            actor: auth.actor,
            operation: "workspace.create",
            idempotencyKey: idempotencyKey.trim(),
            input: body
          },
          () => store.createWorkspace(auth.actor, body)
        );
      } catch (error) {
        if (env.V0_EXPOSE_TEST_ERRORS === "1") {
          throw new HttpException(
            problem(
              "RUNTIME_DB_WRITE_FAILED",
              500,
              "Runtime database write failed",
              sanitizeError(error)
            ),
            500
          );
        }
        throw error;
      }
      if (!result.ok) {
        throw new HttpException(result.problem, result.problem.status);
      }

      return result.response;
    }

    async listWorkspaces(request) {
      const auth = authenticateRequest(request.headers, env);
      if (!auth.ok) {
        throw new HttpException(auth.problem, auth.problem.status);
      }

      return {
        workspaces: await store.listWorkspaces(auth.actor)
      };
    }

    async getWorkspace(request, workspaceId) {
      const auth = authenticateRequest(request.headers, env);
      if (!auth.ok) {
        throw new HttpException(auth.problem, auth.problem.status);
      }

      const result = await store.getWorkspaceForActor(auth.actor, workspaceId);
      if (!result) {
        throw new HttpException(
          problem("WORKSPACE_ACCESS_DENIED", 404, "Workspace access denied", "We could not find that item."),
          404
        );
      }

      return result;
    }

    async setWorkspaceCapability(request, workspaceId) {
      const auth = authenticateRequest(request.headers, env);
      if (!auth.ok) {
        throw new HttpException(auth.problem, auth.problem.status);
      }

      const workspaceAccess = await store.getWorkspaceForActor(auth.actor, workspaceId);
      if (!workspaceAccess) {
        throw new HttpException(
          problem("WORKSPACE_ACCESS_DENIED", 404, "Workspace access denied", "We could not find that item."),
          404
        );
      }
      if (!canPerform(workspaceAccess.membership.role, "manage_workspace_capabilities")) {
        throw new HttpException(
          problem("PERMISSION_DENIED", 403, "Permission denied", "Your role cannot perform this action."),
          403
        );
      }

      const result = await store.setWorkspaceCapability(auth.actor, workspaceId, request.body ?? {});
      if (!result.ok) {
        throw new HttpException(result.problem, result.problem.status);
      }
      return result.response;
    }

    async initiateBrandAssetUpload(request) {
      const auth = authenticateRequest(request.headers, env);
      if (!auth.ok) {
        throw new HttpException(auth.problem, auth.problem.status);
      }

      const idempotencyKey = request.headers["idempotency-key"];
      if (typeof idempotencyKey !== "string" || idempotencyKey.trim().length === 0) {
        throw new HttpException(
          problem(
            "IDEMPOTENCY_KEY_REQUIRED",
            400,
            "Idempotency key required",
            "This action needs a request identity. Refresh and try again.",
            true
          ),
          400
        );
      }

      const body = request.body ?? {};
      const result = await store.runIdempotent(
        {
          actor: auth.actor,
          operation: "artifact.upload.initiate",
          idempotencyKey: idempotencyKey.trim(),
          input: body
        },
        async () => {
          const initiated = await store.initiateArtifactUpload(auth.actor, body);
          if (!initiated.ok) {
            throw new HttpException(initiated.problem, initiated.problem.status);
          }
          return initiated.response;
        }
      );
      if (!result.ok) {
        throw new HttpException(result.problem, result.problem.status);
      }
      return result.response;
    }

    async completeBrandAssetUpload(request, artifactId) {
      const auth = authenticateRequest(request.headers, env);
      if (!auth.ok) {
        throw new HttpException(auth.problem, auth.problem.status);
      }

      const result = await store.completeArtifactUpload(auth.actor, artifactId, request.body ?? {});
      if (!result.ok) {
        throw new HttpException(result.problem, result.problem.status);
      }
      return result.response;
    }

    async createArtifactDownload(request, artifactId) {
      const auth = authenticateRequest(request.headers, env);
      if (!auth.ok) {
        throw new HttpException(auth.problem, auth.problem.status);
      }

      const result = await store.createArtifactDownload(auth.actor, artifactId, request.body ?? {});
      if (!result.ok) {
        throw new HttpException(result.problem, result.problem.status);
      }
      return result.response;
    }

    async createBrandCrawlRun(request) {
      const auth = authenticateRequest(request.headers, env);
      if (!auth.ok) {
        throw new HttpException(auth.problem, auth.problem.status);
      }

      const idempotencyKey = request.headers["idempotency-key"];
      if (typeof idempotencyKey !== "string" || idempotencyKey.trim().length === 0) {
        throw new HttpException(
          problem(
            "IDEMPOTENCY_KEY_REQUIRED",
            400,
            "Idempotency key required",
            "This action needs a request identity. Refresh and try again.",
            true
          ),
          400
        );
      }

      const result = await store.runIdempotent(
        {
          actor: auth.actor,
          operation: "brand.crawl_run.create",
          idempotencyKey: idempotencyKey.trim(),
          input: request.body ?? {}
        },
        async () => {
          const created = await store.createBrandCrawlRun(auth.actor, request.body ?? {});
          if (!created.ok) {
            throw new HttpException(created.problem, created.problem.status);
          }
          return created.response;
        }
      );
      if (!result.ok) {
        throw new HttpException(result.problem, result.problem.status);
      }
      return result.response;
    }

    async listBrandCandidates(request, crawlRunId) {
      const auth = authenticateRequest(request.headers, env);
      if (!auth.ok) {
        throw new HttpException(auth.problem, auth.problem.status);
      }
      const result = await store.listBrandCandidates(auth.actor, crawlRunId);
      if (!result.ok) {
        throw new HttpException(result.problem, result.problem.status);
      }
      return result.response;
    }

    async approveBrandProfile(request, brandId) {
      const auth = authenticateRequest(request.headers, env);
      if (!auth.ok) {
        throw new HttpException(auth.problem, auth.problem.status);
      }
      await assertWorkspacePermission(store, auth.actor, request.body?.workspaceId, "approve_brand_profile");
      const result = await store.approveBrandProfile(auth.actor, brandId, request.body ?? {});
      if (!result.ok) {
        throw new HttpException(result.problem, result.problem.status);
      }
      return result.response;
    }

    async createGenerationEstimate(request) {
      const auth = authenticateRequest(request.headers, env);
      if (!auth.ok) {
        throw new HttpException(auth.problem, auth.problem.status);
      }
      await assertWorkspacePermission(store, auth.actor, request.body?.workspaceId, "confirm_paid_generation");
      let result;
      try {
        result = await store.createGenerationEstimate(auth.actor, request.body ?? {});
      } catch (error) {
        if (env.V0_EXPOSE_TEST_ERRORS === "1") {
          throw new HttpException(
            problem("RUNTIME_DB_WRITE_FAILED", 500, "Runtime database write failed", sanitizeError(error)),
            500
          );
        }
        throw error;
      }
      if (!result.ok) {
        throw new HttpException(result.problem, result.problem.status);
      }
      return result.response;
    }

    // V0-G3: confirm a versioned estimate and atomically reserve credits for one
    // generation. This is a costly, externally visible paid mutation, so it
    // requires an Idempotency-Key and runs through store.runIdempotent; a replay
    // with the same key returns the original confirmation and never reserves a
    // second time, while a replay with different details returns
    // IDEMPOTENCY_INPUT_CONFLICT. The capability is the same confirm_paid_generation
    // capability that guards estimate creation.
    async confirmGenerationEstimate(request, estimateId) {
      const auth = authenticateRequest(request.headers, env);
      if (!auth.ok) {
        throw new HttpException(auth.problem, auth.problem.status);
      }
      const body = request.body ?? {};
      await assertWorkspacePermission(store, auth.actor, body.workspaceId, "confirm_paid_generation");
      const idempotencyKey = requireIdempotencyKey(request.headers, env);
      const input = { ...body, estimateId, idempotencyKey };
      const result = await store.runIdempotent(
        {
          actor: auth.actor,
          operation: "generation.estimate.confirm",
          idempotencyKey: idempotencyKey.trim(),
          input
        },
        async () => {
          let confirmed;
          try {
            confirmed = await store.confirmGenerationEstimate(auth.actor, input);
          } catch (error) {
            if (env.V0_EXPOSE_TEST_ERRORS === "1") {
              throw new HttpException(
                problem("RUNTIME_DB_WRITE_FAILED", 500, "Runtime database write failed", sanitizeError(error)),
                500
              );
            }
            throw error;
          }
          if (!confirmed.ok) {
            throw new HttpException(confirmed.problem, confirmed.problem.status);
          }
          return confirmed.response;
        }
      );
      if (!result.ok) {
        throw new HttpException(result.problem, result.problem.status);
      }
      return result.response;
    }

    async getGenerationJob(request, jobId, query) {
      const auth = authenticateRequest(request.headers, env);
      if (!auth.ok) {
        throw new HttpException(auth.problem, auth.problem.status);
      }
      const result = await store.getGenerationJob(auth.actor, {
        jobId,
        workspaceId: query?.workspaceId
      });
      if (!result.ok) {
        throw new HttpException(result.problem, result.problem.status);
      }
      return result.response;
    }

    // V0-G4: submit a queued generation job to the HeyGen simulator exactly once.
    // A costly, externally visible paid mutation: requires an Idempotency-Key and
    // the confirm_paid_generation capability. A replay returns the existing
    // operation and never calls the provider again.
    async submitGenerationJob(request, jobId) {
      const auth = authenticateRequest(request.headers, env);
      if (!auth.ok) {
        throw new HttpException(auth.problem, auth.problem.status);
      }
      const body = request.body ?? {};
      await assertWorkspacePermission(store, auth.actor, body.workspaceId, "confirm_paid_generation");
      const idempotencyKey = requireIdempotencyKey(request.headers, env);
      const input = { ...body, jobId, idempotencyKey };
      let result;
      try {
        result = await store.submitGenerationJob(auth.actor, input);
      } catch (error) {
        if (env.V0_EXPOSE_TEST_ERRORS === "1") {
          throw new HttpException(
            problem("RUNTIME_DB_WRITE_FAILED", 500, "Runtime database write failed", sanitizeError(error)),
            500
          );
        }
        throw error;
      }
      if (!result.ok) {
        throw new HttpException(result.problem, result.problem.status);
      }
      return result.response;
    }

    // V0-G4: reconcile an uncertain provider operation. A recovery action: requires
    // an Idempotency-Key and an authorised actor. Never resubmits.
    async reconcileGenerationJob(request, jobId) {
      const auth = authenticateRequest(request.headers, env);
      if (!auth.ok) {
        throw new HttpException(auth.problem, auth.problem.status);
      }
      const body = request.body ?? {};
      await assertWorkspacePermission(store, auth.actor, body.workspaceId, "confirm_paid_generation");
      const idempotencyKey = requireIdempotencyKey(request.headers, env);
      const input = { ...body, jobId, idempotencyKey };
      const result = await store.reconcileGenerationJob(auth.actor, input);
      if (!result.ok) {
        throw new HttpException(result.problem, result.problem.status);
      }
      return result.response;
    }

    // V0-G4: cancel a generation. Cancellation is a request: 202 Accepted. Uncertain
    // provider operations reconcile first; if still uncertain the job is
    // cancel_requested and the response carries uncertain: true.
    async cancelGenerationJob(request, jobId) {
      const auth = authenticateRequest(request.headers, env);
      if (!auth.ok) {
        throw new HttpException(auth.problem, auth.problem.status);
      }
      const body = request.body ?? {};
      await assertWorkspacePermission(store, auth.actor, body.workspaceId, "confirm_paid_generation");
      const idempotencyKey = requireIdempotencyKey(request.headers, env);
      const input = { ...body, jobId, idempotencyKey };
      const result = await store.cancelGenerationJob(auth.actor, input);
      if (!result.ok) {
        throw new HttpException(result.problem, result.problem.status);
      }
      return result.response;
    }

    // V0-G5: settle a terminal provider operation. Completed media is retained into
    // private V0 storage, validated and bound to lineage; credits are captured once on
    // success or released once on failure. Settlement is idempotent and crash-recoverable.
    // A billing action: requires an Idempotency-Key and an authorised actor.
    async settleGenerationJob(request, jobId) {
      const auth = authenticateRequest(request.headers, env);
      if (!auth.ok) {
        throw new HttpException(auth.problem, auth.problem.status);
      }
      const body = request.body ?? {};
      await assertWorkspacePermission(store, auth.actor, body.workspaceId, "confirm_paid_generation");
      const idempotencyKey = requireIdempotencyKey(request.headers, env);
      const input = { ...body, jobId, idempotencyKey };
      let result;
      try {
        result = await store.settleGenerationJob(auth.actor, input);
      } catch (error) {
        if (env.V0_EXPOSE_TEST_ERRORS === "1") {
          throw new HttpException(
            problem("RUNTIME_DB_WRITE_FAILED", 500, "Runtime database write failed", sanitizeError(error)),
            500
          );
        }
        throw error;
      }
      if (!result.ok) {
        throw new HttpException(result.problem, result.problem.status);
      }
      return result.response;
    }

    // V0-C1: validate a composition intent and AE plan against the deterministic AE
    // capability registry. A valid plan is retained as `validated` with a CLEAN plan
    // artifact; a malformed plan or capability mismatch is retained as `validation_failed`
    // with every unsupported item explained. Composition planning is not a paid or
    // externally visible mutation, so no idempotency key is required. Requires an
    // authorised actor with the blueprint/run-scripts capability.
    async createCompositionPlan(request) {
      const auth = authenticateRequest(request.headers, env);
      if (!auth.ok) {
        throw new HttpException(auth.problem, auth.problem.status);
      }
      const body = request.body ?? {};
      await assertWorkspacePermission(store, auth.actor, body.workspaceId, "select_blueprint_and_run_scripts");
      const input = {
        workspaceId: body.workspaceId,
        generationAssetId: body.generationAssetId,
        inputMode: body.inputMode,
        rawDirection: body.rawDirection,
        timeline: body.timeline
      };
      let result;
      try {
        result = await store.createCompositionPlan(auth.actor, input);
      } catch (error) {
        if (env.V0_EXPOSE_TEST_ERRORS === "1") {
          throw new HttpException(
            problem("RUNTIME_DB_WRITE_FAILED", 500, "Runtime database write failed", sanitizeError(error)),
            500
          );
        }
        throw error;
      }
      if (!result.ok) {
        throw new HttpException(result.problem, result.problem.status);
      }
      return result.response;
    }

    // V0-C2: render a validated composition plan into one retained 9:16 final MP4, thumbnail
    // and captions through the deterministic AE worker. Render is a costly mutation producing
    // retained artifacts, so an Idempotency-Key is required and the RenderAttempt is persisted
    // before the worker runs. Requires an authorised actor with the blueprint/run-scripts
    // capability. A worker crash is recovered once; capability drift and incompatible output
    // are classified and never retain a final video.
    async renderCompositionPlan(request, compositionPlanId) {
      const auth = authenticateRequest(request.headers, env);
      if (!auth.ok) {
        throw new HttpException(auth.problem, auth.problem.status);
      }
      const body = request.body ?? {};
      await assertWorkspacePermission(store, auth.actor, body.workspaceId, "select_blueprint_and_run_scripts");
      const idempotencyKey = requireIdempotencyKey(request.headers, env);
      const input = {
        workspaceId: body.workspaceId,
        compositionInstructionId: compositionPlanId,
        idempotencyKey
      };
      let result;
      try {
        result = await store.renderCompositionPlan(auth.actor, input);
      } catch (error) {
        if (env.V0_EXPOSE_TEST_ERRORS === "1") {
          throw new HttpException(
            problem("RUNTIME_DB_WRITE_FAILED", 500, "Runtime database write failed", sanitizeError(error)),
            500
          );
        }
        throw error;
      }
      if (!result.ok) {
        throw new HttpException(result.problem, result.problem.status);
      }
      return result.response;
    }

    // V0-R1: open a review item bound to one exact final-video version. One review item exists
    // per exact final-video version; a second open with a fresh key replays the same item.
    // Opening a review item for a superseded final video is rejected (REVIEW_VERSION_STALE).
    // Requires an authorised actor with the blueprint/run-scripts capability and an
    // Idempotency-Key. The open mutation is key-bound (input-bound), not just resource-bound: the
    // same key + same input replays the same review item, and the same key + different input
    // (different finalVideoId or reviewStage) returns IDEMPOTENCY_INPUT_CONFLICT (409) and opens
    // no review item.
    async createReviewItem(request) {
      const auth = authenticateRequest(request.headers, env);
      if (!auth.ok) {
        throw new HttpException(auth.problem, auth.problem.status);
      }
      const body = request.body ?? {};
      await assertWorkspacePermission(store, auth.actor, body.workspaceId, "select_blueprint_and_run_scripts");
      const idempotencyKey = requireIdempotencyKey(request.headers, env);
      const input = {
        workspaceId: body.workspaceId,
        finalVideoId: body.finalVideoId,
        reviewStage: body.reviewStage
      };
      let result;
      try {
        result = await store.runIdempotent(
          {
            actor: auth.actor,
            operation: "review.item.create",
            idempotencyKey: idempotencyKey.trim(),
            input
          },
          async () => {
            const opened = await store.createReviewItem(auth.actor, input);
            if (!opened.ok) {
              throw new HttpException(opened.problem, opened.problem.status);
            }
            return opened.response;
          }
        );
      } catch (error) {
        // A business-rule HttpException (REVIEW_VERSION_STALE, VALIDATION_FAILED,
        // IDEMPOTENCY_INPUT_CONFLICT, ...) carries its own problem and status and must surface
        // unchanged. Only genuine, unexpected DB errors are sanitised into RUNTIME_DB_WRITE_FAILED.
        if (error instanceof HttpException) {
          throw error;
        }
        if (env.V0_EXPOSE_TEST_ERRORS === "1") {
          throw new HttpException(
            problem("RUNTIME_DB_WRITE_FAILED", 500, "Runtime database write failed", sanitizeError(error)),
            500
          );
        }
        throw error;
      }
      if (!result.ok) {
        throw new HttpException(result.problem, result.problem.status);
      }
      return result.response;
    }

    // V0-R1: add a timestamped append-only comment to a review item. Any comment-capable role
    // (including Reviewer) may comment. A comment against a superseded bound version is rejected
    // (REVIEW_VERSION_STALE) and archives the review item; prior comments are preserved. Repeated
    // comment activity on one review item collapses to one logical notification. Requires an
    // Idempotency-Key; the same key replayed with the same input returns the same comment and
    // notification, and with different input returns IDEMPOTENCY_INPUT_CONFLICT.
    async addReviewComment(request, reviewItemId) {
      const auth = authenticateRequest(request.headers, env);
      if (!auth.ok) {
        throw new HttpException(auth.problem, auth.problem.status);
      }
      const body = request.body ?? {};
      await assertWorkspacePermission(store, auth.actor, body.workspaceId, "submit_review_comments");
      const idempotencyKey = requireIdempotencyKey(request.headers, env);
      const input = {
        reviewItemId,
        workspaceId: body.workspaceId,
        body: body.body,
        timestampMs: body.timestampMs,
        threadId: body.threadId,
        idempotencyKey
      };
      let result;
      try {
        result = await store.runIdempotent(
          {
            actor: auth.actor,
            operation: "review.comment.add",
            idempotencyKey: idempotencyKey.trim(),
            input
          },
          async () => {
            const added = await store.addReviewComment(auth.actor, input);
            if (!added.ok) {
              throw new HttpException(added.problem, added.problem.status);
            }
            return added.response;
          }
        );
      } catch (error) {
        // A business-rule HttpException (REVIEW_VERSION_STALE, VALIDATION_FAILED, ...) carries
        // its own problem and status and must surface unchanged. Only genuine, unexpected DB
        // errors are sanitised into RUNTIME_DB_WRITE_FAILED.
        if (error instanceof HttpException) {
          throw error;
        }
        if (env.V0_EXPOSE_TEST_ERRORS === "1") {
          throw new HttpException(
            problem("RUNTIME_DB_WRITE_FAILED", 500, "Runtime database write failed", sanitizeError(error)),
            500
          );
        }
        throw error;
      }
      if (!result.ok) {
        throw new HttpException(result.problem, result.problem.status);
      }
      return result.response;
    }

    // V0-R1: read one review item with its preserved comments and a preview of the bound final
    // video and artifacts. No signed URL, object key or secret is surfaced. Any comment-capable
    // role may view the review item it can comment on.
    async getReviewItem(request, reviewItemId, query) {
      const auth = authenticateRequest(request.headers, env);
      if (!auth.ok) {
        throw new HttpException(auth.problem, auth.problem.status);
      }
      await assertWorkspacePermission(store, auth.actor, query?.workspaceId, "submit_review_comments");
      const result = await store.getReviewItem(auth.actor, {
        reviewItemId,
        workspaceId: query.workspaceId
      });
      if (!result.ok) {
        throw new HttpException(result.problem, result.problem.status);
      }
      return result.response;
    }

    // V0-R1: list review items for one workspace with cursor pagination, newest first. Requires
    // the blueprint/run-scripts capability (the production roles that open reviews).
    async listReviewItems(request, query) {
      const auth = authenticateRequest(request.headers, env);
      if (!auth.ok) {
        throw new HttpException(auth.problem, auth.problem.status);
      }
      await assertWorkspacePermission(store, auth.actor, query?.workspaceId, "select_blueprint_and_run_scripts");
      const result = await store.listReviewItems(auth.actor, {
        workspaceId: query.workspaceId,
        limit: query.limit ? Number.parseInt(query.limit, 10) : undefined,
        cursor: query.cursor
      });
      if (!result.ok) {
        throw new HttpException(result.problem, result.problem.status);
      }
      return result.response;
    }

    // V0-R1: list the append-only comments on one review item in creation order. Any
    // comment-capable role may list comments on a review item in its workspace.
    async listReviewComments(request, reviewItemId, query) {
      const auth = authenticateRequest(request.headers, env);
      if (!auth.ok) {
        throw new HttpException(auth.problem, auth.problem.status);
      }
      await assertWorkspacePermission(store, auth.actor, query?.workspaceId, "submit_review_comments");
      const result = await store.listReviewComments(auth.actor, {
        reviewItemId,
        workspaceId: query.workspaceId,
        limit: query.limit ? Number.parseInt(query.limit, 10) : undefined,
        cursor: query.cursor
      });
      if (!result.ok) {
        throw new HttpException(result.problem, result.problem.status);
      }
      return result.response;
    }

    // V0-R2: record one terminal review decision (approve/reject/request_changes) against a review
    // item bound to one exact final-video version. Only Owner/Admin/Client Manager
    // (approve_reject_final_video) may decide; a Reviewer cannot. The decision records the actor,
    // reason, timestamp and the bound final-media fingerprint. An optimistic version mismatch or a
    // superseded bound version is rejected (REVIEW_VERSION_STALE) and the review item is archived.
    // One terminal decision per review item/version: a second fresh-key attempt returns
    // REVIEW_DECISION_ALREADY_RECORDED. An approve produces a downstream approval reference bound to
    // the exact version. Requires an Idempotency-Key; the same key replayed with the same input
    // returns the same decision, and with different input returns IDEMPOTENCY_INPUT_CONFLICT.
    async recordReviewDecision(request, reviewItemId) {
      const auth = authenticateRequest(request.headers, env);
      if (!auth.ok) {
        throw new HttpException(auth.problem, auth.problem.status);
      }
      const body = request.body ?? {};
      await assertWorkspacePermission(store, auth.actor, body.workspaceId, "approve_reject_final_video");
      const idempotencyKey = requireIdempotencyKey(request.headers, env);
      const input = {
        reviewItemId,
        workspaceId: body.workspaceId,
        decision: body.decision,
        reason: body.reason,
        expectedFinalVideoVersion: body.expectedFinalVideoVersion
      };
      let result;
      try {
        result = await store.runIdempotent(
          {
            actor: auth.actor,
            operation: "review.decision.record",
            idempotencyKey: idempotencyKey.trim(),
            input
          },
          async () => {
            const recorded = await store.recordReviewDecision(auth.actor, input);
            if (!recorded.ok) {
              throw new HttpException(recorded.problem, recorded.problem.status);
            }
            return recorded.response;
          }
        );
      } catch (error) {
        // A business-rule HttpException (REVIEW_VERSION_STALE, REVIEW_DECISION_ALREADY_RECORDED,
        // VALIDATION_FAILED, IDEMPOTENCY_INPUT_CONFLICT, ...) carries its own problem and status
        // and must surface unchanged. Only genuine, unexpected DB errors are sanitised into
        // RUNTIME_DB_WRITE_FAILED.
        if (error instanceof HttpException) {
          throw error;
        }
        if (env.V0_EXPOSE_TEST_ERRORS === "1") {
          throw new HttpException(
            problem("RUNTIME_DB_WRITE_FAILED", 500, "Runtime database write failed", sanitizeError(error)),
            500
          );
        }
        throw error;
      }
      if (!result.ok) {
        throw new HttpException(result.problem, result.problem.status);
      }
      return result.response;
    }

    // V0-U1: create one calendar post bound to one approved exact final-video version. An
    // API-scheduled post (manualExport false) requires a valid future scheduledAt with an explicit
    // UTC offset and is created SCHEDULED; a manual-export post (manualExport true) is created
    // APPROVED with no scheduledAt and produces a retained manual-export Artifact, leaving
    // manualLiveUrl null for later verification. The bound final video must be current and carry a
    // matching approval token; unapproved media is REVIEW_APPROVAL_REQUIRED, superseded media is
    // PUBLISH_MEDIA_STALE, a past/invalid schedule or a schedule conflict is PUBLISH_SCHEDULE_INVALID.
    // Requires an Idempotency-Key; the same key replayed with the same input returns the same post,
    // and with different input returns IDEMPOTENCY_INPUT_CONFLICT.
    async createCalendarPost(request) {
      const auth = authenticateRequest(request.headers, env);
      if (!auth.ok) {
        throw new HttpException(auth.problem, auth.problem.status);
      }
      const body = request.body ?? {};
      await assertWorkspacePermission(store, auth.actor, body.workspaceId, "schedule_publish_approved_media");
      const idempotencyKey = requireIdempotencyKey(request.headers, env);
      const input = {
        workspaceId: body.workspaceId,
        finalVideoId: body.finalVideoId,
        approvalToken: body.approvalToken,
        platform: body.platform,
        account: body.account,
        caption: body.caption,
        scheduledAt: body.scheduledAt,
        timezone: body.timezone,
        manualExport: body.manualExport
      };
      let result;
      try {
        result = await store.runIdempotent(
          {
            actor: auth.actor,
            operation: "calendar.post.create",
            idempotencyKey: idempotencyKey.trim(),
            input
          },
          async () => {
            const created = await store.createCalendarPost(auth.actor, input);
            if (!created.ok) {
              throw new HttpException(created.problem, created.problem.status);
            }
            return created.response;
          }
        );
      } catch (error) {
        if (error instanceof HttpException) {
          throw error;
        }
        if (env.V0_EXPOSE_TEST_ERRORS === "1") {
          throw new HttpException(
            problem("RUNTIME_DB_WRITE_FAILED", 500, "Runtime database write failed", sanitizeError(error)),
            500
          );
        }
        throw error;
      }
      if (!result.ok) {
        throw new HttpException(result.problem, result.problem.status);
      }
      return result.response;
    }

    // V0-U1: edit a calendar post that has not yet been published. An authorised production role
    // (schedule_publish_approved_media: Owner/Admin/Client Manager; NOT Reviewer) corrects the
    // caption, account, platform, schedule, timezone and/or manualExport choice. The bound media
    // identity (finalVideoId/approvalToken/sha256/version) is immutable on edit; a superseded bound
    // version returns PUBLISH_MEDIA_STALE. An optimistic expectedVersion mismatch returns
    // RESOURCE_VERSION_STALE; a successful edit bumps version. An edit is blocked once a
    // PublishOperation exists, a manual live URL is set, or the post is terminal
    // (PUBLISH_POST_LOCKED). An edited schedule that conflicts with another active post returns
    // PUBLISH_SCHEDULE_INVALID. Requires an Idempotency-Key; the same key replayed with the same
    // input returns the same edit, and with different input returns IDEMPOTENCY_INPUT_CONFLICT.
    async updateCalendarPost(request, calendarPostId) {
      const auth = authenticateRequest(request.headers, env);
      if (!auth.ok) {
        throw new HttpException(auth.problem, auth.problem.status);
      }
      const body = request.body ?? {};
      await assertWorkspacePermission(store, auth.actor, body.workspaceId, "schedule_publish_approved_media");
      const idempotencyKey = requireIdempotencyKey(request.headers, env);
      const input = {
        workspaceId: body.workspaceId,
        calendarPostId,
        expectedVersion: body.expectedVersion,
        caption: body.caption,
        account: body.account,
        platform: body.platform,
        scheduledAt: body.scheduledAt,
        timezone: body.timezone,
        manualExport: body.manualExport
      };
      let result;
      try {
        result = await store.runIdempotent(
          {
            actor: auth.actor,
            operation: "calendar.post.update",
            idempotencyKey: idempotencyKey.trim(),
            input
          },
          async () => {
            const updated = await store.updateCalendarPost(auth.actor, input);
            if (!updated.ok) {
              throw new HttpException(updated.problem, updated.problem.status);
            }
            return updated.response;
          }
        );
      } catch (error) {
        if (error instanceof HttpException) {
          throw error;
        }
        if (env.V0_EXPOSE_TEST_ERRORS === "1") {
          throw new HttpException(
            problem("RUNTIME_DB_WRITE_FAILED", 500, "Runtime database write failed", sanitizeError(error)),
            500
          );
        }
        throw error;
      }
      if (!result.ok) {
        throw new HttpException(result.problem, result.problem.status);
      }
      return result.response;
    }

    // V0-U2: publish an approved scheduled calendar post to the intended Meta account. A
    // publishing action: requires an Idempotency-Key and an authorised Owner/Admin/Client
    // Manager (schedule_publish_approved_media). The request account must equal the
    // calendar post's bound account (PUBLISH_ACCOUNT_MISMATCH); manual-export posts cannot
    // be submitted (PUBLISH_NOT_SUBMITTABLE). Retry, timeout, callback replay and worker
    // crash never create two posts or switch accounts/media. A timeout after possible
    // acceptance is unknown; the caller reconciles before any retry. 202 Accepted.
    async publishCalendarPost(request, calendarPostId) {
      const auth = authenticateRequest(request.headers, env);
      if (!auth.ok) {
        throw new HttpException(auth.problem, auth.problem.status);
      }
      const body = request.body ?? {};
      await assertWorkspacePermission(store, auth.actor, body.workspaceId, "schedule_publish_approved_media");
      const idempotencyKey = requireIdempotencyKey(request.headers, env);
      const input = { ...body, calendarPostId, idempotencyKey };
      let result;
      try {
        result = await store.submitPublishOperation(auth.actor, input);
      } catch (error) {
        if (env.V0_EXPOSE_TEST_ERRORS === "1") {
          throw new HttpException(
            problem("RUNTIME_DB_WRITE_FAILED", 500, "Runtime database write failed", sanitizeError(error)),
            500
          );
        }
        throw error;
      }
      if (!result.ok) {
        throw new HttpException(result.problem, result.problem.status);
      }
      return result.response;
    }

    // V0-U2: reconcile an uncertain publish operation. A recovery action: requires an
    // Idempotency-Key and an authorised actor. Never resubmits; resolves unknown/submitting/
    // accepted/processing to a terminal state and records reconciledAt. 200 OK.
    async reconcilePublishOperation(request, calendarPostId) {
      const auth = authenticateRequest(request.headers, env);
      if (!auth.ok) {
        throw new HttpException(auth.problem, auth.problem.status);
      }
      const body = request.body ?? {};
      await assertWorkspacePermission(store, auth.actor, body.workspaceId, "schedule_publish_approved_media");
      const idempotencyKey = requireIdempotencyKey(request.headers, env);
      const input = { ...body, calendarPostId, idempotencyKey };
      const result = await store.reconcilePublishOperation(auth.actor, input);
      if (!result.ok) {
        throw new HttpException(result.problem, result.problem.status);
      }
      return result.response;
    }

    // V0-U4: independently verify the audience-facing live post against the approved calendar post.
    // Owner/Admin/Client Manager (schedule_publish_approved_media), NOT Reviewer. No Idempotency-Key
    // is required: exactly-once is enforced by the one-PostVerification-per-calendar-post row, and the
    // completion notification is deduplicated by workspace + payload hash. Provider acknowledgement
    // alone never becomes success: a not-yet-live post returns 202 VERIFY_PROCESSING_WAIT and sends
    // no notification. A verified result advances the post to published_verified, retains an immutable
    // audience evidence artifact, sends one deduplicated completion notification and anchors an
    // initial immutable PerformanceSnapshot (200). A still-processing live post returns 202 with a
    // verification attempt record. Wrong media/account or restricted visibility is a 409 non-success
    // and sends no notification. A manual-export post without a live URL is 409
    // VERIFY_MANUAL_URL_REQUIRED until one is supplied. No secret, signed URL, object key, recipient
    // user id, payload hash or raw provider payload leaks.
    async verifyCalendarPost(request, calendarPostId) {
      const auth = authenticateRequest(request.headers, env);
      if (!auth.ok) {
        throw new HttpException(auth.problem, auth.problem.status);
      }
      const body = request.body ?? {};
      await assertWorkspacePermission(store, auth.actor, body.workspaceId, "schedule_publish_approved_media");
      const input = { ...body, calendarPostId };
      let result;
      try {
        result = await store.verifyCalendarPost(auth.actor, input);
      } catch (error) {
        if (env.V0_EXPOSE_TEST_ERRORS === "1") {
          throw new HttpException(
            problem("RUNTIME_DB_WRITE_FAILED", 500, "Runtime database write failed", sanitizeError(error)),
            500
          );
        }
        throw error;
      }
      if (!result.ok) {
        throw new HttpException(result.problem, result.problem.status);
      }
      if (result.status === 202) {
        // The platform is still processing the live post: a 202 success carries the structured
        // processing-wait body (code, calendarPost, verification attempt, retryAfterMs).
        throw new HttpException(result.response, 202);
      }
      return result.response;
    }

    // V0-A1: export the complete creative lineage for one final video as a bounded, redacted,
    // hash-manifested ancestry. Owner/Admin/Client Manager (view_lineage_and_performance), NOT
    // Reviewer. A missing or cross-workspace final video returns the same WORKSPACE_ACCESS_DENIED
    // (404) so existence never leaks. No secret, signed URL, object key, raw provider payload,
    // external id, request hash, idempotency key or source hash surfaces. 200 OK.
    async getLineage(request, finalVideoId, query) {
      const auth = authenticateRequest(request.headers, env);
      if (!auth.ok) {
        throw new HttpException(auth.problem, auth.problem.status);
      }
      await assertWorkspacePermission(store, auth.actor, query?.workspaceId, "view_lineage_and_performance");
      let result;
      try {
        result = await store.getLineageForActor(auth.actor, {
          workspaceId: query.workspaceId,
          finalVideoId
        });
      } catch (error) {
        if (env.V0_EXPOSE_TEST_ERRORS === "1") {
          throw new HttpException(
            problem("RUNTIME_DB_WRITE_FAILED", 500, "Runtime database write failed", sanitizeError(error)),
            500
          );
        }
        throw error;
      }
      if (!result.ok) {
        throw new HttpException(result.problem, result.problem.status);
      }
      return result.response;
    }

    // V0-A1: collect a fresh immutable PerformanceSnapshot of observed (simulated, never
    // predictive) platform metrics for one verified audience-facing post. Owner/Admin/Client
    // Manager (schedule_publish_approved_media), NOT Reviewer. Requires Idempotency-Key;
    // exactly-once is one collected snapshot per (workspace, key). 200 observed/replay; 202
    // PERFORMANCE_PROCESSING_WAIT while the platform is still reporting. A not-yet-verified post is
    // 409 PERFORMANCE_NOT_OBSERVABLE. No secret, signed URL, object key, raw provider payload or
    // account id leaks; metrics are observations of past platform state only.
    async collectPerformance(request, calendarPostId) {
      const auth = authenticateRequest(request.headers, env);
      if (!auth.ok) {
        throw new HttpException(auth.problem, auth.problem.status);
      }
      const body = request.body ?? {};
      const idempotencyKey = request.headers["idempotency-key"];
      if (typeof idempotencyKey !== "string" || idempotencyKey.trim().length === 0) {
        throw new HttpException(
          problem("IDEMPOTENCY_KEY_REQUIRED", 400, "Idempotency key required", "This action needs a request identity. Refresh and try again.", true),
          400
        );
      }
      await assertWorkspacePermission(store, auth.actor, body.workspaceId, "schedule_publish_approved_media");
      const input = { ...body, calendarPostId, idempotencyKey: idempotencyKey.trim() };
      let result;
      try {
        result = await store.collectPerformanceForActor(auth.actor, input);
      } catch (error) {
        if (env.V0_EXPOSE_TEST_ERRORS === "1") {
          throw new HttpException(
            problem("RUNTIME_DB_WRITE_FAILED", 500, "Runtime database write failed", sanitizeError(error)),
            500
          );
        }
        throw error;
      }
      if (!result.ok) {
        throw new HttpException(result.problem, result.problem.status);
      }
      if (result.status === 202) {
        // The platform is still reporting: a 202 success carries the structured processing-wait
        // body (code, calendarPost, retryAfterMs).
        throw new HttpException(result.response, 202);
      }
      return result.response;
    }

    // V0-A1: read every immutable PerformanceSnapshot for one calendar post (the initial
    // verification snapshot plus all later performance_collect observations). Owner/Admin/Client
    // Manager (view_lineage_and_performance), NOT Reviewer. A missing or cross-workspace post
    // returns the same WORKSPACE_ACCESS_DENIED (404). Snapshots are append-only; a snapshot is
    // flagged stale when the post is no longer published_verified. 200 OK.
    async getPerformance(request, calendarPostId, query) {
      const auth = authenticateRequest(request.headers, env);
      if (!auth.ok) {
        throw new HttpException(auth.problem, auth.problem.status);
      }
      await assertWorkspacePermission(store, auth.actor, query?.workspaceId, "view_lineage_and_performance");
      let result;
      try {
        result = await store.getPerformanceForActor(auth.actor, {
          workspaceId: query.workspaceId,
          calendarPostId
        });
      } catch (error) {
        if (env.V0_EXPOSE_TEST_ERRORS === "1") {
          throw new HttpException(
            problem("RUNTIME_DB_WRITE_FAILED", 500, "Runtime database write failed", sanitizeError(error)),
            500
          );
        }
        throw error;
      }
      if (!result.ok) {
        throw new HttpException(result.problem, result.problem.status);
      }
      return result.response;
    }

    // V0-U2/V0-U3: receive a signed publishing callback. The signature header is selected by
    // provider (Meta: x-meta-signature, YouTube: x-youtube-signature) via the publish adapter
    // registry. Signature verified in constant time, timestamp windowed, deduplicated by
    // (workspace, source, eventId). The calendar post advances in lockstep with the operation;
    // the public post URL is bound only on completion. Provider payloads stay private. 200 OK.
    async handlePublishingCallback(request, provider) {
      const adapter = resolvePublishCallbackAdapter(provider);
      const signatureHeader = adapter ? adapter.signatureHeader : "x-meta-signature";
      return processPaymentCallbackResponse(
        store.processPublishingCallback(provider, request.body ?? {}, request.headers[signatureHeader])
      );
    }

    async handleHeygenCallback(request) {
      return processPaymentCallbackResponse(
        store.processHeygenCallback(request.body ?? {}, request.headers["x-heygen-signature"])
      );
    }

    async listBlueprints(request, query) {
      const auth = authenticateRequest(request.headers, env);
      if (!auth.ok) {
        throw new HttpException(auth.problem, auth.problem.status);
      }
      await assertWorkspacePermission(store, auth.actor, query?.workspaceId, "select_blueprint_and_run_scripts");
      const result = await store.listBlueprints(auth.actor, {
        workspaceId: query.workspaceId,
        brandProfileId: query.brandProfileId,
        limit: query.limit ? Number.parseInt(query.limit, 10) : undefined,
        cursor: query.cursor
      });
      if (!result.ok) {
        throw new HttpException(result.problem, result.problem.status);
      }
      return result.response;
    }

    async listAvatars(request, query) {
      const auth = authenticateRequest(request.headers, env);
      if (!auth.ok) {
        throw new HttpException(auth.problem, auth.problem.status);
      }
      await assertWorkspacePermission(store, auth.actor, query?.workspaceId, "manage_avatars_consent");
      const result = await store.listAvatars(auth.actor, {
        workspaceId: query.workspaceId,
        brandProfileId: query.brandProfileId,
        limit: query.limit ? Number.parseInt(query.limit, 10) : undefined,
        cursor: query.cursor
      });
      if (!result.ok) {
        throw new HttpException(result.problem, result.problem.status);
      }
      return result.response;
    }

    async revokeAvatarConsent(request, avatarProfileId) {
      const auth = authenticateRequest(request.headers, env);
      if (!auth.ok) {
        throw new HttpException(auth.problem, auth.problem.status);
      }
      const body = request.body ?? {};
      await assertWorkspacePermission(store, auth.actor, body.workspaceId, "manage_avatars_consent");
      const result = await store.revokeAvatarConsent(auth.actor, avatarProfileId, body);
      if (!result.ok) {
        throw new HttpException(result.problem, result.problem.status);
      }
      return result.response;
    }

    async createCreditPurchase(request) {
      const auth = authenticateRequest(request.headers, env);
      if (!auth.ok) {
        throw new HttpException(auth.problem, auth.problem.status);
      }
      const body = request.body ?? {};
      await assertWorkspacePermission(store, auth.actor, body.workspaceId, "purchase_credits_and_view_wallet_ledger");
      const idempotencyKey = requireIdempotencyKey(request.headers, env);
      const currency = typeof body.currency === "string" ? body.currency.toUpperCase() : body.currency;
      let provider = typeof body.provider === "string" ? body.provider : "";
      if (provider === "") {
        provider = currency === "INR" ? "razorpay" : "stripe";
      }
      const input = { ...body, currency, provider, idempotencyKey };
      const result = await store.runIdempotent(
        {
          actor: auth.actor,
          operation: "credit.purchase.create",
          idempotencyKey: idempotencyKey.trim(),
          input
        },
        async () => {
          const created = await store.createCreditPurchase(auth.actor, input);
          if (!created.ok) {
            throw new HttpException(created.problem, created.problem.status);
          }
          return created.response;
        }
      );
      if (!result.ok) {
        throw new HttpException(result.problem, result.problem.status);
      }
      return result.response;
    }

    async getWalletLedger(request, walletId, query) {
      const auth = authenticateRequest(request.headers, env);
      if (!auth.ok) {
        throw new HttpException(auth.problem, auth.problem.status);
      }
      await assertWorkspacePermission(store, auth.actor, query?.workspaceId, "purchase_credits_and_view_wallet_ledger");
      const result = await store.listWalletLedger(auth.actor, {
        walletId,
        workspaceId: query.workspaceId,
        limit: query.limit ? Number.parseInt(query.limit, 10) : undefined,
        cursor: query.cursor
      });
      if (!result.ok) {
        throw new HttpException(result.problem, result.problem.status);
      }
      return result.response;
    }

    async createCreditAdjustment(request, walletId) {
      const auth = authenticateRequest(request.headers, env);
      if (!auth.ok) {
        throw new HttpException(auth.problem, auth.problem.status);
      }
      const body = request.body ?? {};
      await assertWorkspacePermission(store, auth.actor, body.workspaceId, "adjust_credits");
      const idempotencyKey = requireIdempotencyKey(request.headers, env);
      const input = { ...body, walletId, idempotencyKey };
      const result = await store.runIdempotent(
        {
          actor: auth.actor,
          operation: "credit.adjustment.create",
          idempotencyKey: idempotencyKey.trim(),
          input
        },
        async () => {
          const adjusted = await store.createCreditAdjustment(auth.actor, input);
          if (!adjusted.ok) {
            throw new HttpException(adjusted.problem, adjusted.problem.status);
          }
          return adjusted.response;
        }
      );
      if (!result.ok) {
        throw new HttpException(result.problem, result.problem.status);
      }
      return result.response;
    }

    async handleRazorpayCallback(request) {
      return processPaymentCallbackResponse(
        store.processPaymentCallback("razorpay", request.body ?? {}, request.headers["x-razorpay-signature"])
      );
    }

    async handleStripeCallback(request) {
      return processPaymentCallbackResponse(
        store.processPaymentCallback("stripe", request.body ?? {}, request.headers["stripe-signature"])
      );
    }

    async seedBlueprintLibraryEntry(request) {
      const auth = authenticateRequest(request.headers, env);
      if (!auth.ok) {
        throw new HttpException(auth.problem, auth.problem.status);
      }
      await assertWorkspacePermission(store, auth.actor, request.body?.workspaceId, "select_blueprint_and_run_scripts");
      const result = await store.seedBlueprintLibraryEntry(auth.actor, request.body ?? {});
      if (!result.ok) {
        throw new HttpException(result.problem, result.problem.status);
      }
      return result.response;
    }

    async createBlueprintRequest(request) {
      const auth = authenticateRequest(request.headers, env);
      if (!auth.ok) {
        throw new HttpException(auth.problem, auth.problem.status);
      }
      await assertWorkspacePermission(store, auth.actor, request.body?.workspaceId, "select_blueprint_and_run_scripts");
      const result = await store.createBlueprintRequest(auth.actor, request.body ?? {});
      if (!result.ok) {
        throw new HttpException(result.problem, result.problem.status);
      }
      return result.response;
    }

    async createReadyBlueprint(request, blueprintRequestId) {
      const auth = authenticateRequest(request.headers, env);
      if (!auth.ok) {
        throw new HttpException(auth.problem, auth.problem.status);
      }
      await assertWorkspacePermission(store, auth.actor, request.body?.workspaceId, "select_blueprint_and_run_scripts");
      const result = await store.createReadyBlueprint(auth.actor, blueprintRequestId, request.body ?? {});
      if (!result.ok) {
        throw new HttpException(result.problem, result.problem.status);
      }
      return result.response;
    }

    async createScriptTournament(request) {
      const auth = authenticateRequest(request.headers, env);
      if (!auth.ok) {
        throw new HttpException(auth.problem, auth.problem.status);
      }
      await assertWorkspacePermission(store, auth.actor, request.body?.workspaceId, "select_blueprint_and_run_scripts");

      const idempotencyKey = request.headers["idempotency-key"];
      if (typeof idempotencyKey !== "string" || idempotencyKey.trim().length === 0) {
        throw new HttpException(
          problem(
            "IDEMPOTENCY_KEY_REQUIRED",
            400,
            "Idempotency key required",
            "This action needs a request identity. Refresh and try again.",
            true
          ),
          400
        );
      }

      const result = await store.runIdempotent(
        {
          actor: auth.actor,
          operation: "script.tournament.create",
          idempotencyKey: idempotencyKey.trim(),
          input: request.body ?? {}
        },
        async () => {
          const created = await store.createScriptTournament(auth.actor, request.body ?? {});
          if (!created.ok) {
            throw new HttpException(created.problem, created.problem.status);
          }
          return created.response;
        }
      );
      if (!result.ok) {
        throw new HttpException(result.problem, result.problem.status);
      }
      return result.response;
    }

    async selectScriptVariant(request, tournamentId) {
      const auth = authenticateRequest(request.headers, env);
      if (!auth.ok) {
        throw new HttpException(auth.problem, auth.problem.status);
      }
      await assertWorkspacePermission(store, auth.actor, request.body?.workspaceId, "select_blueprint_and_run_scripts");

      const idempotencyKey = request.headers["idempotency-key"];
      if (typeof idempotencyKey !== "string" || idempotencyKey.trim().length === 0) {
        throw new HttpException(
          problem(
            "IDEMPOTENCY_KEY_REQUIRED",
            400,
            "Idempotency key required",
            "This action needs a request identity. Refresh and try again.",
            true
          ),
          400
        );
      }

      // The path tournamentId is authoritative. If the body carries a tournamentId
      // it must match the path so a malformed or buggy client cannot select
      // tournament B from tournament A's URL and produce a confusing audit trail.
      const bodyTournamentId = request.body?.tournamentId;
      if (bodyTournamentId !== undefined && bodyTournamentId !== tournamentId) {
        throw new HttpException(
          problem(
            "VALIDATION_FAILED",
            422,
            "Validation failed",
            "The tournament in the URL and the request body must match."
          ),
          422
        );
      }
      const reconciledInput = { ...(request.body ?? {}), tournamentId };

      const result = await store.runIdempotent(
        {
          actor: auth.actor,
          operation: "script.variant.select",
          idempotencyKey: idempotencyKey.trim(),
          input: reconciledInput
        },
        async () => {
          const selected = await store.selectScriptVariant(auth.actor, reconciledInput);
          if (!selected.ok) {
            throw new HttpException(selected.problem, selected.problem.status);
          }
          return selected.response;
        }
      );
      if (!result.ok) {
        throw new HttpException(result.problem, result.problem.status);
      }
      return result.response;
    }

    async searchViralCandidates(request) {
      const auth = authenticateRequest(request.headers, env);
      if (!auth.ok) {
        throw new HttpException(auth.problem, auth.problem.status);
      }
      await assertWorkspacePermission(store, auth.actor, request.body?.workspaceId, "select_blueprint_and_run_scripts");
      const result = await store.searchViralCandidates(auth.actor, request.body ?? {});
      if (!result.ok) {
        throw new HttpException(result.problem, result.problem.status);
      }
      return result.response;
    }

    async extractViralCandidateBlueprint(request, candidateId) {
      const auth = authenticateRequest(request.headers, env);
      if (!auth.ok) {
        throw new HttpException(auth.problem, auth.problem.status);
      }
      await assertWorkspacePermission(store, auth.actor, request.body?.workspaceId, "select_blueprint_and_run_scripts");
      const result = await store.extractViralCandidateBlueprint(auth.actor, candidateId, request.body ?? {});
      if (!result.ok) {
        throw new HttpException(result.problem, result.problem.status);
      }
      return result.response;
    }

    async createSceneBlueprint(request, candidateId) {
      const auth = authenticateRequest(request.headers, env);
      if (!auth.ok) {
        throw new HttpException(auth.problem, auth.problem.status);
      }
      await assertWorkspacePermission(store, auth.actor, request.body?.workspaceId, "select_blueprint_and_run_scripts");
      const result = await store.createSceneBlueprint(auth.actor, candidateId, request.body ?? {});
      if (!result.ok) {
        throw new HttpException(result.problem, result.problem.status);
      }
      return result.response;
    }

    async startSimulatedMediaProcessing(request) {
      const auth = authenticateRequest(request.headers, env);
      if (!auth.ok) {
        throw new HttpException(auth.problem, auth.problem.status);
      }

      const idempotencyKey = request.headers["idempotency-key"];
      if (typeof idempotencyKey !== "string" || idempotencyKey.trim().length === 0) {
        throw new HttpException(
          problem(
            "IDEMPOTENCY_KEY_REQUIRED",
            400,
            "Idempotency key required",
            "This action needs a request identity. Refresh and try again.",
            true
          ),
          400
        );
      }

      let result;
      try {
        result = await store.runIdempotent(
          {
            actor: auth.actor,
            operation: "job.simulated_media_processing.start",
            idempotencyKey: idempotencyKey.trim(),
            input: request.body ?? {}
          },
          async () => {
            const started = await store.startSimulatedMediaProcessing(auth.actor, request.body ?? {});
            if (!started.ok) {
              throw new HttpException(started.problem, started.problem.status);
            }
            return started.response;
          }
        );
      } catch (error) {
        if (env.V0_EXPOSE_TEST_ERRORS === "1") {
          throw new HttpException(
            problem(
              "RUNTIME_DB_WRITE_FAILED",
              500,
              "Runtime database write failed",
              sanitizeError(error)
            ),
            500
          );
        }
        throw error;
      }
      if (!result.ok) {
        throw new HttpException(result.problem, result.problem.status);
      }
      return result.response;
    }

    async getJob(request, jobId) {
      const auth = authenticateRequest(request.headers, env);
      if (!auth.ok) {
        throw new HttpException(auth.problem, auth.problem.status);
      }
      const result = await store.getJobForActor(auth.actor, jobId);
      if (!result.ok) {
        throw new HttpException(result.problem, result.problem.status);
      }
      return result.response;
    }

    async listJobEvents(request, jobId) {
      const auth = authenticateRequest(request.headers, env);
      if (!auth.ok) {
        throw new HttpException(auth.problem, auth.problem.status);
      }
      const result = await store.listJobEventsForActor(auth.actor, jobId);
      if (!result.ok) {
        throw new HttpException(result.problem, result.problem.status);
      }
      return result.response;
    }

    async getJobTrace(request, jobId) {
      const auth = authenticateRequest(request.headers, env);
      if (!auth.ok) {
        throw new HttpException(auth.problem, auth.problem.status);
      }
      await assertWorkspacePermissionForJob(store, auth.actor, jobId, "view_operations");
      const result = await store.getJobTraceForActor(auth.actor, jobId);
      if (!result.ok) {
        throw new HttpException(result.problem, result.problem.status);
      }
      return result.response;
    }

    async recoverJob(request, jobId) {
      const auth = authenticateRequest(request.headers, env);
      if (!auth.ok) {
        throw new HttpException(auth.problem, auth.problem.status);
      }
      await assertWorkspacePermissionForJob(store, auth.actor, jobId, "retry_reconcile_provider_jobs");
      const result = await store.recoverJob(auth.actor, jobId, request.body ?? {});
      if (!result.ok) {
        throw new HttpException(result.problem, result.problem.status);
      }
      return result.response;
    }

    async listDeadLetterJobs(request) {
      const auth = authenticateRequest(request.headers, env);
      if (!auth.ok) {
        throw new HttpException(auth.problem, auth.problem.status);
      }
      const result = await store.listDeadLetterJobs(auth.actor, request.body ?? {});
      if (!result.ok) {
        throw new HttpException(result.problem, result.problem.status);
      }
      return result.response;
    }

    async getWorkspaceOperationalMetrics(request, workspaceId) {
      const auth = authenticateRequest(request.headers, env);
      if (!auth.ok) {
        throw new HttpException(auth.problem, auth.problem.status);
      }
      await assertWorkspacePermission(store, auth.actor, workspaceId, "view_operations");
      const result = await store.getWorkspaceOperationalMetrics(auth.actor, workspaceId);
      if (!result.ok) {
        throw new HttpException(result.problem, result.problem.status);
      }
      return result.response;
    }

    async createServiceCredential(request, workspaceId) {
      const auth = authenticateRequest(request.headers, env);
      if (!auth.ok) {
        throw new HttpException(auth.problem, auth.problem.status);
      }
      await assertWorkspacePermission(store, auth.actor, workspaceId, "manage_provider_credentials");
      const result = await store.createServiceCredential(auth.actor, workspaceId, request.body ?? {});
      if (!result.ok) {
        throw new HttpException(result.problem, result.problem.status);
      }
      return result.response;
    }

    async rotateServiceCredential(request, workspaceId, credentialId) {
      const auth = authenticateRequest(request.headers, env);
      if (!auth.ok) {
        throw new HttpException(auth.problem, auth.problem.status);
      }
      await assertWorkspacePermission(store, auth.actor, workspaceId, "manage_provider_credentials");
      const result = await store.rotateServiceCredential(auth.actor, workspaceId, credentialId, request.body ?? {});
      if (!result.ok) {
        throw new HttpException(result.problem, result.problem.status);
      }
      return result.response;
    }

    async setSimulatorMode(request, workspaceId) {
      const auth = authenticateRequest(request.headers, env);
      if (!auth.ok) {
        throw new HttpException(auth.problem, auth.problem.status);
      }
      if (!["local", "test", "staging"].includes(env.APP_ENV)) {
        throw new HttpException(problem("CAPABILITY_DISABLED", 404, "Capability disabled", "We could not find that page."), 404);
      }
      await assertWorkspacePermission(store, auth.actor, workspaceId, "manage_simulator_modes");
      const result = await store.setSimulatorMode(auth.actor, workspaceId, request.body ?? {});
      if (!result.ok) {
        throw new HttpException(result.problem, result.problem.status);
      }
      return result.response;
    }

    async recordRestoreDrill(request, workspaceId) {
      const auth = authenticateRequest(request.headers, env);
      if (!auth.ok) {
        throw new HttpException(auth.problem, auth.problem.status);
      }
      await assertWorkspacePermission(store, auth.actor, workspaceId, "run_restore_drills");
      const result = await store.recordRestoreDrill(auth.actor, workspaceId, request.body ?? {});
      if (!result.ok) {
        throw new HttpException(result.problem, result.problem.status);
      }
      return result.response;
    }

    async runRedactionScan(request, workspaceId) {
      const auth = authenticateRequest(request.headers, env);
      if (!auth.ok) {
        throw new HttpException(auth.problem, auth.problem.status);
      }
      await assertWorkspacePermission(store, auth.actor, workspaceId, "view_operations");
      const result = await store.runRedactionScan(auth.actor, workspaceId, request.body ?? {});
      if (!result.ok) {
        throw new HttpException(result.problem, result.problem.status);
      }
      return result.response;
    }

    // V0-A2: deterministic India-to-Backblaze-B2 transfer benchmark. Owner/Admin
    // (run_restore_drills). Returns a simulated, budget-bounded India-to-B2
    // latency and egress cost and retains a benchmark.b2_recorded audit row.
    async runB2Benchmark(request, workspaceId) {
      const auth = authenticateRequest(request.headers, env);
      if (!auth.ok) {
        throw new HttpException(auth.problem, auth.problem.status);
      }
      await assertWorkspacePermission(store, auth.actor, workspaceId, "run_restore_drills");
      const result = await store.runB2Benchmark(auth.actor, workspaceId, request.body ?? {});
      if (!result.ok) {
        throw new HttpException(result.problem, result.problem.status);
      }
      return result.response;
    }

    // V0-A2: load-shaped queue backlog simulation. Owner/Admin (run_restore_drills).
    // Returns a deterministic two-hour growth-then-drain backlog curve with an SLO
    // breach and the no-duplicate-paid-work / no-silent-job-loss invariants.
    async runBacklogSimulation(request, workspaceId) {
      const auth = authenticateRequest(request.headers, env);
      if (!auth.ok) {
        throw new HttpException(auth.problem, auth.problem.status);
      }
      await assertWorkspacePermission(store, auth.actor, workspaceId, "run_restore_drills");
      const result = await store.runBacklogSimulation(auth.actor, workspaceId, request.body ?? {});
      if (!result.ok) {
        throw new HttpException(result.problem, result.problem.status);
      }
      return result.response;
    }

    // V0-A2: incident/runbook rehearsal and rollback or forward-recovery record.
    // Owner/Admin (run_restore_drills). Records a deterministic rehearsal of one
    // owner-pinned scenario and retains an incident.rehearsal_recorded audit row.
    async runIncidentRehearsal(request, workspaceId) {
      const auth = authenticateRequest(request.headers, env);
      if (!auth.ok) {
        throw new HttpException(auth.problem, auth.problem.status);
      }
      await assertWorkspacePermission(store, auth.actor, workspaceId, "run_restore_drills");
      const result = await store.runIncidentRehearsal(auth.actor, workspaceId, request.body ?? {});
      if (!result.ok) {
        throw new HttpException(result.problem, result.problem.status);
      }
      return result.response;
    }

    // V0-A2: operational alert states. Owner/Admin (view_operations). Derives
    // deterministic alert states from the operational metrics against owner-pinned
    // thresholds (queue-age SLO breach, dead letters, lease expiry spike, retry storm).
    async getWorkspaceOperationalAlerts(request, workspaceId) {
      const auth = authenticateRequest(request.headers, env);
      if (!auth.ok) {
        throw new HttpException(auth.problem, auth.problem.status);
      }
      await assertWorkspacePermission(store, auth.actor, workspaceId, "view_operations");
      const result = await store.getWorkspaceOperationalAlerts(auth.actor, workspaceId);
      if (!result.ok) {
        throw new HttpException(result.problem, result.problem.status);
      }
      return result.response;
    }

    async claimJob(request, jobId) {
      assertWorker(request.headers, env);
      const result = await store.claimJob(jobId, request.body ?? {});
      if (!result.ok) {
        throw new HttpException(result.problem, result.problem.status);
      }
      return result.response;
    }

    async heartbeatJob(request, jobId) {
      assertWorker(request.headers, env);
      const result = await store.heartbeatJob(jobId, request.body ?? {});
      if (!result.ok) {
        throw new HttpException(result.problem, result.problem.status);
      }
      return result.response;
    }

    async completeJob(request, jobId) {
      assertWorker(request.headers, env);
      const result = await store.completeJob(jobId, request.body ?? {});
      if (!result.ok) {
        throw new HttpException(result.problem, result.problem.status);
      }
      return result.response;
    }

    async failJob(request, jobId) {
      assertWorker(request.headers, env);
      const result = await store.failJob(jobId, request.body ?? {});
      if (!result.ok) {
        throw new HttpException(result.problem, result.problem.status);
      }
      return result.response;
    }

    async expireJobLeases(request) {
      assertWorker(request.headers, env);
      const result = await store.expireJobLeases(request.body ?? {});
      if (!result.ok) {
        throw new HttpException(result.problem, result.problem.status);
      }
      return result.response;
    }

    async relayOutbox(request) {
      assertWorker(request.headers, env);
      const result = await store.relayOutbox(request.body ?? {});
      if (!result.ok) {
        throw new HttpException(result.problem, result.problem.status);
      }
      return result.response;
    }
  }

  Controller(prefix)(F0Controller);
  route("health", F0Controller, "health");
  route("ready", F0Controller, "ready");
  route("version", F0Controller, "version");
  route("openapi.json", F0Controller, "openapi");
  postRoute("workspaces", F0Controller, "createWorkspace", [Req()]);
  route("workspaces", F0Controller, "listWorkspaces", [Req()]);
  route("workspaces/:workspaceId", F0Controller, "getWorkspace", [Req(), Param("workspaceId")]);
  postRoute("workspaces/:workspaceId/capabilities", F0Controller, "setWorkspaceCapability", [Req(), Param("workspaceId")], 200);
  postRoute("brands/assets/uploads", F0Controller, "initiateBrandAssetUpload", [Req()]);
  postRoute("brands/assets/uploads/:artifactId/complete", F0Controller, "completeBrandAssetUpload", [Req(), Param("artifactId")], 200);
  postRoute("artifacts/:artifactId/downloads", F0Controller, "createArtifactDownload", [Req(), Param("artifactId")], 200);
  postRoute("brands/crawl-runs", F0Controller, "createBrandCrawlRun", [Req()], 202);
  route("brands/crawl-runs/:crawlRunId/candidates", F0Controller, "listBrandCandidates", [Req(), Param("crawlRunId")], 200);
  postRoute("brands/:brandId/approvals", F0Controller, "approveBrandProfile", [Req(), Param("brandId")], 201);
  postRoute("generation-estimates", F0Controller, "createGenerationEstimate", [Req()], 202);
  postRoute("generation-estimates/:estimateId/confirm", F0Controller, "confirmGenerationEstimate", [Req(), Param("estimateId")], 202);
  route("generation-jobs/:jobId", F0Controller, "getGenerationJob", [Req(), Param("jobId"), Query()], 200);
  postRoute("generation-jobs/:jobId/submit", F0Controller, "submitGenerationJob", [Req(), Param("jobId")], 202);
  postRoute("generation-jobs/:jobId/reconcile", F0Controller, "reconcileGenerationJob", [Req(), Param("jobId")], 200);
  postRoute("generation-jobs/:jobId/cancel", F0Controller, "cancelGenerationJob", [Req(), Param("jobId")], 202);
  postRoute("generation-jobs/:jobId/settle", F0Controller, "settleGenerationJob", [Req(), Param("jobId")], 202);
  postRoute("composition-plans", F0Controller, "createCompositionPlan", [Req()], 202);
  postRoute("composition-plans/:id/render", F0Controller, "renderCompositionPlan", [Req(), Param("id")], 202);
  postRoute("review-items", F0Controller, "createReviewItem", [Req()], 202);
  route("review-items", F0Controller, "listReviewItems", [Req(), Query()], 200);
  route("review-items/:id", F0Controller, "getReviewItem", [Req(), Param("id"), Query()], 200);
  postRoute("review-items/:id/comments", F0Controller, "addReviewComment", [Req(), Param("id")], 202);
  route("review-items/:id/comments", F0Controller, "listReviewComments", [Req(), Param("id"), Query()], 200);
  postRoute("review-items/:id/decisions", F0Controller, "recordReviewDecision", [Req(), Param("id")], 202);
  // V0-U1: create one calendar post bound to one approved exact final-video version (scheduled or
  // manual-export fallback). Requires Idempotency-Key; Owner/Admin/Client Manager
  // (schedule_publish_approved_media), NOT Reviewer.
  postRoute("calendar-posts", F0Controller, "createCalendarPost", [Req()], 202);
  // V0-U1: edit a calendar post before publication. Requires Idempotency-Key; Owner/Admin/Client
  // Manager (schedule_publish_approved_media), NOT Reviewer. 202 Accepted.
  patchRoute("calendar-posts/:calendarPostId", F0Controller, "updateCalendarPost", [Req(), Param("calendarPostId")], 202);
  // V0-U2: idempotent Meta publication. Owner/Admin/Client Manager
  // (schedule_publish_approved_media). Publish is 202; reconcile is 200; callback is 200.
  postRoute("calendar-posts/:calendarPostId/publish", F0Controller, "publishCalendarPost", [Req(), Param("calendarPostId")], 202);
  postRoute("calendar-posts/:calendarPostId/publish/reconcile", F0Controller, "reconcilePublishOperation", [Req(), Param("calendarPostId")], 200);
  // V0-U4: audience-facing verification. Owner/Admin/Client Manager
  // (schedule_publish_approved_media). 200 verified/replay; 202 VERIFY_PROCESSING_WAIT while the
  // platform is still processing. No Idempotency-Key: exactly-once is the one-verification-per-post
  // row plus the deduplicated completion notification.
  postRoute("calendar-posts/:calendarPostId/verify", F0Controller, "verifyCalendarPost", [Req(), Param("calendarPostId")], 200);
  // V0-A1: complete creative lineage export for one final video. Owner/Admin/Client Manager
  // (view_lineage_and_performance), NOT Reviewer. Bounded, redacted, hash-manifested ancestry;
  // a missing or cross-workspace final video returns the same 404 so existence never leaks. 200 OK.
  route("lineage/:finalVideoId", F0Controller, "getLineage", [Req(), Param("finalVideoId"), Query()], 200);
  // V0-A1: collect a fresh immutable observed PerformanceSnapshot. Owner/Admin/Client Manager
  // (schedule_publish_approved_media), NOT Reviewer. Requires Idempotency-Key. 200 observed/replay;
  // 202 PERFORMANCE_PROCESSING_WAIT while the platform is still reporting. 200 OK (replay).
  postRoute("calendar-posts/:calendarPostId/performance-collect", F0Controller, "collectPerformance", [Req(), Param("calendarPostId")], 200);
  // V0-A1: read every immutable PerformanceSnapshot for one calendar post. Owner/Admin/Client
  // Manager (view_lineage_and_performance), NOT Reviewer. 200 OK.
  route("calendar-posts/:calendarPostId/performance", F0Controller, "getPerformance", [Req(), Param("calendarPostId"), Query()], 200);
  route("blueprints", F0Controller, "listBlueprints", [Req(), Query()], 200);
  route("avatars", F0Controller, "listAvatars", [Req(), Query()], 200);
  // V0-A2: revoke likeness/voice consent for a brand-bound avatar. Owner/Admin/
  // Client Manager (manage_avatars_consent), NOT Reviewer. Monotonic and
  // immediate: the avatar becomes consent_revoked and cannot enter a generation
  // estimate. Consent evidence never surfaces. 200 OK (idempotent on re-revoke).
  postRoute("avatars/:avatarProfileId/consent-revocation", F0Controller, "revokeAvatarConsent", [Req(), Param("avatarProfileId")], 200);
  postRoute("credit-purchases", F0Controller, "createCreditPurchase", [Req()], 202);
  route("credit-wallets/:walletId/ledger", F0Controller, "getWalletLedger", [Req(), Param("walletId"), Query()], 200);
  postRoute("credit-wallets/:walletId/adjustments", F0Controller, "createCreditAdjustment", [Req(), Param("walletId")], 200);
  postRoute("callbacks/razorpay", F0Controller, "handleRazorpayCallback", [Req()], 200);
  postRoute("callbacks/stripe", F0Controller, "handleStripeCallback", [Req()], 200);
  postRoute("callbacks/heygen", F0Controller, "handleHeygenCallback", [Req()], 200);
  // V0-U2: signed publishing callback (Meta). 200 OK.
  postRoute("callbacks/publishing/:provider", F0Controller, "handlePublishingCallback", [Req(), Param("provider")], 200);
  postRoute("blueprints/library-entries", F0Controller, "seedBlueprintLibraryEntry", [Req()], 201);
  postRoute("blueprint-requests", F0Controller, "createBlueprintRequest", [Req()], 202);
  postRoute("blueprint-requests/:blueprintRequestId/ready-blueprint", F0Controller, "createReadyBlueprint", [Req(), Param("blueprintRequestId")], 202);
  postRoute("script-tournaments", F0Controller, "createScriptTournament", [Req()], 202);
  postRoute("script-tournaments/:tournamentId/select", F0Controller, "selectScriptVariant", [Req(), Param("tournamentId")], 200);
  postRoute("viral-candidates/search", F0Controller, "searchViralCandidates", [Req()], 202);
  postRoute("viral-candidates/:candidateId/extract-blueprint", F0Controller, "extractViralCandidateBlueprint", [Req(), Param("candidateId")], 202);
  postRoute("viral-candidates/:candidateId/scene-blueprint", F0Controller, "createSceneBlueprint", [Req(), Param("candidateId")], 202);
  postRoute("jobs/simulated-media-processing", F0Controller, "startSimulatedMediaProcessing", [Req()], 202);
  postRoute("jobs/dead-letter", F0Controller, "listDeadLetterJobs", [Req()], 200);
  route("jobs/:jobId", F0Controller, "getJob", [Req(), Param("jobId")]);
  route("jobs/:jobId/events", F0Controller, "listJobEvents", [Req(), Param("jobId")]);
  route("jobs/:jobId/trace", F0Controller, "getJobTrace", [Req(), Param("jobId")]);
  postRoute("jobs/:jobId/recover", F0Controller, "recoverJob", [Req(), Param("jobId")], 200);
  route("workspaces/:workspaceId/operations/metrics", F0Controller, "getWorkspaceOperationalMetrics", [Req(), Param("workspaceId")]);
  postRoute("workspaces/:workspaceId/service-credentials", F0Controller, "createServiceCredential", [Req(), Param("workspaceId")], 201);
  // V0-A2: rotate a provider credential by supplying a new secret-manager
  // reference. Owner/Admin (manage_provider_credentials). Creates a new ACTIVE
  // credential row, marks the prior row REVOKED, stamps lastRotatedAt, and never
  // surfaces a plaintext secret. 200 OK.
  postRoute("workspaces/:workspaceId/service-credentials/:credentialId/rotate", F0Controller, "rotateServiceCredential", [Req(), Param("workspaceId"), Param("credentialId")], 200);
  postRoute("workspaces/:workspaceId/simulator-mode", F0Controller, "setSimulatorMode", [Req(), Param("workspaceId")], 200);
  postRoute("workspaces/:workspaceId/restore-drills", F0Controller, "recordRestoreDrill", [Req(), Param("workspaceId")], 200);
  postRoute("workspaces/:workspaceId/redaction-scan", F0Controller, "runRedactionScan", [Req(), Param("workspaceId")], 200);
  // V0-A2 hardening drills: deterministic India-to-B2 benchmark, load-shaped queue
  // backlog simulation, incident/runbook rehearsal, and operational alert states.
  // The three drills reuse run_restore_drills (Owner/Admin); alerts reuses
  // view_operations (Owner/Admin). Each retains an audit row (alerts is read-only).
  postRoute("workspaces/:workspaceId/b2-benchmark", F0Controller, "runB2Benchmark", [Req(), Param("workspaceId")], 200);
  postRoute("workspaces/:workspaceId/backlog-simulation", F0Controller, "runBacklogSimulation", [Req(), Param("workspaceId")], 200);
  postRoute("workspaces/:workspaceId/incident-rehearsal", F0Controller, "runIncidentRehearsal", [Req(), Param("workspaceId")], 200);
  route("workspaces/:workspaceId/operations/alerts", F0Controller, "getWorkspaceOperationalAlerts", [Req(), Param("workspaceId")]);
  postRoute("internal/outbox/relay", F0Controller, "relayOutbox", [Req()], 200);
  postRoute("internal/jobs/leases/expire", F0Controller, "expireJobLeases", [Req()], 200);
  postRoute("internal/jobs/:jobId/claim", F0Controller, "claimJob", [Req(), Param("jobId")], 200);
  postRoute("internal/jobs/:jobId/heartbeat", F0Controller, "heartbeatJob", [Req(), Param("jobId")], 200);
  postRoute("internal/jobs/:jobId/complete", F0Controller, "completeJob", [Req(), Param("jobId")], 200);
  postRoute("internal/jobs/:jobId/fail", F0Controller, "failJob", [Req(), Param("jobId")], 200);

  return F0Controller;
}

async function assertWorkspacePermission(store, actor, workspaceId, capability) {
  const workspaceAccess = await store.getWorkspaceForActor(actor, workspaceId);
  if (!workspaceAccess) {
    throw new HttpException(
      problem("WORKSPACE_ACCESS_DENIED", 404, "Workspace access denied", "We could not find that item."),
      404
    );
  }
  if (!canPerform(workspaceAccess.membership.role, capability)) {
    throw new HttpException(problem("PERMISSION_DENIED", 403, "Permission denied", "Your role cannot perform this action."), 403);
  }
  return workspaceAccess;
}

async function assertWorkspacePermissionForJob(store, actor, jobId, capability) {
  const job = await store.getJobForActor(actor, jobId);
  if (!job.ok) {
    throw new HttpException(job.problem, job.problem.status);
  }
  await assertWorkspacePermission(store, actor, job.response.job.workspaceId, capability);
  return job.response.job;
}

function assertWorker(headers, env) {
  const configured = env.V0_INTERNAL_WORKER_TOKEN;
  const supplied = headers["x-v0-worker-token"];
  if (!configured || supplied !== configured) {
    throw new HttpException(
      problem("AUTH_TOKEN_INVALID", 401, "Auth token invalid", "Your session is not valid. Sign in again."),
      401
    );
  }
}

function requireIdempotencyKey(headers, env) {
  const idempotencyKey = headers["idempotency-key"];
  if (typeof idempotencyKey !== "string" || idempotencyKey.trim().length === 0) {
    throw new HttpException(
      problem(
        "IDEMPOTENCY_KEY_REQUIRED",
        400,
        "Idempotency key required",
        "This action needs a request identity. Refresh and try again.",
        true
      ),
      400
    );
  }
  return idempotencyKey.trim();
}

function processPaymentCallbackResponse(resultPromise) {
  return Promise.resolve(resultPromise).then((result) => {
    if (!result.ok) {
      throw new HttpException(result.problem, result.problem.status);
    }
    return result.response;
  });
}

function problem(code, status, title, detail, retryable = false) {
  return {
    type: `https://errors.sakhaa-forge.invalid/v0/${code}`,
    title,
    status,
    code,
    detail,
    trace_id: "v0-local-trace",
    retryable
  };
}

function sanitizeError(error) {
  return String(error?.meta?.message || error?.code || error?.message || "Unknown error")
    .replace(/postgresql:\/\/[^\s)]+/g, "postgresql://[redacted]")
    .slice(0, 500);
}

function route(path, target, methodName, params = []) {
  for (let index = 0; index < params.length; index += 1) {
    params[index](target.prototype, methodName, index);
  }
  Get(path)(
    target.prototype,
    methodName,
    Object.getOwnPropertyDescriptor(target.prototype, methodName)
  );
}

function postRoute(path, target, methodName, params = [], statusCode = null) {
  for (let index = 0; index < params.length; index += 1) {
    params[index](target.prototype, methodName, index);
  }
  if (statusCode !== null) {
    HttpCode(statusCode)(target.prototype, methodName, Object.getOwnPropertyDescriptor(target.prototype, methodName));
  }
  Post(path)(
    target.prototype,
    methodName,
    Object.getOwnPropertyDescriptor(target.prototype, methodName)
  );
}

function patchRoute(path, target, methodName, params = [], statusCode = null) {
  for (let index = 0; index < params.length; index += 1) {
    params[index](target.prototype, methodName, index);
  }
  if (statusCode !== null) {
    HttpCode(statusCode)(target.prototype, methodName, Object.getOwnPropertyDescriptor(target.prototype, methodName));
  }
  Patch(path)(
    target.prototype,
    methodName,
    Object.getOwnPropertyDescriptor(target.prototype, methodName)
  );
}

if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
  const port = Number.parseInt(process.env.PORT || "3001", 10);
  const app = await createApiServer(process.env);
  await app.listen(port, "0.0.0.0");
  console.log(`Sakhaa Forge API listening on ${await app.getUrl()}`);
}
