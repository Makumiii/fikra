import { lazy, useEffect, useState } from "react";
import { Link, useFetcher, useNavigate } from "react-router";
import { BookmarkSimple, ChatCircle, DotsThree, Export, NotePencil, Plus, PushPin, Quotes, SealCheck, Smiley, Trash, X } from "@phosphor-icons/react";

import type { FeedPost, Profile, Viewer } from "../lib/models";
import { REACTIONS } from "../lib/models";
import { Avatar } from "./avatar";
import { QuoteCard } from "./quote-card";

const EmojiKeyboard = lazy(() => import("./emoji-keyboard").then((module) => ({ default: module.EmojiKeyboard })));

function timeAgo(timestamp: number) {
  const seconds = Math.max(1, Math.floor(Date.now() / 1000) - timestamp);
  const units: [number, string][] = [[31536000, "y"], [2592000, "mo"], [86400, "d"], [3600, "h"], [60, "m"]];
  for (const [size, label] of units) if (seconds >= size) return `${Math.floor(seconds / size)}${label}`;
  return `${seconds}s`;
}

function dateTimeLabel(timestamp: number) {
  return new Intl.DateTimeFormat("en", { dateStyle: "medium", timeStyle: "short", timeZone: "UTC" }).format(new Date(timestamp * 1000));
}

function RichText({ text }: { text: string }) {
  const pattern = /(https?:\/\/[^\s<]+|@[a-zA-Z0-9_]{3,24})/g;
  return <>{text.split(pattern).map((part, index) => {
    if (/^https?:\/\//.test(part)) return <a key={index} href={part} target="_blank" rel="noopener noreferrer">{part}</a>;
    if (part.startsWith("@")) return <Link key={index} to={`/search?q=${encodeURIComponent(part)}`}>{part}</Link>;
    return part;
  })}</>;
}

export function PostCard({ post, viewer, profile, detailed = false, viewCount = 0 }: { post: FeedPost; viewer: Viewer | null; profile: Profile; detailed?: boolean; viewCount?: number }) {
  const navigate = useNavigate();
  const reaction = useFetcher<{ ok: boolean }>();
  const bookmark = useFetcher<{ ok: boolean }>();
  const ownerAction = useFetcher<{ ok: boolean; pinned?: boolean }>();
  const [pickerOpen, setPickerOpen] = useState(false);
  const [keyboardOpen, setKeyboardOpen] = useState(false);
  const [interactionError, setInteractionError] = useState("");
  const optimisticReaction = reaction.formData?.get("emoji")?.toString() ?? post.viewerReaction;
  const optimisticBookmarked = bookmark.formData ? bookmark.formData.get("enabled") === "1" : post.viewerBookmarked;
  const optimisticPinned = ownerAction.formData?.get("intent") === "pin" ? !post.pinned : post.pinned;
  const reactions = post.reactionCount + (optimisticReaction && !post.viewerReaction ? 1 : !optimisticReaction && post.viewerReaction ? -1 : 0);
  const bookmarks = post.bookmarkCount + (optimisticBookmarked && !post.viewerBookmarked ? 1 : !optimisticBookmarked && post.viewerBookmarked ? -1 : 0);

  useEffect(() => {
    const failure = reaction.data && !reaction.data.ok ? "Reaction failed. Your previous reaction is restored." : bookmark.data && !bookmark.data.ok ? "Bookmark failed. Your previous state is restored." : "";
    setInteractionError(failure);
  }, [reaction.data, bookmark.data]);
  useEffect(() => {
    if (reaction.formData) { setPickerOpen(false); setKeyboardOpen(false); }
  }, [reaction.formData]);

  async function share() {
    const url = `${window.location.origin}/post/${post.id}`;
    if (navigator.share) await navigator.share({ title: post.title || `Post by @${profile.handle}`, text: post.excerpt || post.body.slice(0, 120), url }).catch(() => undefined);
    else await navigator.clipboard.writeText(url);
  }

  function openThread(event: React.MouseEvent<HTMLElement>) {
    if (detailed || window.getSelection()?.toString() || (event.target as HTMLElement).closest("a,button,form,input,textarea,select,summary,details,[role=dialog]")) return;
    navigate(`/post/${post.id}`);
  }

  function chooseCustomEmoji(emoji: string) {
    reaction.submit({ intent: "react", emoji: optimisticReaction === emoji ? "" : emoji }, { method: "post", action: `/actions/post/${post.id}` });
    setKeyboardOpen(false);
    setPickerOpen(false);
  }

  function closeEmojiKeyboard() {
    setKeyboardOpen(false);
    setPickerOpen(false);
  }

  function handleReactionAction() {
    if (!viewer) { location.assign("/subscribe"); return; }
    if (optimisticReaction) {
      reaction.submit({ intent: "react", emoji: "" }, { method: "post", action: `/actions/post/${post.id}` });
      setPickerOpen(false);
      setKeyboardOpen(false);
      return;
    }
    queueMicrotask(() => setPickerOpen(true));
  }

  return <article data-impression-post-id={post.id} className={`post-card ${detailed ? "detailed" : "clickable"}`} onClick={openThread} onKeyDown={(event) => { if (!detailed && event.key === "Enter" && event.target === event.currentTarget) navigate(`/post/${post.id}`); }} tabIndex={detailed ? undefined : 0} aria-label={detailed ? undefined : `Open ${post.kind === "article" ? post.title || "article" : "post"} thread`}>
    {post.pinned ? <div className="pinned-label"><PushPin size={14} weight="fill" />Pinned {post.kind === "article" ? "article" : "post"}</div> : null}
    <div className="post-grid">
      <Link className="post-avatar-link" to="/about" aria-label={`View ${profile.displayName} profile`}><Avatar identity={profile} className="post-avatar" /></Link>
      <div className="post-content">
        <header className="post-author"><Link to="/about"><strong>{profile.displayName}</strong><SealCheck className="verified-dot small" size={15} weight="fill" aria-label="Verified" /><span>@{profile.handle}</span></Link><span>·</span><Link to={`/post/${post.id}`} title={dateTimeLabel(post.publishedAt)} suppressHydrationWarning>{timeAgo(post.publishedAt)}</Link>{viewer?.role === "owner" ? <details className="post-owner-menu"><summary aria-label="Post actions"><DotsThree size={20} weight="bold" /></summary><div><Link to={`/compose?edit=${post.id}`}><NotePencil size={17} />Edit post</Link><Link to={`/compose?quote=${post.id}`}><Quotes size={17} />Quote post</Link><ownerAction.Form method="post" action={`/actions/owner/post/${post.id}`}><button name="intent" value="pin"><PushPin size={17} />{optimisticPinned ? "Unpin" : "Pin to profile"}</button></ownerAction.Form><ownerAction.Form method="post" action={`/actions/owner/post/${post.id}`} onSubmit={(event) => { if (!confirm("Delete this post permanently? This also removes its replies, reactions, and bookmarks.")) event.preventDefault(); }}><button className="danger" name="intent" value="delete"><Trash size={17} />Delete post</button></ownerAction.Form></div></details> : null}</header>
        {post.kind === "article" ? <Link to={`/post/${post.id}`} className="article-preview">{post.coverKey ? <img src={`/media/${encodeURIComponent(post.coverKey)}`} alt="" loading="lazy" /> : <div className="article-cover-placeholder"><span>LONG<br />READ</span></div>}<div><span className="eyebrow">Article</span><h2>{post.title}</h2><p>{post.excerpt || post.body.slice(0, 180)}</p><small>{Math.max(1, Math.ceil(post.body.split(/\s+/).length / 220))} min read</small></div></Link> : <div className="post-body"><RichText text={post.body} /></div>}
        {post.quote ? <QuoteCard quote={post.quote} profile={profile} /> : null}
        {post.linkCard?.linkKind === "youtube" ? <div className="video-card"><iframe src={`https://www.youtube-nocookie.com/embed/${new URL(post.linkCard.url).searchParams.get("v") || post.linkCard.url.split("/").pop()}`} title={post.linkCard.title || "YouTube video"} loading="lazy" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture" allowFullScreen /></div> : post.linkCard ? <a className="inline-link-card" href={post.linkCard.url} target={post.linkCard.linkKind === "internal" ? undefined : "_blank"} rel={post.linkCard.linkKind === "internal" ? undefined : "noopener noreferrer"}>{post.linkCard.imageUrl ? <img src={post.linkCard.imageUrl} alt="" loading="lazy" referrerPolicy="no-referrer" /> : <div className="link-monogram">↗</div>}<div><small>{post.linkCard.siteName || new URL(post.linkCard.url).hostname}</small><strong>{post.linkCard.title || post.linkCard.url}</strong>{post.linkCard.description ? <p>{post.linkCard.description}</p> : null}</div></a> : null}
        {post.topics.length ? <div className="topic-row">{post.topics.map((topic) => <Link key={topic.id} to={`/topics/${topic.slug}`}>#{topic.name}</Link>)}</div> : null}
        {detailed ? <div className="post-detail-meta"><time dateTime={new Date(post.publishedAt * 1000).toISOString()}>{dateTimeLabel(post.publishedAt)}</time>{viewCount ? <><span>·</span><strong>{viewCount.toLocaleString()}</strong><span>views</span></> : null}</div> : null}
        <div className="post-actions">
          <Link to={`/post/${post.id}`} className="post-action" aria-label={`${post.replyCount} replies`}><ChatCircle size={20} /><span>{post.replyCount || ""}</span></Link>
          <div className="reaction-wrap"><button type="button" className={`post-action ${optimisticReaction ? "reacted" : ""}`} onClick={handleReactionAction} aria-label={optimisticReaction ? `Remove ${optimisticReaction} reaction` : "React to post"} aria-expanded={pickerOpen}><span className="reaction-symbol">{optimisticReaction || <Smiley size={20} />}</span><span>{reactions || ""}</span></button>{pickerOpen && !keyboardOpen ? <div className="reaction-picker" role="dialog" aria-label="Choose a reaction"><button type="button" className="picker-close" onClick={() => setPickerOpen(false)} aria-label="Close"><X size={14} /></button>{REACTIONS.map((emoji) => <reaction.Form method="post" action={`/actions/post/${post.id}`} key={emoji}><input type="hidden" name="intent" value="react" /><button name="emoji" value={emoji} aria-label={`React ${emoji}`}>{emoji}</button></reaction.Form>)}<button type="button" onClick={() => setKeyboardOpen(true)} aria-label="Open emoji keyboard"><Plus size={19} weight="bold" /></button></div> : null}{keyboardOpen ? <EmojiKeyboard onSelect={chooseCustomEmoji} onClose={closeEmojiKeyboard} /> : null}</div>
          <bookmark.Form method="post" action={`/actions/post/${post.id}`}><input type="hidden" name="intent" value="bookmark" /><input type="hidden" name="enabled" value={optimisticBookmarked ? "0" : "1"} /><button className={`post-action ${optimisticBookmarked ? "bookmarked" : ""}`} aria-label={`${optimisticBookmarked ? "Remove bookmark" : "Bookmark"}. ${bookmarks} bookmarks`} onClick={(event) => { if (!viewer) { event.preventDefault(); location.assign("/subscribe"); } }}><BookmarkSimple size={20} weight={optimisticBookmarked ? "fill" : "regular"} /><span>{bookmarks || ""}</span></button></bookmark.Form>
          <button className="post-action" onClick={share} aria-label="Share"><Export size={20} /></button>
        </div>
        {interactionError ? <p className="interaction-error" role="status">{interactionError}</p> : null}
      </div>
    </div>
  </article>;
}
