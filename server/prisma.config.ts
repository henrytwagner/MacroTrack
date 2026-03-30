import "dotenv/config";
import { defineConfig } from "prisma/config";
import path from "node:path";

export default defineConfig({
  schema: path.join(__dirname, "src/db/prisma/schema.prisma"),
  datasource: {
    url: process.env.DATABASE_URL ?? "",
  },
});
