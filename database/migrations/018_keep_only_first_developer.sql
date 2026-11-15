-- Keep only the NEXORA developer account named "Первый".
-- This migration is intentionally guarded: it aborts if that account is absent.
DO $$
DECLARE
  developer_id UUID;
BEGIN
  SELECT id INTO developer_id
  FROM nexora_social_auth.accounts
  WHERE LOWER(nickname_normalized) = LOWER('Первый');

  IF developer_id IS NULL THEN
    RAISE EXCEPTION 'Refusing account cleanup: developer account "Первый" was not found';
  END IF;

  -- These legacy tables use TEXT account IDs and do not have cascading FKs.
  DELETE FROM nexora_social_auth.room_presence
  WHERE account_id <> developer_id::text;

  DELETE FROM nexora_social_auth.room_messages
  WHERE account_id <> developer_id::text;

  -- All account-owned tables with foreign keys use ON DELETE CASCADE;
  -- moderation history references use ON DELETE SET NULL.
  DELETE FROM nexora_social_auth.accounts
  WHERE id <> developer_id;

  INSERT INTO nexora_social_auth.account_roles(account_id, role)
  VALUES (developer_id, 'developer')
  ON CONFLICT (account_id) DO UPDATE SET role = 'developer';
END $$;
