import Fastify from "fastify";
import cors from "@fastify/cors";
import websocket from "@fastify/websocket";
import { goalsRoutes } from "./routes/goals.js";
import { foodRoutes } from "./routes/food.js";
import { customFoodRoutes } from "./routes/customFood.js";

export async function buildApp() {
  const app = Fastify({ logger: true });

  await app.register(cors, {
    origin: true,
  });

  await app.register(websocket);

  app.get("/health", async () => {
    return { status: "ok" };
  });

  await app.register(goalsRoutes);
  await app.register(foodRoutes);
  await app.register(customFoodRoutes);

  return app;
}
