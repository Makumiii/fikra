# Deployment

## New installation

1. Install dependencies and authenticate with `npx wrangler login`.
2. Run `npm run setup:cloudflare` and enter a unique resource prefix, final HTTPS URL, and owner email.
3. Configure SMTP when prompted, or remain in outbox mode only while testing.
4. Run `npm run deploy`.
5. Attach the hostname as a Worker custom domain and ensure `SITE_URL` exactly matches it.
6. Open `/setup`, verify the owner email, and complete the profile.

The provisioning script creates separate D1, R2, email Queue, and dead-letter Queue resources. It writes `wrangler.deploy.jsonc`, which must stay private and ignored.

## Custom domain and mail DNS

Use a Cloudflare Worker custom domain rather than a redirect. Configure the SMTP provider's DKIM and SPF records on the sending domain and publish DMARC. Test that magic links use the final hostname before inviting readers.

## Release procedure

```sh
npm ci
npm run check
npm run test:e2e
npm run backup:remote
npm run deploy
```

`deploy` applies migrations before deploying the Worker. Do not connect preview or staging environments to production bindings. CI validates source but intentionally does not deploy.

## Rollback

Worker versions can be rolled back from Cloudflare. If a schema migration must also be reversed, use the pre-deploy Time Travel bookmark from `backups/` and follow [operations.md](operations.md). Restore data only after stopping writes or taking the site offline.
