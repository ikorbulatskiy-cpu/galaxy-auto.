-- NEXORA profile progression foundation. Additive and isolated to the NEXORA schema.
ALTER TABLE nexora_social_world.characters
  ADD COLUMN IF NOT EXISTS level INTEGER NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS experience BIGINT NOT NULL DEFAULT 0;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'characters_level_positive_check'
      AND conrelid = 'nexora_social_world.characters'::regclass
  ) THEN
    ALTER TABLE nexora_social_world.characters
      ADD CONSTRAINT characters_level_positive_check CHECK (level >= 1);
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'characters_experience_nonnegative_check'
      AND conrelid = 'nexora_social_world.characters'::regclass
  ) THEN
    ALTER TABLE nexora_social_world.characters
      ADD CONSTRAINT characters_experience_nonnegative_check CHECK (experience >= 0);
  END IF;
END $$;
