FROM node:22-slim

RUN apt-get update -y && apt-get install -y openssl && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Copy both packages needed for the build
COPY shared/ ./shared/
COPY server/ ./server/

WORKDIR /app/server

RUN npm ci
RUN npm run build

EXPOSE 3000

CMD ["sh", "start.sh"]
