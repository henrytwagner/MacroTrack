#!/bin/sh
set -e

echo "[Startup] Resolving previously failed weight_entries migration..."
npx prisma migrate resolve --rolled-back 20260330043231_weight_entries --schema=src/db/prisma/schema.prisma || true

echo "[Startup] Running pending migrations..."
npx prisma migrate deploy --schema=src/db/prisma/schema.prisma || true

echo "[Startup] Starting server..."
exec npm start
