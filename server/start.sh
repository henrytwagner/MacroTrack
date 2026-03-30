#!/bin/sh
set -e

echo "[Startup] Running pending migrations..."
npx prisma migrate deploy --schema=src/db/prisma/schema.prisma || true

echo "[Startup] Starting server..."
exec npm start
