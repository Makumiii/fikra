import { env } from "cloudflare:workers";
import { Link } from "react-router";
import { Hash } from "@phosphor-icons/react";
import type { Route } from "./+types/topics";
import { getTopics } from "../lib/db.server";
import { getSiteSettings } from "../lib/site.server";
export function meta({ loaderData }: Route.MetaArgs) { const siteUrl=loaderData?.siteUrl||"https://example.com"; const siteName=loaderData?.site.siteName||"Fikra"; return [{ title: `Topics | ${siteName}` }, { name: "description", content: "Explore this timeline by topic." }, { property:"og:title",content:`Topics on ${siteName}` }, { property:"og:image",content:`${siteUrl}/og/home.png` }, {tagName:"link",rel:"canonical",href:`${siteUrl}/topics`}]; }
export async function loader() { const [topics,site]=await Promise.all([getTopics(env.DB),getSiteSettings(env.DB)]); return { topics, site, siteUrl: env.SITE_URL }; }
export default function Topics({ loaderData }: Route.ComponentProps) { return <div><header className="page-heading inset"><span className="eyebrow">Explore</span><h1>Topics, not rabbit holes.</h1><p>A calmer way to find the part of my brain you came for.</p></header><div className="topic-grid">{loaderData.topics.map((topic) => <Link to={`/topics/${topic.slug}`} key={topic.id}><span className="topic-icon"><Hash size={22} /></span><div><h2>{topic.name}</h2><p>{topic.description || "Posts loosely gathered under this idea."}</p><small>{topic.postCount} {topic.postCount === 1 ? "post" : "posts"}</small></div></Link>)}</div></div>; }
