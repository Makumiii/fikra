import { env } from "cloudflare:workers";
import { Link, useRouteLoaderData } from "react-router";
import { BookmarkSimple } from "@phosphor-icons/react";
import type { Route } from "./+types/bookmarks";
import type { loader as rootLoader } from "../root";
import { currentViewer } from "../lib/auth.server";
import { getFeed } from "../lib/db.server";
import { PostCard } from "../components/post-card";
export function meta() { return [{ title: "Bookmarks | Fikra" }, { name: "robots", content: "noindex,nofollow" }]; }
export async function loader({ request }: Route.LoaderArgs) { const viewer = await currentViewer(request); if (!viewer) return { signedIn: false, posts: [] }; return { signedIn: true, posts: await getFeed(env.DB, viewer.id, { bookmarks: true }) }; }
export default function Bookmarks({ loaderData }: Route.ComponentProps) { const root = useRouteLoaderData<typeof rootLoader>("root"); if (!root) return null; return <><header className="sticky-page-header"><BookmarkSimple size={22} /><div><strong>Bookmarks</strong><small>Only you can see these</small></div></header><section className="feed">{!loaderData.signedIn ? <div className="empty-state"><h2>Your saved posts are private.</h2><p>Sign in to open your bookmarks. New here? Subscribe to choose a handle.</p><div className="auth-choice"><Link className="primary-button" to="/login">Log in</Link><Link className="soft-button" to="/subscribe">Subscribe</Link></div></div> : <>{loaderData.posts.map((post) => <PostCard key={post.id} post={post} viewer={root.viewer} profile={root.profile} />)}{!loaderData.posts.length ? <div className="empty-state"><h2>Nothing tucked away yet.</h2><p>Bookmark a post and it will wait here patiently.</p><Link className="soft-button" to="/">Find something worth keeping</Link></div> : null}</>}</section></>; }
