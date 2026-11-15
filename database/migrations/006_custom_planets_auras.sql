-- Custom planets and animated aura ranks. Safe and idempotent.
ALTER TABLE planets ADD COLUMN IF NOT EXISTS owner_user_id UUID REFERENCES users(id) ON DELETE SET NULL;
ALTER TABLE characters ADD COLUMN IF NOT EXISTS aura VARCHAR(32) NOT NULL DEFAULT 'none';
ALTER TABLE characters DROP CONSTRAINT IF EXISTS characters_aura_check;
ALTER TABLE characters ADD CONSTRAINT characters_aura_check CHECK (aura IN ('none','angel','god','almighty','universe','legend'));
INSERT INTO planets (slug,name,description,access_type,ticket_price,settings)
VALUES ('newbies-1','Новички*1','Стартовая планета NEXORA. Король планеты пока неизвестен: проект находится в разработке.','public',0,'{"theme":"newbie","interior":"Зал новичков","weather":"Ясно","king_label":"Король пока неизвестен"}'::jsonb)
ON CONFLICT (slug) DO UPDATE SET description=EXCLUDED.description,settings=COALESCE(planets.settings,'{}'::jsonb)||EXCLUDED.settings;
INSERT INTO rooms (planet_id,slug,name,description,capacity)
SELECT id,'newcomers-hall','Зал новичков','Первая точка встречи новых персонажей.',100 FROM planets WHERE slug='newbies-1'
ON CONFLICT (planet_id,slug) DO NOTHING;
INSERT INTO user_locations (user_id,planet_id)
SELECT u.id,p.id FROM users u CROSS JOIN planets p WHERE p.slug='newbies-1'
AND NOT EXISTS (SELECT 1 FROM user_locations l WHERE l.user_id=u.id)
ON CONFLICT (user_id) DO NOTHING;
