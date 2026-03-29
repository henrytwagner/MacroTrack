#!/bin/bash
set -e

MAX_RETRIES=10
RETRY_INTERVAL=5

# Prefer public URL so migrations work without Railway private networking
if [ -n "$DATABASE_PUBLIC_URL" ]; then
  export DATABASE_URL="$DATABASE_PUBLIC_URL"
  echo "Using DATABASE_PUBLIC_URL for migrations."
fi

echo "Running database migrations..."
for i in $(seq 1 $MAX_RETRIES); do
  if npx prisma migrate deploy --schema=src/db/prisma/schema.prisma; then
    echo "Migrations completed successfully."
    break
  else
    if [ $i -eq $MAX_RETRIES ]; then
      echo "Migration failed after $MAX_RETRIES attempts, giving up."
      exit 1
    fi
    echo "Migration attempt $i/$MAX_RETRIES failed, retrying in ${RETRY_INTERVAL}s..."
    sleep $RETRY_INTERVAL
  fi
done

echo "Starting server..."
exec node dist/server/src/server.js
