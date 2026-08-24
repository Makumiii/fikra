import { env } from "cloudflare:workers";
export function loader(){return new Response(`User-agent: *\nAllow: /\nDisallow: /owner\nDisallow: /compose\nDisallow: /settings\nDisallow: /notifications\nDisallow: /bookmarks\nDisallow: /auth/\nSitemap: ${env.SITE_URL}/sitemap.xml\n`,{headers:{"Content-Type":"text/plain; charset=utf-8","Cache-Control":"public, max-age=86400"}});}
