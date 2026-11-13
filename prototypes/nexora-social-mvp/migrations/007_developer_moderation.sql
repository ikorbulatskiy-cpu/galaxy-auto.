-- NEXORA moderation foundation. Additive only; existing accounts and sessions remain intact.
ALTER TABLE nexora_social_world.developer_role_assignments
  DROP CONSTRAINT IF EXISTS developer_role_assignments_role_check;
ALTER TABLE nexora_social_world.developer_role_assignments
  ADD CONSTRAINT developer_role_assignments_role_check
  CHECK (role IN ('DEVELOPER','ADMIN','MODERATOR','HELPER','USER'));

CREATE TABLE IF NOT EXISTS nexora_social_world.moderation_actions (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  actor_account_id BIGINT REFERENCES nexora_social_world.accounts(id) ON DELETE SET NULL,
  target_account_id BIGINT NOT NULL REFERENCES nexora_social_world.accounts(id) ON DELETE CASCADE,
  action_type VARCHAR(16) NOT NULL CHECK (action_type IN ('BAN','WARN')),
  reason VARCHAR(500) NOT NULL,
  expires_at TIMESTAMPTZ,
  revoked_at TIMESTAMPTZ,
  revoked_by BIGINT REFERENCES nexora_social_world.accounts(id) ON DELETE SET NULL,
  revocation_reason VARCHAR(500),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS moderation_target_created_idx
  ON nexora_social_world.moderation_actions(target_account_id, created_at DESC);
CREATE INDEX IF NOT EXISTS moderation_active_bans_idx
  ON nexora_social_world.moderation_actions(target_account_id, expires_at)
  WHERE action_type='BAN' AND revoked_at IS NULL;
