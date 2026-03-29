import type { FastifyInstance } from "fastify";
import { parseNutritionLabel } from "../services/gemini.js";

export async function nutritionLabelRoutes(app: FastifyInstance) {
  app.post("/api/nutrition/label/parse", async (request, reply) => {
    const { ocrText } = request.body as { ocrText?: string };

    if (!ocrText || typeof ocrText !== "string" || ocrText.trim().length === 0) {
      return reply.code(400).send({ error: "ocrText is required and must be a non-empty string" });
    }

    const result = await parseNutritionLabel(ocrText.trim());
    return reply.send(result);
  });
}
