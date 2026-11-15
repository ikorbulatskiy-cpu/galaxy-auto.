-- NEXORA avatar equipment: persistent outfit selection and Emperor of the Galaxy set.
ALTER TABLE nexora_social_auth.characters
  ADD COLUMN IF NOT EXISTS outfit_id SMALLINT NOT NULL DEFAULT 0
  CHECK (outfit_id BETWEEN 0 AND 1);

INSERT INTO nexora_social_auth.authority_ranks(rank_order,rank_name,min_points,stars,aura)
VALUES (14,'Император Галактики',50000,7,'purple')
ON CONFLICT(rank_order) DO UPDATE SET
  rank_name=EXCLUDED.rank_name,
  min_points=EXCLUDED.min_points,
  stars=EXCLUDED.stars,
  aura=EXCLUDED.aura;
