ALTER TABLE profile ADD COLUMN about_intro TEXT NOT NULL DEFAULT 'A personal timeline for short posts, useful links, and long-form writing.';
ALTER TABLE profile ADD COLUMN about_heading TEXT NOT NULL DEFAULT 'What appears here';
ALTER TABLE profile ADD COLUMN about_body TEXT NOT NULL DEFAULT 'Short thoughts land in the main feed. Longer ideas become proper articles. Links get context, and topics keep everything explorable.';
