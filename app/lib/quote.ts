const X_HOSTS = new Set(["x.com", "www.x.com", "twitter.com", "www.twitter.com"]);
const POST_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function validPostId(value: string) {
  return POST_ID.test(value);
}

export function canonicalXPostUrl(value: string) {
  try {
    const url = new URL(value.trim());
    const host = url.hostname.toLowerCase();
    if (url.protocol !== "https:" || !X_HOSTS.has(host) || url.username || url.password || url.port) return null;
    const match = url.pathname.match(/^\/([^/]+)\/status\/(\d+)(?:\/)?$/i);
    if (!match) return null;
    return `https://x.com/${match[1]}/status/${match[2]}`;
  } catch {
    return null;
  }
}
