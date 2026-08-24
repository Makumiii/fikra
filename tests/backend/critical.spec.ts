import { env } from "cloudflare:workers";
import { beforeEach, describe, expect, it } from "vitest";

import { createBetterAuth } from "../../app/lib/better-auth.server";
import { currentViewer } from "../../app/lib/auth.server";
import { action as analyticsAction } from "../../app/routes/analytics-impressions";
import { action as postAction } from "../../app/routes/post-action";

const browserAgent = "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 Chrome/140.0 Safari/537.36";

async function clearApplicationData() {
  for (const table of [
    "post_detail_opens", "post_impressions", "analytics_sessions", "post_daily_metrics", "bookmarks", "reactions",
    "email_deliveries", "unsubscribe_tokens", "auth_session", "auth_account", "auth_verification", "auth_user", "users", "posts",
  ]) await env.DB.prepare(`DELETE FROM ${table}`).run();
  await env.DB.prepare("UPDATE site_settings SET setup_completed_at=unixepoch(),site_name='Fikra Test' WHERE id=1").run();
}

async function createMagicLinkSession(email: string, handle: string) {
  const id = crypto.randomUUID();
  await env.DB.prepare(`INSERT INTO users (id,email,handle,display_name,role,status,created_at,updated_at)
    VALUES (?,?,?,?,?,'pending',unixepoch(),unixepoch())`)
    .bind(id, email, handle, handle, email === env.OWNER_EMAIL ? "owner" : "reader").run();
  const auth = createBetterAuth(env);
  await auth.api.signInMagicLink({
    headers: new Headers({ Origin: env.SITE_URL }),
    body: {
      email,
      name: handle,
      callbackURL: "/auth/complete",
      errorCallbackURL: "/auth/complete",
      metadata: { domainUserId: id, handle, requestId: crypto.randomUUID() },
    },
  });
  const delivery = await env.DB.prepare("SELECT payload_json FROM email_deliveries WHERE user_id=? AND template='magic-link' ORDER BY created_at DESC LIMIT 1")
    .bind(id).first<{ payload_json: string }>();
  const magicUrl = String((JSON.parse(delivery!.payload_json) as { url: string }).url);
  const response = await auth.handler(new Request(magicUrl, { headers: { "User-Agent": browserAgent } }));
  const cookie = response.headers.get("set-cookie")?.split(";")[0] || "";
  expect(cookie).toContain("fikra_session=");
  return { auth, cookie, id, magicUrl };
}

function analyticsRequest(events: Array<{ postId: string; type: "impression" | "detail" }>, cookie = "") {
  return new Request("http://localhost:8787/actions/analytics/impressions", {
    method: "POST",
    headers: { Origin: "http://localhost:8787", "Content-Type": "application/json", "User-Agent": browserAgent, Cookie: cookie },
    body: JSON.stringify({ events }),
  });
}

beforeEach(clearApplicationData);

describe("critical trust boundaries", () => {
  it("consumes magic links once, creates a session, and assigns owner only from OWNER_EMAIL", async () => {
    const { auth, cookie, magicUrl } = await createMagicLinkSession("owner@example.com", "owner_test");
    const viewer = await currentViewer(new Request("http://localhost:8787/", { headers: { Cookie: cookie } }));
    expect(viewer).toMatchObject({ handle: "owner_test", role: "owner" });
    const replay = await auth.handler(new Request(magicUrl));
    expect(replay.status).toBeGreaterThanOrEqual(300);
    expect(replay.headers.get("location")).toContain("error=");
  });

  it("persists reactions and bookmarks only for an authenticated reader", async () => {
    const { cookie } = await createMagicLinkSession("reader@example.com", "reader_test");
    const postId = "interaction-post";
    await env.DB.prepare(`INSERT INTO posts (id,slug,kind,body,excerpt,status,published_at,created_at,updated_at)
      VALUES (?,?,'thought','A test post','','published',unixepoch(),unixepoch(),unixepoch())`).bind(postId, postId).run();
    const form = new FormData();
    form.set("intent", "react");
    form.set("emoji", "🔥");
    const response = await postAction({ request: new Request(`http://localhost:8787/actions/post/${postId}`, { method: "POST", headers: { Origin: "http://localhost:8787", Cookie: cookie }, body: form }), params: { postId } } as never);
    expect(response).toMatchObject({ data: { ok: true, reactionCount: 1, viewerReaction: "🔥" } });
    expect(await env.DB.prepare("SELECT emoji FROM reactions WHERE post_id=?").bind(postId).first<{ emoji: string }>()).toEqual({ emoji: "🔥" });

    const bookmarkForm = new FormData();
    bookmarkForm.set("intent", "bookmark");
    bookmarkForm.set("enabled", "1");
    await postAction({ request: new Request(`http://localhost:8787/actions/post/${postId}`, { method: "POST", headers: { Origin: "http://localhost:8787", Cookie: cookie }, body: bookmarkForm }), params: { postId } } as never);
    expect((await env.DB.prepare("SELECT COUNT(*) count FROM bookmarks WHERE post_id=?").bind(postId).first<{ count: number }>())?.count).toBe(1);
  });

  it("deduplicates qualified impressions per rolling session and tracks detail opens separately", async () => {
    const postId = "qualified-impression-post";
    await env.DB.prepare(`INSERT INTO posts (id,slug,kind,body,excerpt,status,published_at,created_at,updated_at)
      VALUES (?,?,'thought','Visible long enough','','published',unixepoch(),unixepoch(),unixepoch())`).bind(postId, postId).run();
    const events = [{ postId, type: "impression" as const }, { postId, type: "detail" as const }];
    const first = await analyticsAction({ request: analyticsRequest(events), params: {} } as never);
    const cookie = first.headers.get("set-cookie")?.split(";")[0] || "";
    expect(await first.json()).toEqual({ accepted: 2 });
    const second = await analyticsAction({ request: analyticsRequest(events, cookie), params: {} } as never);
    expect(await second.json()).toEqual({ accepted: 0 });
    const metrics = await env.DB.prepare(`SELECT
      (SELECT SUM(views) FROM post_daily_metrics WHERE post_id=?) views,
      (SELECT COUNT(*) FROM post_detail_opens WHERE post_id=?) details`).bind(postId, postId).first<{ views: number; details: number }>();
    expect(metrics).toEqual({ views: 1, details: 1 });
  });

  it("rejects bots, prefetches, cross-origin writes, and malformed analytics batches", async () => {
    const bot = analyticsRequest([{ postId: "missing-post", type: "impression" }]);
    bot.headers.set("User-Agent", "Googlebot");
    expect((await analyticsAction({ request: bot, params: {} } as never)).status).toBe(204);
    const prefetch = analyticsRequest([{ postId: "missing-post", type: "impression" }]);
    prefetch.headers.set("Purpose", "prefetch");
    expect((await analyticsAction({ request: prefetch, params: {} } as never)).status).toBe(204);
    const crossOrigin = analyticsRequest([{ postId: "missing-post", type: "impression" }]);
    crossOrigin.headers.set("Origin", "https://attacker.example");
    await expect(analyticsAction({ request: crossOrigin, params: {} } as never)).rejects.toMatchObject({ status: 403 });
    const malformed = new Request("http://localhost:8787/actions/analytics/impressions", { method: "POST", headers: { Origin: "http://localhost:8787", "Content-Type": "application/json", "User-Agent": browserAgent }, body: JSON.stringify({ events: [] }) });
    expect((await analyticsAction({ request: malformed, params: {} } as never)).status).toBe(400);
  });
});
