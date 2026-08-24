# Architecture

One Cloudflare Worker runs the React Router SSR application and consumes email Queue messages. D1 holds application, Better Auth, search, notification, and analytics data. Private R2 objects are served through validated application routes. The Queue isolates request latency from SMTP delivery and retries transient failures.

## Trust boundaries

- Published content and the configured profile are public.
- Subscriber sessions use opaque, secure, HTTP-only cookies managed by Better Auth.
- Owner elevation occurs only after a verified email exactly matches the `OWNER_EMAIL` Worker secret.
- Every owner mutation checks the database role server-side. Conditional UI is convenience, never authorization.
- Email addresses, session values, magic tokens, and analytics tokens are not returned by public loaders or logs.
- An unconfigured installation exposes only setup/auth/media necessities, returns `noindex`, and rejects other mutations.

## Content and discovery

Thoughts, articles, links, and quotes use immutable post IDs in canonical URLs. D1 FTS5 indexes published text. Topics, sitemap, RSS, JSON-LD, canonical metadata, and generated Open Graph images expose only published content.

## Qualified impressions

The browser records an impression after at least 50% of a post remains visible for one second. A first-party, HTTP-only analytics session lasts 30 minutes. D1's unique `(post_id, session_id)` constraint prevents refreshes and repeated scrolling from inflating the count; detail opens are tracked separately. Bots, prefetches, malformed payloads, and cross-origin requests are rejected. No IP address or user-agent is retained.

## Email and scheduling

React Email renders transactional templates. The producer writes an idempotent delivery record before queueing. The consumer records attempts and either stores local outbox delivery or sends SMTP. A delayed Queue heartbeat drives digests without request-path work.

## Recovery

Numbered D1 migrations are forward-only. D1 Time Travel bookmarks provide fast rollback within Cloudflare's retention window; a table-scoped logical export avoids FTS virtual-table export limitations. R2 objects need a separate inventory/copy policy. See [operations.md](operations.md).
