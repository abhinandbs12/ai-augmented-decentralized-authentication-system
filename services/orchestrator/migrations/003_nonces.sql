-- Single-use login challenges. Postgres is the first of the two enforcement
-- points for replay rejection; the contract is the second (FR-07).
CREATE TABLE IF NOT EXISTS nonces (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  wallet_address  text NOT NULL,
  nonce_value     text NOT NULL,
  trust_score     integer NOT NULL CHECK (trust_score BETWEEN 0 AND 100),
  used            boolean NOT NULL DEFAULT false,
  expires_at      timestamptz NOT NULL,
  created_at      timestamptz NOT NULL DEFAULT now(),
  UNIQUE (wallet_address, nonce_value)
);

CREATE INDEX IF NOT EXISTS nonces_expiry_idx ON nonces (expires_at);
