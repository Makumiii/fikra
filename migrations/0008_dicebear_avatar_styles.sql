ALTER TABLE users ADD COLUMN avatar_style TEXT NOT NULL DEFAULT 'voxel-art';
ALTER TABLE profile ADD COLUMN avatar_style TEXT NOT NULL DEFAULT 'voxel-art';
ALTER TABLE magic_links ADD COLUMN avatar_style TEXT;
