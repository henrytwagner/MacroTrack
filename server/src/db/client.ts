import "dotenv/config";
import dns from "dns";
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import pg from "pg";

// Railway private networking resolves to IPv6 which Docker can't route — force IPv4
dns.setDefaultResultOrder("ipv4first");

const globalForPrisma = globalThis as unknown as {
  prisma?: PrismaClient;
  pool?: pg.Pool;
};

function createClient(): { prisma: PrismaClient; pool: pg.Pool } {
  const url = process.env.DATABASE_URL;
  if (!url) {
    throw new Error("DATABASE_URL is not set");
  }

  let host = "unknown";
  try {
    const parsed = new URL(url);
    host = parsed.hostname;
    const port = parsed.port;
    console.log(`[DB] Connecting to ${host}:${port}${parsed.pathname}`);

    dns.lookup(host, (err, address) => {
      if (err) console.error(`[DB] DNS lookup FAILED for ${host}: ${err.message}`);
      else console.log(`[DB] DNS resolved ${host} → ${address}`);
    });
  } catch {
    console.log(`[DB] DATABASE_URL is not a valid URL`);
  }

  // Only enable SSL for Railway public proxies (*.proxy.rlwy.net).
  // Local dev and private networking don't use SSL.
  const needsSsl = host.endsWith(".proxy.rlwy.net");
  const sslConfig = needsSsl ? { rejectUnauthorized: false } : false;
  console.log(`[DB] SSL: ${needsSsl ? "enabled (public proxy)" : "disabled"}`);

  const pool = new pg.Pool({
    connectionString: url,
    ssl: sslConfig,
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
