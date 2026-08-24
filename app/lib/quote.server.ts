import sanitizeHtml from "sanitize-html";

import type { PostKind, QuoteAttachment } from "./models";
import { canonicalXPostUrl, validPostId } from "./quote";

const X_HOSTS = new Set(["x.com", "www.x.com", "twitter.com", "www.twitter.com"]);

export { canonicalXPostUrl, validPostId } from "./quote";

function decodeEntities(value: string) {
  return value
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/&mdash;/gi, "—")
    .replace(/&ndash;/gi, "–")
    .replace(/&nbsp;/gi, " ");
}

function oEmbedText(html: string) {
  const paragraph = html.match(/<p\b[^>]*>([\s\S]*?)<\/p>/i)?.[1] || "";
  const text = sanitizeHtml(paragraph, { allowedTags: [], allowedAttributes: {} });
  return decodeEntities(text).replace(/\s+/g, " ").trim().slice(0, 1000) || null;
}

export async function fetchXQuote(value: string): Promise<Extract<QuoteAttachment, { source: "x" }>> {
  const url = canonicalXPostUrl(value);
  if (!url) throw new Error("Paste a valid X post link, such as https://x.com/name/status/123.");
  const endpoint = new URL("https://publish.x.com/oembed");
  endpoint.searchParams.set("url", url);
  endpoint.searchParams.set("omit_script", "1");
  endpoint.searchParams.set("theme", "dark");
  endpoint.searchParams.set("dnt", "1");
  const response = await fetch(endpoint, { headers: { Accept: "application/json" }, signal: AbortSignal.timeout(5000) });
  if (!response.ok) throw new Error("X could not resolve that post. Check the link and try again.");
  const payload = await response.json() as { html?: unknown; author_name?: unknown; author_url?: unknown; url?: unknown };
  if (typeof payload.html !== "string" || !payload.html.includes("twitter-tweet")) throw new Error("That X post is unavailable for embedding.");
  const authorUrl = typeof payload.author_url === "string" && canonicalXAuthorUrl(payload.author_url) ? payload.author_url : null;
  return {
    source: "x",
    url,
    authorName: typeof payload.author_name === "string" ? payload.author_name.trim().slice(0, 100) || null : null,
    authorUrl,
    text: oEmbedText(payload.html),
  };
}

function canonicalXAuthorUrl(value: string) {
  try {
    const url = new URL(value);
    if (url.protocol !== "https:" || !X_HOSTS.has(url.hostname.toLowerCase()) || url.pathname.split("/").filter(Boolean).length !== 1) return null;
    return url.href;
  } catch {
    return null;
  }
}

export async function getLocalQuote(db: D1Database, id: string): Promise<Extract<QuoteAttachment, { source: "local" }> | null> {
  if (!validPostId(id)) return null;
  const row = await db.prepare("SELECT id,kind,title,body,excerpt,cover_key,published_at FROM posts WHERE id=? AND status='published'")
    .bind(id).first<Record<string, unknown>>();
  if (!row) return null;
  return {
    source: "local",
    id: String(row.id),
    kind: row.kind as PostKind,
    unavailable: false,
    title: row.title ? String(row.title) : null,
    body: String(row.body),
    excerpt: String(row.excerpt || ""),
    coverKey: row.cover_key ? String(row.cover_key) : null,
    publishedAt: Number(row.published_at || 0),
  };
}
