import { createRequestHandler } from "react-router";

import { renderEmail, type DigestTickPayload, type EmailPayload } from "../app/lib/email.server";
import { sendSmtp } from "../app/lib/smtp.server";
import { ensureDigestTick, sendDigests } from "../app/lib/digest.server";
import { isSiteConfigured } from "../app/lib/site.server";

const requestHandler = createRequestHandler(
  () => import("virtual:react-router/server-build"),
  import.meta.env.MODE,
);

function copyResponseHeaders(response: Response) {
  const headers = new Headers();
  response.headers.forEach((value, key) => {
    if (key.toLowerCase() !== "set-cookie") headers.set(key, value);
  });
  const cookies = typeof response.headers.getSetCookie === "function" ? response.headers.getSetCookie() : [];
  for (const cookie of cookies) headers.append("Set-Cookie", cookie);
  if (!cookies.length) {
    const combined = response.headers.get("set-cookie");
    if (combined) for (const cookie of combined.split(/,(?=\s*(?:__Secure-)?[^;,=\s]+=[^;,]*)/)) headers.append("Set-Cookie", cookie.trim());
  }
  return headers;
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const pathname = url.pathname;
    const configured = await isSiteConfigured(env.DB);
    if (!configured) {
      if (pathname === "/robots.txt") {
        return new Response("User-agent: *\nDisallow: /\n", { headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "no-store" } });
      }
      if (["/rss.xml", "/sitemap.xml"].includes(pathname) || pathname.startsWith("/og/")) {
        return new Response("Not found", { status: 404, headers: { "X-Robots-Tag": "noindex, nofollow", "Cache-Control": "no-store" } });
      }
      const setupRequest = pathname === "/setup" || pathname.startsWith("/api/auth/") || pathname.startsWith("/auth/")
        || pathname.startsWith("/avatars/") || pathname.startsWith("/banners/") || pathname.startsWith("/media/") || pathname === "/favicon";
      if (request.method !== "GET" && request.method !== "HEAD" && !setupRequest) {
        return Response.json({ error: "Site setup is not complete" }, { status: 503, headers: { "Cache-Control": "no-store", "X-Robots-Tag": "noindex, nofollow" } });
      }
    }
    const response = await requestHandler(request);
    const headers = copyResponseHeaders(response);
    const hasSession = /(?:^|;\s*)(?:__Secure-)?fikra_session=/.test(request.headers.get("Cookie") || "");
    const privateResponse = hasSession || pathname.startsWith("/api/auth/") || pathname.startsWith("/auth/") || pathname === "/unsubscribe" || pathname === "/settings"
      || pathname === "/bookmarks" || pathname === "/notifications" || pathname === "/owner" || pathname === "/compose"
      || pathname.startsWith("/actions/");
    headers.set("X-Content-Type-Options", "nosniff");
    headers.set("X-Frame-Options", "DENY");
    headers.set("Referrer-Policy", pathname === "/auth/verify" || pathname === "/unsubscribe" ? "no-referrer" : "strict-origin-when-cross-origin");
    if (privateResponse) headers.set("Cache-Control", "private, no-store");
    headers.set("Permissions-Policy", "camera=(), microphone=(), geolocation=(), payment=()");
    headers.set("Strict-Transport-Security", "max-age=31536000; includeSubDomains");
    if (headers.get("Content-Type")?.toLowerCase().startsWith("image/svg+xml")) {
      headers.set("Content-Security-Policy", "default-src 'none'; style-src 'unsafe-inline'; sandbox");
      headers.set("Content-Disposition", "inline");
    } else {
      headers.set("Content-Security-Policy", "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob: https:; font-src 'self'; connect-src 'self'; frame-src https://www.youtube-nocookie.com; object-src 'none'; base-uri 'self'; frame-ancestors 'none'; form-action 'self'");
    }
    if (!configured) headers.set("X-Robots-Tag", "noindex, nofollow");
    return new Response(response.body, { status: response.status, statusText: response.statusText, headers });
  },
  async queue(batch, env) {
    for (const message of batch.messages) {
      const body = message.body as EmailPayload | DigestTickPayload;
      if ("type" in body && body.type === "digest-tick") {
        try { await sendDigests(env); await ensureDigestTick(env, true); message.ack(); }
        catch (error) {
          console.error(JSON.stringify({ event: "digest_tick_failed", error: error instanceof Error ? error.message : String(error) }));
          message.retry({ delaySeconds: 300 });
        }
        continue;
      }
      if (!("deliveryId" in body)) { message.ack(); continue; }
      const { deliveryId } = body;
      const delivery = await env.DB.prepare("SELECT * FROM email_deliveries WHERE id = ?").bind(deliveryId).first<Record<string, unknown>>();
      if (!delivery || ["sent", "outbox"].includes(String(delivery.status))) { message.ack(); continue; }
      try {
        const now = Math.floor(Date.now() / 1000);
        await env.DB.prepare("UPDATE email_deliveries SET status = 'sending', attempts = attempts + 1, updated_at = ? WHERE id = ?").bind(now, deliveryId).run();
        if (env.EMAIL_TRANSPORT === "outbox") {
          await env.DB.prepare("UPDATE email_deliveries SET status = 'outbox', sent_at = ?, updated_at = ? WHERE id = ?").bind(now, now, deliveryId).run();
        } else {
          const rendered = await renderEmail(String(delivery.template), JSON.parse(String(delivery.payload_json)), env.SITE_URL);
          await sendSmtp(env, { to: String(delivery.recipient_email), subject: String(delivery.subject), ...rendered });
          await env.DB.prepare("UPDATE email_deliveries SET status = 'sent', sent_at = ?, updated_at = ? WHERE id = ?").bind(now, now, deliveryId).run();
        }
        message.ack();
      } catch (error) {
        const reason = error instanceof Error ? error.message.slice(0, 500) : "Unknown email error";
        await env.DB.prepare("UPDATE email_deliveries SET status = 'failed', last_error = ?, updated_at = unixepoch() WHERE id = ?").bind(reason, deliveryId).run();
        message.retry({ delaySeconds: 30 });
      }
    }
  },
} satisfies ExportedHandler<Env>;
