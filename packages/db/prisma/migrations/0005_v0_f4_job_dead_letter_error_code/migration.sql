ALTER TABLE jobs
  ADD COLUMN last_error_code varchar(120);

CREATE INDEX jobs_workspace_failed_updated_idx
  ON jobs(workspace_id, status, updated_at)
  WHERE status = 'FAILED';
