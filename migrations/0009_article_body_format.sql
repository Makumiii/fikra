ALTER TABLE posts ADD COLUMN body_format TEXT NOT NULL DEFAULT 'markdown' CHECK (body_format IN ('markdown', 'html'));
