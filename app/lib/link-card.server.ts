import { env } from "cloudflare:workers";
import dns from "node:dns";

function firstUrl(text: string) {
  const linked = text.match(/href=["'](https?:\/\/[^"']+)["']/i)?.[1];
  return (linked || text.match(/https?:\/\/[^\s<>()]+/i)?.[0])?.replace(/[.,!?;:]$/, "") || null;
}
function textContent(value: string | null) { return value?.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim().slice(0, 300) || null; }
function meta(html: string, keys: string[]) {
  for (const key of keys) {
    const escaped = key.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const patterns = [
      new RegExp(`<meta[^>]+(?:property|name)=["']${escaped}["'][^>]+content=["']([^"']*)["'][^>]*>`, "i"),
      new RegExp(`<meta[^>]+content=["']([^"']*)["'][^>]+(?:property|name)=["']${escaped}["'][^>]*>`, "i"),
    ];
    for (const pattern of patterns) { const match = html.match(pattern); if (match) return textContent(match[1]); }
  }
  return null;
}
function youtubeId(url: URL) {
  if (["youtube.com", "www.youtube.com", "m.youtube.com"].includes(url.hostname)) return url.searchParams.get("v");
  if (url.hostname === "youtu.be") return url.pathname.split("/")[1];
  return null;
}
function unsafeIpv4(host: string) {
  const parts = host.split(".").map(Number);
  if (parts.length !== 4 || parts.some((part) => !Number.isInteger(part) || part < 0 || part > 255)) return false;
  const value = (((parts[0] * 256 + parts[1]) * 256 + parts[2]) * 256 + parts[3]) >>> 0;
  const reserved: Array<[number, number]> = [
    [0x00000000, 0x00ffffff], [0x0a000000, 0x0affffff], [0x64400000, 0x647fffff],
    [0x7f000000, 0x7fffffff], [0xa9fe0000, 0xa9feffff], [0xac100000, 0xac1fffff],
    [0xc0000000, 0xc00000ff], [0xc0000200, 0xc00002ff], [0xc0586300, 0xc05863ff],
    [0xc0a80000, 0xc0a8ffff], [0xc6120000, 0xc613ffff], [0xc6336400, 0xc63364ff],
    [0xcb007100, 0xcb0071ff], [0xe0000000, 0xffffffff],
  ];
  return reserved.some(([start, end]) => value >= start && value <= end);
}

function unsafeIpv6(host: string) {
  const normalized = host.toLowerCase();
  if (normalized.includes(".")) return true;
  const first = Number.parseInt(normalized.split(":")[0] || "0", 16);
  return first < 0x2000 || first > 0x3fff
    || normalized.startsWith("2001:db8:")
    || normalized.startsWith("2001:10:")
    || normalized.startsWith("2001:2:");
}

function unsafeHost(hostname: string) {
  const host = hostname.toLowerCase().replace(/^\[|\]$/g, "").replace(/\.$/, "");
  if (!host || host === "localhost" || host.endsWith(".localhost") || host.endsWith(".local") || host.endsWith(".internal") || host.endsWith(".lan")) return true;
  if (/^\d+(?:\.\d+){3}$/.test(host)) return unsafeIpv4(host);
  if (host.includes(":")) return unsafeIpv6(host);
  return !host.includes(".");
}

function safeExternal(url: URL) {
  if (url.protocol !== "https:" || url.username || url.password || (url.port && url.port !== "443")) return false;
  return !unsafeHost(url.hostname);
}

async function publicAddresses(hostname: string) {
  const host = hostname.replace(/^\[|\]$/g, "");
  if (/^\d+(?:\.\d+){3}$/.test(host) || host.includes(":")) return [host];
  const [ipv4, ipv6] = await Promise.all([
    dns.promises.resolve4(host).catch(() => [] as string[]),
    dns.promises.resolve6(host).catch(() => [] as string[]),
  ]);
  return [...ipv4, ...ipv6];
}

async function assertPublicDestination(url: URL) {
  if (!safeExternal(url)) throw new Error("Unsafe preview URL");
  const addresses = await publicAddresses(url.hostname);
  if (!addresses.length || addresses.some(unsafeHost)) throw new Error("Preview host did not resolve to a public address");
}

async function fetchPreview(start: URL) {
  let current = start;
  for (let redirects = 0; redirects <= 3; redirects++) {
    await assertPublicDestination(current);
    const response = await fetch(current.href, { redirect: "manual", headers: { "User-Agent": "FikraLinkPreview/1.0", "Accept": "text/html" }, signal: AbortSignal.timeout(5000) });
    if (response.status >= 300 && response.status < 400) {
      const location = response.headers.get("Location");
      if (!location || redirects === 3) throw new Error("Unsafe redirect chain");
      current = new URL(location, current);
      continue;
    }
    return response;
  }
  throw new Error("Preview redirect limit exceeded");
}

async function limitedText(response: Response, maximum = 1_000_000) {
  if (!response.body) return "";
  const reader = response.body.getReader(); const chunks: Uint8Array[] = []; let size = 0;
  try {
    for (;;) { const chunk = await reader.read(); if (chunk.done) break; size += chunk.value.byteLength; if (size > maximum) throw new Error("Preview page too large"); chunks.push(chunk.value); }
  } finally { reader.releaseLock(); }
  const data = new Uint8Array(size); let offset = 0; for (const chunk of chunks) { data.set(chunk, offset); offset += chunk.byteLength; }
  return new TextDecoder().decode(data);
}

export async function createLinkCard(postId: string, body: string) {
  const value = firstUrl(body);
  if (!value) return;
  let url: URL;
  try { url = new URL(value); } catch { return; }
  const now = Math.floor(Date.now() / 1000);
  const site = new URL(env.SITE_URL);
  if (url.origin === site.origin && url.pathname.startsWith("/post/")) {
    const linkedPostId = decodeURIComponent(url.pathname.split("/").filter(Boolean).pop() || "");
    const post = await env.DB.prepare("SELECT title, excerpt, body, cover_key FROM posts WHERE (id = ? OR slug = ?) AND status = 'published' LIMIT 1").bind(linkedPostId, linkedPostId).first<Record<string, unknown>>();
    if (post) await env.DB.prepare(`INSERT INTO link_cards (id, post_id, url, link_kind, title, description, image_url, site_name, status, fetched_at, created_at)
      VALUES (?, ?, ?, 'internal', ?, ?, ?, ?, 'ready', ?, ?)`).bind(crypto.randomUUID(), postId, url.href, post.title || "Timeline post", post.excerpt || String(post.body).slice(0, 160), post.cover_key ? `${env.SITE_URL}/media/${encodeURIComponent(String(post.cover_key))}` : null, env.SITE_NAME, now, now).run();
    return;
  }
  const videoId = youtubeId(url);
  if (videoId && /^[\w-]{6,20}$/.test(videoId)) {
    await env.DB.prepare(`INSERT INTO link_cards (id, post_id, url, link_kind, title, image_url, site_name, status, fetched_at, created_at)
      VALUES (?, ?, ?, 'youtube', 'YouTube video', ?, 'YouTube', 'ready', ?, ?)`).bind(crypto.randomUUID(), postId, url.href, `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`, now, now).run();
    return;
  }
  if (!safeExternal(url)) return;
  try {
    const response = await fetchPreview(url);
    const type = response.headers.get("content-type") || "";
    const length = Number(response.headers.get("content-length") || 0);
    if (!response.ok || !type.includes("text/html") || length > 1_000_000) throw new Error("Preview unavailable");
    const html = (await limitedText(response)).slice(0, 600_000);
    const title = meta(html, ["og:title", "twitter:title"]) || textContent(html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1] || null);
    const description = meta(html, ["og:description", "twitter:description", "description"]);
    const rawImage = meta(html, ["og:image:secure_url", "og:image", "twitter:image"]);
    let image: string | null = null;
    if (rawImage) { try { const candidate = new URL(rawImage, response.url); if (safeExternal(candidate)) image = candidate.href; } catch { /* no image */ } }
    await env.DB.prepare(`INSERT INTO link_cards (id, post_id, url, link_kind, title, description, image_url, site_name, status, fetched_at, created_at)
      VALUES (?, ?, ?, 'external', ?, ?, ?, ?, 'ready', ?, ?)`).bind(crypto.randomUUID(), postId, url.href, title || url.hostname, description, image, meta(html, ["og:site_name"]) || url.hostname, now, now).run();
  } catch {
    await env.DB.prepare(`INSERT INTO link_cards (id, post_id, url, link_kind, title, site_name, status, fetched_at, created_at)
      VALUES (?, ?, ?, 'external', ?, ?, 'unavailable', ?, ?)`).bind(crypto.randomUUID(), postId, url.href, url.hostname, url.hostname, now, now).run();
  }
}

export function slugify(value: string) { return value.toLowerCase().normalize("NFKD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 72) || `post-${Date.now()}`; }
