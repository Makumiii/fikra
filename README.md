# Fikra

Fikra is a production-shaped, single-author social blog for Cloudflare. It combines a fast personal timeline with long-form articles, email subscriptions, passwordless reader identities, conversations, emoji reactions, bookmarks, topics, search, rich link cards, and owner analytics.

Reading is public. Subscribers get a handle and magic-link login. The configured owner publishes and moderates from the same interface; authorization is always enforced on the server.

## What you get

- Thoughts, rich-link posts, quoted posts, YouTube embeds, and Tiptap articles
- Editable profile, about page, image uploads, and DiceBear avatars/banners
- D1-backed full-text search, drafts, topics, reactions, replies, bookmarks, and notifications
- React Email templates delivered through a Cloudflare Queue and SMTP
- Per-post SEO metadata, sitemap, RSS, JSON-LD, and generated Open Graph images
- Qualified, session-deduplicated impressions instead of raw page-hit counters
- A first-run `/setup` wizard with generic defaults and no personal branding in source

## Stack

React 19, React Router 8 Framework Mode, Cloudflare Workers, D1, private R2, Cloudflare Queues, Better Auth, React Email, Tiptap, Playwright, and Cloudflare's Vitest pool.

## Run locally

Requirements: Node.js 22 or newer and npm.

```sh
git clone https://github.com/Makumiii/fikra.git
cd fikra
npm install
cp .dev.vars.example .dev.vars
npm run setup:local
npm run dev
```

Open `http://localhost:5173/setup`. For local email, `EMAIL_TRANSPORT=outbox` stores magic links in D1 instead of sending them. Inspect the latest link with:

```sh
npx wrangler d1 execute fikra-local --local --command "SELECT recipient_email,payload_json FROM email_deliveries ORDER BY created_at DESC LIMIT 1"
```

Set `OWNER_EMAIL` in `.dev.vars` to the address you will use. Owner status is assigned only after that exact email is verified.

## Deploy to Cloudflare

Authenticate Wrangler, then let the setup command create isolated D1, R2, Queue, and dead-letter Queue resources:

```sh
npx wrangler login
npm run setup:cloudflare
npm run deploy
```

The generated `wrangler.deploy.jsonc` contains resource identifiers and is deliberately ignored. Secrets are sent to Wrangler through a mode-`0600` temporary file, never command arguments. Visit `https://your-domain.example/setup` after deployment.

For a custom domain, add a Worker custom domain in Cloudflare or add a `routes` entry to your private deployment config. Set `SITE_URL` to the final HTTPS origin before requesting magic links.

### Email

Outbox mode is suitable only for development. For production, configure an SMTP provider (Brevo works with port 587/STARTTLS) when prompted by `setup:cloudflare`, or set these Wrangler secrets later:

`SMTP_HOST`, `SMTP_PORT`, `SMTP_USERNAME`, `SMTP_PASSWORD`, `SMTP_FROM_EMAIL`, and `SMTP_FROM_NAME`.

Publish the provider's SPF and DKIM records and add a DMARC policy for your sending domain. Never commit `.dev.vars`, `.env`, or `wrangler.deploy.jsonc`.

## Validate changes

```sh
npm run check
npm run test:e2e
```

`check` runs generated Cloudflare types, TypeScript, lint, backend integration tests against real D1 migrations, and a production build. Playwright covers public responsive UI, discovery metadata, authorization boundaries, magic-link login, reactions, and bookmarks.

## Operations and upgrades

Before deploys, `npm run deploy` records a D1 Time Travel bookmark. Create a logical backup explicitly with `npm run backup:remote`. Backups are written under ignored `backups/` with restrictive permissions.

Pull upgrades into a branch, run `npm ci && npm run check && npm run test:e2e`, back up D1, then deploy. Numbered migrations are forward-only. See [deployment](docs/deployment.md), [operations](docs/operations.md), [customization](docs/customization.md), and [architecture](docs/architecture.md).

## Contributing and security

Start work from `develop`; stable releases land on protected `main`. Read [CONTRIBUTING.md](CONTRIBUTING.md). Report vulnerabilities privately as described in [SECURITY.md](SECURITY.md).

MIT licensed.
