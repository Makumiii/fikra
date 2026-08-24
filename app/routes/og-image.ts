import { env } from "cloudflare:workers";
import { ImageResponse } from "workers-og";
import type { Route } from "./+types/og-image";

function escape(value: string) { return value.replace(/[&<>"']/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[character]!); }
export async function loader({ params }: Route.LoaderArgs) {
  const [profile, settings] = await Promise.all([
    env.DB.prepare("SELECT display_name,handle FROM profile WHERE id=1").first<{ display_name: string; handle: string }>(),
    env.DB.prepare("SELECT site_name,site_description FROM site_settings WHERE id=1").first<{ site_name: string; site_description: string }>(),
  ]);
  const siteName = settings?.site_name || "Fikra";
  const author = profile?.display_name || "Site Owner";
  const handle = profile?.handle || "owner";
  let title = settings?.site_description || "An independent, single-author social blog.";
  let label = siteName.toUpperCase().slice(0, 42);
  if (params.postId !== "home") {
    const post = await env.DB.prepare("SELECT title, body, kind FROM posts WHERE id = ? AND status = 'published'").bind(params.postId).first<{ title: string | null; body: string; kind: string }>();
    if (!post) throw new Response("Not found", { status: 404 });
    title = post.title || post.body.slice(0, 150);
    label = post.kind === "article" ? "ARTICLE" : "POST";
  }
  const html = `<div style="width:1200px;height:630px;display:flex;flex-direction:column;justify-content:space-between;background:#111416;color:#f4f4ef;padding:64px;font-family:sans-serif">
    <p style="font-size:24px;font-weight:800;letter-spacing:.12em;color:#8f9cf4;margin:0">${label}</p>
    <h1 style="display:flex;font-size:${title.length > 95 ? 54 : 68}px;line-height:1.04;font-weight:800;letter-spacing:-.035em;max-width:1030px;margin:0">${escape(title)}</h1>
    <div style="display:flex;align-items:center;justify-content:space-between;width:1072px"><p style="font-size:25px;font-weight:700;margin:0">${escape(author)}&nbsp;&nbsp;<span style="color:#aeb3b5;font-weight:400">@${escape(handle)}</span></p><p style="font-size:26px;color:#aeb3b5;margin:0">${escape(new URL(env.SITE_URL).hostname)}&nbsp;&nbsp; F•</p></div>
  </div>`;
  const response = new ImageResponse(html, { width: 1200, height: 630 });
  response.headers.set("Cache-Control", "public, max-age=3600, stale-while-revalidate=86400");
  return response;
}
