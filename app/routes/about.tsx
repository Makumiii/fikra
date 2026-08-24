import { Link, useRouteLoaderData } from "react-router";
import { EnvelopeSimple, Globe, MapPin } from "@phosphor-icons/react";
import type { loader as rootLoader } from "../root";
import { Avatar } from "../components/avatar";

export function meta({ matches }: { matches: Array<{ id: string; loaderData?: { siteUrl?: string; profile?: { displayName: string; bio: string } } }> }) { const root = matches.find((match) => match.id === "root")?.loaderData; const siteUrl = root?.siteUrl || "https://example.com"; const name = root?.profile?.displayName || "Site Owner"; const description = root?.profile?.bio || "About the author of this independent timeline."; return [{ title: `About ${name}` }, { name: "description", content: description }, { property: "og:title", content: `About ${name}` }, { property: "og:image", content: `${siteUrl}/og/home.png` }, { tagName: "link", rel: "canonical", href: `${siteUrl}/about` }]; }

export default function About() {
  const root = useRouteLoaderData<typeof rootLoader>("root");
  if (!root) return null;
  const { profile } = root;
  return <article className="about-page">
    <div className="about-banner" style={profile.bannerKey ? { backgroundImage: `url(/media/${encodeURIComponent(profile.bannerKey)})` } : undefined} role={profile.bannerKey ? "img" : undefined} aria-label={profile.bannerKey ? "Profile banner" : undefined} />
    <Avatar identity={profile} className="about-avatar" alt={profile.displayName} />
    <div className="about-identity"><h1>{profile.displayName}</h1><span>@{profile.handle}</span></div>
    <p className="about-lede">{profile.bio}</p>
    {profile.aboutIntro ? <p className="about-note">{profile.aboutIntro}</p> : null}
    <div className="about-details">{profile.location ? <span><MapPin size={19} />{profile.location}</span> : null}{root.profileLinks.map((link) => <a href={link.url} key={link.id}><Globe size={19} />{link.label}</a>)}</div>
    {profile.aboutHeading || profile.aboutBody ? <section className="about-section">{profile.aboutHeading ? <h2>{profile.aboutHeading}</h2> : null}{profile.aboutBody ? <p>{profile.aboutBody}</p> : null}</section> : null}
    {!root.viewer ? <div className="auth-choice about-cta"><a href="/subscribe" className="primary-button"><EnvelopeSimple size={18} />Subscribe</a><Link to="/login" className="soft-button">Log in</Link></div> : null}
  </article>;
}
