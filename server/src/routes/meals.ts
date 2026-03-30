import type { FastifyInstance } from "fastify";
import { prisma } from "../db/client.js";

import { recategorizeMealsForDay } from "../services/mealCategorizer.js";
import type {
  SavedMeal,
  CreateSavedMealRequest,
  LogMealRequest,
  FoodEntry,
  FoodSource,
  MealLabel,
} from "../../../shared/types.js";

// ---------------------------------------------------------------------------
// Mapper
// ---------------------------------------------------------------------------

function mapSavedMeal(meal: {
  id: string;
  name: string;
  createdAt: Date;
  items: {
    id: string;
    name: string;
    quantity: number;
    unit: string;
    calories: number;
    proteinG: number;
    carbsG: number;
    fatG: number;
    source: string;
    usdaFdcId: number | null;
    customFoodId: string | null;
    communityFoodId: string | null;
  }[];
}): SavedMeal {
  return {
    id: meal.id,
    name: meal.name,
    createdAt: meal.createdAt.toISOString(),
    items: meal.items.map((item) => ({
      id: item.id,
      name: item.name,
      quantity: item.quantity,
      unit: item.unit,
      calories: item.calories,
      proteinG: item.proteinG,
      carbsG: item.carbsG,
      fatG: item.fatG,
      source: item.source as FoodSource,
      usdaFdcId: item.usdaFdcId ?? undefined,
      customFoodId: item.customFoodId ?? undefined,
      communityFoodId: item.communityFoodId ?? undefined,
    })),
  };
}

function mapLoggedEntry(entry: {
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
  communityFoodId: string | null;
  savedMealId: string | null;
  mealInstanceId: string | null;
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
    communityFoodId: entry.communityFoodId ?? undefined,
    savedMealId: entry.savedMealId ?? undefined,
    mealInstanceId: entry.mealInstanceId ?? undefined,
    createdAt: entry.createdAt.toISOString(),
  };
}

// ---------------------------------------------------------------------------
// Routes
// ---------------------------------------------------------------------------

export async function mealsRoutes(app: FastifyInstance): Promise<void> {
  // GET /api/meals — list all saved meals for the default user
  app.get("/api/meals", async (request) => {
    const userId = request.userId;
    const meals = await prisma.savedMeal.findMany({
      where: { userId },
      include: { items: true },
      orderBy: { createdAt: "desc" },
    });
    return meals.map(mapSavedMeal);
  });

  // POST /api/meals — create a new saved meal
  app.post("/api/meals", async (req, reply) => {
    const userId = req.userId;
    const body = req.body as CreateSavedMealRequest;

    if (!body.name?.trim()) {
      reply.status(400);
      return { error: "Meal name is required" };
    }

    const meal = await prisma.savedMeal.create({
      data: {
        userId,
        name: body.name.trim(),
        items: {
          create: body.items.map((item) => ({
            name: item.name,
            quantity: item.quantity,
            unit: item.unit,
            calories: item.calories,
            proteinG: item.proteinG,
            carbsG: item.carbsG,
            fatG: item.fatG,
            source: item.source,
            usdaFdcId: item.usdaFdcId,
            customFoodId: item.customFoodId,
            communityFoodId: item.communityFoodId,
          })),
        },
      },
      include: { items: true },
    });

    reply.status(201);
    return mapSavedMeal(meal);
  });

  // PUT /api/meals/:id — update name and items
  app.put("/api/meals/:id", async (req, reply) => {
    const userId = req.userId;
    const { id } = req.params as { id: string };
    const body = req.body as CreateSavedMealRequest;

    const existing = await prisma.savedMeal.findFirst({ where: { id, userId } });
    if (!existing) {
      reply.status(404);
      return { error: "Meal not found" };
    }

    // Replace items: delete old, create new in a transaction
    const meal = await prisma.$transaction(async (tx) => {
      await tx.savedMealItem.deleteMany({ where: { savedMealId: id } });
      return tx.savedMeal.update({
        where: { id },
        data: {
          name: body.name.trim(),
          items: {
            create: body.items.map((item) => ({
              name: item.name,
              quantity: item.quantity,
              unit: item.unit,
              calories: item.calories,
              proteinG: item.proteinG,
              carbsG: item.carbsG,
              fatG: item.fatG,
              source: item.source,
              usdaFdcId: item.usdaFdcId,
              customFoodId: item.customFoodId,
              communityFoodId: item.communityFoodId,
            })),
          },
        },
        include: { items: true },
      });
    });

    return mapSavedMeal(meal);
  });

  // DELETE /api/meals/:id — delete a saved meal
  app.delete("/api/meals/:id", async (req, reply) => {
    const userId = req.userId;
    const { id } = req.params as { id: string };

    const existing = await prisma.savedMeal.findFirst({ where: { id, userId } });
    if (!existing) {
      reply.status(404);
      return { error: "Meal not found" };
    }

    await prisma.savedMeal.delete({ where: { id } });
    return {};
  });

  // POST /api/meals/:id/log — log a meal instance as food entries
  app.post("/api/meals/:id/log", async (req, reply) => {
    const userId = req.userId;
    const { id } = req.params as { id: string };
    const body = req.body as LogMealRequest;

    const meal = await prisma.savedMeal.findFirst({
      where: { id, userId },
      include: { items: true },
    });
    if (!meal) {
      reply.status(404);
      return { error: "Meal not found" };
    }
    if (meal.items.length === 0) {
      reply.status(400);
      return { error: "Meal has no items" };
    }

    const mealInstanceId = crypto.randomUUID();
    const date = new Date(body.date);
    const scale = body.scaleFactor ?? 1;

    const created = await prisma.$transaction(
      meal.items.map((item) =>
        prisma.foodEntry.create({
          data: {
            userId,
            date,
            mealLabel: body.mealLabel,
            name: item.name,
            calories: item.calories * scale,
            proteinG: item.proteinG * scale,
            carbsG: item.carbsG * scale,
            fatG: item.fatG * scale,
            quantity: item.quantity * scale,
            unit: item.unit,
            source: item.source,
            usdaFdcId: item.usdaFdcId,
            customFoodId: item.customFoodId,
            communityFoodId: item.communityFoodId,
            savedMealId: id,
            mealInstanceId,
          },
        })
      )
    );

    await recategorizeMealsForDay(userId, date);

    return created.map(mapLoggedEntry);
  });

  // GET /api/meals/frequent
  app.get("/api/meals/frequent", async (request, reply) => {
    const userId = request.userId;

    const groups = await prisma.foodEntry.groupBy({
      by: ["savedMealId"],
      where: { userId, savedMealId: { not: null } },
      _count: { savedMealId: true },
      orderBy: { _count: { savedMealId: "desc" } },
      take: 5,
    });

    if (groups.length === 0) {
      return reply.send([]);
    }

    const mealIds = groups
      .map((g) => g.savedMealId)
      .filter((id): id is string => id !== null);

    const meals = await prisma.savedMeal.findMany({
      where: { id: { in: mealIds }, userId },
      include: { items: true },
    });

    const result = [];
    for (const g of groups) {
      const meal = meals.find((m) => m.id === g.savedMealId);
      if (!meal) continue;

      const lastEntry = await prisma.foodEntry.findFirst({
        where: { userId, savedMealId: g.savedMealId },
        orderBy: { createdAt: "desc" },
        select: { date: true },
      });

      const totalMacros = {
        calories: meal.items.reduce((s, i) => s + i.calories, 0),
        proteinG: meal.items.reduce((s, i) => s + i.proteinG, 0),
        carbsG: meal.items.reduce((s, i) => s + i.carbsG, 0),
        fatG: meal.items.reduce((s, i) => s + i.fatG, 0),
      };

      result.push({
        savedMealId: meal.id,
        name: meal.name,
        totalMacros,
        itemCount: meal.items.length,
        logCount: g._count.savedMealId,
        lastLoggedDate: lastEntry
          ? lastEntry.date.toISOString().split("T")[0]
          : "",
      });
    }

    return reply.send(result);
  });
}
