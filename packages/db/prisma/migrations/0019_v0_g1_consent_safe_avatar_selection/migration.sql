-- V0-G1 consent-safe avatar selection: generic, brand-ambassador and consented
-- real-person avatars bound to an approved brand profile. Eligibility is derived
-- from consent evidence/expiry/revocation and service-fulfillment state; it is
-- never stored as a separate enum. Consent evidence stays in avatar_consents
-- as a secret-manager style reference and never reaches public responses.
-- Sources: docs/V0/Sprints/V0-G1_CONSENT_SAFE_AVATAR_SELECTION_SPRINT.md.

CREATE TABLE IF NOT EXISTS avatar_profiles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES workspaces(id),
  brand_profile_id UUID NOT NULL REFERENCES brand_profiles(id),
  kind VARCHAR(40) NOT NULL,
  display_name VARCHAR(160) NOT NULL,
  likeness_scope VARCHAR(40) NOT NULL,
  voice_scope VARCHAR(40) NOT NULL,
  service_fulfillment_state VARCHAR(40) NOT NULL,
  created_at TIMESTAMPTZ(6) NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ(6) NOT NULL DEFAULT now(),
  CONSTRAINT avatar_profiles_kind_check CHECK (kind IN ('generic', 'brand_ambassador', 'real_person')),
  CONSTRAINT avatar_profiles_likeness_scope_check CHECK (likeness_scope IN ('internal', 'campaign', 'limited')),
  CONSTRAINT avatar_profiles_voice_scope_check CHECK (voice_scope IN ('internal', 'campaign', 'limited')),
  CONSTRAINT avatar_profiles_service_fulfillment_state_check CHECK (service_fulfillment_state IN ('not_required', 'pending', 'fulfilled')),
  CONSTRAINT avatar_profiles_display_name_check CHECK (btrim(display_name) <> '')
);

CREATE UNIQUE INDEX IF NOT EXISTS avatar_profiles_workspace_brand_name_idx
  ON avatar_profiles(workspace_id, brand_profile_id, display_name);

CREATE INDEX IF NOT EXISTS avatar_profiles_workspace_brand_created_idx
  ON avatar_profiles(workspace_id, brand_profile_id, created_at);

CREATE INDEX IF NOT EXISTS avatar_profiles_workspace_updated_idx
  ON avatar_profiles(workspace_id, updated_at, id);

ALTER TABLE avatar_profiles ENABLE ROW LEVEL SECURITY;

CREATE POLICY avatar_profiles_workspace_isolation ON avatar_profiles
  USING (workspace_id::text = current_setting('app.current_workspace_id', true));

CREATE TABLE IF NOT EXISTS avatar_consents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES workspaces(id),
  avatar_profile_id UUID NOT NULL UNIQUE REFERENCES avatar_profiles(id),
  evidence_ref VARCHAR(300) NOT NULL,
  likeness_scope VARCHAR(40) NOT NULL,
  voice_scope VARCHAR(40) NOT NULL,
  expires_at TIMESTAMPTZ(6),
  revoked_at TIMESTAMPTZ(6),
  revoked_by_user_id UUID,
  created_at TIMESTAMPTZ(6) NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ(6) NOT NULL DEFAULT now(),
  CONSTRAINT avatar_consents_evidence_ref_check CHECK (btrim(evidence_ref) <> ''),
  CONSTRAINT avatar_consents_likeness_scope_check CHECK (likeness_scope IN ('internal', 'campaign', 'limited')),
  CONSTRAINT avatar_consents_voice_scope_check CHECK (voice_scope IN ('internal', 'campaign', 'limited'))
);

CREATE INDEX IF NOT EXISTS avatar_consents_workspace_avatar_idx
  ON avatar_consents(workspace_id, avatar_profile_id);

ALTER TABLE avatar_consents ENABLE ROW LEVEL SECURITY;

CREATE POLICY avatar_consents_workspace_isolation ON avatar_consents
  USING (workspace_id::text = current_setting('app.current_workspace_id', true));