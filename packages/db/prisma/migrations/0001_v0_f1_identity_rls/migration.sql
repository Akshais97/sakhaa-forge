CREATE TYPE membership_role AS ENUM ('OWNER', 'ADMIN', 'CLIENT_MANAGER', 'REVIEWER');
CREATE TYPE record_status AS ENUM ('ACTIVE', 'ARCHIVED', 'DELETED');

CREATE TABLE users (
  id uuid PRIMARY KEY,
  email varchar(320),
  display_name varchar(160),
  status record_status NOT NULL DEFAULT 'ACTIVE',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE workspaces (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name varchar(120) NOT NULL,
  slug varchar(140) NOT NULL UNIQUE,
  status record_status NOT NULL DEFAULT 'ACTIVE',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE memberships (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES workspaces(id),
  user_id uuid NOT NULL REFERENCES users(id),
  role membership_role NOT NULL,
  status record_status NOT NULL DEFAULT 'ACTIVE',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (workspace_id, user_id)
);

CREATE TABLE audit_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid REFERENCES workspaces(id),
  actor_user_id uuid REFERENCES users(id),
  event_type varchar(120) NOT NULL,
  target_type varchar(120),
  target_id uuid,
  reason varchar(500),
  occurred_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX memberships_user_status_idx ON memberships(user_id, status);
CREATE INDEX memberships_workspace_role_idx ON memberships(workspace_id, role);
CREATE INDEX audit_events_workspace_occurred_idx ON audit_events(workspace_id, occurred_at);
CREATE INDEX audit_events_actor_occurred_idx ON audit_events(actor_user_id, occurred_at);

ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE workspaces ENABLE ROW LEVEL SECURITY;
ALTER TABLE memberships ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit_events ENABLE ROW LEVEL SECURITY;

ALTER TABLE users FORCE ROW LEVEL SECURITY;
ALTER TABLE workspaces FORCE ROW LEVEL SECURITY;
ALTER TABLE memberships FORCE ROW LEVEL SECURITY;
ALTER TABLE audit_events FORCE ROW LEVEL SECURITY;

CREATE FUNCTION app_current_user_id()
RETURNS uuid
LANGUAGE sql
STABLE
AS $$
  SELECT NULLIF(current_setting('app.current_user_id', true), '')::uuid
$$;

CREATE POLICY user_select_self
  ON users
  FOR SELECT
  USING (id = app_current_user_id());

CREATE POLICY user_insert_self
  ON users
  FOR INSERT
  WITH CHECK (id = app_current_user_id());

CREATE POLICY membership_select_own_workspace
  ON memberships
  FOR SELECT
  USING (user_id = app_current_user_id());

CREATE POLICY workspace_select_member
  ON workspaces
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1
      FROM memberships
      WHERE memberships.workspace_id = workspaces.id
        AND memberships.user_id = app_current_user_id()
        AND memberships.status = 'ACTIVE'
    )
  );

CREATE POLICY workspace_insert_current_creation
  ON workspaces
  FOR INSERT
  WITH CHECK (id::text = current_setting('app.current_workspace_id', true));

CREATE POLICY membership_insert_creator_owner
  ON memberships
  FOR INSERT
  WITH CHECK (
    workspace_id::text = current_setting('app.current_workspace_id', true)
    AND user_id = app_current_user_id()
    AND role = 'OWNER'
    AND status = 'ACTIVE'
  );

CREATE POLICY audit_select_workspace_member
  ON audit_events
  FOR SELECT
  USING (
    workspace_id IS NOT NULL
    AND EXISTS (
      SELECT 1
      FROM memberships
      WHERE memberships.workspace_id = audit_events.workspace_id
        AND memberships.user_id = app_current_user_id()
        AND memberships.status = 'ACTIVE'
    )
  );

CREATE POLICY audit_insert_actor
  ON audit_events
  FOR INSERT
  WITH CHECK (actor_user_id = app_current_user_id());
