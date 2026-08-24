# Contributing

Use Node.js 22 or newer. Fork the repository, branch from `develop`, and keep changes focused.

```sh
npm ci
cp .dev.vars.example .dev.vars
npm run setup:local
npm run check
npm run test:e2e
```

Do not commit credentials, generated deployment configs, local D1 state, backups, or personal content. Add a numbered migration for schema changes; never edit a migration that has shipped. Pull requests should explain the behavior change, manual verification, data implications, and screenshots for UI work. Releases are promoted from `develop` to protected `main`.
