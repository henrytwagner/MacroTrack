import "dotenv/config";
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import pg from "pg";

const globalForPrisma = globalThis as unknown as {
  prisma?: PrismaClient;
  pool?: pg.Pool;
};

function createClient(): { prisma: PrismaClient; pool: pg.Pool } {
  const url = process.env.DATABASE_URL;
  if (!url) {
    throw new Error("DATABASE_URL is not set");
  }

  // Log masked URL for debugging connectivity
  try {
    const parsed = new URL(url);
    const host = parsed.hostname;
    const port = parsed.port;
    console.log(`[DB] Connecting to ${host}:${port}${parsed.pathname} (ssl: false)`);

    // DNS lookup diagnostic
    import("dns").then(dns => {
      dns.lookup(host, (err, address) => {
        if (err) console.error(`[DB] DNS lookup FAILED for ${host}: ${err.message}`);
        else console.log(`[DB] DNS resolved ${host} → ${address}`);
      });
    });
  } catch {
    console.log(`[DB] DATABASE_URL is not a valid URL: ${url.substring(0, 30)}...`);
  }

  const pool = new pg.Pool({
    connectionString: url,
    ssl: false,
    connectionTimeoutMillis: 10000,
  });

  // Test the connection on startup
  pool.query("SELECT 1").then(() => {
    console.log("[DB] Connection test successful");
  }).catch((err: Error) => {
    console.error(`[DB] Connection test FAILED: ${err.message}`);
  });

  const adapter = new PrismaPg(pool);
  return { prisma: new PrismaClient({ adapter }), pool };
}

if (!globalForPrisma.prisma) {
  const { prisma, pool } = createClient();
  globalForPrisma.prisma = prisma;
  globalForPrisma.pool = pool;
}

export const prisma = globalForPrisma.prisma;
export const pool = globalForPrisma.pool!;
