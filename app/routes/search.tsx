import { env } from "cloudflare:workers";
import { Form, Link, useRouteLoaderData } from "react-router";
import { MagnifyingGlass } from "@phosphor-icons/react";
import type { Route } from "./+types/search";
import type { loader as rootLoader } from "../root";
import { currentViewer } from "../lib/auth.server";
import { getFeed } from "../lib/db.server";
import { PostCard } from "../components/post-card";
import type { FeedPost } from "../lib/models";

export function meta() { return [{ title: "Search | Fikra" }, { name: "robots", content: "noindex,follow" }]; }
export async function loader({ request }: Route.LoaderArgs) {
  const q = new URL(request.url).searchParams.get("q")?.trim().slice(0, 100) || "";
  const viewer = await currentViewer(request);
  let posts: FeedPost[] = [];
  if (q) { try { posts = await getFeed(env.DB, viewer?.id, { query: q }); } catch { posts = []; } }
  return { q, posts };
}
export default function Search({ loaderData }: Route.ComponentProps) {
  const root = useRouteLoaderData<typeof rootLoader>("root"); if (!root) return null;
  return <><header className="search-header"><Form method="get"><MagnifyingGlass size={20} /><input type="search" name="q" defaultValue={loaderData.q} placeholder="Search posts and articles" autoFocus /><button className="soft-button">Search</button></Form></header>{loaderData.q ? <div className="section-label">{loaderData.posts.length} results for “{loaderData.q}”</div> : null}<section className="feed">{loaderData.posts.map((post) => <PostCard key={post.id} post={post} viewer={root.viewer} profile={root.profile} />)}{loaderData.q && !loaderData.posts.length ? <div className="empty-state"><h2>No clever matches.</h2><p>Try a broader word, a topic name, or a phrase from the post you remember.</p></div> : !loaderData.q ? <div className="empty-state"><h2>Search the whole timeline.</h2><p>Articles, short thoughts, questionable opinions. Full-text search does the rummaging.</p><Link to="/topics" className="soft-button">Browse topics instead</Link></div> : null}</section></>;
}
