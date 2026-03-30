#!/bin/sh
set -e

echo "[Startup] Applying auth schema fix..."
node -e "
const { Pool } = require('pg');
const fs = require('fs');
const pool = new Pool({ connectionString: process.env.DATABASE_URL });
pool.query(fs.readFileSync('/app/server/src/db/prisma/migrations/fix_auth_columns.sql', 'utf8'))
  .then(() => { console.log('[Startup] Auth columns verified'); pool.end(); })
  .catch(e => { console.error('[Startup] SQL error:', e.message); pool.end(); process.exit(1); });
"

echo "[Startup] Resolving migration state..."
npx prisma migrate resolve --applied 20260330001442_add_auth_fields --schema=src/db/prisma/schema.prisma 2>/dev/null || true
npx prisma migrate resolve --applied 20260330004112_add_password_reset --schema=src/db/prisma/schema.prisma 2>/dev/null || true

echo "[Startup] Running pending migrations..."
npx prisma migrate deploy --schema=src/db/prisma/schema.prisma || true

echo "[Startup] Starting server..."
exec npm start
