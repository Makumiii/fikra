import type { FeedPost, PostBodyFormat, PostKind, Profile, QuoteAttachment, Topic, Viewer } from "./models";
import { normalizeAvatarStyle } from "./avatar";
import { normalizeBannerStyle } from "./banner";

type Row = Record<string, unknown>;

export async function getViewer(db: D1Database, tokenHash: string): Promise<Viewer | null> {
  const row = await db.prepare(`
    SELECT u.id, u.handle, u.display_name, u.role, u.avatar_key, u.avatar_seed, u.avatar_style
    FROM sessions s JOIN users u ON u.id = s.user_id
    WHERE s.token_hash = ? AND s.expires_at > unixepoch() AND u.status = 'active'
  `).bind(tokenHash).first<Row>();
  if (!row) return null;
  return {
    id: String(row.id),
    handle: String(row.handle),
    displayName: String(row.display_name),
    role: row.role === "owner" ? "owner" : "reader",
    avatarKey: row.avatar_key ? String(row.avatar_key) : null,
    avatarSeed: row.avatar_seed ? String(row.avatar_seed) : null,
    avatarStyle: normalizeAvatarStyle(row.avatar_style),
  };
}

export async function getProfile(db: D1Database): Promise<Profile> {
  const row = await db.prepare("SELECT * FROM profile WHERE id = 1").first<Row>();
  if (!row) throw new Error("Profile has not been configured");
  return {
    displayName: String(row.display_name),
    handle: String(row.handle),
    bio: String(row.bio),
    location: row.location ? String(row.location) : null,
    avatarKey: row.avatar_key ? String(row.avatar_key) : null,
    avatarSeed: row.avatar_seed ? String(row.avatar_seed) : null,
    avatarStyle: normalizeAvatarStyle(row.avatar_style),
    bannerKey: row.banner_key ? String(row.banner_key) : null,
    bannerSeed: row.banner_seed ? String(row.banner_seed) : null,
    bannerStyle: normalizeBannerStyle(row.banner_style),
    jokeFollowers: String(row.joke_followers),
    followingCount: Number(row.following_count),
    subscriberRevealThreshold: Number(row.subscriber_reveal_threshold),
    aboutIntro: String(row.about_intro || ""),
    aboutHeading: String(row.about_heading || ""),
    aboutBody: String(row.about_body || ""),
  };
}

export async function getProfileLinks(db: D1Database) {
  const result = await db.prepare("SELECT id, label, url FROM profile_links ORDER BY position, created_at").all<{ id: string; label: string; url: string }>();
  return result.results;
}

export async function getSubscriberCount(db: D1Database): Promise<number> {
  const row = await db.prepare("SELECT COUNT(*) AS count FROM users WHERE status = 'active'").first<{ count: number }>();
  return Number(row?.count ?? 0);
}

export async function getTopics(db: D1Database): Promise<Topic[]> {
  const result = await db.prepare(`
    SELECT t.id, t.slug, t.name, t.description, t.color, COUNT(p.id) AS post_count
    FROM topics t
    LEFT JOIN post_topics pt ON pt.topic_id = t.id
    LEFT JOIN posts p ON p.id = pt.post_id AND p.status = 'published'
    GROUP BY t.id ORDER BY post_count DESC, t.name
  `).all<Row>();
  return result.results.map((row) => ({
    id: String(row.id), slug: String(row.slug), name: String(row.name),
    description: String(row.description), color: String(row.color), postCount: Number(row.post_count),
  }));
}

function mapPost(row: Row): FeedPost {
  let topics: Topic[] = [];
  try { topics = JSON.parse(String(row.topics_json || "[]")); } catch { topics = []; }
  let linkCard: FeedPost["linkCard"] = null;
  try {
    const parsed = row.link_card_json ? JSON.parse(String(row.link_card_json)) : null;
    if (parsed) linkCard = { url: parsed.url, linkKind: parsed.link_kind, title: parsed.title, description: parsed.description, imageUrl: parsed.image_url, siteName: parsed.site_name };
  } catch { linkCard = null; }
  let quote: QuoteAttachment | null = null;
  try {
    const parsed = row.quote_json ? JSON.parse(String(row.quote_json)) : null;
    if (parsed?.source === "local") quote = parsed.unavailable ? {
      source: "local", id: String(parsed.id), unavailable: true,
    } : {
      source: "local", id: String(parsed.id), kind: parsed.kind as PostKind,
      title: parsed.title ? String(parsed.title) : null, body: String(parsed.body || ""), excerpt: String(parsed.excerpt || ""),
      coverKey: parsed.cover_key ? String(parsed.cover_key) : null, publishedAt: Number(parsed.published_at || 0),
    } as QuoteAttachment;
    if (parsed?.source === "x") quote = {
      source: "x", url: String(parsed.url), authorName: parsed.author_name ? String(parsed.author_name) : null,
      authorUrl: parsed.author_url ? String(parsed.author_url) : null, text: parsed.text ? String(parsed.text) : null,
    };
  } catch { quote = null; }
  return {
    id: String(row.id), slug: String(row.slug), kind: row.kind as FeedPost["kind"],
    bodyFormat: row.body_format === "html" ? "html" as PostBodyFormat : "markdown" as PostBodyFormat,
    title: row.title ? String(row.title) : null, body: String(row.body), excerpt: String(row.excerpt),
    coverKey: row.cover_key ? String(row.cover_key) : null, pinned: Boolean(row.pinned),
    publishedAt: Number(row.published_at), topics,
    reactionCount: Number(row.reaction_count), replyCount: Number(row.reply_count),
    bookmarkCount: Number(row.bookmark_count), viewerReaction: row.viewer_reaction ? String(row.viewer_reaction) : null,
    viewerBookmarked: Boolean(row.viewer_bookmarked), seoTitle: row.seo_title ? String(row.seo_title) : null,
    seoDescription: row.seo_description ? String(row.seo_description) : null, canonicalUrl: row.canonical_url ? String(row.canonical_url) : null,
    quote, linkCard,
  };
}

const POST_SELECT = `
  SELECT p.*,
    COALESCE((SELECT COUNT(*) FROM reactions r WHERE r.post_id = p.id), 0) AS reaction_count,
    COALESCE((SELECT COUNT(*) FROM replies r WHERE r.post_id = p.id AND r.status = 'visible'), 0) AS reply_count,
    COALESCE((SELECT COUNT(*) FROM bookmarks b WHERE b.post_id = p.id), 0) AS bookmark_count,
    (SELECT emoji FROM reactions r WHERE r.post_id = p.id AND r.user_id = ?) AS viewer_reaction,
    EXISTS(SELECT 1 FROM bookmarks b WHERE b.post_id = p.id AND b.user_id = ?) AS viewer_bookmarked,
    COALESCE((SELECT json_group_array(json_object('id', t.id, 'slug', t.slug, 'name', t.name, 'description', t.description, 'color', t.color))
      FROM post_topics pt JOIN topics t ON t.id = pt.topic_id WHERE pt.post_id = p.id), '[]') AS topics_json
    ,CASE
      WHEN p.quote_external_url IS NOT NULL THEN json_object('source', 'x', 'url', p.quote_external_url, 'author_name', p.quote_external_author, 'author_url', p.quote_external_author_url, 'text', p.quote_external_text)
      WHEN p.quote_post_id IS NOT NULL AND qp.id IS NULL THEN json_object('source', 'local', 'id', p.quote_post_id, 'unavailable', 1)
      WHEN qp.id IS NOT NULL THEN json_object('source', 'local', 'id', qp.id, 'kind', qp.kind, 'title', qp.title, 'body', qp.body, 'excerpt', qp.excerpt, 'cover_key', qp.cover_key, 'published_at', qp.published_at)
      ELSE NULL
    END AS quote_json
    ,(SELECT json_object('url', lc.url, 'link_kind', lc.link_kind, 'title', lc.title, 'description', lc.description, 'image_url', lc.image_url, 'site_name', lc.site_name)
      FROM link_cards lc WHERE lc.post_id = p.id AND lc.status = 'ready' ORDER BY lc.created_at LIMIT 1) AS link_card_json
  FROM posts p LEFT JOIN posts qp ON qp.id = p.quote_post_id AND qp.status = 'published'`;

export async function getFeed(db: D1Database, viewerId = "", options: { kind?: string; topic?: string; query?: string; bookmarks?: boolean; limit?: number } = {}) {
  const conditions = ["p.status = 'published'"];
  const values: unknown[] = [viewerId, viewerId];
  if (options.kind === "article") { conditions.push("p.kind = 'article'"); }
  if (options.topic) {
    conditions.push("EXISTS (SELECT 1 FROM post_topics x JOIN topics tx ON tx.id = x.topic_id WHERE x.post_id = p.id AND tx.slug = ?)");
    values.push(options.topic);
  }
  if (options.query) {
    conditions.push("p.id IN (SELECT post_id FROM posts_fts WHERE posts_fts MATCH ?)");
    values.push(`"${options.query.replace(/["*:^(){}[\]]/g, " ").trim()}"*`);
  }
  if (options.bookmarks) { conditions.push("EXISTS (SELECT 1 FROM bookmarks bx WHERE bx.post_id = p.id AND bx.user_id = ?)"); values.push(viewerId); }
  values.push(Math.min(options.limit ?? 30, 50));
  const result = await db.prepare(`${POST_SELECT} WHERE ${conditions.join(" AND ")} ORDER BY p.pinned DESC, p.published_at DESC LIMIT ?`).bind(...values).all<Row>();
  return result.results.map(mapPost);
}

export async function getPost(db: D1Database, postId: string, viewerId = "") {
  const row = await db.prepare(`${POST_SELECT} WHERE p.id = ? AND p.status = 'published' LIMIT 1`).bind(viewerId, viewerId, postId).first<Row>();
  return row ? mapPost(row) : null;
}
