import "dotenv/config";
import { buildApp } from "./app.js";
import { prisma, pool } from "./db/client.js";

const PORT = Number(process.env.PORT) || 3000;
const HOST = "0.0.0.0";

async function main() {
  const app = await buildApp();

  async function shutdown() {
    await app.close();
    await prisma.$disconnect();
    await pool.end();
    process.exit(0);
  }

  process.on("SIGTERM", shutdown);
  process.on("SIGINT", shutdown);

  try {
    await app.listen({ port: PORT, host: HOST });
    console.log(`Server listening on http://${HOST}:${PORT}`);
  } catch (err) {
    app.log.error(err);
    process.exit(1);
  }
}

main();
