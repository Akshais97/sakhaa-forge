import "reflect-metadata";
import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { Controller, Get, HttpCode, HttpException, Module, Param, Post, Query, Req } from "@nestjs/common";
import { NestFactory } from "@nestjs/core";
import { FastifyAdapter } from "@nestjs/platform-fastify";
import { authenticateRequest } from "./auth.mjs";
import { getBuildInfo } from "./build-info.mjs";
import { canPerform } from "./permissions.mjs";
import { getHealth, getReadiness } from "./readiness.mjs";
import { createStore } from "./workspace-store.mjs";

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
  return app;
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
      const result = await store.createGenerationEstimate(auth.actor, request.body ?? {});
      if (!result.ok) {
        throw new HttpException(result.problem, result.problem.status);
      }
      return result.response;
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

      const result = await store.runIdempotent(
        {
          actor: auth.actor,
          operation: "script.variant.select",
          idempotencyKey: idempotencyKey.trim(),
          input: request.body ?? {}
        },
        async () => {
          const selected = await store.selectScriptVariant(auth.actor, request.body ?? {});
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
  route("blueprints", F0Controller, "listBlueprints", [Req(), Query()], 200);
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
  postRoute("workspaces/:workspaceId/simulator-mode", F0Controller, "setSimulatorMode", [Req(), Param("workspaceId")], 200);
  postRoute("workspaces/:workspaceId/restore-drills", F0Controller, "recordRestoreDrill", [Req(), Param("workspaceId")], 200);
  postRoute("workspaces/:workspaceId/redaction-scan", F0Controller, "runRedactionScan", [Req(), Param("workspaceId")], 200);
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

if (import.meta.url === `file://${process.argv[1]}`) {
  const port = Number.parseInt(process.env.PORT || "3001", 10);
  const app = await createApiServer(process.env);
  await app.listen(port, "0.0.0.0");
  console.log(`Sakhaa Forge API listening on ${await app.getUrl()}`);
}
