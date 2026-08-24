import { Link } from "react-router";
import { ArrowSquareOut, Quotes, SealCheck, XLogo } from "@phosphor-icons/react";

import type { Profile, QuoteAttachment } from "../lib/models";
import { Avatar } from "./avatar";

function quoteTime(timestamp: number) {
  if (!timestamp) return "";
  return new Intl.DateTimeFormat("en", { dateStyle: "medium", timeZone: "UTC" }).format(new Date(timestamp * 1000));
}
export function QuoteCard({ quote, profile, preview = false }: { quote: QuoteAttachment; profile: Profile; preview?: boolean }) {
  if (quote.source === "x") return <a className="quote-card quote-x" href={quote.url} target="_blank" rel="noopener noreferrer" aria-label="Open quoted X post">
    <header className="quote-card-header"><span className="quote-source-icon"><XLogo size={17} weight="bold" /></span><span><strong>{quote.authorName || "Post on X"}</strong><small>{quote.authorName ? "X post" : "View on X"}</small></span><ArrowSquareOut size={17} /></header>
    <p>{quote.text || "Open this post on X to read the original."}</p>
    <small className="quote-external-url">{quote.url.replace(/^https:\/\//, "")}</small>
  </a>;

  if (quote.unavailable) return <div className="quote-card quote-unavailable"><Quotes size={18} /><span><strong>Original post unavailable</strong><small>This quote’s source was deleted or is no longer public.</small></span></div>;

  const content = <>
    <header className="quote-card-header"><Avatar identity={profile} className="quote-avatar" /><span><strong>{profile.displayName}</strong><SealCheck className="verified-dot small" size={14} weight="fill" aria-label="Verified" /><small>@{profile.handle}{quote.publishedAt ? ` · ${quoteTime(quote.publishedAt)}` : ""}</small></span><Quotes size={17} /></header>
    {quote.kind === "article" ? <div className="quote-local-article">{quote.coverKey ? <img src={`/media/${encodeURIComponent(quote.coverKey)}`} alt="" loading="lazy" /> : null}<span className="eyebrow">Article</span><strong>{quote.title || "Untitled article"}</strong><small>{quote.excerpt || quote.body.slice(0, 160)}</small></div> : <p>{quote.body}</p>}
  </>;

  return preview ? <div className="quote-card quote-local">{content}</div> : <Link className="quote-card quote-local" to={`/post/${quote.id}`} aria-label="Open quoted post">{content}</Link>;
}
