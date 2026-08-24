ALTER TABLE posts ADD COLUMN quote_post_id TEXT REFERENCES posts(id) ON DELETE SET NULL;
ALTER TABLE posts ADD COLUMN quote_external_url TEXT;
ALTER TABLE posts ADD COLUMN quote_external_author TEXT;
ALTER TABLE posts ADD COLUMN quote_external_author_url TEXT;
ALTER TABLE posts ADD COLUMN quote_external_text TEXT;
