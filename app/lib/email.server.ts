import { env } from "cloudflare:workers";
import { createElement } from "react";
import { render, toPlainText } from "@react-email/render";

import { ActivityEmail, DigestEmail, MagicLinkEmail, NewPostEmail, WelcomeEmail } from "../emails";
import type { EmailRenderResult, EmailTemplateData, EmailTemplateName } from "../emails";
import { randomToken, sha256 } from "./crypto.server";

export interface EmailPayload {
  deliveryId: string;
}

export interface DigestTickPayload { type: "digest-tick" }

type LegacyTemplateName = EmailTemplateName | "notification";

type QueueEmailInput = {
  userId?: string;
  email: string;
  template: LegacyTemplateName;
  subject?: string;
  idempotencyKey: string;
  data: Record<string, unknown>;
};

const isRecord = (value: unknown): value is Record<string, unknown> => Boolean(value) && typeof value === "object";
const stringValue = (value: unknown, fallback = "") => typeof value === "string" ? value : fallback;
const stringArray = (value: unknown) => Array.isArray(value) ? value.map(String).filter(Boolean).slice(0, 8) : [];

function siteUrl(data: Record<string, unknown>, fallback: string) {
  const candidate = stringValue(data.siteUrl, fallback);
  const isLocalHttp = /^http:\/\/(?:localhost|127\.0\.0\.1)(?::\d+)?(?:\/|$)/i.test(candidate);
  return (/^https:\/\//i.test(candidate) || isLocalHttp) ? candidate.replace(/\/$/, "") : fallback.replace(/\/$/, "");
}

function urlValue(value: unknown, fallback: string) {
  const candidate = stringValue(value, fallback);
  const isLocalHttp = /^http:\/\/(?:localhost|127\.0\.0\.1)(?::\d+)?(?:\/|$)/i.test(candidate);
  return (/^https:\/\//i.test(candidate) || isLocalHttp) ? candidate : fallback;
}

function normalizePost(post: Record<string, unknown>, rootSiteUrl: string) {
  const url = urlValue(post.url, rootSiteUrl);
  const kind: "thought" | "article" | "link" = post.kind === "article" || post.kind === "link" ? post.kind : "thought";
  return {
    kind,
    title: stringValue(post.title, stringValue(post.excerpt, "A timeline post")).slice(0, 140),
    excerpt: stringValue(post.excerpt, stringValue(post.title, "A timeline post")).slice(0, 300),
    url,
    coverUrl: stringValue(post.coverUrl) || undefined,
    topics: stringArray(post.topics),
  };
}

/**
 * Converts both current payloads and older queued payloads into the typed
 * React Email data contract. This lets deployments drain existing queue rows
 * safely while the new templates roll out.
 */
function normalizeTemplateData(template: string, raw: unknown, fallbackSiteUrl: string): EmailTemplateData {
  const data = isRecord(raw) ? raw : {};
  const rootSiteUrl = siteUrl(data, fallbackSiteUrl);
  const siteName = stringValue(data.siteName, "Fikra").slice(0, 80);
  const unsubscribeUrl = stringValue(data.unsubscribeUrl) || undefined;

  if (template === "magic-link") {
    return { template: "magic-link", handle: stringValue(data.handle, "there").replace(/^@/, "").slice(0, 24), url: urlValue(data.url, rootSiteUrl), siteUrl: rootSiteUrl, siteName };
  }

  if (template === "welcome") {
    return {
      template: "welcome",
      handle: stringValue(data.handle, "there").replace(/^@/, "").slice(0, 24),
      timelineUrl: urlValue(data.timelineUrl, `${rootSiteUrl}/`),
      settingsUrl: urlValue(data.settingsUrl, `${rootSiteUrl}/settings`),
      siteUrl: rootSiteUrl,
      siteName,
      avatarUrl: stringValue(data.avatarUrl) || undefined,
    };
  }

  if (template === "digest") {
    const posts = Array.isArray(data.posts) ? data.posts.filter(isRecord).map((post) => normalizePost(post, rootSiteUrl)) : [];
    return { template: "digest", frequency: data.frequency === "weekly" ? "weekly" : "daily", posts, siteUrl: rootSiteUrl, siteName, unsubscribeUrl };
  }

  if (template === "activity" || template === "notification") {
    return {
      template: "activity",
      activity: data.activity === "mention" ? "mention" : "reply",
      actorName: stringValue(data.actorName, "Site Owner").slice(0, 60),
      actorHandle: stringValue(data.actorHandle, "owner").replace(/^@/, "").slice(0, 24),
      actorAvatarUrl: stringValue(data.actorAvatarUrl) || undefined,
      quote: stringValue(data.quote, stringValue(data.title, "There is new activity on a conversation.")).slice(0, 1000),
      url: urlValue(data.url, rootSiteUrl),
      siteUrl: rootSiteUrl,
      siteName,
      unsubscribeUrl,
    };
  }

  const kind = data.kind === "article" || data.kind === "link" ? data.kind : "thought";
  return {
    template: "new-post",
    kind,
    title: stringValue(data.title).slice(0, 140) || undefined,
    body: stringValue(data.body, stringValue(data.title, "A new post is live.")).slice(0, 100_000),
    excerpt: stringValue(data.excerpt).slice(0, 300) || undefined,
    url: urlValue(data.url, rootSiteUrl),
    coverUrl: stringValue(data.coverUrl) || undefined,
    topics: stringArray(data.topics),
    siteUrl: rootSiteUrl,
    siteName,
    unsubscribeUrl,
  };
}

export function subjectForEmail(template: LegacyTemplateName, raw: Record<string, unknown>) {
  const data = isRecord(raw) ? raw : {};
  if (template === "magic-link") return "Your private sign-in link";
  if (template === "welcome") return `You’re in, @${stringValue(data.handle, "there").replace(/^@/, "")}`;
  const siteName = stringValue(data.siteName, "Fikra");
  if (template === "digest") return `${data.frequency === "weekly" ? "This week's" : "Today's"} posts from ${siteName}`;
  if (template === "activity" || template === "notification") return data.activity === "mention" ? "You were mentioned" : `@${stringValue(data.actorHandle, "owner")} replied to you`;
  if (data.kind === "article" && stringValue(data.title)) return `New on ${siteName}: ${stringValue(data.title).slice(0, 100)}`;
  return `A new post on ${siteName}`;
}

export function emailMediaUrl(siteUrl: string, key: string | null | undefined) {
  if (!key || key.startsWith("avatar-dicebear-")) return undefined;
  if (!/^(?:avatar|banner|cover)-[a-zA-Z0-9_-]+\.(?:jpg|png|webp|avif)$/i.test(key)) return undefined;
  return `${siteUrl.replace(/\/$/, "")}/media/${encodeURIComponent(key)}`;
}

export async function queueEmail(input: QueueEmailInput) {
  const id = crypto.randomUUID();
  const now = Math.floor(Date.now() / 1000);
  const settings = await env.DB.prepare("SELECT site_name FROM site_settings WHERE id=1").first<{ site_name: string }>();
  const data: Record<string, unknown> = { ...input.data, siteUrl: stringValue(input.data.siteUrl, env.SITE_URL), siteName: stringValue(input.data.siteName, settings?.site_name || env.SITE_NAME || "Fikra") };
  if (input.userId && (input.template === "new-post" || input.template === "digest")) {
    const unsubscribeToken = randomToken();
    await env.DB.prepare("INSERT INTO unsubscribe_tokens (id,user_id,token_hash,created_at) VALUES (?,?,?,?)")
      .bind(crypto.randomUUID(), input.userId, await sha256(unsubscribeToken), now).run();
    data.unsubscribeUrl = `${env.SITE_URL}/unsubscribe?token=${encodeURIComponent(unsubscribeToken)}`;
  }
  const subject = input.subject || subjectForEmail(input.template, data);
  await env.DB.prepare(`
    INSERT INTO email_deliveries
      (id, idempotency_key, user_id, recipient_email, template, subject, payload_json, transport, status, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'queued', ?, ?)
    ON CONFLICT(idempotency_key) DO NOTHING
  `).bind(id, input.idempotencyKey, input.userId ?? null, input.email, input.template, subject,
    JSON.stringify(data), env.EMAIL_TRANSPORT, now, now).run();

  const delivery = await env.DB.prepare("SELECT id, status FROM email_deliveries WHERE idempotency_key = ?")
    .bind(input.idempotencyKey).first<{ id: string; status: string }>();
  if (delivery?.id === id) await env.EMAIL_QUEUE.send({ deliveryId: id } satisfies EmailPayload);
  return delivery?.id ?? id;
}

export async function renderEmail(template: string, rawData: unknown, fallbackSiteUrl = "https://example.com"): Promise<EmailRenderResult> {
  const data = normalizeTemplateData(template, rawData, fallbackSiteUrl);
  const element = data.template === "magic-link"
    ? createElement(MagicLinkEmail, data)
    : data.template === "welcome"
      ? createElement(WelcomeEmail, data)
      : data.template === "new-post"
        ? createElement(NewPostEmail, data)
        : data.template === "digest"
          ? createElement(DigestEmail, data)
          : createElement(ActivityEmail, data);
  const html = await render(element);
  return { html, text: toPlainText(html), unsubscribeUrl: "unsubscribeUrl" in data ? data.unsubscribeUrl : undefined };
}
