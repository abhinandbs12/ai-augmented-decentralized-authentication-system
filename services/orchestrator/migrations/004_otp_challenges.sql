-- SMS step-up challenges. Only the hash of the six-digit code is stored, and
-- the row is deleted once the attempt limit is reached (TRD 5.5).
CREATE TABLE IF NOT EXISTS otp_challenges (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  wallet_address  text NOT NULL,
  code_hash       text NOT NULL,
  trust_score     integer NOT NULL CHECK (trust_score BETWEEN 0 AND 100),
  attempts        integer NOT NULL DEFAULT 0,
  verified        boolean NOT NULL DEFAULT false,
  expires_at      timestamptz NOT NULL,
  created_at      timestamptz NOT NULL DEFAULT now()
);
