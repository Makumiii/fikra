CREATE TABLE unsubscribe_tokens (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash TEXT NOT NULL UNIQUE,
  used_at INTEGER,
  created_at INTEGER NOT NULL
);

CREATE INDEX idx_unsubscribe_token ON unsubscribe_tokens(token_hash, used_at);

ALTER TABLE users ADD COLUMN last_digest_at INTEGER;
