export const membershipRoles = ["OWNER", "ADMIN", "CLIENT_MANAGER", "REVIEWER"];

const roleCapabilities = {
  OWNER: [
    "manage_workspace_members",
    "manage_provider_credentials",
    "approve_brand_profile",
    "select_blueprint_and_run_scripts",
    "confirm_paid_generation",
    "manage_avatars_consent",
    "submit_review_comments",
    "approve_reject_final_video",
    "schedule_publish_approved_media",
    "purchase_credits_and_view_wallet_ledger",
    "adjust_credits",
    "view_provider_financial_reconciliation",
    "retry_reconcile_provider_jobs",
    "export_delete_workspace"
  ],
  ADMIN: [
    "manage_workspace_members",
    "manage_provider_credentials",
    "approve_brand_profile",
    "select_blueprint_and_run_scripts",
    "confirm_paid_generation",
    "manage_avatars_consent",
    "submit_review_comments",
    "approve_reject_final_video",
    "schedule_publish_approved_media",
    "purchase_credits_and_view_wallet_ledger",
    "adjust_credits",
    "view_provider_financial_reconciliation",
    "retry_reconcile_provider_jobs",
    "export_delete_workspace"
  ],
  CLIENT_MANAGER: [
    "approve_brand_profile",
    "select_blueprint_and_run_scripts",
    "confirm_paid_generation",
    "manage_avatars_consent",
    "submit_review_comments",
    "approve_reject_final_video",
    "schedule_publish_approved_media",
    "purchase_credits_and_view_wallet_ledger"
  ],
  REVIEWER: ["submit_review_comments"]
};

export function canPerform(role, capability) {
  return roleCapabilities[role]?.includes(capability) === true;
}
