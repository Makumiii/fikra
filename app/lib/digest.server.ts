import { emailMediaUrl, queueEmail } from "./email.server";
import type { DigestTickPayload } from "./email.server";

const TICK_SECONDS = 12 * 60 * 60;

export async function ensureDigestTick(env: Env, force = false) {
  const now = Math.floor(Date.now() / 1000);
  const nextAt = now + TICK_SECONDS;
  const result = force
    ? await env.DB.prepare("INSERT INTO system_state(key,value,updated_at) VALUES('digest-next',?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value,updated_at=excluded.updated_at").bind(String(nextAt), now).run()
    : await env.DB.prepare("INSERT INTO system_state(key,value,updated_at) VALUES('digest-next',?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value,updated_at=excluded.updated_at WHERE CAST(system_state.value AS INTEGER)<=?").bind(String(nextAt), now, now).run();
  if (force || result.meta.changes) await env.EMAIL_QUEUE.send({ type: "digest-tick" } satisfies DigestTickPayload, { delaySeconds: TICK_SECONDS });
}

export async function sendDigests(env: Env, force = false) {
  const now = Math.floor(Date.now() / 1000);
  const weeklyDay = new Date().getUTCDay() === 0;
  const users = await env.DB.prepare(`SELECT id,email,handle,digest_frequency,last_digest_at,topics_only FROM users
    WHERE status='active' AND notify_new_posts=1 AND (digest_frequency='daily' OR (digest_frequency='weekly' AND (?=1 OR ?=1)))`).bind(weeklyDay ? 1 : 0, force ? 1 : 0).all<Record<string, unknown>>();
  let queued = 0;
  for (const user of users.results) {
    const frequency = String(user.digest_frequency);
    const since = Number(user.last_digest_at || now - (frequency === "daily" ? 86400 : 604800));
    const topicFilter = Number(user.topics_only) ? "AND EXISTS (SELECT 1 FROM post_topics pt JOIN user_topics ut ON ut.topic_id=pt.topic_id WHERE pt.post_id=p.id AND ut.user_id=?)" : "";
    const statement = env.DB.prepare(`SELECT p.id,p.kind,p.cover_key,COALESCE(p.title,substr(p.body,1,90)) title,COALESCE(NULLIF(p.excerpt,''),substr(p.body,1,180)) excerpt,
      COALESCE((SELECT json_group_array(t.name) FROM post_topics pt JOIN topics t ON t.id=pt.topic_id WHERE pt.post_id=p.id), '[]') topics_json
      FROM posts p WHERE p.status='published' AND p.published_at>? ${topicFilter} ORDER BY p.published_at DESC LIMIT 20`);
    const posts = Number(user.topics_only) ? await statement.bind(since, user.id).all<Record<string, unknown>>() : await statement.bind(since).all<Record<string, unknown>>();
    if (posts.results.length) {
      const date = new Date().toISOString().slice(0, 10);
      await queueEmail({ userId: String(user.id), email: String(user.email), template: "digest", idempotencyKey: `digest:${frequency}:${date}:${user.id}`, data: { frequency, posts: posts.results.map((post) => {
        let topics: string[] = [];
        try {
          const parsed = JSON.parse(String(post.topics_json || "[]"));
          topics = Array.isArray(parsed) ? parsed.map(String).filter(Boolean).slice(0, 8) : [];
        } catch { topics = []; }
        return { kind: post.kind === "article" || post.kind === "link" ? post.kind : "thought", title: String(post.title), excerpt: String(post.excerpt), url: `${env.SITE_URL}/post/${post.id}`, coverUrl: emailMediaUrl(env.SITE_URL, post.cover_key ? String(post.cover_key) : null), topics };
      }) } });
      queued++;
    }
    await env.DB.prepare("UPDATE users SET last_digest_at=? WHERE id=?").bind(now, user.id).run();
  }
  await env.DB.batch([
    env.DB.prepare("DELETE FROM sessions WHERE expires_at<?").bind(now),
    env.DB.prepare("DELETE FROM magic_links WHERE expires_at<?").bind(now - 86400),
    env.DB.prepare("DELETE FROM auth_session WHERE julianday(expiresAt) < julianday('now')"),
    env.DB.prepare("DELETE FROM auth_verification WHERE julianday(expiresAt) < julianday('now')"),
    env.DB.prepare("DELETE FROM auth_rate_limit WHERE lastRequest < (CAST(strftime('%s','now') AS INTEGER) * 1000 - 172800000)"),
    env.DB.prepare("DELETE FROM rate_limits WHERE window_start<?").bind(now - 172800),
    env.DB.prepare("DELETE FROM unsubscribe_tokens WHERE used_at IS NOT NULL AND used_at<?").bind(now - 2592000),
  ]);
  return queued;
}
