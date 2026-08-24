import { env } from "cloudflare:workers";
import { data } from "react-router";
import type { Route } from "./+types/post-action";
import { assertSameOrigin, requireViewer } from "../lib/auth.server";
import { REACTIONS } from "../lib/models";
import { isSingleEmoji } from "../lib/emoji";
import { rateLimit } from "../lib/rate-limit.server";

export async function action({ request, params }: Route.ActionArgs) {
  assertSameOrigin(request);
  const viewer = await requireViewer(request);
  await rateLimit(request, `interaction:${viewer.id}`, 60, 60);
  const post = await env.DB.prepare("SELECT id FROM posts WHERE id = ? AND status = 'published'").bind(params.postId).first();
  if (!post) throw new Response("Post not found", { status: 404 });
  const form = await request.formData();
  const intent = String(form.get("intent") || "");
  const now = Math.floor(Date.now() / 1000);
  if (intent === "react") {
    const emoji = String(form.get("emoji") || "");
    if (!emoji) await env.DB.prepare("DELETE FROM reactions WHERE post_id = ? AND user_id = ?").bind(params.postId, viewer.id).run();
    else {
      if (!(REACTIONS as readonly string[]).includes(emoji) && !isSingleEmoji(emoji)) return data({ ok: false, error: "Choose one emoji." }, { status: 400 });
      await env.DB.prepare(`INSERT INTO reactions (post_id, user_id, emoji, created_at, updated_at) VALUES (?, ?, ?, ?, ?)
        ON CONFLICT(post_id, user_id) DO UPDATE SET emoji = excluded.emoji, updated_at = excluded.updated_at`).bind(params.postId, viewer.id, emoji, now, now).run();
    }
  } else if (intent === "bookmark") {
    if (form.get("enabled") === "1") await env.DB.prepare("INSERT OR IGNORE INTO bookmarks (post_id, user_id, created_at) VALUES (?, ?, ?)").bind(params.postId, viewer.id, now).run();
    else await env.DB.prepare("DELETE FROM bookmarks WHERE post_id = ? AND user_id = ?").bind(params.postId, viewer.id).run();
  } else return data({ ok: false, error: "Unknown action" }, { status: 400 });
  const state = await env.DB.prepare(`SELECT
    (SELECT COUNT(*) FROM reactions WHERE post_id=?) reactionCount,
    (SELECT COUNT(*) FROM bookmarks WHERE post_id=?) bookmarkCount,
    (SELECT emoji FROM reactions WHERE post_id=? AND user_id=?) viewerReaction,
    EXISTS(SELECT 1 FROM bookmarks WHERE post_id=? AND user_id=?) viewerBookmarked`)
    .bind(params.postId, params.postId, params.postId, viewer.id, params.postId, viewer.id)
    .first<{ reactionCount: number; bookmarkCount: number; viewerReaction: string | null; viewerBookmarked: number }>();
  return data({ ok: true, reactionCount: Number(state?.reactionCount || 0), bookmarkCount: Number(state?.bookmarkCount || 0), viewerReaction: state?.viewerReaction || null, viewerBookmarked: Boolean(state?.viewerBookmarked) });
}
