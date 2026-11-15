-- Passwordless character-code authentication.
ALTER TABLE users ALTER COLUMN email DROP NOT NULL;
ALTER TABLE users ALTER COLUMN password_hash DROP NOT NULL;
ALTER TABLE users ADD COLUMN IF NOT EXISTS character_code_hash TEXT;
CREATE UNIQUE INDEX IF NOT EXISTS users_character_code_hash_uidx
  ON users(character_code_hash)
  WHERE character_code_hash IS NOT NULL;
