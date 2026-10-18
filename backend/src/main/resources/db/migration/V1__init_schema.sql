CREATE TABLE users (
    id              UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
    wallet_address  VARCHAR(42)  NOT NULL,
    role            VARCHAR(10)  NOT NULL DEFAULT 'USER',
    status          VARCHAR(10)  NOT NULL DEFAULT 'ACTIVE',
    created_at      TIMESTAMPTZ  NOT NULL DEFAULT now(),
    updated_at      TIMESTAMPTZ  NOT NULL DEFAULT now(),
    CONSTRAINT uq_users_wallet  UNIQUE (wallet_address),
    CONSTRAINT ck_users_wallet  CHECK (wallet_address ~ '^0x[0-9a-f]{40}$'),
    CONSTRAINT ck_users_role    CHECK (role IN ('USER', 'ADMIN')),
    CONSTRAINT ck_users_status  CHECK (status IN ('ACTIVE', 'REVOKED'))
);
CREATE INDEX ix_users_status_role ON users (status, role);

CREATE TABLE authentication_challenges (
    id              BIGINT       GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    wallet_address  VARCHAR(42)  NOT NULL,
    purpose         VARCHAR(16)  NOT NULL,
    nonce           VARCHAR(32)  NOT NULL,
    challenge       TEXT         NOT NULL,
    created_at      TIMESTAMPTZ  NOT NULL,
    expires_at      TIMESTAMPTZ  NOT NULL,
    used            BOOLEAN      NOT NULL DEFAULT FALSE,
    used_at         TIMESTAMPTZ,
    CONSTRAINT uq_challenges_nonce     UNIQUE (nonce),
    CONSTRAINT uq_challenges_challenge UNIQUE (challenge),
    CONSTRAINT ck_challenges_wallet    CHECK (wallet_address ~ '^0x[0-9a-f]{40}$'),
    CONSTRAINT ck_challenges_purpose   CHECK (purpose IN ('REGISTRATION', 'LOGIN')),
    CONSTRAINT ck_challenges_nonce     CHECK (nonce ~ '^[0-9a-f]{32}$'),
    CONSTRAINT ck_challenges_length    CHECK (char_length(challenge) <= 1000),
    CONSTRAINT ck_challenges_expiry    CHECK (expires_at > created_at)
);
CREATE INDEX ix_challenges_wallet_created ON authentication_challenges (wallet_address, created_at DESC);
CREATE INDEX ix_challenges_expires        ON authentication_challenges (expires_at);

CREATE TABLE authentication_events (
    id              BIGINT       GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    user_id         UUID         REFERENCES users (id),
    actor_user_id   UUID         REFERENCES users (id),
    wallet_address  VARCHAR(42),
    event_type      VARCHAR(24)  NOT NULL,
    event_status    VARCHAR(10)  NOT NULL,
    failure_reason  VARCHAR(40),
    occurred_at     TIMESTAMPTZ  NOT NULL DEFAULT now(),
    ip_address      VARCHAR(45),
    user_agent      VARCHAR(512),
    CONSTRAINT ck_auth_events_wallet CHECK (wallet_address IS NULL OR wallet_address ~ '^0x[0-9a-f]{40}$'),
    CONSTRAINT ck_auth_events_type   CHECK (event_type IN ('REGISTRATION', 'LOGIN', 'LOGOUT',
                                             'WALLET_REVOKED', 'WALLET_ACTIVATED', 'SESSION_TERMINATED')),
    CONSTRAINT ck_auth_events_status CHECK (event_status IN ('SUCCESS', 'FAILURE', 'BLOCKED'))
);
CREATE INDEX ix_auth_events_user   ON authentication_events (user_id, occurred_at DESC);
CREATE INDEX ix_auth_events_wallet ON authentication_events (wallet_address, occurred_at DESC);
CREATE INDEX ix_auth_events_type   ON authentication_events (event_type, event_status, occurred_at DESC);

CREATE TABLE security_events (
    id              BIGINT       GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    user_id         UUID         REFERENCES users (id),
    wallet_address  VARCHAR(42),
    attack_type     VARCHAR(40)  NOT NULL,
    description     VARCHAR(500) NOT NULL,
    result          VARCHAR(10)  NOT NULL,
    occurred_at     TIMESTAMPTZ  NOT NULL DEFAULT now(),
    ip_address      VARCHAR(45),
    CONSTRAINT ck_sec_events_wallet CHECK (wallet_address IS NULL OR wallet_address ~ '^0x[0-9a-f]{40}$'),
    CONSTRAINT ck_sec_events_type   CHECK (attack_type IN ('REPLAY_ATTEMPT', 'EXPIRED_CHALLENGE',
        'INVALID_CHALLENGE', 'INVALID_SIGNATURE', 'SIGNATURE_MISMATCH', 'UNREGISTERED_WALLET',
        'REVOKED_WALLET_ATTEMPT', 'PRIVILEGE_ESCALATION_ATTEMPT', 'CSRF_REJECTED',
        'RATE_LIMIT_EXCEEDED', 'IP_TEMPORARILY_BLOCKED')),
    CONSTRAINT ck_sec_events_result CHECK (result IN ('BLOCKED', 'DETECTED'))
);
CREATE INDEX ix_sec_events_type   ON security_events (attack_type, occurred_at DESC);
CREATE INDEX ix_sec_events_wallet ON security_events (wallet_address, occurred_at DESC);
CREATE INDEX ix_sec_events_time   ON security_events (occurred_at DESC);
