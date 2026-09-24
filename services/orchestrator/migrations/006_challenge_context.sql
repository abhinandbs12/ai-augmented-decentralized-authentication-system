-- The scoring reasons and the route of an attempt travel with its challenge,
-- so the event written after verification can say why it was routed that way.
ALTER TABLE nonces ADD COLUMN IF NOT EXISTS factors text[] NOT NULL DEFAULT '{}';
ALTER TABLE nonces ADD COLUMN IF NOT EXISTS route text NOT NULL DEFAULT 'allow';
ALTER TABLE otp_challenges ADD COLUMN IF NOT EXISTS factors text[] NOT NULL DEFAULT '{}';
