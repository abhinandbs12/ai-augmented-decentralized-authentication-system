-- Devices and sessions. A device is a browser that completed a sign-in; it holds a random token in an
-- HttpOnly cookie and only the token's SHA-256 hash is stored here.
CREATE TABLE devices (
    id          UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
    token_hash  VARCHAR(64)  NOT NULL,
    label       VARCHAR(80)  NOT NULL,
    created_at  TIMESTAMPTZ  NOT NULL,
    CONSTRAINT uq_devices_token UNIQUE (token_hash),
    CONSTRAINT ck_devices_token CHECK (token_hash ~ '^[0-9a-f]{64}$')
);

CREATE TABLE user_devices (
    id             UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id        UUID         NOT NULL REFERENCES users (id),
    device_id      UUID         NOT NULL REFERENCES devices (id),
    first_seen_at  TIMESTAMPTZ  NOT NULL,
    last_seen_at   TIMESTAMPTZ  NOT NULL,
    trusted_until  TIMESTAMPTZ,
    removed_at     TIMESTAMPTZ,
    CONSTRAINT uq_user_devices UNIQUE (user_id, device_id)
);
CREATE INDEX ix_user_devices_device ON user_devices (device_id);

CREATE TABLE user_sessions (
    id            UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id       UUID         NOT NULL REFERENCES users (id),
    device_id     UUID         NOT NULL REFERENCES devices (id),
    ip_address    VARCHAR(45),
    second_step   BOOLEAN      NOT NULL,
    created_at    TIMESTAMPTZ  NOT NULL,
    last_seen_at  TIMESTAMPTZ  NOT NULL,
    ended_at      TIMESTAMPTZ,
    end_reason    VARCHAR(16),
    CONSTRAINT ck_sessions_end    CHECK ((ended_at IS NULL) = (end_reason IS NULL)),
    CONSTRAINT ck_sessions_reason CHECK (end_reason IS NULL OR end_reason IN ('LOGOUT', 'REMOTE_LOGOUT',
        'EXPIRED', 'WALLET_REVOKED', 'RESTART', 'EMERGENCY_STOP', 'DEVICE_REMOVED', 'RELOGIN'))
);
CREATE INDEX ix_sessions_user ON user_sessions (user_id, last_seen_at DESC);

CREATE TABLE sign_in_alerts (
    id           BIGINT       GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    user_id      UUID         NOT NULL REFERENCES users (id),
    session_id   UUID         NOT NULL REFERENCES user_sessions (id),
    created_at   TIMESTAMPTZ  NOT NULL,
    resolved_at  TIMESTAMPTZ,
    resolution   VARCHAR(12),
    CONSTRAINT uq_alerts_session    UNIQUE (session_id),
    CONSTRAINT ck_alerts_resolution CHECK ((resolved_at IS NULL) = (resolution IS NULL)
        AND (resolution IS NULL OR resolution IN ('CONFIRMED', 'SIGNED_OUT')))
);
CREATE INDEX ix_alerts_user ON sign_in_alerts (user_id, created_at DESC);

-- Second step: authenticator secret (encrypted by the application) and one-time backup codes (hashed).
CREATE TABLE second_factors (
    user_id            UUID          PRIMARY KEY REFERENCES users (id),
    secret_ciphertext  VARCHAR(120)  NOT NULL,
    created_at         TIMESTAMPTZ   NOT NULL,
    enabled_at         TIMESTAMPTZ,
    last_used_step     BIGINT
);

CREATE TABLE backup_codes (
    id         BIGINT       GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    user_id    UUID         NOT NULL REFERENCES users (id),
    code_hash  VARCHAR(64)  NOT NULL,
    used_at    TIMESTAMPTZ,
    CONSTRAINT uq_backup_codes      UNIQUE (user_id, code_hash),
    CONSTRAINT ck_backup_codes_hash CHECK (code_hash ~ '^[0-9a-f]{64}$')
);

-- Trust score inputs and results.
CREATE TABLE wallet_flags (
    wallet_address  VARCHAR(42)   PRIMARY KEY,
    reason          VARCHAR(200)  NOT NULL,
    flagged_by      UUID          NOT NULL REFERENCES users (id),
    flagged_at      TIMESTAMPTZ   NOT NULL,
    CONSTRAINT ck_flags_wallet CHECK (wallet_address ~ '^0x[0-9a-f]{40}$')
);

CREATE TABLE login_assessments (
    id              BIGINT        GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    wallet_address  VARCHAR(42)   NOT NULL,
    user_id         UUID          REFERENCES users (id),
    device_id       UUID          REFERENCES devices (id),
    ip_address      VARCHAR(45),
    score           INTEGER       NOT NULL,
    rules           VARCHAR(120)  NOT NULL,
    decision        VARCHAR(12)   NOT NULL,
    assessed_at     TIMESTAMPTZ   NOT NULL,
    CONSTRAINT ck_assess_score    CHECK (score BETWEEN 0 AND 100),
    CONSTRAINT ck_assess_decision CHECK (decision IN ('ALLOW', 'SECOND_STEP', 'REFUSE')),
    CONSTRAINT ck_assess_wallet   CHECK (wallet_address ~ '^0x[0-9a-f]{40}$')
);
CREATE INDEX ix_assess_time   ON login_assessments (assessed_at DESC);
CREATE INDEX ix_assess_wallet ON login_assessments (wallet_address, assessed_at DESC);

-- Failed attempts per client address within the last hour feed the trust score.
CREATE INDEX ix_auth_events_ip ON authentication_events (ip_address, occurred_at DESC);

-- Emergency stop: a single row.
CREATE TABLE emergency_stop (
    id            INTEGER       PRIMARY KEY,
    active        BOOLEAN       NOT NULL,
    block_logins  BOOLEAN       NOT NULL,
    reason        VARCHAR(200),
    changed_by    UUID,
    changed_at    TIMESTAMPTZ,
    CONSTRAINT ck_stop_single CHECK (id = 1)
);
INSERT INTO emergency_stop (id, active, block_logins) VALUES (1, FALSE, FALSE);

-- Administrator actions that take effect only after a delay.
CREATE TABLE admin_actions (
    id              BIGINT        GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    action          VARCHAR(24)   NOT NULL,
    target_wallet   VARCHAR(42),
    requested_by    UUID          NOT NULL REFERENCES users (id),
    requested_at    TIMESTAMPTZ   NOT NULL,
    execute_after   TIMESTAMPTZ   NOT NULL,
    status          VARCHAR(10)   NOT NULL,
    decided_by      UUID          REFERENCES users (id),
    decided_at      TIMESTAMPTZ,
    failure_reason  VARCHAR(40),
    CONSTRAINT ck_actions_action CHECK (action IN ('ACTIVATE_WALLET', 'RESET_SECOND_STEP', 'LIFT_EMERGENCY_STOP')),
    CONSTRAINT ck_actions_status CHECK (status IN ('PENDING', 'EXECUTING', 'EXECUTED', 'CANCELLED', 'FAILED')),
    CONSTRAINT ck_actions_target CHECK ((action = 'LIFT_EMERGENCY_STOP') = (target_wallet IS NULL)),
    CONSTRAINT ck_actions_wallet CHECK (target_wallet IS NULL OR target_wallet ~ '^0x[0-9a-f]{40}$'),
    CONSTRAINT ck_actions_delay  CHECK (execute_after >= requested_at)
);
-- At most one open request per action and target.
CREATE UNIQUE INDEX uq_actions_open ON admin_actions (action, COALESCE(target_wallet, ''))
    WHERE status IN ('PENDING', 'EXECUTING');
CREATE INDEX ix_actions_due ON admin_actions (execute_after) WHERE status = 'PENDING';

-- Read-only API keys. Only the SHA-256 hash of the secret part is stored.
CREATE TABLE api_keys (
    id            UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
    owner_id      UUID          NOT NULL REFERENCES users (id),
    name          VARCHAR(60)   NOT NULL,
    secret_hash   VARCHAR(64)   NOT NULL,
    scopes        VARCHAR(100)  NOT NULL,
    created_at    TIMESTAMPTZ   NOT NULL,
    expires_at    TIMESTAMPTZ   NOT NULL,
    revoked_at    TIMESTAMPTZ,
    revoked_by    UUID          REFERENCES users (id),
    last_used_at  TIMESTAMPTZ,
    CONSTRAINT uq_api_keys_secret UNIQUE (secret_hash),
    CONSTRAINT ck_api_keys_hash   CHECK (secret_hash ~ '^[0-9a-f]{64}$'),
    CONSTRAINT ck_api_keys_expiry CHECK (expires_at > created_at)
);

-- Action challenges ("fresh signature"): bound to one action, its parameters and one session.
ALTER TABLE authentication_challenges
    ADD COLUMN action          VARCHAR(24),
    ADD COLUMN action_details  VARCHAR(200),
    ADD COLUMN session_id      UUID REFERENCES user_sessions (id);
ALTER TABLE authentication_challenges DROP CONSTRAINT ck_challenges_purpose;
ALTER TABLE authentication_challenges
    ADD CONSTRAINT ck_challenges_purpose CHECK (purpose IN ('REGISTRATION', 'LOGIN', 'ACTION')),
    ADD CONSTRAINT ck_challenges_action  CHECK ((purpose = 'ACTION') = (action IS NOT NULL AND session_id IS NOT NULL));

ALTER TABLE authentication_events DROP CONSTRAINT ck_auth_events_type;
ALTER TABLE authentication_events ADD CONSTRAINT ck_auth_events_type CHECK (event_type IN ('REGISTRATION',
    'LOGIN', 'LOGOUT', 'WALLET_REVOKED', 'WALLET_ACTIVATED', 'SESSION_TERMINATED', 'SECOND_STEP',
    'SECOND_STEP_ENABLED', 'SECOND_STEP_DISABLED', 'SECOND_STEP_RESET', 'BACKUP_CODES_RENEWED',
    'REMOTE_LOGOUT', 'DEVICE_REMOVED', 'WALLET_FLAGGED', 'WALLET_UNFLAGGED', 'EMERGENCY_STOP_ON',
    'EMERGENCY_STOP_OFF', 'ACTION_REQUESTED', 'ACTION_CANCELLED', 'API_KEY_CREATED', 'API_KEY_REVOKED'));

ALTER TABLE security_events DROP CONSTRAINT ck_sec_events_type;
ALTER TABLE security_events ADD CONSTRAINT ck_sec_events_type CHECK (attack_type IN ('REPLAY_ATTEMPT',
    'EXPIRED_CHALLENGE', 'INVALID_CHALLENGE', 'INVALID_SIGNATURE', 'SIGNATURE_MISMATCH', 'UNREGISTERED_WALLET',
    'REVOKED_WALLET_ATTEMPT', 'PRIVILEGE_ESCALATION_ATTEMPT', 'CSRF_REJECTED', 'RATE_LIMIT_EXCEEDED',
    'IP_TEMPORARILY_BLOCKED', 'SECOND_STEP_FAILED', 'STEP_UP_FAILED', 'LOW_TRUST_LOGIN', 'INVALID_API_KEY'));
