import { env } from "cloudflare:workers";
import { Link, useRouteLoaderData } from "react-router";
import { ArrowLeft, Hash } from "@phosphor-icons/react";
import type { Route } from "./+types/topic";
import type { loader as rootLoader } from "../root";
import { currentViewer } from "../lib/auth.server";
import { getFeed } from "../lib/db.server";
import { PostCard } from "../components/post-card";
import { getSiteSettings } from "../lib/site.server";
export async function loader({ request, params }: Route.LoaderArgs) { const topic = await env.DB.prepare("SELECT * FROM topics WHERE slug = ?").bind(params.slug).first<Record<string, unknown>>(); if (!topic) throw new Response("Topic not found", { status: 404 }); const viewer = await currentViewer(request); const [posts,site]=await Promise.all([getFeed(env.DB, viewer?.id, { topic: params.slug }),getSiteSettings(env.DB)]); return { topic, posts, site, siteUrl:env.SITE_URL }; }
export function meta({ loaderData }: Route.MetaArgs) { const title=loaderData?`${loaderData.topic.name} | ${loaderData.site.siteName}`:"Topic"; return [{ title }, { name: "description", content: loaderData ? String(loaderData.topic.description) : "" }, {property:"og:title",content:title},...(loaderData?[{property:"og:image",content:`${loaderData.siteUrl}/og/home.png`},{tagName:"link" as const,rel:"canonical",href:`${loaderData.siteUrl}/topics/${loaderData.topic.slug}`}]:[])]; }
export default function TopicPage({ loaderData }: Route.ComponentProps) { const root = useRouteLoaderData<typeof rootLoader>("root"); if (!root) return null; return <><header className="sticky-page-header"><Link to="/topics" className="icon-button"><ArrowLeft size={21} /></Link><div><strong>#{String(loaderData.topic.name)}</strong><small>{loaderData.posts.length} posts</small></div></header><div className="topic-intro"><Hash size={27} /><p>{String(loaderData.topic.description)}</p></div><section className="feed">{loaderData.posts.map((post) => <PostCard key={post.id} post={post} viewer={root.viewer} profile={root.profile} />)}</section></>; }
