import { env } from "cloudflare:workers";
import { data } from "react-router";

import type { Route } from "./+types/reply-action";
import { assertSameOrigin, requireViewer } from "../lib/auth.server";
import { REACTIONS } from "../lib/models";
import { isSingleEmoji } from "../lib/emoji";
import { rateLimit } from "../lib/rate-limit.server";

export async function action({ request, params }: Route.ActionArgs) {
  assertSameOrigin(request);
  const viewer = await requireViewer(request);
  await rateLimit(request, `reply-interaction:${viewer.id}`, 60, 60);
  const reply = await env.DB.prepare("SELECT id FROM replies WHERE id = ? AND status = 'visible'").bind(params.replyId).first();
  if (!reply) throw new Response("Reply not found", { status: 404 });
  const form = await request.formData();
  if (String(form.get("intent") || "") !== "react") return data({ ok: false, error: "Unknown action" }, { status: 400 });
  const emoji = String(form.get("emoji") || "");
  if (!emoji) await env.DB.prepare("DELETE FROM reply_reactions WHERE reply_id = ? AND user_id = ?").bind(params.replyId, viewer.id).run();
  else {
    if (!(REACTIONS as readonly string[]).includes(emoji) && !isSingleEmoji(emoji)) return data({ ok: false, error: "Choose one emoji." }, { status: 400 });
    const now = Math.floor(Date.now() / 1000);
    await env.DB.prepare(`INSERT INTO reply_reactions (reply_id, user_id, emoji, created_at, updated_at) VALUES (?, ?, ?, ?, ?)
      ON CONFLICT(reply_id, user_id) DO UPDATE SET emoji = excluded.emoji, updated_at = excluded.updated_at`)
      .bind(params.replyId, viewer.id, emoji, now, now).run();
  }
  return data({ ok: true });
}
