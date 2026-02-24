import type { FastifyInstance } from "fastify";
import { prisma } from "../db/client.js";
import { getDefaultUserId } from "../db/defaultUser.js";
import { searchFoods } from "../services/usda.js";
import type {
  FoodEntry,
  CreateFoodEntryRequest,
  UpdateFoodEntryRequest,
  UnifiedSearchResponse,
  FrequentFood,
  RecentFood,
  CustomFood,
  FoodSource,
  MealLabel,
} from "../../../shared/types.js";

// ---------------------------------------------------------------------------
// Prisma-to-shared-type mappers
// ---------------------------------------------------------------------------

function mapEntry(entry: {
  id: string;
  date: Date;
  mealLabel: string;
  name: string;
  calories: number;
  proteinG: number;
  carbsG: number;
  fatG: number;
  quantity: number;
  unit: string;
  source: string;
  usdaFdcId: number | null;
  customFoodId: string | null;
  createdAt: Date;
}): FoodEntry {
  return {
    id: entry.id,
    date: entry.date.toISOString().split("T")[0],
    mealLabel: entry.mealLabel as MealLabel,
    name: entry.name,
    calories: entry.calories,
    proteinG: entry.proteinG,
    carbsG: entry.carbsG,
    fatG: entry.fatG,
    quantity: entry.quantity,
    unit: entry.unit,
    source: entry.source as FoodSource,
    usdaFdcId: entry.usdaFdcId ?? undefined,
    customFoodId: entry.customFoodId ?? undefined,
    createdAt: entry.createdAt.toISOString(),
  };
}

function mapCustomFood(food: {
  id: string;
  name: string;
  servingSize: number;
  servingUnit: string;
  calories: number;
  proteinG: number;
  carbsG: number;
  fatG: number;
  sodiumMg: number | null;
  cholesterolMg: number | null;
  fiberG: number | null;
  sugarG: number | null;
  saturatedFatG: number | null;
  transFatG: number | null;
  createdAt: Date;
  updatedAt: Date;
}): CustomFood {
  return {
    id: food.id,
    name: food.name,
    servingSize: food.servingSize,
    servingUnit: food.servingUnit,
    calories: food.calories,
    proteinG: food.proteinG,
    carbsG: food.carbsG,
    fatG: food.fatG,
    sodiumMg: food.sodiumMg ?? undefined,
    cholesterolMg: food.cholesterolMg ?? undefined,
    fiberG: food.fiberG ?? undefined,
    sugarG: food.sugarG ?? undefined,
    saturatedFatG: food.saturatedFatG ?? undefined,
    transFatG: food.transFatG ?? undefined,
    createdAt: food.createdAt.toISOString(),
    updatedAt: food.updatedAt.toISOString(),
  };
}

// ---------------------------------------------------------------------------
// Route plugin
// ---------------------------------------------------------------------------

export async function foodRoutes(app: FastifyInstance) {
  // GET /api/food/entries?date=YYYY-MM-DD
  app.get<{ Querystring: { date: string } }>(
    "/api/food/entries",
    async (request, reply) => {
      const userId = await getDefaultUserId();
      const { date } = request.query;

      if (!date) {
        return reply
          .code(400)
          .send({ error: "date query parameter is required (YYYY-MM-DD)" });
      }

      const entries = await prisma.foodEntry.findMany({
        where: { userId, date: new Date(date) },
        orderBy: { createdAt: "asc" },
      });

      return reply.send(entries.map(mapEntry));
    },
  );

  // GET /api/food/entries/frequent — most frequently logged foods
  app.get("/api/food/entries/frequent", async (_request, reply) => {
    const userId = await getDefaultUserId();

    const groups = await prisma.foodEntry.groupBy({
      by: ["name", "source", "usdaFdcId", "customFoodId"],
      where: { userId },
      _count: { name: true },
      orderBy: { _count: { name: "desc" } },
      take: 10,
    });

    const frequentFoods: FrequentFood[] = [];

    for (const group of groups) {
      const lastEntry = await prisma.foodEntry.findFirst({
        where: { userId, name: group.name, source: group.source },
        orderBy: { createdAt: "desc" },
      });

      if (lastEntry) {
        frequentFoods.push({
          name: group.name,
          source: group.source as FoodSource,
          lastQuantity: lastEntry.quantity,
          lastUnit: lastEntry.unit,
          macros: {
            calories: lastEntry.calories,
            proteinG: lastEntry.proteinG,
            carbsG: lastEntry.carbsG,
            fatG: lastEntry.fatG,
          },
          usdaFdcId: group.usdaFdcId ?? undefined,
          customFoodId: group.customFoodId ?? undefined,
          logCount: group._count.name,
        });
      }
    }

    return reply.send(frequentFoods);
  });

  // GET /api/food/entries/recent — recently logged foods (deduplicated)
  app.get("/api/food/entries/recent", async (_request, reply) => {
    const userId = await getDefaultUserId();

    const recentEntries = await prisma.foodEntry.findMany({
      where: { userId },
      orderBy: { createdAt: "desc" },
      take: 50,
    });

    const seen = new Set<string>();
    const recentFoods: RecentFood[] = [];

    for (const entry of recentEntries) {
      const key = `${entry.name}::${entry.source}`;
      if (seen.has(key)) continue;
      seen.add(key);

      recentFoods.push({
        name: entry.name,
        source: entry.source as FoodSource,
        quantity: entry.quantity,
        unit: entry.unit,
        macros: {
          calories: entry.calories,
          proteinG: entry.proteinG,
          carbsG: entry.carbsG,
          fatG: entry.fatG,
        },
        usdaFdcId: entry.usdaFdcId ?? undefined,
        customFoodId: entry.customFoodId ?? undefined,
        loggedAt: entry.createdAt.toISOString(),
      });

      if (recentFoods.length >= 20) break;
    }

    return reply.send(recentFoods);
  });

  // POST /api/food/entries
  app.post<{ Body: CreateFoodEntryRequest }>(
    "/api/food/entries",
    async (request, reply) => {
      const userId = await getDefaultUserId();
      const body = request.body;

      if (!body.date || !body.name || body.source == null) {
        return reply
          .code(400)
          .send({ error: "date, name, and source are required" });
      }

      const entry = await prisma.foodEntry.create({
        data: {
          userId,
          date: new Date(body.date),
          mealLabel: body.mealLabel,
          name: body.name,
          calories: body.calories,
          proteinG: body.proteinG,
          carbsG: body.carbsG,
          fatG: body.fatG,
          quantity: body.quantity,
          unit: body.unit,
          source: body.source,
          usdaFdcId: body.usdaFdcId,
          customFoodId: body.customFoodId,
        },
      });

      return reply.code(201).send(mapEntry(entry));
    },
  );

  // PUT /api/food/entries/:id
  app.put<{ Params: { id: string }; Body: UpdateFoodEntryRequest }>(
    "/api/food/entries/:id",
    async (request, reply) => {
      const { id } = request.params;
      const body = request.body;

      const existing = await prisma.foodEntry.findUnique({ where: { id } });
      if (!existing) {
        return reply.code(404).send({ error: "Entry not found" });
      }

      const entry = await prisma.foodEntry.update({
        where: { id },
        data: {
          ...(body.quantity !== undefined && { quantity: body.quantity }),
          ...(body.unit !== undefined && { unit: body.unit }),
        },
      });

      return reply.send(mapEntry(entry));
    },
  );

  // DELETE /api/food/entries/:id
  app.delete<{ Params: { id: string } }>(
    "/api/food/entries/:id",
    async (request, reply) => {
      const { id } = request.params;

      const existing = await prisma.foodEntry.findUnique({ where: { id } });
      if (!existing) {
        return reply.code(404).send({ error: "Entry not found" });
      }

      await prisma.foodEntry.delete({ where: { id } });
      return reply.code(204).send();
    },
  );

  // GET /api/food/search?q=... — unified search: custom foods first, then USDA
  app.get<{ Querystring: { q: string } }>(
    "/api/food/search",
    async (request, reply) => {
      const userId = await getDefaultUserId();
      const { q } = request.query;

      if (!q || q.trim().length < 2) {
        const response: UnifiedSearchResponse = { myFoods: [], database: [] };
        return reply.send(response);
      }

      const query = q.trim();

      const [customFoods, usdaResults] = await Promise.all([
        prisma.customFood.findMany({
          where: {
            userId,
            name: { contains: query, mode: "insensitive" },
          },
          take: 5,
          orderBy: { name: "asc" },
        }),
        searchFoods(query),
      ]);

      const response: UnifiedSearchResponse = {
        myFoods: customFoods.map(mapCustomFood),
        database: usdaResults,
      };
      return reply.send(response);
    },
  );
}
