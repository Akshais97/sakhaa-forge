import test from "node:test";
import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import { V0Client } from "../../packages/contracts/generated/v0-client.mjs";
import { withApiServer } from "../helpers/server.mjs";
import { prepareApprovedFinalVideo } from "../helpers/review-fixtures.mjs";

const jwtSecret = "test-supabase-jwt-secret";
const workerToken = "test-worker-token";
const simulatorSecret = "test-payment-simulator-secret";
const heygenSecret = "test-heygen-simulator-secret";

const baseEnv = {
  APP_ENV: "test",
  APP_VERSION: "test",
  SUPABASE_JWT_SECRET: jwtSecret,
  V0_INTERNAL_WORKER_TOKEN: workerToken,
  V0_PAYMENT_SIMULATOR_SECRET: simulatorSecret,
  V0_HEYGEN_SIMULATOR_SECRET: heygenSecret
};

// V0-U1 approved calendar and manual export fallback. An authorised production role
// (schedule_publish_approved_media: Owner/Admin/Client Manager; NOT Reviewer) creates a calendar
// post bound to one approved exact final-video version (finalVideoId + captured
// finalVideoSha256 + finalVideoVersion + the R2 approval token). An API-scheduled post requires a
// valid future scheduledAt (with an explicit UTC offset) in the configured timezone and is
// created SCHEDULED; a manual-export post (manualExport true) is created APPROVED with no
// scheduledAt and produces a retained manual-export Artifact whose sha256 is the deterministic
// manual-export package hash, leaving manualLiveUrl null for later verification. Unapproved or
// superseded media is rejected (REVIEW_APPROVAL_REQUIRED / PUBLISH_MEDIA_STALE); a past or
// invalid schedule is rejected (PUBLISH_SCHEDULE_INVALID); a schedule conflict for the same
// workspace + platform + account within the conflict window is rejected
// (PUBLISH_SCHEDULE_INVALID). The same Idempotency-Key replays the original post; the same key
// with different input is IDEMPOTENCY_INPUT_CONFLICT. Cross-workspace creates hide behind
// WORKSPACE_ACCESS_DENIED. Signed URLs, object keys, secrets and provider payloads never leak.

test("U1 schedules an approved exact final-video version with a valid future schedule and audit", async () => {
  await withApiServer(baseEnv, async ({ baseUrl }) => {
    const client = new V0Client({ baseUrl, authToken: signJwt("u1-schedule") });
    const approved = await prepareApprovedFinalVideo(client, "U1 schedule");
    const workspaceId = approved.workspaceId;

    const created = await client.createCalendarPost(
      {
        workspaceId,
        finalVideoId: approved.finalVideoId,
        approvalToken: approved.approvalToken,
        platform: "meta",
        account: "sunrise-estates",
        caption: "New launch at Sunrise Estates. #realestate #mumbai",
        scheduledAt: "2999-01-01T09:00:00+05:30",
        timezone: "Asia/Kolkata",
        manualExport: false
      },
      { idempotencyKey: "u1-schedule-create" }
    );
    assert.equal(created.status, 202, JSON.stringify(created.body));
    assert.equal(created.body.calendarPost.status, "scheduled");
    assert.equal(created.body.calendarPost.platform, "meta");
    assert.equal(created.body.calendarPost.account, "sunrise-estates");
    assert.equal(created.body.calendarPost.finalVideoId, approved.finalVideoId);
    assert.equal(created.body.calendarPost.finalVideoSha256, approved.finalVideoSha256);
    assert.equal(created.body.calendarPost.finalVideoVersion, approved.finalVideoVersion);
    assert.equal(created.body.calendarPost.approvalToken, approved.approvalToken);
    assert.equal(created.body.calendarPost.manualExport, false);
    assert.equal(created.body.calendarPost.manualLiveUrl, null);
    assert.equal(created.body.calendarPost.exportArtifactId, null);
    assert.equal(created.body.calendarPost.timezone, "Asia/Kolkata");
    // IST offset is respected: 2999-01-01T09:00:00+05:30 -> 2999-01-01T03:30:00.000Z.
    assert.match(created.body.calendarPost.scheduledAt, /^2999-01-01T03:30:00/);
    assert.equal(created.body.calendarPost.createdByUserId, "u1-schedule");
    assert.equal(created.body.audit.eventType, "calendar.post_created");
    assert.equal(created.body.audit.targetType, "CalendarPost");
    assert.equal(created.body.audit.targetId, created.body.calendarPost.id);
    assert.equal(created.body.exportArtifact, null);

    // No signed URL, secret, object key or provider payload leaks.
    assert.equal(/https?:\/\//i.test(JSON.stringify(created.body)), false);
    assert.equal(/secret|api[_-]?key|signature|object[_-]?key|payload[_-]?hash/i.test(JSON.stringify(created.body)), false);
  });
});

test("U1 manual-export creates an APPROVED calendar post with a deterministic manual-export artifact and no live URL", async () => {
  await withApiServer(baseEnv, async ({ baseUrl }) => {
    const client = new V0Client({ baseUrl, authToken: signJwt("u1-manual") });
    const approved = await prepareApprovedFinalVideo(client, "U1 manual");
    const workspaceId = approved.workspaceId;

    const created = await client.createCalendarPost(
      {
        workspaceId,
        finalVideoId: approved.finalVideoId,
        approvalToken: approved.approvalToken,
        platform: "manual",
        account: "sunrise-estates-manual",
        caption: "Manual export for Sunrise Estates.",
        scheduledAt: null,
        timezone: "Asia/Kolkata",
        manualExport: true
      },
      { idempotencyKey: "u1-manual-create" }
    );
    assert.equal(created.status, 202, JSON.stringify(created.body));
    assert.equal(created.body.calendarPost.status, "approved");
    assert.equal(created.body.calendarPost.manualExport, true);
    assert.equal(created.body.calendarPost.scheduledAt, null);
    assert.equal(created.body.calendarPost.manualLiveUrl, null);
    assert.equal(created.body.calendarPost.manualUrlProvidedAt, null);

    // A manual export produces a retained manual-export Artifact whose sha256 is the
    // deterministic manual-export package hash. The object key never reaches the browser.
    assert.ok(created.body.exportArtifact, "manual export must produce an export artifact");
    assert.equal(created.body.exportArtifact.status, "CLEAN");
    assert.equal(created.body.exportArtifact.retentionClass, "manual-export");
    assert.equal(created.body.exportArtifact.schemaVersion, "calendar.manual_export.v1");
    assert.ok(typeof created.body.exportArtifact.sha256 === "string" && created.body.exportArtifact.sha256.length === 64);
    assert.equal(created.body.exportArtifact.objectKey, undefined);
    assert.equal(created.body.calendarPost.exportArtifactId, created.body.exportArtifact.id);

    // The export artifact hash is deterministic: a same-key replay returns the same hash.
    const replay = await client.createCalendarPost(
      {
        workspaceId,
        finalVideoId: approved.finalVideoId,
        approvalToken: approved.approvalToken,
        platform: "manual",
        account: "sunrise-estates-manual",
        caption: "Manual export for Sunrise Estates.",
        scheduledAt: null,
        timezone: "Asia/Kolkata",
        manualExport: true
      },
      { idempotencyKey: "u1-manual-create" }
    );
    assert.equal(replay.status, 202, JSON.stringify(replay.body));
    assert.equal(replay.body.exportArtifact.sha256, created.body.exportArtifact.sha256);
    assert.equal(replay.body.calendarPost.id, created.body.calendarPost.id);

    assert.equal(/https?:\/\//i.test(JSON.stringify(created.body)), false);
    assert.equal(/secret|api[_-]?key|signature|object[_-]?key|payload[_-]?hash/i.test(JSON.stringify(created.body)), false);
  });
});

test("U1 rejects unapproved or superseded media with REVIEW_APPROVAL_REQUIRED or PUBLISH_MEDIA_STALE", async () => {
  await withApiServer(baseEnv, async ({ baseUrl }) => {
    const client = new V0Client({ baseUrl, authToken: signJwt("u1-media") });
    const approved = await prepareApprovedFinalVideo(client, "U1 media");
    const workspaceId = approved.workspaceId;

    // A wrong approval token (no matching approve decision for this final video) is rejected.
    const unapproved = await client.createCalendarPost(
      {
        workspaceId,
        finalVideoId: approved.finalVideoId,
        approvalToken: "a".repeat(64),
        platform: "meta",
        account: "sunrise-estates",
        caption: "Unapproved post.",
        scheduledAt: "2999-01-01T09:00:00+05:30",
        timezone: "Asia/Kolkata",
        manualExport: false
      },
      { idempotencyKey: "u1-unapproved" }
    );
    assert.equal(unapproved.status, 409, JSON.stringify(unapproved.body));
    assert.equal(unapproved.body.code, "REVIEW_APPROVAL_REQUIRED");

    // A superseded bound final video is rejected. Render a new revision (v2 supersedes v1); the
    // approval token is bound to v1, and v1 is no longer current.
    const revised = await client.renderCompositionPlan(
      approved.compositionPlanId,
      { workspaceId },
      { idempotencyKey: "u1-media-supersede" }
    );
    assert.equal(revised.status, 202, JSON.stringify(revised.body));
    assert.equal(revised.body.finalVideo.version, approved.finalVideoVersion + 1);

    const stale = await client.createCalendarPost(
      {
        workspaceId,
        finalVideoId: approved.finalVideoId,
        approvalToken: approved.approvalToken,
        platform: "meta",
        account: "sunrise-estates",
        caption: "Stale post.",
        scheduledAt: "2999-01-01T09:00:00+05:30",
        timezone: "Asia/Kolkata",
        manualExport: false
      },
      { idempotencyKey: "u1-stale" }
    );
    assert.equal(stale.status, 409, JSON.stringify(stale.body));
    assert.equal(stale.body.code, "PUBLISH_MEDIA_STALE");
  });
});

test("U1 rejects past or invalid schedules and respects the IST offset boundary", async () => {
  await withApiServer(baseEnv, async ({ baseUrl }) => {
    const client = new V0Client({ baseUrl, authToken: signJwt("u1-tz") });
    const approved = await prepareApprovedFinalVideo(client, "U1 tz");
    const workspaceId = approved.workspaceId;

    // A past schedule is rejected.
    const past = await client.createCalendarPost(
      {
        workspaceId,
        finalVideoId: approved.finalVideoId,
        approvalToken: approved.approvalToken,
        platform: "meta",
        account: "sunrise-estates",
        caption: "Past post.",
        scheduledAt: "2000-01-01T09:00:00+05:30",
        timezone: "Asia/Kolkata",
        manualExport: false
      },
      { idempotencyKey: "u1-past" }
    );
    assert.equal(past.status, 422, JSON.stringify(past.body));
    assert.equal(past.body.code, "PUBLISH_SCHEDULE_INVALID");

    // A malformed schedule (no UTC offset) is rejected.
    const malformed = await client.createCalendarPost(
      {
        workspaceId,
        finalVideoId: approved.finalVideoId,
        approvalToken: approved.approvalToken,
        platform: "meta",
        account: "sunrise-estates-tz",
        caption: "Malformed post.",
        scheduledAt: "not-a-date",
        timezone: "Asia/Kolkata",
        manualExport: false
      },
      { idempotencyKey: "u1-malformed" }
    );
    assert.equal(malformed.status, 422, JSON.stringify(malformed.body));
    assert.equal(malformed.body.code, "PUBLISH_SCHEDULE_INVALID");

    // IST offset boundary: a local IST midnight is stored as the prior UTC day 18:30Z.
    const boundary = await client.createCalendarPost(
      {
        workspaceId,
        finalVideoId: approved.finalVideoId,
        approvalToken: approved.approvalToken,
        platform: "meta",
        account: "sunrise-estates-boundary",
        caption: "Boundary post.",
        scheduledAt: "2999-01-01T00:00:00+05:30",
        timezone: "Asia/Kolkata",
        manualExport: false
      },
      { idempotencyKey: "u1-boundary" }
    );
    assert.equal(boundary.status, 202, JSON.stringify(boundary.body));
    assert.equal(boundary.body.calendarPost.status, "scheduled");
    assert.match(boundary.body.calendarPost.scheduledAt, /^2998-12-31T18:30:00/);
  });
});

test("U1 rejects a schedule conflict for the same workspace + platform + account within the conflict window", async () => {
  await withApiServer(baseEnv, async ({ baseUrl }) => {
    const client = new V0Client({ baseUrl, authToken: signJwt("u1-conflict") });
    const approved = await prepareApprovedFinalVideo(client, "U1 conflict");
    const workspaceId = approved.workspaceId;

    const first = await client.createCalendarPost(
      {
        workspaceId,
        finalVideoId: approved.finalVideoId,
        approvalToken: approved.approvalToken,
        platform: "meta",
        account: "sunrise-estates",
        caption: "First post.",
        scheduledAt: "2999-01-01T09:00:00+05:30",
        timezone: "Asia/Kolkata",
        manualExport: false
      },
      { idempotencyKey: "u1-conflict-1" }
    );
    assert.equal(first.status, 202, JSON.stringify(first.body));

    // A second post for the same workspace + platform + account 30 seconds later is a conflict.
    const conflict = await client.createCalendarPost(
      {
        workspaceId,
        finalVideoId: approved.finalVideoId,
        approvalToken: approved.approvalToken,
        platform: "meta",
        account: "sunrise-estates",
        caption: "Conflict post.",
        scheduledAt: "2999-01-01T09:00:30+05:30",
        timezone: "Asia/Kolkata",
        manualExport: false
      },
      { idempotencyKey: "u1-conflict-2" }
    );
    assert.equal(conflict.status, 422, JSON.stringify(conflict.body));
    assert.equal(conflict.body.code, "PUBLISH_SCHEDULE_INVALID");

    // A different account at the same time is not a conflict.
    const otherAccount = await client.createCalendarPost(
      {
        workspaceId,
        finalVideoId: approved.finalVideoId,
        approvalToken: approved.approvalToken,
        platform: "meta",
        account: "sunrise-estates-other",
        caption: "Other account.",
        scheduledAt: "2999-01-01T09:00:30+05:30",
        timezone: "Asia/Kolkata",
        manualExport: false
      },
      { idempotencyKey: "u1-conflict-3" }
    );
    assert.equal(otherAccount.status, 202, JSON.stringify(otherAccount.body));
  });
});

test("U1 replays a calendar post by idempotency key and rejects a same-key different-input conflict", async () => {
  await withApiServer(baseEnv, async ({ baseUrl }) => {
    const client = new V0Client({ baseUrl, authToken: signJwt("u1-replay") });
    const approved = await prepareApprovedFinalVideo(client, "U1 replay");
    const workspaceId = approved.workspaceId;

    const first = await client.createCalendarPost(
      {
        workspaceId,
        finalVideoId: approved.finalVideoId,
        approvalToken: approved.approvalToken,
        platform: "meta",
        account: "sunrise-estates",
        caption: "Replay post.",
        scheduledAt: "2999-02-01T09:00:00+05:30",
        timezone: "Asia/Kolkata",
        manualExport: false
      },
      { idempotencyKey: "u1-replay-1" }
    );
    assert.equal(first.status, 202, JSON.stringify(first.body));
    const firstId = first.body.calendarPost.id;

    const replay = await client.createCalendarPost(
      {
        workspaceId,
        finalVideoId: approved.finalVideoId,
        approvalToken: approved.approvalToken,
        platform: "meta",
        account: "sunrise-estates",
        caption: "Replay post.",
        scheduledAt: "2999-02-01T09:00:00+05:30",
        timezone: "Asia/Kolkata",
        manualExport: false
      },
      { idempotencyKey: "u1-replay-1" }
    );
    assert.equal(replay.status, 202, JSON.stringify(replay.body));
    assert.equal(replay.body.calendarPost.id, firstId);

    const conflict = await client.createCalendarPost(
      {
        workspaceId,
        finalVideoId: approved.finalVideoId,
        approvalToken: approved.approvalToken,
        platform: "meta",
        account: "sunrise-estates",
        caption: "Different caption.",
        scheduledAt: "2999-02-01T09:00:00+05:30",
        timezone: "Asia/Kolkata",
        manualExport: false
      },
      { idempotencyKey: "u1-replay-1" }
    );
    assert.equal(conflict.status, 409, JSON.stringify(conflict.body));
    assert.equal(conflict.body.code, "IDEMPOTENCY_INPUT_CONFLICT");
  });
});

test("U1 hides a cross-workspace create behind WORKSPACE_ACCESS_DENIED", async () => {
  await withApiServer(baseEnv, async ({ baseUrl }) => {
    const ownerClient = new V0Client({ baseUrl, authToken: signJwt("u1-wsA") });
    const approved = await prepareApprovedFinalVideo(ownerClient, "U1 wsA");
    const workspaceA = approved.workspaceId;

    // Workspace B cannot schedule workspace A's approved final video.
    const otherClient = new V0Client({ baseUrl, authToken: signJwt("u1-wsB") });
    const otherWorkspace = await otherClient.createWorkspace(
      { name: "U1 wsB" },
      { idempotencyKey: "u1-wsB-create" }
    );
    const workspaceB = otherWorkspace.body.workspace.id;

    const cross = await otherClient.createCalendarPost(
      {
        workspaceId: workspaceB,
        finalVideoId: approved.finalVideoId,
        approvalToken: approved.approvalToken,
        platform: "meta",
        account: "sunrise-estates",
        caption: "Cross post.",
        scheduledAt: "2999-03-01T09:00:00+05:30",
        timezone: "Asia/Kolkata",
        manualExport: false
      },
      { idempotencyKey: "u1-wsB-cross" }
    );
    assert.equal(cross.status, 404, JSON.stringify(cross.body));
    assert.equal(cross.body.code, "WORKSPACE_ACCESS_DENIED");

    // The other workspace id never leaks.
    assert.equal(JSON.stringify(cross.body).includes(workspaceA), false);
  });
});

// V0-U1 edit route (PATCH /calendar-posts/{id}). An authorised production role
// (schedule_publish_approved_media: Owner/Admin/Client Manager; NOT Reviewer) edits a calendar post
// that has not yet been published: caption, account, platform, scheduledAt, timezone and
// manualExport. The bound media identity (finalVideoId/approvalToken/sha256/version) is immutable on
// edit; a superseded bound version returns PUBLISH_MEDIA_STALE (409). An optimistic expectedVersion
// mismatch returns RESOURCE_VERSION_STALE (409); a successful edit bumps version. An edit is blocked
// once a PublishOperation exists (or manualLiveUrl is set, or the post is terminal) with
// PUBLISH_POST_LOCKED (409). An edited schedule that conflicts with another active post for the same
// workspace + platform + account within the conflict window returns PUBLISH_SCHEDULE_INVALID (422).
// Edit is idempotency-key-bound (calendar.post.update): same key + same input replays; same key +
// different input is IDEMPOTENCY_INPUT_CONFLICT. A calendar.post_updated audit records the changed
// fields and never rewrites the R2 approval truth. Cross-workspace edits hide behind
// WORKSPACE_ACCESS_DENIED (404).

test("U1 edits a calendar post caption before submission with an optimistic version bump and audit", async () => {
  await withApiServer(baseEnv, async ({ baseUrl }) => {
    const client = new V0Client({ baseUrl, authToken: signJwt("u1-edit-caption") });
    const approved = await prepareApprovedFinalVideo(client, "U1 edit caption");
    const workspaceId = approved.workspaceId;

    const created = await client.createCalendarPost(
      {
        workspaceId,
        finalVideoId: approved.finalVideoId,
        approvalToken: approved.approvalToken,
        platform: "meta",
        account: "sunrise-estates",
        caption: "Original caption.",
        scheduledAt: "2999-06-01T09:00:00+05:30",
        timezone: "Asia/Kolkata",
        manualExport: false
      },
      { idempotencyKey: "u1-edit-caption-create" }
    );
    assert.equal(created.status, 202, JSON.stringify(created.body));
    assert.equal(created.body.calendarPost.version, 1);
    const postId = created.body.calendarPost.id;

    const edited = await client.updateCalendarPost(
      postId,
      {
        workspaceId,
        expectedVersion: 1,
        caption: "Edited caption with a new CTA. #realestate"
      },
      { idempotencyKey: "u1-edit-caption-1" }
    );
    assert.equal(edited.status, 202, JSON.stringify(edited.body));
    assert.equal(edited.body.calendarPost.id, postId);
    assert.equal(edited.body.calendarPost.version, 2);
    assert.equal(edited.body.calendarPost.caption, "Edited caption with a new CTA. #realestate");
    // The bound media identity is immutable on edit.
    assert.equal(edited.body.calendarPost.finalVideoId, approved.finalVideoId);
    assert.equal(edited.body.calendarPost.approvalToken, approved.approvalToken);
    assert.equal(edited.body.calendarPost.finalVideoSha256, approved.finalVideoSha256);
    assert.equal(edited.body.calendarPost.finalVideoVersion, approved.finalVideoVersion);
    assert.equal(edited.body.calendarPost.status, "scheduled");
    assert.equal(edited.body.audit.eventType, "calendar.post_updated");
    assert.equal(edited.body.audit.targetType, "CalendarPost");
    assert.equal(edited.body.audit.targetId, postId);
    assert.ok(/caption/.test(edited.body.audit.reason), `audit reason lists changed fields: ${edited.body.audit.reason}`);

    assert.equal(/https?:\/\//i.test(JSON.stringify(edited.body)), false);
    assert.equal(/secret|api[_-]?key|signature|object[_-]?key|payload[_-]?hash/i.test(JSON.stringify(edited.body)), false);
  });
});

test("U1 rejects an edit with a stale expected version", async () => {
  await withApiServer(baseEnv, async ({ baseUrl }) => {
    const client = new V0Client({ baseUrl, authToken: signJwt("u1-edit-version") });
    const approved = await prepareApprovedFinalVideo(client, "U1 edit version");
    const workspaceId = approved.workspaceId;

    const created = await client.createCalendarPost(
      {
        workspaceId,
        finalVideoId: approved.finalVideoId,
        approvalToken: approved.approvalToken,
        platform: "meta",
        account: "sunrise-estates",
        caption: "Version post.",
        scheduledAt: "2999-06-02T09:00:00+05:30",
        timezone: "Asia/Kolkata",
        manualExport: false
      },
      { idempotencyKey: "u1-edit-version-create" }
    );
    assert.equal(created.status, 202, JSON.stringify(created.body));
    const postId = created.body.calendarPost.id;

    // The post is at version 1; an edit claiming expectedVersion 0 is stale.
    const stale = await client.updateCalendarPost(
      postId,
      { workspaceId, expectedVersion: 0, caption: "Stale edit." },
      { idempotencyKey: "u1-edit-version-stale" }
    );
    assert.equal(stale.status, 409, JSON.stringify(stale.body));
    assert.equal(stale.body.code, "RESOURCE_VERSION_STALE");
  });
});

test("U1 rejects an edit when the bound media has been superseded", async () => {
  await withApiServer(baseEnv, async ({ baseUrl }) => {
    const client = new V0Client({ baseUrl, authToken: signJwt("u1-edit-stale-media") });
    const approved = await prepareApprovedFinalVideo(client, "U1 edit stale media");
    const workspaceId = approved.workspaceId;

    const created = await client.createCalendarPost(
      {
        workspaceId,
        finalVideoId: approved.finalVideoId,
        approvalToken: approved.approvalToken,
        platform: "meta",
        account: "sunrise-estates",
        caption: "Stale media post.",
        scheduledAt: "2999-06-03T09:00:00+05:30",
        timezone: "Asia/Kolkata",
        manualExport: false
      },
      { idempotencyKey: "u1-edit-stale-create" }
    );
    assert.equal(created.status, 202, JSON.stringify(created.body));
    const postId = created.body.calendarPost.id;

    // A new revision supersedes the bound version; the post now points at superseded media.
    const revised = await client.renderCompositionPlan(
      approved.compositionPlanId,
      { workspaceId },
      { idempotencyKey: "u1-edit-stale-rev" }
    );
    assert.equal(revised.status, 202, JSON.stringify(revised.body));

    const stale = await client.updateCalendarPost(
      postId,
      { workspaceId, expectedVersion: 1, caption: "Edit after supersede." },
      { idempotencyKey: "u1-edit-stale-1" }
    );
    assert.equal(stale.status, 409, JSON.stringify(stale.body));
    assert.equal(stale.body.code, "PUBLISH_MEDIA_STALE");
  });
});

test("U1 detects a schedule conflict after editing the schedule into an occupied window", async () => {
  await withApiServer(baseEnv, async ({ baseUrl }) => {
    const client = new V0Client({ baseUrl, authToken: signJwt("u1-edit-conflict") });
    const approved = await prepareApprovedFinalVideo(client, "U1 edit conflict");
    const workspaceId = approved.workspaceId;

    // Post A occupies the 09:00 IST window for sunrise-estates.
    const postA = await client.createCalendarPost(
      {
        workspaceId,
        finalVideoId: approved.finalVideoId,
        approvalToken: approved.approvalToken,
        platform: "meta",
        account: "sunrise-estates",
        caption: "Post A.",
        scheduledAt: "2999-07-01T09:00:00+05:30",
        timezone: "Asia/Kolkata",
        manualExport: false
      },
      { idempotencyKey: "u1-edit-conflict-a" }
    );
    assert.equal(postA.status, 202, JSON.stringify(postA.body));

    // Post B for the same account is far away (no conflict at create).
    const postB = await client.createCalendarPost(
      {
        workspaceId,
        finalVideoId: approved.finalVideoId,
        approvalToken: approved.approvalToken,
        platform: "meta",
        account: "sunrise-estates",
        caption: "Post B.",
        scheduledAt: "2999-07-01T11:00:00+05:30",
        timezone: "Asia/Kolkata",
        manualExport: false
      },
      { idempotencyKey: "u1-edit-conflict-b" }
    );
    assert.equal(postB.status, 202, JSON.stringify(postB.body));

    // Editing B's schedule into the 09:00 window conflicts with A.
    const conflict = await client.updateCalendarPost(
      postB.body.calendarPost.id,
      {
        workspaceId,
        expectedVersion: 1,
        scheduledAt: "2999-07-01T09:00:30+05:30"
      },
      { idempotencyKey: "u1-edit-conflict-edit" }
    );
    assert.equal(conflict.status, 422, JSON.stringify(conflict.body));
    assert.equal(conflict.body.code, "PUBLISH_SCHEDULE_INVALID");
  });
});

test("U1 blocks an edit after a publish operation exists", async () => {
  const env = { ...baseEnv, V0_META_SIMULATOR_SECRET: "test-meta-simulator-secret" };
  await withApiServer(env, async ({ baseUrl }) => {
    const client = new V0Client({ baseUrl, authToken: signJwt("u1-edit-locked") });
    const approved = await prepareApprovedFinalVideo(client, "U1 edit locked");
    const workspaceId = approved.workspaceId;

    const created = await client.createCalendarPost(
      {
        workspaceId,
        finalVideoId: approved.finalVideoId,
        approvalToken: approved.approvalToken,
        platform: "meta",
        account: "sunrise-estates",
        caption: "Lock post.",
        scheduledAt: "2999-08-01T09:00:00+05:30",
        timezone: "Asia/Kolkata",
        manualExport: false
      },
      { idempotencyKey: "u1-edit-locked-create" }
    );
    assert.equal(created.status, 202, JSON.stringify(created.body));
    const postId = created.body.calendarPost.id;

    // Publishing creates a PublishOperation and advances the post past the editable state.
    const published = await client.publishCalendarPost(
      postId,
      { workspaceId, account: "sunrise-estates" },
      { idempotencyKey: "u1-edit-locked-publish" }
    );
    assert.equal(published.status, 202, JSON.stringify(published.body));

    const locked = await client.updateCalendarPost(
      postId,
      { workspaceId, expectedVersion: 1, caption: "Edit after publish." },
      { idempotencyKey: "u1-edit-locked-1" }
    );
    assert.equal(locked.status, 409, JSON.stringify(locked.body));
    assert.equal(locked.body.code, "PUBLISH_POST_LOCKED");
  });
});

test("U1 edits a scheduled post into a manual export with a retained manual-export artifact", async () => {
  await withApiServer(baseEnv, async ({ baseUrl }) => {
    const client = new V0Client({ baseUrl, authToken: signJwt("u1-edit-toggle") });
    const approved = await prepareApprovedFinalVideo(client, "U1 edit toggle");
    const workspaceId = approved.workspaceId;

    const created = await client.createCalendarPost(
      {
        workspaceId,
        finalVideoId: approved.finalVideoId,
        approvalToken: approved.approvalToken,
        platform: "meta",
        account: "sunrise-estates",
        caption: "Toggle post.",
        scheduledAt: "2999-09-01T09:00:00+05:30",
        timezone: "Asia/Kolkata",
        manualExport: false
      },
      { idempotencyKey: "u1-edit-toggle-create" }
    );
    assert.equal(created.status, 202, JSON.stringify(created.body));
    const postId = created.body.calendarPost.id;

    // Edit the post into a manual export: manualExport true, no scheduledAt.
    const toggled = await client.updateCalendarPost(
      postId,
      {
        workspaceId,
        expectedVersion: 1,
        manualExport: true,
        scheduledAt: null
      },
      { idempotencyKey: "u1-edit-toggle-1" }
    );
    assert.equal(toggled.status, 202, JSON.stringify(toggled.body));
    assert.equal(toggled.body.calendarPost.status, "approved");
    assert.equal(toggled.body.calendarPost.manualExport, true);
    assert.equal(toggled.body.calendarPost.scheduledAt, null);
    assert.equal(toggled.body.calendarPost.version, 2);
    assert.ok(toggled.body.exportArtifact, "toggling to manual export produces an export artifact");
    assert.equal(toggled.body.exportArtifact.retentionClass, "manual-export");
    assert.equal(toggled.body.exportArtifact.schemaVersion, "calendar.manual_export.v1");
    assert.equal(toggled.body.calendarPost.exportArtifactId, toggled.body.exportArtifact.id);
    assert.equal(toggled.body.exportArtifact.objectKey, undefined);

    assert.equal(/https?:\/\//i.test(JSON.stringify(toggled.body)), false);
    assert.equal(/secret|api[_-]?key|signature|object[_-]?key|payload[_-]?hash/i.test(JSON.stringify(toggled.body)), false);
  });
});

test("U1 replays an edit by idempotency key and rejects a same-key different-input conflict", async () => {
  await withApiServer(baseEnv, async ({ baseUrl }) => {
    const client = new V0Client({ baseUrl, authToken: signJwt("u1-edit-replay") });
    const approved = await prepareApprovedFinalVideo(client, "U1 edit replay");
    const workspaceId = approved.workspaceId;

    const created = await client.createCalendarPost(
      {
        workspaceId,
        finalVideoId: approved.finalVideoId,
        approvalToken: approved.approvalToken,
        platform: "meta",
        account: "sunrise-estates",
        caption: "Replay edit post.",
        scheduledAt: "2999-10-01T09:00:00+05:30",
        timezone: "Asia/Kolkata",
        manualExport: false
      },
      { idempotencyKey: "u1-edit-replay-create" }
    );
    assert.equal(created.status, 202, JSON.stringify(created.body));
    const postId = created.body.calendarPost.id;

    const edit1 = await client.updateCalendarPost(
      postId,
      { workspaceId, expectedVersion: 1, caption: "First edit." },
      { idempotencyKey: "u1-edit-replay-key" }
    );
    assert.equal(edit1.status, 202, JSON.stringify(edit1.body));
    assert.equal(edit1.body.calendarPost.version, 2);

    // Same key + same input replays the same edit (version stays 2).
    const replay = await client.updateCalendarPost(
      postId,
      { workspaceId, expectedVersion: 1, caption: "First edit." },
      { idempotencyKey: "u1-edit-replay-key" }
    );
    assert.equal(replay.status, 202, JSON.stringify(replay.body));
    assert.equal(replay.body.calendarPost.version, 2);

    // Same key + different input is a conflict.
    const conflict = await client.updateCalendarPost(
      postId,
      { workspaceId, expectedVersion: 1, caption: "Different edit." },
      { idempotencyKey: "u1-edit-replay-key" }
    );
    assert.equal(conflict.status, 409, JSON.stringify(conflict.body));
    assert.equal(conflict.body.code, "IDEMPOTENCY_INPUT_CONFLICT");
  });
});

test("U1 hides a cross-workspace edit behind WORKSPACE_ACCESS_DENIED", async () => {
  await withApiServer(baseEnv, async ({ baseUrl }) => {
    const ownerClient = new V0Client({ baseUrl, authToken: signJwt("u1-edit-wsA") });
    const approved = await prepareApprovedFinalVideo(ownerClient, "U1 edit wsA");
    const workspaceA = approved.workspaceId;

    const created = await ownerClient.createCalendarPost(
      {
        workspaceId: workspaceA,
        finalVideoId: approved.finalVideoId,
        approvalToken: approved.approvalToken,
        platform: "meta",
        account: "sunrise-estates",
        caption: "Cross edit post.",
        scheduledAt: "2999-11-01T09:00:00+05:30",
        timezone: "Asia/Kolkata",
        manualExport: false
      },
      { idempotencyKey: "u1-edit-wsA-create" }
    );
    assert.equal(created.status, 202, JSON.stringify(created.body));
    const postId = created.body.calendarPost.id;

    // Workspace B cannot edit workspace A's calendar post.
    const otherClient = new V0Client({ baseUrl, authToken: signJwt("u1-edit-wsB") });
    const otherWorkspace = await otherClient.createWorkspace(
      { name: "U1 edit wsB" },
      { idempotencyKey: "u1-edit-wsB-create" }
    );
    const workspaceB = otherWorkspace.body.workspace.id;

    const cross = await otherClient.updateCalendarPost(
      postId,
      { workspaceId: workspaceB, expectedVersion: 1, caption: "Cross edit." },
      { idempotencyKey: "u1-edit-wsB-edit" }
    );
    assert.equal(cross.status, 404, JSON.stringify(cross.body));
    assert.equal(cross.body.code, "WORKSPACE_ACCESS_DENIED");
    assert.equal(JSON.stringify(cross.body).includes(workspaceA), false);
  });
});

test("U1 concurrent creates for the same account and window create exactly one post", async () => {
  await withApiServer(baseEnv, async ({ baseUrl }) => {
    const client = new V0Client({ baseUrl, authToken: signJwt("u1-edit-concurrent") });
    const approved = await prepareApprovedFinalVideo(client, "U1 edit concurrent");
    const workspaceId = approved.workspaceId;

    // Fire several concurrent creates with different idempotency keys for the same account and
    // conflict window. Exactly one must win (202) and the rest must be rejected as a schedule
    // conflict (422 PUBLISH_SCHEDULE_INVALID); no duplicate post is recorded.
    const attempts = await Promise.all(
      Array.from({ length: 4 }, (_, index) =>
        client.createCalendarPost(
          {
            workspaceId,
            finalVideoId: approved.finalVideoId,
            approvalToken: approved.approvalToken,
            platform: "meta",
            account: "sunrise-estates-concurrent",
            caption: `Concurrent ${index}.`,
            scheduledAt: "2999-12-01T09:00:00+05:30",
            timezone: "Asia/Kolkata",
            manualExport: false
          },
          { idempotencyKey: `u1-edit-concurrent-${index}` }
        )
      )
    );
    const successes = attempts.filter((attempt) => attempt.status === 202);
    const conflicts = attempts.filter((attempt) => attempt.status === 422 && attempt.body.code === "PUBLISH_SCHEDULE_INVALID");
    assert.equal(successes.length, 1, JSON.stringify(attempts.map((a) => ({ status: a.status, code: a.body?.code }))));
    assert.equal(conflicts.length, attempts.length - 1);
    assert.equal(successes[0].body.calendarPost.account, "sunrise-estates-concurrent");
  });
});

function signJwt(userId) {
  const header = Buffer.from(JSON.stringify({ alg: "HS256", typ: "JWT" })).toString("base64url");
  const payload = Buffer.from(
    JSON.stringify({
      sub: userId,
      email: `${userId}@example.test`,
      aud: "authenticated",
      role: "authenticated",
      exp: Math.floor(Date.now() / 1000) + 3600
    })
  ).toString("base64url");
  const signature = createHmac("sha256", jwtSecret).update(`${header}.${payload}`).digest("base64url");
  return `${header}.${payload}.${signature}`;
}
