import { env } from "cloudflare:workers";
import { Link, NavLink, useRouteLoaderData } from "react-router";
import { CalendarBlank, LinkSimple, MapPin, SealCheck } from "@phosphor-icons/react";

import type { Route } from "./+types/home";
import type { loader as rootLoader } from "../root";
import { currentViewer } from "../lib/auth.server";
import { getFeed } from "../lib/db.server";
import { PostCard } from "../components/post-card";
import { ProfileEditor } from "../components/profile-editor";
import { Avatar } from "../components/avatar";
import { getProfile } from "../lib/db.server";
import { getSiteSettings } from "../lib/site.server";

export function meta({ loaderData }: Route.MetaArgs) {
  const siteUrl = loaderData?.siteUrl || "https://example.com";
  const siteName = loaderData?.site.siteName || "Fikra";
  const description = loaderData?.site.siteDescription || "An independent, single-author social blog.";
  return [
    { title: siteName },
    { name: "description", content: description },
    { property: "og:title", content: siteName },
    { property: "og:description", content: description },
    { property: "og:type", content: "website" },
    { property: "og:image", content: `${siteUrl}/og/home.png` },
    { name: "twitter:card", content: "summary_large_image" },
    { tagName: "link", rel: "canonical", href: siteUrl },
  ];
}

export async function loader({ request }: Route.LoaderArgs) {
  const url = new URL(request.url);
  const viewer = await currentViewer(request);
  const view = url.searchParams.get("view") === "articles" ? "articles" : "posts";
  const [posts, site, profile] = await Promise.all([getFeed(env.DB, viewer?.id, view === "articles" ? { kind: "article" } : {}), getSiteSettings(env.DB), getProfile(env.DB)]);
  return { posts, view, siteUrl: env.SITE_URL, site, profile };
}

export default function Home({ loaderData }: Route.ComponentProps) {
  const root = useRouteLoaderData<typeof rootLoader>("root");
  if (!root) return null;
  const { profile, profileLinks, subscriberCount } = root;
  const revealSubscribers = subscriberCount >= profile.subscriberRevealThreshold;
  return <>
    <header className="profile-header">
      <div className={`profile-banner ${profile.bannerKey ? "has-image" : ""}`} style={profile.bannerKey ? { backgroundImage: `url(/media/${encodeURIComponent(profile.bannerKey)})` } : undefined} role={profile.bannerKey ? "img" : undefined} aria-label={profile.bannerKey ? "Profile banner" : undefined} />
      <div className="profile-body">
        <div className="profile-avatar-row"><Avatar identity={profile} className="profile-avatar" alt={profile.displayName} /><div className="profile-actions">{root.viewer?.role === "owner" ? <ProfileEditor profile={profile} profileLink={profileLinks[0]} /> : <Link to="/about" className="soft-button">About me</Link>}{!root.viewer ? <><Link to="/subscribe" className="primary-button">Subscribe</Link><Link to="/login" className="profile-login">Log in</Link></> : null}</div></div>
        <h1>{profile.displayName}<SealCheck className="verified-dot" size={19} weight="fill" aria-label="Self-verified, obviously" /></h1>
        <p className="handle">@{profile.handle}</p>
        <p className="profile-bio">{profile.bio}</p>
        <div className="profile-meta">{profile.location ? <span><MapPin size={17} />{profile.location}</span> : null}{profileLinks.map((item) => <a key={item.id} href={item.url} rel="me"><LinkSimple size={17} />{item.label}</a>)}<span><CalendarBlank size={17} />Joined my own platform</span></div>
        <div className="counts"><span><strong>{profile.jokeFollowers}</strong> followers <i title="Source: trust me, bro">probably</i></span><span><strong>{profile.followingCount}</strong> following</span><span><strong>{revealSubscribers ? subscriberCount.toLocaleString() : "classified"}</strong> subscribers</span></div>
      </div>
      <nav className="feed-tabs" aria-label="Timeline views"><NavLink to="/" end className={({ isActive }) => isActive && loaderData.view === "posts" ? "active" : ""}>Posts</NavLink><NavLink to="/?view=articles" className={() => loaderData.view === "articles" ? "active" : ""}>Articles</NavLink></nav>
    </header>
    <section className="feed" aria-label={loaderData.view === "articles" ? "Articles" : "Posts"}>
      {loaderData.posts.length ? loaderData.posts.map((post) => <PostCard key={post.id} post={post} viewer={root.viewer} profile={profile} />) : <div className="empty-state"><h2>The timeline is suspiciously peaceful.</h2><p>{root.viewer?.role === "owner" ? "Post the first thought and ruin the silence beautifully." : `${profile.displayName} is probably overthinking the first post.`}</p>{root.viewer?.role === "owner" ? <Link className="primary-button" to="/compose">Write something</Link> : null}</div>}
    </section>
  </>;
}
