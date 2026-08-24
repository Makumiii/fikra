PRAGMA foreign_keys = ON;

CREATE TABLE users (
  id TEXT PRIMARY KEY,
  email TEXT NOT NULL COLLATE NOCASE UNIQUE,
  handle TEXT NOT NULL COLLATE NOCASE UNIQUE,
  display_name TEXT NOT NULL,
  bio TEXT NOT NULL DEFAULT '',
  avatar_key TEXT,
  banner_key TEXT,
  role TEXT NOT NULL DEFAULT 'reader' CHECK (role IN ('reader', 'owner')),
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'active', 'unsubscribed', 'suspended')),
  digest_frequency TEXT NOT NULL DEFAULT 'weekly' CHECK (digest_frequency IN ('instant', 'daily', 'weekly', 'off')),
  notify_replies INTEGER NOT NULL DEFAULT 1 CHECK (notify_replies IN (0, 1)),
  notify_mentions INTEGER NOT NULL DEFAULT 1 CHECK (notify_mentions IN (0, 1)),
  notify_new_posts INTEGER NOT NULL DEFAULT 1 CHECK (notify_new_posts IN (0, 1)),
  topics_only INTEGER NOT NULL DEFAULT 0 CHECK (topics_only IN (0, 1)),
  verified_at INTEGER,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE TABLE profile (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  display_name TEXT NOT NULL,
  handle TEXT NOT NULL,
  bio TEXT NOT NULL,
  location TEXT,
  avatar_key TEXT,
  banner_key TEXT,
  joke_followers TEXT NOT NULL DEFAULT '100M',
  following_count INTEGER NOT NULL DEFAULT 0,
  subscriber_reveal_threshold INTEGER NOT NULL DEFAULT 100,
  updated_at INTEGER NOT NULL
);

CREATE TABLE profile_links (
  id TEXT PRIMARY KEY,
  label TEXT NOT NULL,
  url TEXT NOT NULL,
  position INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL
);

CREATE TABLE magic_links (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash TEXT NOT NULL UNIQUE,
  purpose TEXT NOT NULL CHECK (purpose IN ('subscribe', 'login')),
  expires_at INTEGER NOT NULL,
  used_at INTEGER,
  requested_ip_hash TEXT,
  created_at INTEGER NOT NULL
);

CREATE TABLE sessions (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash TEXT NOT NULL UNIQUE,
  expires_at INTEGER NOT NULL,
  last_seen_at INTEGER NOT NULL,
  created_at INTEGER NOT NULL
);

CREATE TABLE topics (
  id TEXT PRIMARY KEY,
  slug TEXT NOT NULL COLLATE NOCASE UNIQUE,
  name TEXT NOT NULL COLLATE NOCASE UNIQUE,
  description TEXT NOT NULL DEFAULT '',
  color TEXT NOT NULL DEFAULT '#667085',
  created_by TEXT REFERENCES users(id) ON DELETE SET NULL,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE TABLE user_topics (
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  topic_id TEXT NOT NULL REFERENCES topics(id) ON DELETE CASCADE,
  created_at INTEGER NOT NULL,
  PRIMARY KEY (user_id, topic_id)
);

CREATE TABLE posts (
  id TEXT PRIMARY KEY,
  slug TEXT NOT NULL COLLATE NOCASE UNIQUE,
  kind TEXT NOT NULL CHECK (kind IN ('thought', 'article', 'link')),
  title TEXT,
  body TEXT NOT NULL,
  excerpt TEXT NOT NULL DEFAULT '',
  cover_key TEXT,
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'published', 'archived')),
  pinned INTEGER NOT NULL DEFAULT 0 CHECK (pinned IN (0, 1)),
  allow_replies INTEGER NOT NULL DEFAULT 1 CHECK (allow_replies IN (0, 1)),
  seo_title TEXT,
  seo_description TEXT,
  canonical_url TEXT,
  published_at INTEGER,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE TABLE post_topics (
  post_id TEXT NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
  topic_id TEXT NOT NULL REFERENCES topics(id) ON DELETE CASCADE,
  PRIMARY KEY (post_id, topic_id)
);

CREATE TABLE link_cards (
  id TEXT PRIMARY KEY,
  post_id TEXT NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
  url TEXT NOT NULL,
  link_kind TEXT NOT NULL CHECK (link_kind IN ('internal', 'external', 'youtube')),
  title TEXT,
  description TEXT,
  image_url TEXT,
  site_name TEXT,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'ready', 'unavailable', 'unsafe')),
  fetched_at INTEGER,
  created_at INTEGER NOT NULL,
  UNIQUE (post_id, url)
);

CREATE TABLE reactions (
  post_id TEXT NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  emoji TEXT NOT NULL CHECK (emoji IN ('❤️', '😂', '🔥', '👏', '🤯', '🤔')),
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  PRIMARY KEY (post_id, user_id)
);

CREATE TABLE replies (
  id TEXT PRIMARY KEY,
  post_id TEXT NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  parent_reply_id TEXT REFERENCES replies(id) ON DELETE CASCADE,
  body TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'visible' CHECK (status IN ('visible', 'hidden', 'deleted')),
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE TABLE bookmarks (
  post_id TEXT NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at INTEGER NOT NULL,
  PRIMARY KEY (post_id, user_id)
);

CREATE TABLE mentions (
  id TEXT PRIMARY KEY,
  mentioned_user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  actor_user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  post_id TEXT REFERENCES posts(id) ON DELETE CASCADE,
  reply_id TEXT REFERENCES replies(id) ON DELETE CASCADE,
  created_at INTEGER NOT NULL,
  UNIQUE (mentioned_user_id, actor_user_id, post_id, reply_id)
);

CREATE TABLE notifications (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  actor_user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
  type TEXT NOT NULL CHECK (type IN ('mention', 'reply', 'new_post', 'milestone')),
  post_id TEXT REFERENCES posts(id) ON DELETE CASCADE,
  reply_id TEXT REFERENCES replies(id) ON DELETE CASCADE,
  message TEXT NOT NULL,
  read_at INTEGER,
  emailed_at INTEGER,
  created_at INTEGER NOT NULL
);

CREATE TABLE email_deliveries (
  id TEXT PRIMARY KEY,
  idempotency_key TEXT NOT NULL UNIQUE,
  user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
  recipient_email TEXT NOT NULL,
  template TEXT NOT NULL,
  subject TEXT NOT NULL,
  payload_json TEXT NOT NULL,
  transport TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'queued' CHECK (status IN ('queued', 'sending', 'sent', 'failed', 'outbox')),
  provider_message_id TEXT,
  attempts INTEGER NOT NULL DEFAULT 0,
  last_error TEXT,
  sent_at INTEGER,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE TABLE rate_limits (
  key TEXT NOT NULL,
  window_start INTEGER NOT NULL,
  count INTEGER NOT NULL DEFAULT 1,
  PRIMARY KEY (key, window_start)
);

CREATE TABLE post_daily_metrics (
  post_id TEXT NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
  metric_date TEXT NOT NULL,
  views INTEGER NOT NULL DEFAULT 0,
  shares INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (post_id, metric_date)
);

CREATE VIRTUAL TABLE posts_fts USING fts5(
  post_id UNINDEXED,
  title,
  excerpt,
  body,
  tokenize = 'unicode61 remove_diacritics 2'
);

CREATE TRIGGER posts_fts_insert AFTER INSERT ON posts WHEN new.status = 'published' BEGIN
  INSERT INTO posts_fts(post_id, title, excerpt, body)
  VALUES (new.id, COALESCE(new.title, ''), new.excerpt, new.body);
END;

CREATE TRIGGER posts_fts_update AFTER UPDATE ON posts BEGIN
  DELETE FROM posts_fts WHERE post_id = old.id;
  INSERT INTO posts_fts(post_id, title, excerpt, body)
  SELECT new.id, COALESCE(new.title, ''), new.excerpt, new.body
  WHERE new.status = 'published';
END;

CREATE TRIGGER posts_fts_delete AFTER DELETE ON posts BEGIN
  DELETE FROM posts_fts WHERE post_id = old.id;
END;

CREATE INDEX idx_users_status ON users(status);
CREATE INDEX idx_users_role ON users(role);
CREATE INDEX idx_magic_links_expiry ON magic_links(expires_at, used_at);
CREATE INDEX idx_sessions_token ON sessions(token_hash, expires_at);
CREATE INDEX idx_sessions_user ON sessions(user_id, expires_at);
CREATE INDEX idx_posts_feed ON posts(status, pinned DESC, published_at DESC);
CREATE INDEX idx_posts_kind ON posts(status, kind, published_at DESC);
CREATE INDEX idx_post_topics_topic ON post_topics(topic_id, post_id);
CREATE INDEX idx_replies_post ON replies(post_id, status, created_at);
CREATE INDEX idx_replies_parent ON replies(parent_reply_id, status, created_at);
CREATE INDEX idx_notifications_user ON notifications(user_id, read_at, created_at DESC);
CREATE INDEX idx_email_status ON email_deliveries(status, created_at);
CREATE INDEX idx_metrics_post ON post_daily_metrics(post_id, metric_date DESC);

INSERT INTO profile (
  id, display_name, handle, bio, location, joke_followers,
  following_count, subscriber_reveal_threshold, updated_at
) VALUES (
  1,
  'Site Owner',
  'owner',
  'A small, independent corner of the internet.',
  NULL,
  'a suspicious number of',
  0,
  100,
  unixepoch()
);

INSERT INTO topics (id, slug, name, description, color, created_at, updated_at)
VALUES
  ('topic-building', 'building', 'Building', 'Notes from making software and shipping ideas.', '#536DFE', unixepoch(), unixepoch()),
  ('topic-internet', 'internet', 'Internet', 'Thoughts about the web, platforms, and online culture.', '#536DFE', unixepoch(), unixepoch());
