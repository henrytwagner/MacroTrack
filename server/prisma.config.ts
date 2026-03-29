import { defineConfig } from "prisma/config";
import path from "node:path";

export default defineConfig({
  schema: path.join(__dirname, "src/db/prisma/schema.prisma"),
  datasource: {
    // Prefer DATABASE_PUBLIC_URL (Railway external proxy) over DATABASE_URL
    // (internal private network) since private networking requires Pro plan.
    url: process.env.DATABASE_PUBLIC_URL ?? process.env.DATABASE_URL ?? "",
  },
});
