# MacroTrack Server

Fastify backend with REST API, WebSocket voice sessions, and Prisma/PostgreSQL.

## Setup

```bash
npm install
npm run db:generate
npm run dev
```

## Git Hooks

This repo uses a pre-commit hook that enforces migration safety. After cloning, enable it:

```bash
git config core.hooksPath .hooks
```

The hook prevents:
- Committing `schema.prisma` changes without a migration file
- Committing a migration file without `schema.prisma`
- Adding hand-written `.sql` files to the migrations directory

## Database Migrations

Migrations run automatically on deploy via `start.sh`. For local development:

```bash
# 1. Edit server/src/db/prisma/schema.prisma
# 2. Create a migration:
npm run db:migrate -- --name descriptive_name
# 3. Regenerate the Prisma client:
npm run db:generate
# 4. Commit schema + migration together (pre-commit hook enforces this)
```

### Rules

- Never `db push` against remote databases (Railway dev or prod)
- Never `prisma migrate resolve --applied` — use `--rolled-back` only
- Always commit server source changes alongside schema migrations if types changed
- See `CLAUDE.md` at repo root for the full migration policy
