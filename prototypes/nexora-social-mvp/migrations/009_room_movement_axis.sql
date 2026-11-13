-- NEXORA room 5.0: persist the second axis for click-to-move room navigation.
-- Existing players keep their current horizontal position and receive a default floor depth.
ALTER TABLE nexora_social_world.characters
  ADD COLUMN IF NOT EXISTS position_y REAL NOT NULL DEFAULT 0.82;
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname='characters_position_y_range_check'
      AND conrelid='nexora_social_world.characters'::regclass
  ) THEN
    ALTER TABLE nexora_social_world.characters
      ADD CONSTRAINT characters_position_y_range_check
      CHECK(position_y>=0.60 AND position_y<=0.94);
  END IF;
END $$;
