import { env } from "cloudflare:workers";
import { data, Link, redirect, useFetcher, useRevalidator, useRouteLoaderData } from "react-router";
import { ArrowLeft, ChatCircle, DotsThree, Export, PaperPlaneTilt, Plus, SealCheck, Smiley, Trash, X } from "@phosphor-icons/react";
import { useEffect, useState } from "react";

import type { Route } from "./+types/post";
import type { loader as rootLoader } from "../root";
import { assertSameOrigin, currentViewer, requireViewer } from "../lib/auth.server";
import { getPost } from "../lib/db.server";
import { renderArticleHtml, renderMarkdown } from "../lib/markdown.server";
import { emailMediaUrl, queueEmail } from "../lib/email.server";
import { consumeRateLimit, rateLimit, rateLimitSubject } from "../lib/rate-limit.server";
import { PostCard } from "../components/post-card";
import { EmojiKeyboard } from "../components/emoji-keyboard";
import { Avatar } from "../components/avatar";
import { REACTIONS } from "../lib/models";
import { normalizeAvatarStyle } from "../lib/avatar";
import { getProfile } from "../lib/db.server";
import { getSiteSettings } from "../lib/site.server";

interface ReplyRecord {
  id: string;
  body: string;
  parent_reply_id: string | null;
  created_at: number;
  handle: string;
  display_name: string;
  role: string;
  avatar_key: string | null;
  avatar_seed: string | null;
  avatar_style: string | null;
  reaction_count: number;
  viewer_reaction: string | null;
}

interface ReplyNode extends ReplyRecord { children: ReplyNode[] }

function timeAgo(timestamp: number) {
  const seconds = Math.max(1, Math.floor(Date.now() / 1000) - timestamp);
  const units: [number, string][] = [[31536000, "y"], [2592000, "mo"], [86400, "d"], [3600, "h"], [60, "m"]];
  for (const [size, label] of units) if (seconds >= size) return `${Math.floor(seconds / size)}${label}`;
  return `${seconds}s`;
}

function buildReplyTree(records: ReplyRecord[], sort: "relevant" | "latest") {
  const nodes = new Map<string, ReplyNode>(records.map((reply) => [reply.id, { ...reply, children: [] }]));
  const roots: ReplyNode[] = [];
  for (const node of nodes.values()) {
    const parent = node.parent_reply_id ? nodes.get(node.parent_reply_id) : null;
    if (parent && parent.id !== node.id) parent.children.push(node);
    else roots.push(node);
  }
  const orderChildren = (node: ReplyNode) => {
    node.children.sort((a, b) => a.created_at - b.created_at);
    node.children.forEach(orderChildren);
  };
  roots.forEach(orderChildren);
  if (sort === "latest") roots.sort((a, b) => b.created_at - a.created_at);
  else roots.sort((a, b) => {
    const score = (reply: ReplyNode) => (reply.role === "owner" ? 30 : 0) + reply.reaction_count * 4 + reply.children.length * 6;
    return score(b) - score(a) || b.created_at - a.created_at;
  });
  return roots;
}

function ReplyText({ text }: { text: string }) {
  const pattern = /(@[a-zA-Z0-9_]{3,24}|https?:\/\/[^\s<]+)/g;
  return <>{text.split(pattern).map((part, index) => part.startsWith("@") ? <Link key={index} to={`/search?q=${encodeURIComponent(part)}`}>{part}</Link> : /^https?:\/\//.test(part) ? <a key={index} href={part} target="_blank" rel="noopener noreferrer">{part}</a> : part)}</>;
}

export async function loader({ request, params }: Route.LoaderArgs) {
  const viewer = await currentViewer(request);
  const post = await getPost(env.DB, params.postId, viewer?.id);
  if (!post) {
    const legacy = await env.DB.prepare("SELECT id FROM posts WHERE slug=? AND status='published'").bind(params.postId).first<{ id: string }>();
    if (legacy) throw redirect(`/post/${legacy.id}`, 301);
    throw new Response("Not found", { status: 404 });
  }
  const [replies, views, profile, site] = await Promise.all([
    env.DB.prepare(`SELECT r.id, r.body, r.parent_reply_id, r.created_at, u.handle, u.display_name, u.role, u.avatar_key, u.avatar_seed, u.avatar_style,
      COALESCE((SELECT COUNT(*) FROM reply_reactions rr WHERE rr.reply_id = r.id), 0) AS reaction_count,
      (SELECT emoji FROM reply_reactions rr WHERE rr.reply_id = r.id AND rr.user_id = ?) AS viewer_reaction
      FROM replies r JOIN users u ON u.id = r.user_id WHERE r.post_id = ? AND r.status = 'visible' ORDER BY r.created_at`)
      .bind(viewer?.id || "", post.id).all<ReplyRecord>(),
    env.DB.prepare("SELECT COALESCE(SUM(views), 0) AS count FROM post_daily_metrics WHERE post_id = ?").bind(post.id).first<{ count: number }>(),
    getProfile(env.DB),
    getSiteSettings(env.DB),
  ]);
  return { post, articleHtml: post.kind === "article" ? post.bodyFormat === "html" ? renderArticleHtml(post.body) : renderMarkdown(post.body) : null, replies: replies.results, viewCount: Number(views?.count || 0), siteUrl: env.SITE_URL, profile, site };
}

export function meta({ loaderData }: Route.MetaArgs) {
  if (!loaderData) return [{ title: "Post not found" }];
  const { post } = loaderData;
  const title = post.seoTitle || post.title || `${post.body.slice(0, 55)} | ${loaderData.site.siteName}`;
  const description = post.seoDescription || post.excerpt || post.body.slice(0, 160);
  const url = post.canonicalUrl || `${loaderData.siteUrl}/post/${post.id}`;
  const author = loaderData.profile.displayName;
  return [{ title }, { name: "description", content: description }, { property: "og:title", content: title }, { property: "og:description", content: description }, { property: "og:type", content: post.kind === "article" ? "article" : "website" }, { property: "og:url", content: url }, { property: "og:image", content: `${loaderData.siteUrl}/og/${post.id}.png` }, { name: "twitter:card", content: "summary_large_image" }, { tagName: "link", rel: "canonical", href: url }, { "script:ld+json": post.kind === "article" ? { "@context": "https://schema.org", "@type": "BlogPosting", headline: post.title, description, datePublished: new Date(post.publishedAt * 1000).toISOString(), author: { "@type": "Person", name: author, url: `${loaderData.siteUrl}/about` }, mainEntityOfPage: url } : { "@context": "https://schema.org", "@type": "SocialMediaPosting", headline: title, datePublished: new Date(post.publishedAt * 1000).toISOString(), author: { "@type": "Person", name: author } } }];
}

export async function action({ request, params }: Route.ActionArgs) {
  assertSameOrigin(request);
  const viewer = await requireViewer(request);
  await Promise.all([
    rateLimit(request, "reply-ip", 10, 60),
    rateLimitSubject(viewer.id, "reply-account", 30, 60 * 60),
  ]);
  const post = await env.DB.prepare("SELECT id,allow_replies FROM posts WHERE id = ? AND status = 'published'").bind(params.postId).first<{ id: string; allow_replies: number }>();
  if (!post || !post.allow_replies) throw new Response("Replies are closed", { status: 403 });
  const form = await request.formData();
  const body = String(form.get("body") || "").trim();
  const parentId = String(form.get("parentId") || "") || null;
  if (!body || body.length > 1000) return { ok: false as const, error: "Replies need 1 to 1,000 characters." };
  if (parentId) {
    const parent = await env.DB.prepare("SELECT id FROM replies WHERE id = ? AND post_id = ? AND status = 'visible'").bind(parentId, post.id).first();
    if (!parent) return { ok: false as const, error: "That reply no longer exists." };
  }
  const replyId = crypto.randomUUID();
  const now = Math.floor(Date.now() / 1000);
  try {
    await env.DB.prepare("INSERT INTO replies (id, post_id, user_id, parent_reply_id, body, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)")
      .bind(replyId, post.id, viewer.id, parentId, body, now, now).run();
  } catch (error) {
    console.error(JSON.stringify({ event: "reply_insert_failed", postId: post.id, viewerId: viewer.id, error: String(error) }));
    return data({ ok: false as const, error: "Your reply could not be posted. It is saved below so you can retry." }, { status: 503 });
  }

  try {
    const handles = viewer.role === "owner" ? [...new Set(body.match(/@[a-zA-Z0-9_]{3,24}/g)?.map((item) => item.slice(1).toLowerCase()) || [])] : [];
    for (const handle of handles.slice(0, 10)) {
      const mentioned = await env.DB.prepare("SELECT id,email,notify_mentions FROM users WHERE handle = ? AND status = 'active'").bind(handle).first<{ id: string; email: string; notify_mentions: number }>();
      if (mentioned && mentioned.id !== viewer.id) {
        await env.DB.batch([
          env.DB.prepare("INSERT OR IGNORE INTO mentions (id, mentioned_user_id, actor_user_id, post_id, reply_id, created_at) VALUES (?, ?, ?, ?, ?, ?)").bind(crypto.randomUUID(), mentioned.id, viewer.id, post.id, replyId, now),
          env.DB.prepare("INSERT INTO notifications (id, user_id, actor_user_id, type, post_id, reply_id, message, created_at) VALUES (?, ?, ?, 'mention', ?, ?, ?, ?)").bind(crypto.randomUUID(), mentioned.id, viewer.id, post.id, replyId, `@${viewer.handle} mentioned you`, now),
        ]);
        if (mentioned.notify_mentions) await queueEmail({ userId: mentioned.id, email: mentioned.email, template: "activity", idempotencyKey: `mention:${replyId}:${mentioned.id}`, data: { activity: "mention", actorName: viewer.displayName, actorHandle: viewer.handle, actorAvatarUrl: emailMediaUrl(env.SITE_URL, viewer.avatarKey), quote: body, url: `${env.SITE_URL}/post/${post.id}#reply-${replyId}` } });
      }
    }
    if (parentId) {
      const parentOwner = await env.DB.prepare("SELECT u.id AS user_id,u.email,u.notify_replies FROM replies r JOIN users u ON u.id=r.user_id WHERE r.id = ?").bind(parentId).first<{ user_id: string; email: string; notify_replies: number }>();
      if (parentOwner && parentOwner.user_id !== viewer.id) {
        await env.DB.prepare("INSERT INTO notifications (id, user_id, actor_user_id, type, post_id, reply_id, message, created_at) VALUES (?, ?, ?, 'reply', ?, ?, ?, ?)").bind(crypto.randomUUID(), parentOwner.user_id, viewer.id, post.id, replyId, `@${viewer.handle} replied to you`, now).run();
        if (parentOwner.notify_replies && await consumeRateLimit(parentOwner.user_id, "reply-email-recipient", 5, 15 * 60)) {
          await queueEmail({ userId: parentOwner.user_id, email: parentOwner.email, template: "activity", idempotencyKey: `reply:${replyId}:${parentOwner.user_id}`, data: { activity: "reply", actorName: viewer.displayName, actorHandle: viewer.handle, actorAvatarUrl: emailMediaUrl(env.SITE_URL, viewer.avatarKey), quote: body, url: `${env.SITE_URL}/post/${post.id}#reply-${replyId}` } });
        }
      }
    }
  } catch (error) {
    console.error(JSON.stringify({ event: "reply_notification_failed", replyId, error: String(error) }));
  }
  return data({ ok: true as const, replyId }, { status: 201 });
}

function ThreadReply({ reply, viewer, depth, onReply }: { reply: ReplyNode; viewer: { id: string; role: string } | null; depth: number; onReply: (reply: ReplyNode) => void }) {
  const reaction = useFetcher<{ ok: boolean }>();
  const ownerAction = useFetcher<{ ok: boolean }>();
  const [pickerOpen, setPickerOpen] = useState(false);
  const [keyboardOpen, setKeyboardOpen] = useState(false);
  const [reactionError, setReactionError] = useState("");
  const optimisticReaction = reaction.formData?.get("emoji")?.toString() ?? reply.viewer_reaction;
  const reactionCount = reply.reaction_count + (optimisticReaction && !reply.viewer_reaction ? 1 : !optimisticReaction && reply.viewer_reaction ? -1 : 0);
  useEffect(() => { if (reaction.data && !reaction.data.ok) setReactionError("Reaction failed. Previous state restored."); }, [reaction.data]);
  useEffect(() => { if (reaction.formData) { setPickerOpen(false); setKeyboardOpen(false); } }, [reaction.formData]);
  async function shareReply() {
    const url = `${window.location.origin}${window.location.pathname}#reply-${reply.id}`;
    if (navigator.share) await navigator.share({ text: reply.body.slice(0, 120), url }).catch(() => undefined);
    else await navigator.clipboard.writeText(url);
  }
  function chooseCustomEmoji(emoji: string) {
    reaction.submit({ intent: "react", emoji: optimisticReaction === emoji ? "" : emoji }, { method: "post", action: `/actions/reply/${reply.id}` });
    setKeyboardOpen(false);
    setPickerOpen(false);
  }
  function closeEmojiKeyboard() {
    setKeyboardOpen(false);
    setPickerOpen(false);
  }
  function handleReactionAction() {
    if (!viewer) { location.assign("/login"); return; }
    if (optimisticReaction) {
      reaction.submit({ intent: "react", emoji: "" }, { method: "post", action: `/actions/reply/${reply.id}` });
      setPickerOpen(false);
      setKeyboardOpen(false);
      return;
    }
    queueMicrotask(() => setPickerOpen(true));
  }
  return <div className={`reply-branch${reply.children.length ? " has-children" : ""}`}>
    <article className="reply-item" id={`reply-${reply.id}`}>
      <div className="reply-avatar-column"><Avatar identity={{ displayName: reply.display_name, avatarKey: reply.avatar_key, avatarSeed: reply.avatar_seed, avatarStyle: normalizeAvatarStyle(reply.avatar_style) }} className="tiny" /></div>
      <div className="reply-content">
        <header><strong>{reply.display_name}</strong>{reply.role === "owner" ? <SealCheck className="verified-dot small" size={15} weight="fill" aria-label="Verified" /> : null}<span>@{reply.handle}</span><span>·</span><time title={new Intl.DateTimeFormat("en", { dateStyle: "medium", timeStyle: "short", timeZone: "UTC" }).format(new Date(reply.created_at * 1000))} suppressHydrationWarning>{timeAgo(reply.created_at)}</time>{viewer?.role === "owner" ? <details className="reply-owner-menu"><summary aria-label={`Actions for @${reply.handle}'s reply`}><DotsThree size={18} weight="bold" /></summary><div><ownerAction.Form method="post" action={`/actions/owner/reply/${reply.id}`} onSubmit={(event) => { if (!confirm(reply.children.length ? "Delete this reply and all replies beneath it permanently?" : "Delete this reply permanently?")) event.preventDefault(); }}><button className="danger" name="intent" value="delete"><Trash size={16} />Delete reply</button></ownerAction.Form></div></details> : null}</header>
        <p><ReplyText text={reply.body} /></p>
        <div className="reply-actions">
          <button type="button" className="reply-action" onClick={() => onReply(reply)} aria-label={`Reply to @${reply.handle}`}><ChatCircle size={18} /><span>{reply.children.length || ""}</span></button>
          <div className="reaction-wrap"><button type="button" className={`reply-action${optimisticReaction ? " reacted" : ""}`} onClick={handleReactionAction} aria-label={optimisticReaction ? `Remove ${optimisticReaction} reaction` : "React to reply"} aria-expanded={pickerOpen}><span className="reaction-symbol">{optimisticReaction || <Smiley size={18} />}</span><span>{reactionCount || ""}</span></button>{pickerOpen && !keyboardOpen ? <div className="reaction-picker" role="dialog" aria-label="Choose a reaction"><button type="button" className="picker-close" onClick={() => setPickerOpen(false)} aria-label="Close"><X size={14} /></button>{REACTIONS.map((emoji) => <reaction.Form method="post" action={`/actions/reply/${reply.id}`} key={emoji}><input type="hidden" name="intent" value="react" /><button name="emoji" value={emoji} aria-label={`React ${emoji}`}>{emoji}</button></reaction.Form>)}<button type="button" onClick={() => setKeyboardOpen(true)} aria-label="Open emoji keyboard"><Plus size={19} weight="bold" /></button></div> : null}{keyboardOpen ? <EmojiKeyboard onSelect={chooseCustomEmoji} onClose={closeEmojiKeyboard} /> : null}</div>
          <button type="button" className="reply-action" onClick={shareReply} aria-label="Share reply"><Export size={18} /></button>
        </div>
        {reactionError ? <small className="interaction-error" role="status">{reactionError}</small> : null}
      </div>
    </article>
    {reply.children.length ? <div className={`reply-children depth-${Math.min(depth + 1, 3)}`}>{reply.children.map((child) => <ThreadReply key={child.id} reply={child} viewer={viewer} depth={depth + 1} onReply={onReply} />)}</div> : null}
  </div>;
}

export default function PostPage({ loaderData }: Route.ComponentProps) {
  const root = useRouteLoaderData<typeof rootLoader>("root");
  const revalidator = useRevalidator();
  const [replyingTo, setReplyingTo] = useState<{ id: string; handle: string } | null>(null);
  const [sortMode, setSortMode] = useState<"relevant" | "latest">("relevant");
  const [draft, setDraft] = useState("");
  const [draftLoaded, setDraftLoaded] = useState(false);
  const [pendingReply, setPendingReply] = useState<{ body: string; parentId: string | null; status: "sending" | "failed"; error?: string } | null>(null);
  const { post, articleHtml, replies, viewCount } = loaderData;
  const draftKey = `reply-draft:${post.id}`;
  const replyTree = buildReplyTree(replies, sortMode);
  useEffect(() => { const saved = localStorage.getItem(draftKey); if (saved) setDraft(saved); setDraftLoaded(true); }, [draftKey]);
  useEffect(() => { if (!draftLoaded) return; if (draft) localStorage.setItem(draftKey, draft); else localStorage.removeItem(draftKey); }, [draft, draftKey, draftLoaded]);
  if (!root) return null;
  function startReply(reply: ReplyNode) {
    setReplyingTo({ id: reply.id, handle: reply.handle });
    requestAnimationFrame(() => {
      document.getElementById("reply-body")?.focus();
      document.getElementById("reply-form")?.scrollIntoView({ behavior: "smooth", block: "center" });
    });
  }
  async function submitReply(event?: React.FormEvent<HTMLFormElement>, retry = pendingReply) {
    event?.preventDefault();
    const body = (retry?.status === "failed" ? retry.body : draft).trim();
    const parentId = retry?.status === "failed" ? retry.parentId : replyingTo?.id || null;
    if (!body || body.length > 1000) {
      setPendingReply({ body, parentId, status: "failed", error: "Replies need 1 to 1,000 characters." });
      return;
    }
    setPendingReply({ body, parentId, status: "sending" });
    const form = new FormData();
    form.set("body", body);
    if (parentId) form.set("parentId", parentId);
    try {
      const response = await fetch(window.location.pathname, { method: "POST", body: form, headers: { Accept: "application/json" } });
      const result = await response.json() as { ok: boolean; error?: string };
      if (!response.ok || !result.ok) throw new Error(result.error || "Your reply could not be posted.");
      setDraft("");
      setReplyingTo(null);
      setPendingReply(null);
      await revalidator.revalidate();
    } catch (error) {
      setPendingReply({ body, parentId, status: "failed", error: error instanceof Error ? error.message : "Your reply could not be posted." });
      setDraft(body);
    }
  }
  return <div data-post-detail-id={post.id} data-impression-post-id={post.id}>
    <header className="sticky-page-header thread-header"><Link to="/" className="icon-button" aria-label="Back"><ArrowLeft size={21} /></Link><div><strong>{post.kind === "article" ? "Article" : "Post"}</strong></div></header>
    {post.kind === "article" ? <article className="long-read"><header>{post.topics.length ? <div className="topic-row">{post.topics.map((topic) => <Link key={topic.id} to={`/topics/${topic.slug}`}>#{topic.name}</Link>)}</div> : null}<h1>{post.title}</h1><p>{post.excerpt}</p><div className="article-byline"><Avatar identity={root.profile} className="tiny" /><span><strong>{root.profile.displayName}</strong><small>{new Intl.DateTimeFormat(root.site.locale, { dateStyle: "long", timeZone: root.site.timezone }).format(new Date(post.publishedAt * 1000))} · {Math.max(1, Math.ceil(post.body.split(/\s+/).length / 220))} min read</small></span></div></header>{post.coverKey ? <img className="article-hero" src={`/media/${encodeURIComponent(post.coverKey)}`} alt="" /> : null}<div className="prose" dangerouslySetInnerHTML={{ __html: articleHtml || "" }} /></article> : <PostCard post={post} viewer={root.viewer} profile={root.profile} detailed viewCount={viewCount} />}
    <section className="conversation" aria-labelledby="thread-heading">{root.viewer ? <form className="reply-form" id="reply-form" onSubmit={(event) => void submitReply(event)}><Avatar identity={root.viewer} className="tiny" /><div className="reply-composer-body">{replyingTo ? <div className="replying-to">Replying to @{replyingTo.handle}<button type="button" onClick={() => setReplyingTo(null)}>Cancel</button></div> : null}<label className="sr-only" htmlFor="reply-body">Post your reply</label><textarea id="reply-body" name="body" rows={1} maxLength={1000} value={draft} onChange={(event) => setDraft(event.target.value)} placeholder={replyingTo ? `Reply to @${replyingTo.handle}` : "Post your reply"} required /></div><button className="primary-button reply-submit" disabled={pendingReply?.status === "sending"}><PaperPlaneTilt size={17} />{pendingReply?.status === "sending" ? "Sending…" : "Reply"}</button></form> : <div className="reply-gate"><p>Reading is public. Log in to reply.</p><Link className="primary-button" to="/login">Log in</Link><Link className="soft-button" to="/subscribe">Subscribe</Link></div>}
      <div className="thread-controls"><h2 id="thread-heading">{replies.length ? `${replies.length} ${replies.length === 1 ? "reply" : "replies"}` : "Replies"}</h2>{replies.length > 1 ? <div role="group" aria-label="Sort replies"><button type="button" className={sortMode === "relevant" ? "active" : ""} onClick={() => setSortMode("relevant")}>Relevant</button><button type="button" className={sortMode === "latest" ? "active" : ""} onClick={() => setSortMode("latest")}>Latest</button></div> : null}</div>
      {pendingReply ? <article className={`pending-reply ${pendingReply.status}`} aria-live="polite"><Avatar identity={root.viewer!} className="tiny" /><div><header><strong>{root.viewer?.displayName}</strong><span>{pendingReply.status === "sending" ? "Posting…" : "Not posted"}</span></header><p>{pendingReply.body}</p>{pendingReply.status === "failed" ? <div className="failed-reply-actions"><span>{pendingReply.error}</span><button type="button" className="soft-button" onClick={() => void submitReply(undefined, pendingReply)}>Retry</button><button type="button" className="text-button" onClick={() => { setDraft(pendingReply.body); setPendingReply(null); document.getElementById("reply-body")?.focus(); }}>Edit draft</button></div> : null}</div></article> : null}
      <div className="reply-list">{replyTree.length ? replyTree.map((reply) => <ThreadReply key={reply.id} reply={reply} viewer={root.viewer} depth={0} onReply={startReply} />) : <p className="thread-empty">No replies yet. Start the thread.</p>}</div>
    </section>
  </div>;
}
