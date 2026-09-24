-- Opaque session tokens (TRD 11.3). Only the SHA-256 hash is stored, so a
-- database dump cannot be replayed as a login.
CREATE TABLE IF NOT EXISTS sessions (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash    text UNIQUE NOT NULL,
  trust_score   integer NOT NULL CHECK (trust_score BETWEEN 0 AND 100),
  issued_at     timestamptz NOT NULL DEFAULT now(),
  expires_at    timestamptz NOT NULL,
  revoked_at    timestamptz
);

CREATE INDEX IF NOT EXISTS sessions_user_expiry_idx ON sessions (user_id, expires_at);
