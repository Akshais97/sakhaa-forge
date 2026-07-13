-- V0-S2 actor lineage integrity: enforce that every selected_script approver is a
-- real user. Additive FK on selected_scripts.approver_user_id -> users(id).
-- Sources: docs/V0/V0_PRISMA_SCHEMA.md, docs/Project/Sprint Reviews/S1_S2review.md.

ALTER TABLE selected_scripts
  ADD CONSTRAINT selected_scripts_approver_user_id_fkey
  FOREIGN KEY (approver_user_id) REFERENCES users(id);