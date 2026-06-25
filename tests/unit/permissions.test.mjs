import test from "node:test";
import assert from "node:assert/strict";
import { canPerform, membershipRoles } from "../../apps/api/src/permissions.mjs";

test("membership roles match consolidated V0 permissions contract", () => {
  assert.deepEqual(membershipRoles, ["OWNER", "ADMIN", "CLIENT_MANAGER", "REVIEWER"]);
});

test("client manager can use production and wallet capabilities but cannot use admin recovery controls", () => {
  assert.equal(canPerform("CLIENT_MANAGER", "approve_brand_profile"), true);
  assert.equal(canPerform("CLIENT_MANAGER", "select_blueprint_and_run_scripts"), true);
  assert.equal(canPerform("CLIENT_MANAGER", "confirm_paid_generation"), true);
  assert.equal(canPerform("CLIENT_MANAGER", "purchase_credits_and_view_wallet_ledger"), true);
  assert.equal(canPerform("CLIENT_MANAGER", "manage_workspace_capabilities"), false);
  assert.equal(canPerform("OWNER", "manage_workspace_capabilities"), true);
  assert.equal(canPerform("ADMIN", "manage_workspace_capabilities"), true);
  assert.equal(canPerform("CLIENT_MANAGER", "view_operations"), false);
  assert.equal(canPerform("OWNER", "view_operations"), true);
  assert.equal(canPerform("ADMIN", "run_restore_drills"), true);
  assert.equal(canPerform("REVIEWER", "manage_simulator_modes"), false);
  assert.equal(canPerform("CLIENT_MANAGER", "retry_reconcile_provider_jobs"), false);
  assert.equal(canPerform("CLIENT_MANAGER", "adjust_credits"), false);
});

test("reviewer can submit comments only", () => {
  assert.equal(canPerform("REVIEWER", "submit_review_comments"), true);
  assert.equal(canPerform("REVIEWER", "approve_reject_final_video"), false);
  assert.equal(canPerform("REVIEWER", "schedule_publish_approved_media"), false);
});
