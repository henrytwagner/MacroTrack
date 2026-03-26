import Fastify from "fastify";
import cors from "@fastify/cors";
import multipart from "@fastify/multipart";
import websocket from "@fastify/websocket";
import { goalsRoutes } from "./routes/goals.js";
import { foodRoutes } from "./routes/food.js";
import { customFoodRoutes } from "./routes/customFood.js";
import { communityFoodRoutes } from "./routes/communityFood.js";
import { barcodeRoutes } from "./routes/barcode.js";
import { profileRoutes } from "./routes/profile.js";
import { userPreferencesRoutes } from "./routes/userPreferences.js";
import { mealsRoutes } from "./routes/meals.js";
import { voiceSessionRoutes } from "./websocket/voiceSession.js";
import { kitchenModeSessionRoutes } from "./websocket/kitchenModeSession.js";

export async function buildApp() {
  const app = Fastify({ logger: true });

  await app.register(cors, {
    origin: true,
  });

  await app.register(multipart, { limits: { fileSize: 10 * 1024 * 1024 } });
  await app.register(websocket);

  app.get("/health", async () => {
    return { status: "ok" };
  });

  await app.register(goalsRoutes);
  await app.register(foodRoutes);
  await app.register(customFoodRoutes);
  await app.register(communityFoodRoutes);
  await app.register(barcodeRoutes);
  await app.register(profileRoutes);
  await app.register(userPreferencesRoutes);
  await app.register(mealsRoutes);
  await app.register(voiceSessionRoutes);           // legacy /ws/voice-session (RN app)
  await app.register(kitchenModeSessionRoutes);     // Phase E /ws/kitchen-mode (Swift app)

  return app;
}
