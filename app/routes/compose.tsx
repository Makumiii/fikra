import { env } from "cloudflare:workers";
import { Form, Link, redirect, useFetcher, useNavigation, useRouteLoaderData } from "react-router";
import { Article, ClockCounterClockwise, Image, LinkSimple, NotePencil, PushPin, Quotes, SlidersHorizontal, Tag, Trash, X, XLogo } from "@phosphor-icons/react";
import { useEffect, useRef, useState } from "react";

import type { Route } from "./+types/compose";
import type { loader as rootLoader } from "../root";
import { assertSameOrigin, requireOwner } from "../lib/auth.server";
import { getTopics } from "../lib/db.server";
import { createLinkCard, slugify } from "../lib/link-card.server";
import { emailMediaUrl, queueEmail } from "../lib/email.server";
import { fileSavings, optimizeImage, replaceInputFile } from "../lib/image.client";
import { articleText, renderMarkdown, sanitizeArticleHtml } from "../lib/markdown.server";
import { storeImageUpload } from "../lib/media.server";
import { fetchXQuote, getLocalQuote } from "../lib/quote.server";
import { canonicalXPostUrl, validPostId } from "../lib/quote";
import type { QuoteAttachment } from "../lib/models";
import { ArticleEditor } from "../components/article-editor";
import { QuoteCard } from "../components/quote-card";

export async function loader({ request }: Route.LoaderArgs) {
  await requireOwner(request);
  const url = new URL(request.url);
  const edit = url.searchParams.get("edit");
  const post = edit ? await env.DB.prepare("SELECT * FROM posts WHERE id = ?").bind(edit).first<Record<string, unknown>>() : null;
  if (edit && !post) throw new Response("Draft or post not found", { status: 404 });
  const requestedQuoteId = url.searchParams.get("quote");
  const quote = post?.quote_external_url ? {
    source: "x" as const,
    url: String(post.quote_external_url),
    authorName: post.quote_external_author ? String(post.quote_external_author) : null,
    authorUrl: post.quote_external_author_url ? String(post.quote_external_author_url) : null,
    text: post.quote_external_text ? String(post.quote_external_text) : null,
  } : (post?.quote_post_id ? await getLocalQuote(env.DB, String(post.quote_post_id)) : requestedQuoteId ? await getLocalQuote(env.DB, requestedQuoteId) : null);
  if (requestedQuoteId && !post && !quote) throw new Response("That post is no longer available to quote", { status: 404 });
  const selected = post ? (await env.DB.prepare("SELECT topic_id FROM post_topics WHERE post_id = ?").bind(post.id).all<{ topic_id: string }>()).results.map((row) => row.topic_id) : [];
  const editorContent = post && String(post.kind) === "article"
    ? String(post.body_format || "markdown") === "html" ? String(post.body || "") : renderMarkdown(String(post.body || ""))
    : "";
  const drafts = await env.DB.prepare("SELECT id,kind,title,body,updated_at FROM posts WHERE status='draft' AND kind IN ('thought','article') ORDER BY updated_at DESC LIMIT 50").all<{ id: string; kind: string; title: string | null; body: string; updated_at: number }>();
  return { topics: await getTopics(env.DB), post, quote, selected, editorContent, drafts: drafts.results, view: !edit && url.searchParams.get("view") === "drafts" ? "drafts" as const : "compose" as const, newPostId: post ? String(post.id) : crypto.randomUUID() };
}

export async function action({ request }: Route.ActionArgs) {
  assertSameOrigin(request);
  await requireOwner(request);
  const form = await request.formData();
  const requestedPostId = String(form.get("postId") || "");
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(requestedPostId)) return { ok: false as const, error: "That post ID is invalid. Reload the composer and try again." };
  if (form.get("intent") === "delete-draft") {
    const draft = await env.DB.prepare("SELECT cover_key FROM posts WHERE id=? AND status='draft'").bind(requestedPostId).first<{ cover_key: string | null }>();
    if (!draft) throw new Response("Draft not found", { status: 404 });
    await env.DB.prepare("DELETE FROM posts WHERE id=? AND status='draft'").bind(requestedPostId).run();
    if (draft.cover_key) await env.MEDIA.delete(draft.cover_key).catch((error) => console.error(JSON.stringify({ event: "orphaned_draft_cover", postId: requestedPostId, key: draft.cover_key, error: String(error) })));
    return redirect("/compose?view=drafts");
  }
  const rawBody = String(form.get("body") || "").trim();
  const title = String(form.get("title") || "").trim();
  const kind = (["thought", "article", "link"].includes(String(form.get("kind"))) ? String(form.get("kind")) : "thought") as "thought" | "article" | "link";
  const bodyFormat = kind === "article" && form.get("bodyFormat") === "html" ? "html" : "markdown";
  const body = bodyFormat === "html" ? sanitizeArticleHtml(rawBody) : rawBody;
  const bodyText = bodyFormat === "html" ? articleText(body) : body;
  const status = form.get("status") === "draft" ? "draft" : "published";
  const postId = requestedPostId;
  const quotePostId = String(form.get("quotePostId") || "").trim() || null;
  const quoteExternalInput = String(form.get("quoteExternalUrl") || "").trim() || null;
  if ((quotePostId || quoteExternalInput) && kind !== "thought") return { ok: false as const, error: "Quotes are available on thought posts." };
  if (quotePostId && quoteExternalInput) return { ok: false as const, error: "Choose one quoted post." };
  let localQuote: QuoteAttachment | null = null;
  let externalQuote: Extract<QuoteAttachment, { source: "x" }> | null = null;
  if (quotePostId) {
    if (!validPostId(quotePostId) || quotePostId === postId) return { ok: false as const, error: "That quoted post is invalid." };
    localQuote = await getLocalQuote(env.DB, quotePostId);
    if (!localQuote) return { ok: false as const, error: "That post is no longer available to quote." };
  }
  if (quoteExternalInput) {
    const canonicalUrl = canonicalXPostUrl(quoteExternalInput);
    if (!canonicalUrl) return { ok: false as const, error: "Paste a valid X post link, such as https://x.com/name/status/123." };
    try {
      externalQuote = await fetchXQuote(canonicalUrl);
    } catch (error) {
      if (status === "published") return { ok: false as const, error: error instanceof Error ? error.message : "That X post could not be loaded." };
      externalQuote = { source: "x", url: canonicalUrl, authorName: null, authorUrl: null, text: null };
    }
  }
  if (status === "draft" && kind === "link") return { ok: false as const, error: "Link posts publish directly. Save a thought or article as a draft instead." };
  if (bodyText.length > 100_000 || body.length > 500_000 || (status === "published" && !bodyText)) return { ok: false as const, error: "Published posts need a body and must stay under 100,000 characters." };
  if (kind === "article" && (title.length > 140 || (status === "published" && !title))) return { ok: false as const, error: "Published articles need a title under 140 characters." };
  const existing = await env.DB.prepare("SELECT slug,cover_key,status FROM posts WHERE id = ?").bind(postId).first<{ slug: string; cover_key: string | null; status: string }>();
  if (status === "draft" && existing?.status === "published") return { ok: false as const, error: "Published posts cannot be moved back to drafts. Publish your edits when they are ready." };
  let slug = existing?.slug || (status === "draft" ? `draft-${postId}` : slugify(title || bodyText.slice(0, 72)));
  if (!existing) {
    const collision = await env.DB.prepare("SELECT id FROM posts WHERE slug = ?").bind(slug).first();
    if (collision) slug = `${slug}-${crypto.randomUUID().slice(0, 6)}`;
  }
  let coverKey = existing?.cover_key || null;
  const cover = form.get("cover");
  if (cover instanceof File && cover.size) {
    const stored = await storeImageUpload(cover, "cover");
    if (!stored?.ok) return { ok: false as const, error: stored?.error || "The cover image could not be stored." };
    coverKey = stored.key;
  }
  const now = Math.floor(Date.now() / 1000);
  const excerpt = String(form.get("excerpt") || "").trim().slice(0, 300) || (kind === "article" ? bodyText.slice(0, 200) : "");
  const pinned = form.get("pinned") === "1" ? 1 : 0;
  const seoTitle = String(form.get("seoTitle") || "").trim() || null;
  const seoDescription = String(form.get("seoDescription") || "").trim().slice(0, 160) || null;
  const quotePostValue = localQuote?.source === "local" ? localQuote.id : null;
  const quoteExternalValue = externalQuote?.source === "x" ? externalQuote.url : null;
  const quoteAuthorValue = externalQuote?.source === "x" ? externalQuote.authorName : null;
  const quoteAuthorUrlValue = externalQuote?.source === "x" ? externalQuote.authorUrl : null;
  const quoteTextValue = externalQuote?.source === "x" ? externalQuote.text : null;
  try {
    if (existing) await env.DB.prepare(`UPDATE posts SET slug=?, kind=?, title=?, body=?, body_format=?, excerpt=?, cover_key=?, status=?, pinned=?, seo_title=?, seo_description=?, quote_post_id=?, quote_external_url=?, quote_external_author=?, quote_external_author_url=?, quote_external_text=?, published_at=CASE WHEN ?='published' THEN COALESCE(published_at, ?) ELSE published_at END, updated_at=? WHERE id=?`)
      .bind(slug, kind, title || null, body, bodyFormat, excerpt, coverKey, status, pinned, seoTitle, seoDescription, quotePostValue, quoteExternalValue, quoteAuthorValue, quoteAuthorUrlValue, quoteTextValue, status, now, now, postId).run();
    else await env.DB.prepare(`INSERT INTO posts (id, slug, kind, title, body, body_format, excerpt, cover_key, status, pinned, seo_title, seo_description, quote_post_id, quote_external_url, quote_external_author, quote_external_author_url, quote_external_text, published_at, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`).bind(postId, slug, kind, title || null, body, bodyFormat, excerpt, coverKey, status, pinned, seoTitle, seoDescription, quotePostValue, quoteExternalValue, quoteAuthorValue, quoteAuthorUrlValue, quoteTextValue, status === "published" ? now : null, now, now).run();
  } catch (error) {
    if (coverKey && coverKey !== existing?.cover_key) await env.MEDIA.delete(coverKey).catch(() => undefined);
    throw error;
  }
  if (existing?.cover_key && coverKey !== existing.cover_key) {
    await env.MEDIA.delete(existing.cover_key).catch((error) => console.error(JSON.stringify({ event: "orphaned_post_cover", postId, key: existing.cover_key, error: String(error) })));
  }
  await env.DB.prepare("DELETE FROM post_topics WHERE post_id = ?").bind(postId).run();
  for (const topicId of form.getAll("topics").map(String).slice(0, 8)) await env.DB.prepare("INSERT OR IGNORE INTO post_topics (post_id, topic_id) VALUES (?, ?)").bind(postId, topicId).run();
  const newTopic = String(form.get("newTopic") || "").trim();
  if (newTopic) {
    const topicSlug = slugify(newTopic).slice(0, 48);
    const topicId = crypto.randomUUID();
    await env.DB.prepare("INSERT INTO topics (id, slug, name, created_at, updated_at) VALUES (?, ?, ?, ?, ?) ON CONFLICT(slug) DO NOTHING").bind(topicId, topicSlug, newTopic.slice(0, 48), now, now).run();
    const topic = await env.DB.prepare("SELECT id FROM topics WHERE slug = ?").bind(topicSlug).first<{ id: string }>();
    if (topic) await env.DB.prepare("INSERT OR IGNORE INTO post_topics (post_id, topic_id) VALUES (?, ?)").bind(postId, topic.id).run();
  }
  await env.DB.prepare("DELETE FROM link_cards WHERE post_id = ?").bind(postId).run();
  await createLinkCard(postId, body);
  if (status === "published") {
    const [ownerProfile, topicRows] = await Promise.all([
      env.DB.prepare("SELECT display_name,handle,avatar_key FROM profile WHERE id=1").first<{ display_name: string; handle: string; avatar_key: string | null }>(),
      env.DB.prepare("SELECT t.name FROM post_topics pt JOIN topics t ON t.id=pt.topic_id WHERE pt.post_id=? ORDER BY t.name").bind(postId).all<{ name: string }>(),
    ]);
    const emailTopics = topicRows.results.map((topic) => topic.name);
    const emailBody = bodyText.slice(0, kind === "article" ? 300 : 1500);
    const postUrl = `${env.SITE_URL}/post/${postId}`;
    const actorName = String(ownerProfile?.display_name || "Site Owner");
    const actorHandle = String(ownerProfile?.handle || "owner");
    const actorAvatarUrl = emailMediaUrl(env.SITE_URL, ownerProfile?.avatar_key);
    const coverUrl = emailMediaUrl(env.SITE_URL, coverKey);
    const mentionHandles = [...new Set(bodyText.match(/@[a-zA-Z0-9_]{3,24}/g)?.map((item) => item.slice(1).toLowerCase()) || [])].slice(0, 20);
    for (const handle of mentionHandles) {
      const user = await env.DB.prepare("SELECT id,email,notify_mentions FROM users WHERE handle=? AND status='active'").bind(handle).first<{id:string;email:string;notify_mentions:number}>();
      if (user) {
        await env.DB.prepare("INSERT INTO notifications (id,user_id,type,post_id,message,created_at) VALUES (?,?,'mention',?,?,?)").bind(crypto.randomUUID(),user.id,postId,`@${actorHandle} mentioned @${handle}`,now).run();
        if (user.notify_mentions) await queueEmail({userId:user.id,email:user.email,template:"activity",idempotencyKey:`post-mention:${postId}:${user.id}`,data:{activity:"mention",actorName,actorHandle,actorAvatarUrl,quote:bodyText.slice(0,1000),url:postUrl}});
      }
    }
    if (existing?.status !== "published") {
      const subscribers = await env.DB.prepare(`SELECT DISTINCT u.id,u.email,u.handle FROM users u WHERE u.status='active' AND u.notify_new_posts=1 AND u.digest_frequency='instant' AND u.id NOT IN (SELECT id FROM users WHERE role='owner') AND (u.topics_only=0 OR EXISTS (SELECT 1 FROM user_topics ut JOIN post_topics pt ON pt.topic_id=ut.topic_id WHERE ut.user_id=u.id AND pt.post_id=?))`).bind(postId).all<{id:string;email:string;handle:string}>();
      for (const subscriber of subscribers.results) {
        await env.DB.prepare("INSERT INTO notifications (id,user_id,type,post_id,message,created_at) VALUES (?,?,'new_post',?,?,?)").bind(crypto.randomUUID(),subscriber.id,postId,title||bodyText.slice(0,80),now).run();
        await queueEmail({userId:subscriber.id,email:subscriber.email,template:"new-post",idempotencyKey:`new-post:${postId}:${subscriber.id}`,data:{kind,title:title||undefined,body:emailBody,excerpt:excerpt||undefined,url:postUrl,coverUrl,topics:emailTopics}});
      }
    }
  }
  return redirect(status === "published" ? `/post/${postId}` : `/compose?view=drafts&saved=${postId}`);
}

export default function Compose(props: Route.ComponentProps) {
  return props.loaderData.view === "drafts" ? <Drafts {...props} /> : <ComposeEditor {...props} />;
}

function Drafts({ loaderData }: Route.ComponentProps) {
  return <div className="compose-page"><header className="sticky-page-header"><ClockCounterClockwise size={21} /><div><strong>Drafts</strong><small>{loaderData.drafts.length ? `${loaderData.drafts.length} saved` : "Nothing waiting"}</small></div></header><div className="composer draft-workspace">
    <div className="kind-switch compose-tabs" role="navigation" aria-label="Compose format"><Link to="/compose"><NotePencil size={17} />Thought</Link><Link to="/compose"><Article size={17} />Article</Link><Link to="/compose"><LinkSimple size={17} />Link</Link><Link to="/compose?view=drafts" className="active" aria-current="page"><ClockCounterClockwise size={17} />Drafts</Link></div>
    {loaderData.drafts.length ? <div className="draft-list">{loaderData.drafts.map((draft) => <article className="draft-row" key={draft.id}><Link to={`/compose?edit=${draft.id}`}><small>{draft.kind} · edited {new Date(draft.updated_at * 1000).toLocaleDateString("en", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" })}</small><strong>{draft.title || draft.body.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim().slice(0, 100) || "Untitled draft"}</strong></Link><Form method="post" onSubmit={(event) => { if (!confirm("Delete this draft permanently?")) event.preventDefault(); }}><input type="hidden" name="postId" value={draft.id} /><button className="draft-delete" name="intent" value="delete-draft" aria-label={`Delete ${draft.title || "draft"}`}><Trash size={18} /></button></Form></article>)}</div> : <div className="empty-state draft-empty"><h2>No drafts yet.</h2><p>Save a thought or article before publishing and it will wait here.</p><Link className="primary-button" to="/compose">Write a post</Link></div>}
  </div></div>;
}

function ComposeEditor({ loaderData, actionData }: Route.ComponentProps) {
  const navigation = useNavigation(); const post = loaderData.post;
  const root = useRouteLoaderData<typeof rootLoader>("root");
  const quotePreview = useFetcher<{ ok: boolean; quote?: QuoteAttachment; error?: string }>();
  const initialKind = post?.kind === "article" || post?.kind === "link" ? post.kind : "thought";
  const [kind, setKind] = useState<"thought" | "article" | "link">(initialKind);
  const [body, setBody] = useState(post?.kind === "article" ? "" : String(post?.body || ""));
  const [articleBody, setArticleBody] = useState(loaderData.editorContent);
  const [openPanel, setOpenPanel] = useState<"topics" | "more" | "quote" | null>(null);
  const [quote, setQuote] = useState<QuoteAttachment | null>(loaderData.quote || null);
  const [quoteUrl, setQuoteUrl] = useState(loaderData.quote?.source === "x" ? loaderData.quote.url : "");
  const existingCover = post?.cover_key ? `/media/${encodeURIComponent(String(post.cover_key))}` : "";
  const coverInput = useRef<HTMLInputElement>(null);
  const temporaryCoverUrl = useRef<string | null>(null);
  const [coverName, setCoverName] = useState(post?.cover_key ? "Current cover" : "");
  const [coverPreview, setCoverPreview] = useState(existingCover);
  const [hasNewCover, setHasNewCover] = useState(false);
  const [coverStatus, setCoverStatus] = useState("");
  const [clientError, setClientError] = useState("");
  const [preparingCover, setPreparingCover] = useState(false);
  const [selectedTopicCount, setSelectedTopicCount] = useState(loaderData.selected.length);
  useEffect(() => () => { if (temporaryCoverUrl.current) URL.revokeObjectURL(temporaryCoverUrl.current); }, []);
  useEffect(() => {
    if (!quotePreview.data) return;
    if (quotePreview.data.ok && quotePreview.data.quote) {
      setQuote(quotePreview.data.quote);
      setClientError("");
    } else if (quotePreview.data.error) setClientError(quotePreview.data.error);
  }, [quotePreview.data]);
  async function selectCover(input: HTMLInputElement, file?: File) {
    if (!file) return;
    setClientError("");
    setPreparingCover(true);
    try {
      const optimized = await optimizeImage(file, { maxWidth: 1600, maxHeight: 1200, quality: 0.84 });
      replaceInputFile(input, optimized);
      if (temporaryCoverUrl.current) URL.revokeObjectURL(temporaryCoverUrl.current);
      temporaryCoverUrl.current = URL.createObjectURL(optimized);
      setCoverName(optimized.name);
      setCoverStatus(fileSavings(file.size, optimized.size));
      setCoverPreview(temporaryCoverUrl.current);
      setHasNewCover(true);
    } catch (error) {
      input.value = "";
      setClientError(error instanceof Error ? error.message : "The image could not be prepared.");
    } finally { setPreparingCover(false); }
  }
  function clearSelectedCover() {
    if (coverInput.current) coverInput.current.value = "";
    if (temporaryCoverUrl.current) URL.revokeObjectURL(temporaryCoverUrl.current);
    temporaryCoverUrl.current = null;
    setCoverName(existingCover ? "Current cover" : "");
    setCoverPreview(existingCover);
    setHasNewCover(false);
    setCoverStatus("");
  }
  function validateCompose(event: React.FormEvent<HTMLFormElement>) {
    const form = new FormData(event.currentTarget);
    const submitter = (event.nativeEvent as SubmitEvent).submitter as HTMLButtonElement | null;
    const savingDraft = submitter?.value === "draft";
    const submittedBody = String(form.get("body") || "").trim();
    const submittedText = kind === "article" ? submittedBody.replace(/<[^>]+>/g, " ").replace(/&nbsp;/gi, " ").replace(/\s+/g, " ").trim() : submittedBody;
    const title = String(form.get("title") || "").trim();
    const submittedQuotePost = String(form.get("quotePostId") || "").trim();
    const submittedQuoteUrl = String(form.get("quoteExternalUrl") || "").trim();
    if (savingDraft && kind === "link") { event.preventDefault(); setClientError("Link posts publish directly."); }
    else if (kind !== "thought" && (submittedQuotePost || submittedQuoteUrl)) { event.preventDefault(); setClientError("Quotes are available on thought posts."); }
    else if (submittedQuoteUrl && !canonicalXPostUrl(submittedQuoteUrl)) { event.preventDefault(); setClientError("Paste a valid X post link, such as https://x.com/name/status/123."); }
    else if (submittedQuoteUrl && quote?.source !== "x") { event.preventDefault(); setClientError("Preview the X post before publishing."); }
    else if (!savingDraft && !submittedText) { event.preventDefault(); setClientError("Write something before publishing."); }
    else if (submittedText.length > 100_000) { event.preventDefault(); setClientError("Keep the article under 100,000 characters."); }
    else if (!savingDraft && kind === "article" && !title) { event.preventDefault(); setClientError("Articles need a title."); }
    else if (preparingCover) { event.preventDefault(); setClientError("Wait a moment while the image is prepared."); }
  }
  function changeKind(next: "thought" | "article" | "link") {
    setKind(next);
    setClientError("");
    if (next !== "thought" && quote) {
      setQuote(null);
      setQuoteUrl("");
      setOpenPanel(null);
    }
  }
  function previewXPost() {
    const value = quoteUrl.trim();
    if (!value) { setClientError("Paste an X post link first."); return; }
    setClientError("");
    quotePreview.submit({ url: value }, { method: "post", action: "/api/quote-preview" });
  }
  function removeQuote() {
    setQuote(null);
    setQuoteUrl("");
    setClientError("");
  }
  if (!root) return null;
  return <div className="compose-page"><header className="sticky-page-header"><NotePencil size={21} /><div><strong>{post ? post.status === "draft" ? "Edit draft" : "Edit post" : "Post"}</strong><small>Owner controls</small></div></header><Form method="post" encType="multipart/form-data" className="composer" onSubmit={validateCompose}>
    <input type="hidden" name="postId" value={loaderData.newPostId} />
    <input type="hidden" name="quotePostId" value={quote?.source === "local" ? quote.id : ""} />
    <input type="hidden" name="quoteExternalUrl" value={quote?.source === "x" ? quote.url : ""} />
    <fieldset className="kind-switch compose-tabs"><legend>Format</legend>{[["thought", NotePencil, "Thought"], ["article", Article, "Article"], ["link", LinkSimple, "Link"]].map(([value, Icon, label]) => <label key={String(value)}><input type="radio" name="kind" value={String(value)} checked={kind === value} onChange={() => changeKind(value as "thought" | "article" | "link")} /><span><Icon size={17} />{String(label)}</span></label>)}<Link to="/compose?view=drafts"><ClockCounterClockwise size={17} />Drafts{loaderData.drafts.length ? <b>{loaderData.drafts.length}</b> : null}</Link></fieldset>
    <label className="field article-title"><span>Title</span><input name="title" defaultValue={post?.title ? String(post.title) : ""} maxLength={140} placeholder="Article title" /></label>
    {kind === "article" ? <><input type="hidden" name="bodyFormat" value="html" /><input type="hidden" name="body" value={articleBody} readOnly /><ArticleEditor initialContent={loaderData.editorContent} onChange={setArticleBody} /></> : <><input type="hidden" name="bodyFormat" value="markdown" /><label className="field body-field"><span className="sr-only">Post</span><textarea name="body" value={body} onChange={(event) => setBody(event.currentTarget.value)} rows={10} maxLength={100000} placeholder="What is happening? On your own website, this time." /><small>Markdown supported · links become rich previews</small></label></>}
    {quote ? <div className="quote-attachment"><div><span className="eyebrow">{quote.source === "x" ? "Quoting an X post" : "Quoting your post"}</span><QuoteCard quote={quote} profile={root.profile} preview /></div><button type="button" className="quote-remove" onClick={removeQuote} aria-label="Remove quote"><X size={17} /></button></div> : null}
    <div className="composer-toolbar" role="toolbar" aria-label="Post options">
      <label className={`composer-tool upload-tool${coverName ? " active" : ""}`}><Image size={19} /><span>{coverName ? "Image added" : "Image"}</span><input ref={coverInput} type="file" name="cover" accept="image/jpeg,image/png,image/webp,image/avif" onChange={(event) => void selectCover(event.currentTarget, event.currentTarget.files?.[0])} /></label>
      {kind === "thought" ? <button type="button" className={`composer-tool${openPanel === "quote" || quote?.source === "x" ? " active" : ""}`} aria-expanded={openPanel === "quote"} aria-controls="quote-options" onClick={() => setOpenPanel((current) => current === "quote" ? null : "quote")}><XLogo size={18} /><span>Quote X post</span></button> : null}
      <button type="button" className={`composer-tool${openPanel === "topics" || selectedTopicCount ? " active" : ""}`} aria-expanded={openPanel === "topics"} aria-controls="topic-options" onClick={() => setOpenPanel((current) => current === "topics" ? null : "topics")}><Tag size={19} /><span>Topics{selectedTopicCount ? ` ${selectedTopicCount}` : ""}</span></button>
      <label className="composer-tool pin-tool"><input type="checkbox" name="pinned" value="1" defaultChecked={Boolean(post?.pinned)} /><PushPin size={19} /><span>Pin</span></label>
      <button type="button" className={`composer-tool${openPanel === "more" ? " active" : ""}`} aria-expanded={openPanel === "more"} aria-controls="advanced-options" onClick={() => setOpenPanel((current) => current === "more" ? null : "more")}><SlidersHorizontal size={19} /><span>More</span></button>
    </div>
    {coverPreview ? <div className="cover-preview" aria-live="polite"><img src={coverPreview} alt="Selected cover preview" /><span><strong>{coverName}</strong><small>{hasNewCover ? coverStatus || "Ready to upload" : "Published cover"}</small></span>{hasNewCover ? <button type="button" onClick={clearSelectedCover} aria-label="Remove selected cover"><X size={17} /></button> : null}</div> : null}
    <div className="composer-tray quote-tray" id="quote-options" hidden={openPanel !== "quote"}><label className="field"><span>Quote an X post <small>paste a public x.com/status link</small></span><div className="quote-url-row"><input value={quoteUrl} onChange={(event) => { setQuoteUrl(event.currentTarget.value); if (quote?.source === "x" && event.currentTarget.value.trim() !== quote.url) setQuote(null); }} onKeyDown={(event) => { if (event.key === "Enter") { event.preventDefault(); previewXPost(); } }} placeholder="https://x.com/name/status/…" inputMode="url" /><button type="button" className="soft-button" onClick={previewXPost} disabled={quotePreview.state !== "idle"}>{quotePreview.state !== "idle" ? "Checking…" : "Preview"}</button></div></label>{quotePreview.data?.ok && quote?.source === "x" ? <small className="quote-ready"><Quotes size={14} />Ready to quote. Add your thought above.</small> : null}</div>
    <div className="composer-tray" id="topic-options" hidden={openPanel !== "topics"}><fieldset className="topic-picker"><legend>Choose topics</legend>{loaderData.topics.map((topic) => <label key={topic.id}><input type="checkbox" name="topics" value={topic.id} defaultChecked={loaderData.selected.includes(topic.id)} onChange={(event) => setSelectedTopicCount((count) => Math.max(0, count + (event.currentTarget.checked ? 1 : -1)))} /><span>#{topic.name}</span></label>)}<label className="new-topic"><span className="sr-only">New topic</span><input name="newTopic" placeholder="Add topic" /></label></fieldset></div>
    <div className="composer-tray advanced-options" id="advanced-options" hidden={openPanel !== "more"}>
      <label className="field"><span>Excerpt <small>optional</small></span><textarea name="excerpt" defaultValue={post?.excerpt ? String(post.excerpt) : ""} rows={2} maxLength={300} placeholder="Summary for cards and search" /></label>
      <label className="field"><span>Search title <small>optional</small></span><input name="seoTitle" defaultValue={post?.seo_title ? String(post.seo_title) : ""} maxLength={70} placeholder="Uses the post title by default" /></label>
      <label className="field"><span>Search description <small>optional</small></span><textarea name="seoDescription" defaultValue={post?.seo_description ? String(post.seo_description) : ""} maxLength={160} rows={2} placeholder="Uses the excerpt by default" /></label>
    </div>
    {clientError || actionData?.error ? <p className="form-error" role="alert">{clientError || actionData?.error}</p> : null}
    <div className="composer-actions">{kind !== "link" && post?.status !== "published" ? <button className="soft-button" name="status" value="draft" disabled={navigation.state !== "idle" || preparingCover}>{post ? "Update draft" : "Save draft"}</button> : null}<button className="primary-button" name="status" value="published" disabled={navigation.state !== "idle" || preparingCover}>{preparingCover ? "Preparing image…" : navigation.state !== "idle" ? "Publishing…" : post?.status === "published" ? "Update" : "Publish"}</button></div>
  </Form></div>;
}
