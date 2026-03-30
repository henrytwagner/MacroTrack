import type { FastifyInstance } from "fastify";
import { prisma } from "../db/client.js";
import type {
  FoodFrequencyItem,
  FoodSource,
} from "../../../shared/types.js";

export async function statsRoutes(app: FastifyInstance) {
  // GET /api/stats/top-foods?from=YYYY-MM-DD&to=YYYY-MM-DD
  app.get<{ Querystring: { from?: string; to?: string } }>(
    "/api/stats/top-foods",
    async (request, reply) => {
      const userId = request.userId;
      const { from, to } = request.query;

      const where: any = { userId };
      if (from || to) {
        where.date = {};
        if (from) where.date.gte = new Date(from);
        if (to) where.date.lte = new Date(to);
      }

      const groups = await prisma.foodEntry.groupBy({
        by: ["name", "source"],
        where,
        _count: { name: true },
        _avg: { calories: true },
        orderBy: { _count: { name: "desc" } },
        take: 10,
      });

      const topFoods: FoodFrequencyItem[] = [];
      for (const g of groups) {
        const lastEntry = await prisma.foodEntry.findFirst({
          where: { userId, name: g.name, source: g.source as any },
          orderBy: { createdAt: "desc" },
          select: { date: true },
        });

        topFoods.push({
          name: g.name,
          source: g.source as FoodSource,
          totalLogCount: g._count.name,
          avgCalories: Math.round((g._avg.calories ?? 0) * 10) / 10,
          lastLoggedDate: lastEntry
            ? lastEntry.date.toISOString().split("T")[0]
            : "",
        });
      }

      return reply.send(topFoods);
    }
  );
}
