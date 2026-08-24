# Customization

The first-run `/setup` wizard sets the public site name, description, owner display name, handle, bio, locale, timezone, avatar, and banner. The owner can later edit profile and about-page fields in the application.

Design tokens and responsive layout live in `app/app.css`. Keep route behavior and authorization independent from branding. Email presentation lives in `app/emails`; preview it with `npm run email:dev`. Generic seed content is in `migrations/0001_initial.sql`, while test-only demo content is in `tests/fixtures/e2e.sql`.

Do not hardcode a personal email, hostname, profile, Cloudflare account ID, resource ID, or SMTP credential. Use Worker vars for public runtime configuration and Wrangler secrets for private values.
