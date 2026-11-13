CREATE TABLE IF NOT EXISTS nexora_social_world.account_consents (
  account_id TEXT PRIMARY KEY,
  age_confirmed_at TIMESTAMPTZ NOT NULL,
  personal_data_consent_at TIMESTAMPTZ NOT NULL,
  legal_terms_accepted_at TIMESTAMPTZ NOT NULL,
  legal_version TEXT NOT NULL DEFAULT '2026-11-14',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
