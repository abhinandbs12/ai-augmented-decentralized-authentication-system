-- The step-up code is sent by email instead of SMS. The profile keeps an email
-- address (only used to deliver the code; never logged) and no longer a phone
-- number. A challenge remembers when its code was last sent, and how often, so
-- a new code can be asked for after a cooldown and only a few times.
ALTER TABLE users ADD COLUMN IF NOT EXISTS email text;
ALTER TABLE users DROP COLUMN IF EXISTS phone_number;
ALTER TABLE otp_challenges ADD COLUMN IF NOT EXISTS sent_at timestamptz NOT NULL DEFAULT now();
ALTER TABLE otp_challenges ADD COLUMN IF NOT EXISTS send_count integer NOT NULL DEFAULT 1;
