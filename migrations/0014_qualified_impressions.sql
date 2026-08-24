CREATE TABLE analytics_sessions (
  session_hash TEXT PRIMARY KEY,
  expires_at INTEGER NOT NULL,
  created_at INTEGER NOT NULL,
  last_seen_at INTEGER NOT NULL
);

CREATE TABLE post_impressions (
  post_id TEXT NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
  session_hash TEXT NOT NULL REFERENCES analytics_sessions(session_hash) ON DELETE CASCADE,
  created_at INTEGER NOT NULL,
  PRIMARY KEY (post_id, session_hash)
);

CREATE TABLE post_detail_opens (
  post_id TEXT NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
  session_hash TEXT NOT NULL REFERENCES analytics_sessions(session_hash) ON DELETE CASCADE,
  created_at INTEGER NOT NULL,
  PRIMARY KEY (post_id, session_hash)
);

CREATE INDEX idx_analytics_sessions_expiry ON analytics_sessions(expires_at);
CREATE INDEX idx_post_impressions_created ON post_impressions(created_at);
CREATE INDEX idx_post_detail_opens_created ON post_detail_opens(created_at);
