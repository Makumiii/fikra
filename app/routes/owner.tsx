import { env } from "cloudflare:workers";
import { Form, Link, useNavigation } from "react-router";
import { CaretDown, ChartLineUp, EnvelopeSimple } from "@phosphor-icons/react";

import type { Route } from "./+types/owner";
import { assertSameOrigin, requireOwner } from "../lib/auth.server";
import { sendDigests } from "../lib/digest.server";

export async function loader({ request }: Route.LoaderArgs) {
  await requireOwner(request);
  const [counts, posts, subscribers, deliveries] = await Promise.all([
    env.DB.prepare(`SELECT (SELECT COUNT(*) FROM users WHERE status='active' AND role='reader') subscribers,(SELECT COUNT(*) FROM posts WHERE status='published') posts,(SELECT COALESCE(SUM(views),0) FROM post_daily_metrics) views,(SELECT COUNT(*) FROM post_detail_opens) detail_opens,(SELECT COUNT(*) FROM replies WHERE status='visible') replies`).first<Record<string, number>>(),
    env.DB.prepare(`SELECT p.id,p.title,p.body,p.kind,p.pinned,p.published_at,COALESCE(SUM(m.views),0) views,(SELECT COUNT(*) FROM post_detail_opens d WHERE d.post_id=p.id) detail_opens,(SELECT COUNT(*) FROM reactions r WHERE r.post_id=p.id) reactions,(SELECT COUNT(*) FROM replies x WHERE x.post_id=p.id AND x.status='visible') replies FROM posts p LEFT JOIN post_daily_metrics m ON m.post_id=p.id WHERE p.status='published' GROUP BY p.id ORDER BY views DESC,p.updated_at DESC LIMIT 30`).all<Record<string, unknown>>(),
    env.DB.prepare("SELECT handle,display_name,created_at FROM users WHERE status='active' AND role='reader' ORDER BY created_at DESC LIMIT 100").all<Record<string, unknown>>(),
    env.DB.prepare("SELECT template,status,COUNT(*) count FROM email_deliveries GROUP BY template,status ORDER BY template,status").all<Record<string, unknown>>(),
  ]);
  return { counts, posts: posts.results, subscribers: subscribers.results, deliveries: deliveries.results };
}

export async function action({ request }: Route.ActionArgs) {
  assertSameOrigin(request);
  await requireOwner(request);
  const form = await request.formData();
  const intent = String(form.get("intent") || "");
  if (intent === "digest") return { ok: true as const, digestsQueued: await sendDigests(env, true) };
  return { ok: true as const, digestsQueued: 0 };
}

export default function Owner({ loaderData, actionData }: Route.ComponentProps) {
  const navigation = useNavigation();
  const emailCount = loaderData.deliveries.reduce((sum, row) => sum + Number(row.count), 0);
  return <div className="studio-page">
    <header className="sticky-page-header"><ChartLineUp size={22} /><div><strong>Studio</strong><small>Private analytics</small></div></header>
    <dl className="studio-stats"><div><dt>Qualified impressions</dt><dd>{Number(loaderData.counts?.views || 0).toLocaleString()}</dd></div><div><dt>Detail opens</dt><dd>{Number(loaderData.counts?.detail_opens || 0).toLocaleString()}</dd></div><div><dt>Subscribers</dt><dd>{Number(loaderData.counts?.subscribers || 0).toLocaleString()}</dd></div><div><dt>Replies</dt><dd>{Number(loaderData.counts?.replies || 0).toLocaleString()}</dd></div></dl>

    <section className="studio-content" aria-labelledby="content-performance-heading"><div className="studio-section-heading"><h2 id="content-performance-heading">Content performance</h2><small>Highest-impression first</small></div>{loaderData.posts.length ? <div className="studio-post-list">{loaderData.posts.map((post) => <Link className="studio-post-row" to={`/post/${post.id}`} key={String(post.id)}><div><small>{String(post.kind)}{post.pinned ? " · pinned" : ""}</small><strong>{String(post.title || post.body).slice(0, 92)}</strong></div><dl><div><dt>Impressions</dt><dd>{Number(post.views).toLocaleString()}</dd></div><div><dt>Opens</dt><dd>{Number(post.detail_opens).toLocaleString()}</dd></div><div><dt>Replies</dt><dd>{Number(post.replies).toLocaleString()}</dd></div></dl></Link>)}</div> : <p className="studio-empty">Publish your first post to start seeing performance.</p>}</section>

    <details className="studio-disclosure"><summary><span><strong>Audience & email</strong><small>{loaderData.subscribers.length} subscribers · {emailCount.toLocaleString()} deliveries</small></span><CaretDown size={18} /></summary><div className="studio-disclosure-body audience-body"><div className="audience-action"><span><strong>Digest delivery</strong><small>Queue the current digest for eligible subscribers.</small></span><Form method="post"><button className="soft-button" name="intent" value="digest" disabled={navigation.state !== "idle"}><EnvelopeSimple size={17} />{navigation.state !== "idle" ? "Queuing…" : "Run digest"}</button></Form></div>{actionData?.digestsQueued ? <p className="form-success" role="status">{actionData.digestsQueued} digest emails queued.</p> : null}<div className="handle-cloud">{loaderData.subscribers.map((user) => <span key={String(user.handle)}>@{String(user.handle)}</span>)}{!loaderData.subscribers.length ? <small>No subscribers yet.</small> : null}</div></div></details>
  </div>;
}
