-- Additive developer access control for NEXORA Social World.
-- New accounts receive no assignment and therefore remain ordinary USER accounts.
CREATE TABLE IF NOT EXISTS nexora_social_world.developer_role_assignments (
  account_id BIGINT PRIMARY KEY REFERENCES nexora_social_world.accounts(id) ON DELETE CASCADE,
  role VARCHAR(24) NOT NULL CHECK (role IN ('DEVELOPER','MODERATOR','HELPER','USER')),
  permissions JSONB NOT NULL DEFAULT '[]'::jsonb CHECK (jsonb_typeof(permissions) = 'array'),
  assigned_by BIGINT REFERENCES nexora_social_world.accounts(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS developer_role_assignments_role_idx ON nexora_social_world.developer_role_assignments(role);
CREATE TABLE IF NOT EXISTS nexora_social_world.developer_audit_logs (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  actor_account_id BIGINT REFERENCES nexora_social_world.accounts(id) ON DELETE SET NULL,
  target_account_id BIGINT REFERENCES nexora_social_world.accounts(id) ON DELETE SET NULL,
  action VARCHAR(80) NOT NULL,
  reason VARCHAR(500),
  details JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS developer_audit_created_idx ON nexora_social_world.developer_audit_logs(created_at DESC);
