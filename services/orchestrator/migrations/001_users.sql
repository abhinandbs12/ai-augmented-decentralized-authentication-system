-- Customer profiles. No password or credential column exists anywhere (SR-01).
CREATE TABLE IF NOT EXISTS users (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  wallet_address  text UNIQUE NOT NULL,
  display_name    text,
  phone_number    text,                   -- only used to deliver the OTP; never logged
  created_at      timestamptz NOT NULL DEFAULT now(),
  last_login_at   timestamptz
);
