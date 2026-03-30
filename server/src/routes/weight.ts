import type { FastifyInstance } from "fastify";
import { prisma } from "../db/client.js";
import type {
  WeightEntry,
  CreateWeightEntryRequest,
  WeightTrendResponse,
  WeightMovingAvgPoint,
} from "../../../shared/types.js";

function mapWeightEntry(entry: {
  id: string;
  date: Date;
  weightKg: number;
  note: string | null;
  createdAt: Date;
}): WeightEntry {
  return {
    id: entry.id,
    date: entry.date.toISOString().split("T")[0],
    weightKg: entry.weightKg,
    note: entry.note ?? undefined,
    createdAt: entry.createdAt.toISOString(),
  };
}

export async function weightRoutes(app: FastifyInstance) {
  // GET /api/weight?from=YYYY-MM-DD&to=YYYY-MM-DD
  app.get<{ Querystring: { from?: string; to?: string } }>(
    "/api/weight",
    async (request, reply) => {
      const userId = request.userId;
      const { from, to } = request.query;

      const where: any = { userId };
      if (from || to) {
        where.date = {};
        if (from) where.date.gte = new Date(from);
        if (to) where.date.lte = new Date(to);
      }

      const entries = await prisma.weightEntry.findMany({
        where,
        orderBy: { date: "asc" },
      });

      const mapped = entries.map(mapWeightEntry);

      // Compute 7-day moving average
      const movingAverage7Day: WeightMovingAvgPoint[] = [];
      for (let i = 0; i < mapped.length; i++) {
        const windowStart = Math.max(0, i - 6);
        const window = mapped.slice(windowStart, i + 1);
        const avg = window.reduce((s, e) => s + e.weightKg, 0) / window.length;
        movingAverage7Day.push({
          date: mapped[i].date,
          value: Math.round(avg * 100) / 100,
        });
      }

      // Compute weekly rate (last 14 days comparison)
      let weeklyRateKg: number | null = null;
      if (mapped.length >= 2) {
        const now = new Date();
        const twoWeeksAgo = new Date(now.getTime() - 14 * 86400000);
        const recent = mapped.filter(
          (e) => new Date(e.date) >= twoWeeksAgo
        );
        if (recent.length >= 2) {
          const first = recent[0];
          const last = recent[recent.length - 1];
          const daysDiff =
            (new Date(last.date).getTime() -
              new Date(first.date).getTime()) /
            86400000;
          if (daysDiff > 0) {
            weeklyRateKg =
              Math.round(
                ((last.weightKg - first.weightKg) / daysDiff) * 7 * 100
              ) / 100;
          }
        }
      }

      const response: WeightTrendResponse = {
        entries: mapped,
        movingAverage7Day,
        weeklyRateKg,
      };
      return reply.send(response);
    }
  );

  // POST /api/weight — upsert
  app.post<{ Body: CreateWeightEntryRequest }>(
    "/api/weight",
    async (request, reply) => {
      const userId = request.userId;
      const { date, weightKg, note } = request.body;

      if (!date || weightKg == null) {
        return reply
          .code(400)
          .send({ error: "date and weightKg are required" });
      }

      const entry = await prisma.weightEntry.upsert({
        where: { userId_date: { userId, date: new Date(date) } },
        update: { weightKg, note: note ?? null },
        create: {
          userId,
          date: new Date(date),
          weightKg,
          note: note ?? null,
        },
      });

      // Also update User.weightKg to keep profile in sync
      await prisma.user.update({
        where: { id: userId },
        data: { weightKg },
      });

      return reply.code(201).send(mapWeightEntry(entry));
    }
  );

  // DELETE /api/weight/:id
  app.delete<{ Params: { id: string } }>(
    "/api/weight/:id",
    async (request, reply) => {
      const userId = request.userId;
      const { id } = request.params;

      await prisma.weightEntry.deleteMany({
        where: { id, userId },
      });

      return reply.code(204).send({});
    }
  );
}
