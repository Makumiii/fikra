PRAGMA foreign_keys = OFF;

ALTER TABLE reactions RENAME TO reactions_fixed_emoji;
CREATE TABLE reactions (
  post_id TEXT NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  emoji TEXT NOT NULL CHECK (length(emoji) BETWEEN 1 AND 32),
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  PRIMARY KEY (post_id, user_id)
);
INSERT INTO reactions SELECT * FROM reactions_fixed_emoji;
DROP TABLE reactions_fixed_emoji;

ALTER TABLE reply_reactions RENAME TO reply_reactions_fixed_emoji;
CREATE TABLE reply_reactions (
  reply_id TEXT NOT NULL REFERENCES replies(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  emoji TEXT NOT NULL CHECK (length(emoji) BETWEEN 1 AND 32),
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  PRIMARY KEY (reply_id, user_id)
);
INSERT INTO reply_reactions SELECT * FROM reply_reactions_fixed_emoji;
DROP TABLE reply_reactions_fixed_emoji;
CREATE INDEX idx_reply_reactions_reply ON reply_reactions(reply_id, created_at);

PRAGMA foreign_keys = ON;
