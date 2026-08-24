# Operations and recovery

## Back up D1

```sh
npm run backup:remote
```

This writes a Time Travel bookmark and a logical SQL export under ignored `backups/`, both mode `0600`. Copy backups to encrypted storage outside the checkout.

## Restore D1

For recent incidents, restore the exact pre-deploy bookmark:

```sh
npx wrangler d1 time-travel restore DB --bookmark BOOKMARK --config wrangler.deploy.jsonc
```

For disaster recovery into a new database, create D1, point a temporary config at it, apply migrations, then import the logical data export. Test this on a disposable database before changing production. FTS is rebuildable from published posts and should not be treated as primary data.

## R2

D1 backups do not contain media. Enable object versioning/lifecycle appropriate to your account and periodically copy the bucket to separate storage with `wrangler r2 object` tooling or an S3-compatible client. Keep an inventory and restore R2 keys before reopening a recovered database.

## Queue and email

Inspect failed deliveries and the dead-letter Queue after SMTP incidents. Delivery records are idempotent; do not blindly replay messages without checking status. Rotate SMTP and Better Auth secrets after suspected exposure; existing sessions should be invalidated when the authentication secret changes.

## Routine checks

- Worker error rate and latency
- Queue backlog and dead letters
- D1 size, migration state, and recent backup readability
- R2 storage growth
- SPF/DKIM/DMARC alignment and SMTP reputation
- Magic-link, publish, reply, reaction, bookmark, and unsubscribe happy paths
