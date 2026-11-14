-- NEXORA authority progression and expanded illustrated avatar catalog.
ALTER TABLE nexora_social_auth.characters
  ADD COLUMN IF NOT EXISTS authority_points INTEGER NOT NULL DEFAULT 0 CHECK (authority_points >= 0);

ALTER TABLE nexora_social_auth.characters DROP CONSTRAINT IF EXISTS characters_head_id_check;
ALTER TABLE nexora_social_auth.characters DROP CONSTRAINT IF EXISTS characters_body_id_check;
ALTER TABLE nexora_social_auth.characters
  ADD CONSTRAINT characters_head_id_check CHECK (head_id BETWEEN 1 AND 24),
  ADD CONSTRAINT characters_body_id_check CHECK (body_id BETWEEN 1 AND 24);

CREATE TABLE IF NOT EXISTS nexora_social_auth.authority_events (
  id BIGSERIAL PRIMARY KEY,
  account_id UUID NOT NULL REFERENCES nexora_social_auth.accounts(id) ON DELETE CASCADE,
  source VARCHAR(32) NOT NULL,
  source_ref VARCHAR(120) NOT NULL,
  points SMALLINT NOT NULL CHECK (points > 0),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(account_id, source, source_ref)
);
CREATE INDEX IF NOT EXISTS authority_events_daily_idx
  ON nexora_social_auth.authority_events(account_id, created_at DESC);

CREATE TABLE IF NOT EXISTS nexora_social_auth.authority_ranks (
  rank_order SMALLINT PRIMARY KEY,
  rank_name VARCHAR(48) NOT NULL,
  min_points INTEGER NOT NULL UNIQUE CHECK (min_points >= 0),
  stars SMALLINT NOT NULL DEFAULT 0 CHECK (stars BETWEEN 0 AND 7),
  aura VARCHAR(16) NOT NULL CHECK (aura IN ('none','violet','silver','rose','blue','red','ember','purple','green','gold','diamond')),
  UNIQUE(rank_name)
);
INSERT INTO nexora_social_auth.authority_ranks(rank_order,rank_name,min_points,stars,aura) VALUES
 (0,'Новичок',0,0,'none'),
 (1,'Бывалый',1,1,'violet'),
 (2,'Уважаемый',2,2,'silver'),
 (3,'Мастер',3,3,'rose'),
 (4,'Профессионал',4,4,'blue'),
 (5,'Гуру',5,1,'red'),
 (6,'Неприкасаемый',10,2,'ember'),
 (7,'Папа / Мама',20,2,'purple'),
 (8,'Ангел Галактики',100,4,'green'),
 (9,'Бог / Богиня Галактики',200,5,'gold'),
 (10,'Всемогущий',1000,6,'diamond'),
 (11,'Mister / Miss Вселенная',2000,6,'blue'),
 (12,'Легенда Галактики',10000,7,'purple'),
 (13,'Премьер Галактики',20000,7,'gold')
ON CONFLICT (rank_order) DO UPDATE SET rank_name=EXCLUDED.rank_name,min_points=EXCLUDED.min_points,stars=EXCLUDED.stars,aura=EXCLUDED.aura;
