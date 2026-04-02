# MacroTrack

Voice-first macronutrient tracking app. Log food via voice (Kitchen Mode), manual search, or barcode scanning.

## Setup

```bash
# Clone the repo
git clone https://github.com/henrytwagner/MacroTrack.git
cd MacroTrack

# Enable git hooks (enforces migration safety checks)
git config core.hooksPath .hooks

# Server
cd server
npm install
npm run db:generate
npm run dev

# iOS client (requires Xcode)
open MacroTrackerSwift/MacroTrackerSwift.xcodeproj
```

## Project Structure

```
MacroTrackerSwift/   SwiftUI iOS client (active)
server/              Fastify backend (REST + WebSocket)
shared/              TypeScript types shared by server
mobile/              React Native client (deprecated)
```

## Database Migrations

Prisma migrations run automatically on deploy via `start.sh`. For local development:

```bash
cd server

# 1. Edit schema.prisma
# 2. Create a migration:
npm run db:migrate -- --name descriptive_name
# 3. Regenerate the Prisma client:
npm run db:generate
# 4. Commit schema + migration together (pre-commit hook enforces this)
```

See `CLAUDE.md` for the full migration rules.
