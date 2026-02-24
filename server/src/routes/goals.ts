import type { FastifyInstance } from "fastify";
import { prisma } from "../db/client.js";
import { getDefaultUserId } from "../db/defaultUser.js";
import type { DailyGoal, UpdateGoalsRequest } from "../../../shared/types.js";

export async function goalsRoutes(app: FastifyInstance) {
  app.get("/api/goals", async (_request, reply) => {
    const userId = await getDefaultUserId();
    const goal = await prisma.dailyGoal.findUnique({ where: { userId } });

    if (!goal) {
      return reply.code(200).send(null);
    }

    const response: DailyGoal = {
      id: goal.id,
      calories: goal.calories,
      proteinG: goal.proteinG,
      carbsG: goal.carbsG,
      fatG: goal.fatG,
    };
    return reply.send(response);
  });

  app.put<{ Body: UpdateGoalsRequest }>("/api/goals", async (request, reply) => {
    const userId = await getDefaultUserId();
    const { calories, proteinG, carbsG, fatG } = request.body;

    if (
      calories == null ||
      proteinG == null ||
      carbsG == null ||
      fatG == null
    ) {
      return reply
        .code(400)
        .send({ error: "calories, proteinG, carbsG, and fatG are required" });
    }

    const goal = await prisma.dailyGoal.upsert({
      where: { userId },
      update: { calories, proteinG, carbsG, fatG },
      create: { userId, calories, proteinG, carbsG, fatG },
    });

    const response: DailyGoal = {
      id: goal.id,
      calories: goal.calories,
      proteinG: goal.proteinG,
      carbsG: goal.carbsG,
      fatG: goal.fatG,
    };
    return reply.send(response);
  });
}
