#!/bin/sh
set -e

echo "[Startup] Resolving trgm migration (already applied manually)..."
npx prisma migrate resolve --applied 20260329120000_trgm_fuzzy_search --schema=src/db/prisma/schema.prisma || true

echo "[Startup] Running pending migrations..."
npx prisma migrate deploy --schema=src/db/prisma/schema.prisma || true

echo "[Startup] Starting server..."
exec npm start
