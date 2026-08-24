CREATE TABLE site_settings (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  site_name TEXT NOT NULL DEFAULT 'Fikra',
  site_description TEXT NOT NULL DEFAULT 'An independent, single-author social blog.',
  locale TEXT NOT NULL DEFAULT 'en',
  timezone TEXT NOT NULL DEFAULT 'UTC',
  setup_completed_at INTEGER,
  updated_at INTEGER NOT NULL
);

-- Existing installations are already configured. A clean Fikra install keeps
-- the neutral seed profile and is routed through /setup before going public.
INSERT INTO site_settings (
  id, site_name, site_description, locale, timezone, setup_completed_at, updated_at
)
SELECT
  1,
  CASE WHEN display_name = 'Site Owner' AND handle = 'owner' THEN 'Fikra' ELSE display_name || '''s timeline' END,
  CASE WHEN display_name = 'Site Owner' AND handle = 'owner'
    THEN 'An independent, single-author social blog.'
    ELSE 'Short posts, useful links, and long-form writing on an independent timeline.'
  END,
  'en',
  'UTC',
  CASE WHEN display_name = 'Site Owner' AND handle = 'owner' THEN NULL ELSE unixepoch() END,
  unixepoch()
FROM profile WHERE id = 1;
