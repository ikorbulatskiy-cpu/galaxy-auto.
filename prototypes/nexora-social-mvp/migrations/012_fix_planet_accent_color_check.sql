-- Repair the accent-color constraint for databases where migration 010
-- already created the table. The previous range expression failed when
-- PostgreSQL evaluated the check during custom planet insertion.
ALTER TABLE nexora_social_world.custom_planets
  DROP CONSTRAINT IF EXISTS custom_planets_accent_color_check;

ALTER TABLE nexora_social_world.custom_planets
  ADD CONSTRAINT custom_planets_accent_color_check
  CHECK (accent_color ~ '^#[[:xdigit:]]{6}$');
