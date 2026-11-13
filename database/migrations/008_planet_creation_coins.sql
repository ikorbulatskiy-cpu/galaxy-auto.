-- Planet creation uses fractional Coins and owner metadata in room presence.
ALTER TABLE wallet_balances
  ALTER COLUMN coins TYPE NUMERIC(14,2) USING coins::NUMERIC(14,2);
ALTER TABLE wallet_ledger
  ALTER COLUMN amount TYPE NUMERIC(14,2) USING amount::NUMERIC(14,2);
CREATE INDEX IF NOT EXISTS planets_owner_user_id_idx ON planets(owner_user_id) WHERE owner_user_id IS NOT NULL;
