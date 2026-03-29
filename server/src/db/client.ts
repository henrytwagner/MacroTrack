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

  // Log masked URL for debugging connectivity
  try {
    const parsed = new URL(url);
    const host = parsed.hostname;
    const port = parsed.port;
    const usesSsl = !host.endsWith(".railway.internal");
    console.log(`[DB] Connecting to ${host}:${port}${parsed.pathname} (ssl: ${usesSsl})`);

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

  // Railway private networking (*.railway.internal) is raw TCP — no TLS.
  // Public proxies (*.proxy.rlwy.net) require SSL.
  const parsed2 = new URL(url);
  const isPrivateNetwork = parsed2.hostname.endsWith(".railway.internal");
  const sslConfig = isPrivateNetwork ? false : { rejectUnauthorized: false };

  console.log(`[DB] SSL: ${isPrivateNetwork ? "disabled (private network)" : "enabled"}`);

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
