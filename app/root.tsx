import {
  isRouteErrorResponse, Links, Meta, NavLink, Outlet, Scripts, ScrollRestoration,
  useLocation, useNavigation,
} from "react-router";
import { env } from "cloudflare:workers";
import {
  Bell, BookmarkSimple, ChartLineUp, EnvelopeSimple, Hash, House,
  MagnifyingGlass, NotePencil, SignIn, UserCircle,
} from "@phosphor-icons/react";

import type { Route } from "./+types/root";
import { currentViewer } from "./lib/auth.server";
import { getProfile, getProfileLinks, getSubscriberCount } from "./lib/db.server";
import "./app.css";
import { Avatar } from "./components/avatar";
import { getSiteSettings } from "./lib/site.server";
import { QualifiedImpressions } from "./components/qualified-impressions";

export const links: Route.LinksFunction = () => [
  { rel: "icon", href: "/favicon" },
];

export function meta({ loaderData }: Route.MetaArgs) {
  if (!loaderData?.site.configured) return [{ title: "Set up Fikra" }, { name: "robots", content: "noindex,nofollow" }];
  return [{ name: "application-name", content: loaderData.site.siteName }];
}

export async function loader({ request }: Route.LoaderArgs) {
  const [viewer, profile, profileLinks, subscriberCount, site] = await Promise.all([
    currentViewer(request), getProfile(env.DB), getProfileLinks(env.DB), getSubscriberCount(env.DB), getSiteSettings(env.DB),
  ]);
  let unreadCount = 0;
  if (viewer) {
    const row = await env.DB.prepare("SELECT COUNT(*) AS count FROM notifications WHERE user_id = ? AND read_at IS NULL")
      .bind(viewer.id).first<{ count: number }>();
    unreadCount = Number(row?.count || 0);
  }
  return { viewer, profile, profileLinks, subscriberCount, unreadCount, siteUrl: env.SITE_URL, site };
}

export function Layout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head>
        <meta charSet="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover" />
        <meta name="theme-color" content="#f7f7f4" media="(prefers-color-scheme: light)" />
        <meta name="theme-color" content="#0c0d0e" media="(prefers-color-scheme: dark)" />
        <Meta /><Links />
      </head>
      <body>{children}<ScrollRestoration /><Scripts /></body>
    </html>
  );
}

const NAV = [
  ["/", "Home", House], ["/search", "Search", MagnifyingGlass], ["/topics", "Topics", Hash],
  ["/notifications", "Notifications", Bell], ["/bookmarks", "Bookmarks", BookmarkSimple],
] as const;

export default function App({ loaderData }: Route.ComponentProps) {
  const navigation = useNavigation();
  const location = useLocation();
  const { viewer, unreadCount } = loaderData;
  if (!loaderData.site.configured) {
    if (location.pathname === "/setup" || location.pathname.startsWith("/auth/") || location.pathname.startsWith("/api/auth/")) return <Outlet />;
    return <main className="setup-gate"><div className="setup-brand"><span>F</span><strong>Fikra</strong></div><h1>This site is being set up.</h1><p>The owner has not published its identity yet.</p><NavLink className="primary-button" to="/setup">Continue setup</NavLink></main>;
  }
  return (
    <div className="app-shell">
      <a className="skip-link" href="#main-content">Skip to content</a>
      <aside className="left-rail" aria-label="Primary navigation">
        <NavLink to="/" className="brand-mark" aria-label={loaderData.site.siteName}><Avatar identity={loaderData.profile} className="rail-avatar" alt="" /><span className="brand-status" aria-hidden="true">•</span></NavLink>
        <nav className="primary-nav">
          {NAV.map(([to, label, Icon]) => (
            <NavLink key={to} to={to} end={to === "/"} className={({ isActive }) => `nav-item ${isActive ? "active" : ""}`}>
              <span className="nav-icon"><Icon size={25} weight="regular" />{label === "Notifications" && unreadCount > 0 ? <i>{Math.min(unreadCount, 9)}</i> : null}</span>
              <span>{label}</span>
            </NavLink>
          ))}
          <NavLink to="/about" className={({ isActive }) => `nav-item ${isActive ? "active" : ""}`}><UserCircle size={25} /><span>About</span></NavLink>
          {viewer?.role === "owner" ? <>
            <NavLink to="/owner" className={({ isActive }) => `nav-item owner-only ${isActive ? "active" : ""}`}><ChartLineUp size={25} /><span>Studio</span></NavLink>
          </> : null}
        </nav>
        {viewer?.role === "owner" ? <NavLink to="/compose" className="primary-button rail-compose"><NotePencil size={20} weight="bold" /><span>Post</span></NavLink> :
          <>
            <NavLink to="/subscribe" className="primary-button rail-compose"><EnvelopeSimple size={20} weight="bold" /><span>{viewer ? `@${viewer.handle}` : "Subscribe"}</span></NavLink>
            {!viewer ? <NavLink to="/login" className="rail-login"><SignIn size={19} /><span>Log in</span></NavLink> : null}
          </>}
        {viewer ? <NavLink to="/settings" className="account-chip"><Avatar identity={viewer} className="tiny" /><span><strong>{viewer.displayName}</strong><small>@{viewer.handle}</small></span></NavLink> : null}
      </aside>

      <main id="main-content" className="content-column">
        {navigation.location ? <div className="route-progress" aria-label="Loading" /> : null}
        <QualifiedImpressions />
        <Outlet />
      </main>

      <aside className="right-rail">
        <section className="rail-card">
          <span className="eyebrow">Independent timeline</span>
          <h2>Posts without the algorithm doing cardio.</h2>
          <p>Short thoughts, proper articles, and the occasional link worth keeping.</p>
          {!viewer ? <div className="rail-auth-actions"><NavLink className="primary-button" to="/subscribe">Subscribe</NavLink><NavLink className="soft-button" to="/login">Log in</NavLink></div> : <NavLink className="soft-button" to="/settings">Email preferences</NavLink>}
        </section>
        <footer className="rail-footer"><NavLink to="/about">About</NavLink><a href="/rss.xml">RSS</a><a href="/sitemap.xml">Sitemap</a><span>© {new Date().getFullYear()} {loaderData.profile.displayName}</span></footer>
      </aside>

      <nav className="mobile-nav" aria-label="Mobile navigation">
        {NAV.slice(0, 4).map(([to, label, Icon]) => <NavLink key={to} to={to} end={to === "/"} aria-label={label}><Icon size={24} /><span>{label}</span></NavLink>)}
        <NavLink to={viewer?.role === "owner" ? "/compose" : viewer ? "/settings" : "/subscribe"} aria-label={viewer?.role === "owner" ? "Compose" : "Profile"}>{viewer?.role === "owner" ? <NotePencil size={24} /> : <UserCircle size={24} />}<span>{viewer?.role === "owner" ? "Post" : "You"}</span></NavLink>
      </nav>
    </div>
  );
}

export function ErrorBoundary({ error }: Route.ErrorBoundaryProps) {
  let title = "That bit fell over";
  let detail = "Something unexpected happened. A refresh usually persuades it.";
  if (isRouteErrorResponse(error)) {
    title = error.status === 404 ? "Nothing lives here" : `Error ${error.status}`;
    detail = error.status === 404 ? "This link wandered off, or perhaps never existed." : error.statusText || detail;
  }
  return <main className="error-page"><div className="avatar large">F</div><h1>{title}</h1><p>{detail}</p><a className="primary-button" href="/">Back to the timeline</a></main>;
}
