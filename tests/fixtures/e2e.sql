DELETE FROM rate_limits;
DELETE FROM auth_rate_limit;
DELETE FROM auth_verification;

UPDATE site_settings SET
  site_name='Fikra Demo',
  site_description='A clean demonstration of an independently owned social blog.',
  locale='en',
  timezone='UTC',
  setup_completed_at=COALESCE(setup_completed_at,unixepoch()),
  updated_at=unixepoch()
WHERE id=1;

UPDATE profile SET
  display_name='Example Author',
  handle='example_author',
  bio='Writing about software, the web, and ideas worth keeping.',
  location=NULL,
  joke_followers='many alleged',
  updated_at=unixepoch()
WHERE id=1;

INSERT INTO users (id,email,handle,display_name,role,status,verified_at,created_at,updated_at)
VALUES ('e2e-owner','owner@example.com','example_author','Example Author','owner','active',unixepoch(),unixepoch(),unixepoch())
ON CONFLICT(email) DO UPDATE SET role='owner',status='active',verified_at=unixepoch(),updated_at=unixepoch();

INSERT OR IGNORE INTO topics (id,slug,name,description,color,created_at,updated_at)
VALUES ('e2e-topic','building','Building','Notes on making useful things.','#4f63d8',unixepoch(),unixepoch());

INSERT INTO posts (id,slug,kind,title,body,excerpt,status,pinned,published_at,created_at,updated_at)
VALUES ('e2e-public-post','e2e-public-post','thought',NULL,'A personal site is still one of the best pieces of software you can own.','', 'published',0,unixepoch(),unixepoch(),unixepoch())
ON CONFLICT(id) DO UPDATE SET slug=excluded.slug,kind=excluded.kind,title=excluded.title,body=excluded.body,excerpt=excluded.excerpt,status='published',updated_at=unixepoch();

INSERT OR IGNORE INTO post_topics (post_id,topic_id)
SELECT 'e2e-public-post',id FROM topics WHERE slug='building' LIMIT 1;
