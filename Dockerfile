FROM node:22-slim

WORKDIR /app

# Copy both packages needed for the build
COPY shared/ ./shared/
COPY server/ ./server/

WORKDIR /app/server

RUN npm ci
RUN npm run build

EXPOSE 3000

CMD sh -c "npx prisma migrate deploy --schema=src/db/prisma/schema.prisma && npm start"
