-- One row per anchored Merkle batch, plus the leaves that went into it, so a
-- proof can be rebuilt for any past event (FR-18).
CREATE TABLE IF NOT EXISTS audit_batches (
  batch_id      bigint PRIMARY KEY,   -- the id the contract assigned
  merkle_root   text NOT NULL,
  tx_hash       text,
  event_count   integer NOT NULL,
  submitted_at  timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS audit_leaves (
  batch_id    bigint NOT NULL REFERENCES audit_batches(batch_id) ON DELETE CASCADE,
  leaf_index  integer NOT NULL,
  event_id    text NOT NULL,
  leaf_hash   text NOT NULL,
  PRIMARY KEY (batch_id, leaf_index)
);

CREATE INDEX IF NOT EXISTS audit_leaves_event_idx ON audit_leaves (event_id);
