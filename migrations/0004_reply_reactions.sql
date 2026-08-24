CREATE TABLE reply_reactions (
  reply_id TEXT NOT NULL REFERENCES replies(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  emoji TEXT NOT NULL CHECK (emoji IN ('❤️', '😂', '🔥', '👏', '🤯', '🤔')),
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  PRIMARY KEY (reply_id, user_id)
);

CREATE INDEX idx_reply_reactions_reply ON reply_reactions(reply_id, created_at);
