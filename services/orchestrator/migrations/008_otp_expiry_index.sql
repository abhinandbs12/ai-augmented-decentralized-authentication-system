-- The expired-challenge cleanup finds rows by expiry, as nonces_expiry_idx
-- already allows for nonces.
CREATE INDEX IF NOT EXISTS otp_challenges_expiry_idx ON otp_challenges (expires_at);
