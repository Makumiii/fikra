import { env } from "cloudflare:workers";
import { data, redirect } from "react-router";

import type { Route } from "./+types/owner-post-action";
import { assertSameOrigin, requireOwner } from "../lib/auth.server";

export async function action({ request, params }: Route.ActionArgs) {
  assertSameOrigin(request);
  await requireOwner(request);
  const post = await env.DB.prepare("SELECT id,slug,cover_key,pinned FROM posts WHERE id=?").bind(params.postId).first<{ id: string; slug: string; cover_key: string | null; pinned: number }>();
  if (!post) throw new Response("Not found", { status: 404 });
  const intent = String((await request.formData()).get("intent") || "");
  if (intent === "pin") {
    const pinned = post.pinned ? 0 : 1;
    await env.DB.prepare("UPDATE posts SET pinned=?,updated_at=unixepoch() WHERE id=?").bind(pinned, post.id).run();
    return data({ ok: true, pinned: Boolean(pinned) });
  }
  if (intent === "delete") {
    await env.DB.prepare("DELETE FROM posts WHERE id=?").bind(post.id).run();
    if (post.cover_key) {
      try { await env.MEDIA.delete(post.cover_key); }
      catch (error) { console.error(JSON.stringify({ event: "orphaned_post_cover", postId: post.id, key: post.cover_key, error: String(error) })); }
    }
    return redirect("/");
  }
  return data({ ok: false, error: "Unknown post action." }, { status: 400 });
}
