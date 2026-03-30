import type { FastifyInstance } from "fastify";
import { prisma } from "../db/client.js";

import { searchFoods } from "../services/usda.js";
import { mapCommunityFood } from "./communityFood.js";
import { recategorizeMealsForDay } from "../services/mealCategorizer.js";
import { identifyFoodFromPhoto } from "../services/gemini.js";
import { lookupFoodForKitchenMode } from "../services/foodParser.js";
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
  FoodUnitConversion,
  CreateFoodUnitConversionRequest,
  UpdateFoodUnitConversionRequest,
  CascadeUnitConversionsRequest,
  PhotoIdentificationResult,
  USDASearchResult,
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
  confirmedViaScale?: boolean;
  usdaFdcId: number | null;
  customFoodId: string | null;
  communityFoodId: string | null;
  savedMealId?: string | null;
  mealInstanceId?: string | null;
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
    confirmedViaScale: entry.confirmedViaScale || undefined,
    usdaFdcId: entry.usdaFdcId ?? undefined,
    customFoodId: entry.customFoodId ?? undefined,
    communityFoodId: entry.communityFoodId ?? undefined,
    savedMealId: entry.savedMealId ?? undefined,
    mealInstanceId: entry.mealInstanceId ?? undefined,
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

function mapFoodUnitConversion(conv: {
  id: string;
  unitName: string;
  quantityInBaseServings: number;
  measurementSystem: string;
  customFoodId: string | null;
  usdaFdcId: number | null;
}): FoodUnitConversion {
  return {
    id: conv.id,
    unitName: conv.unitName,
    quantityInBaseServings: conv.quantityInBaseServings,
    measurementSystem: conv.measurementSystem as 'weight' | 'volume' | 'abstract',
    customFoodId: conv.customFoodId ?? undefined,
    usdaFdcId: conv.usdaFdcId ?? undefined,
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
      const userId = request.userId;
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
  app.get("/api/food/entries/frequent", async (request, reply) => {
    const userId = request.userId;

    const groups = await prisma.foodEntry.groupBy({
      by: ["name", "source", "usdaFdcId", "customFoodId", "communityFoodId"],
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
          communityFoodId: group.communityFoodId ?? undefined,
          logCount: group._count.name,
        });
      }
    }

    return reply.send(frequentFoods);
  });

  // GET /api/food/entries/recent — recently logged foods (deduplicated)
  app.get("/api/food/entries/recent", async (request, reply) => {
    const userId = request.userId;

    const recentEntries = await prisma.foodEntry.findMany({
      where: { userId },
      orderBy: { createdAt: "desc" },
      take: 50,
    });

    const seen = new Set<string>();
    const recentFoods: RecentFood[] = [];

    for (const entry of recentEntries) {
      const key = `${entry.name}::${entry.source}::${entry.communityFoodId ?? ""}`;
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
        communityFoodId: entry.communityFoodId ?? undefined,
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
      const userId = request.userId;
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
          confirmedViaScale: body.confirmedViaScale ?? false,
          usdaFdcId: body.usdaFdcId,
          customFoodId: body.customFoodId,
          communityFoodId: body.communityFoodId,
        },
      });

      // Fire-and-forget: track USDA food usage for ranking
      if (body.source === "DATABASE" && body.usdaFdcId) {
        prisma.uSDAFoodMetrics.upsert({
          where: { fdcId: body.usdaFdcId },
          create: { fdcId: body.usdaFdcId, usesCount: 1, lastUsedAt: new Date() },
          update: { usesCount: { increment: 1 }, lastUsedAt: new Date() },
        }).catch(() => {});
      }

      await recategorizeMealsForDay(userId, new Date(body.date));

      // Re-fetch the entry to get the updated mealLabel
      const updated = await prisma.foodEntry.findUnique({ where: { id: entry.id } });
      return reply.code(201).send(mapEntry(updated ?? entry));
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
          ...(body.calories !== undefined && { calories: body.calories }),
          ...(body.proteinG !== undefined && { proteinG: body.proteinG }),
          ...(body.carbsG !== undefined && { carbsG: body.carbsG }),
          ...(body.fatG !== undefined && { fatG: body.fatG }),
        },
      });

      // Recategorize if calories changed (could shift meal rankings)
      if (body.calories !== undefined) {
        await recategorizeMealsForDay(existing.userId, existing.date);
        const updated = await prisma.foodEntry.findUnique({ where: { id } });
        return reply.send(mapEntry(updated ?? entry));
      }

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
      await recategorizeMealsForDay(existing.userId, existing.date);
      return reply.code(204).send();
    },
  );

  // GET /api/food/search?q=... — unified search: custom foods first, then USDA
  app.get<{ Querystring: { q: string } }>(
    "/api/food/search",
    async (request, reply) => {
      const userId = request.userId;
      const { q } = request.query;

      if (!q || q.trim().length < 2) {
        const response: UnifiedSearchResponse = { myFoods: [], community: [], database: [] };
        return reply.send(response);
      }

      const query = q.trim();

      const [customFoods, communityFoods, usdaResults] = await Promise.all([
        prisma.customFood.findMany({
          where: {
            userId,
            name: { contains: query, mode: "insensitive" },
          },
          take: 5,
          orderBy: { name: "asc" },
        }),
        prisma.communityFood.findMany({
          where: {
            status: "ACTIVE",
            OR: [
              { name: { contains: query, mode: "insensitive" } },
              { brandName: { contains: query, mode: "insensitive" } },
            ],
          },
          take: 10,
          orderBy: [{ trustScore: "desc" }, { usesCount: "desc" }, { name: "asc" }],
        }),
        searchFoods(query),
      ]);

      // Annotate USDA results with usage counts and sort by uses DESC
      const usdaFdcIds = usdaResults.map((r) => r.fdcId);
      const metricsRows = usdaFdcIds.length > 0
        ? await prisma.uSDAFoodMetrics.findMany({ where: { fdcId: { in: usdaFdcIds } } })
        : [];
      const metricsMap = new Map(metricsRows.map((m) => [m.fdcId, m.usesCount]));
      const annotatedUsda = usdaResults
        .map((r) => ({ ...r, usesCount: metricsMap.get(r.fdcId) ?? 0 }))
        .sort((a, b) => b.usesCount - a.usesCount);

      const response: UnifiedSearchResponse = {
        myFoods: customFoods.map(mapCustomFood),
        community: communityFoods.map(mapCommunityFood),
        database: annotatedUsda,
      };
      return reply.send(response);
    },
  );

  // GET /api/food/units?customFoodId=...&usdaFdcId=...
  app.get<{
    Querystring: { customFoodId?: string; usdaFdcId?: string };
  }>("/api/food/units", async (request, reply) => {
    const userId = request.userId;
    const { customFoodId, usdaFdcId } = request.query;

    if (!customFoodId && !usdaFdcId) {
      return reply.code(400).send({
        error:
          "Either customFoodId or usdaFdcId query parameter is required to list unit conversions.",
      });
    }

    const where: {
      userId: string;
      customFoodId?: string;
      usdaFdcId?: number;
    } = { userId };

    if (customFoodId) {
      where.customFoodId = customFoodId;
    }
    if (usdaFdcId) {
      const parsed = Number.parseInt(usdaFdcId, 10);
      if (!Number.isFinite(parsed)) {
        return reply
          .code(400)
          .send({ error: "usdaFdcId must be a valid integer" });
      }
      where.usdaFdcId = parsed;
    }

    const conversions = await prisma.foodUnitConversion.findMany({
      where,
      orderBy: { unitName: "asc" },
    });

    return reply.send(conversions.map(mapFoodUnitConversion));
  });

  // POST /api/food/units — create or replace a unit conversion for a food
  app.post<{ Body: CreateFoodUnitConversionRequest }>(
    "/api/food/units",
    async (request, reply) => {
      const userId = request.userId;
      const body = request.body;

      if (!body.unitName || body.quantityInBaseServings == null) {
        return reply.code(400).send({
          error: "unitName and quantityInBaseServings are required",
        });
      }

      if (!body.customFoodId && !body.usdaFdcId) {
        return reply.code(400).send({
          error:
            "Either customFoodId or usdaFdcId is required when creating a unit conversion.",
        });
      }

      if (body.quantityInBaseServings <= 0) {
        return reply.code(400).send({
          error: "quantityInBaseServings must be greater than zero",
        });
      }

      // Ensure we don't accumulate duplicates: remove any existing config
      // for this (user, food, unitName) tuple, then recreate.
      await prisma.foodUnitConversion.deleteMany({
        where: {
          userId,
          unitName: body.unitName,
          customFoodId: body.customFoodId ?? undefined,
          usdaFdcId: body.usdaFdcId ?? undefined,
        },
      });

      const created = await prisma.foodUnitConversion.create({
        data: {
          userId,
          unitName: body.unitName,
          quantityInBaseServings: body.quantityInBaseServings,
          measurementSystem: body.measurementSystem ?? "abstract",
          customFoodId: body.customFoodId,
          usdaFdcId: body.usdaFdcId,
        },
      });

      return reply.code(201).send(mapFoodUnitConversion(created));
    },
  );

  // PUT /api/food/units/:id — update an existing conversion
  app.put<{ Params: { id: string }; Body: UpdateFoodUnitConversionRequest }>(
    "/api/food/units/:id",
    async (request, reply) => {
      const { id } = request.params;
      const body = request.body;

      const existing = await prisma.foodUnitConversion.findUnique({
        where: { id },
      });

      if (!existing) {
        return reply.code(404).send({ error: "Unit conversion not found" });
      }

      const updated = await prisma.foodUnitConversion.update({
        where: { id },
        data: {
          ...(body.quantityInBaseServings != null && {
            quantityInBaseServings: body.quantityInBaseServings,
          }),
        },
      });

      return reply.send(mapFoodUnitConversion(updated));
    },
  );

  // DELETE /api/food/units/:id — delete a conversion
  app.delete<{ Params: { id: string } }>(
    "/api/food/units/:id",
    async (request, reply) => {
      const { id } = request.params;

      const existing = await prisma.foodUnitConversion.findUnique({
        where: { id },
      });
      if (!existing) {
        return reply.code(404).send({ error: "Unit conversion not found" });
      }

      await prisma.foodUnitConversion.delete({ where: { id } });
      return reply.code(204).send();
    },
  );

  // PATCH /api/food/units/cascade — atomically update multiple conversions (consistency cascade)
  app.patch<{ Body: CascadeUnitConversionsRequest }>(
    "/api/food/units/cascade",
    async (request, reply) => {
      const userId = request.userId;
      const { updates } = request.body;

      if (!Array.isArray(updates) || updates.length === 0) {
        return reply.code(400).send({ error: "updates array is required and must not be empty" });
      }

      await prisma.$transaction(
        updates.map((u) =>
          prisma.foodUnitConversion.update({
            where: { id: u.id, userId },
            data: { quantityInBaseServings: u.quantityInBaseServings },
          }),
        ),
      );

      return reply.code(204).send();
    },
  );

  // ---------------------------------------------------------------------------
  // POST /api/food/identify-photo — standalone camera food recognition (non-Kitchen Mode)
  // Accepts a JPEG image (base64), identifies the most prominent food via Gemini,
  // resolves nutrition via the existing lookup chain (custom → community → USDA),
  // and returns the matched food + estimated grams for pre-filling FoodDetailSheet.
  // ---------------------------------------------------------------------------

  app.post<{ Body: { imageBase64: string; depthContext?: string } }>(
    "/api/food/identify-photo",
    async (request, reply) => {
      const { imageBase64, depthContext } = request.body;

      if (!imageBase64) {
        return reply.code(400).send({ error: "imageBase64 is required" });
      }

      const userId = request.userId;

      // Step 1: Use Gemini vision to identify food + estimate grams
      const identified = await identifyFoodFromPhoto(imageBase64, depthContext);

      if (!identified) {
        const result: PhotoIdentificationResult = {
          source: null,
          food: null,
          estimatedGrams: 0,
          foodName: "",
        };
        return reply.send(result);
      }

      // Step 2: Resolve the food name through the lookup chain
      const lookup = await lookupFoodForKitchenMode(identified.foodName, userId);

      if (lookup.status === "not_found") {
        // Return food name + grams even if no match — client can fall back to manual search
        const result: PhotoIdentificationResult = {
          source: null,
          food: null,
          estimatedGrams: identified.estimatedGrams,
          foodName: identified.foodName,
        };
        return reply.send(result);
      }

      // Step 3: Fetch the actual food record based on the foodRef
      // lookup.status must be "found" here (not_found was handled above; "multiple" falls through to fallback)
      if (lookup.status !== "found") {
        const result: PhotoIdentificationResult = {
          source: null,
          food: null,
          estimatedGrams: identified.estimatedGrams,
          foodName: identified.foodName,
        };
        return reply.send(result);
      }

      const foodRef = lookup.foodRef; // "custom:UUID" | "usda:FDC_ID" | "community:UUID"
      const [refType, refId] = foodRef.split(":");

      if (refType === "custom") {
        const food = await prisma.customFood.findUnique({ where: { id: refId } });
        if (food) {
          const result: PhotoIdentificationResult = {
            source: "custom",
            food: {
              id: food.id,
              name: food.name,
              servingSize: food.servingSize,
              servingUnit: food.servingUnit,
              calories: food.calories,
              proteinG: food.proteinG,
              carbsG: food.carbsG,
              fatG: food.fatG,
              createdAt: food.createdAt.toISOString(),
              updatedAt: food.updatedAt.toISOString(),
            } as CustomFood,
            estimatedGrams: identified.estimatedGrams,
            foodName: food.name,
          };
          return reply.send(result);
        }
      } else if (refType === "community") {
        const food = await prisma.communityFood.findUnique({ where: { id: refId } });
        if (food) {
          const result: PhotoIdentificationResult = {
            source: "community",
            food: mapCommunityFood(food),
            estimatedGrams: identified.estimatedGrams,
            foodName: food.name,
          };
          return reply.send(result);
        }
      } else if (refType === "usda") {
        // For USDA foods, use the lookup result's pre-resolved macros (no extra API call)
        const fdcId = Number(refId);
        const usdaFood: USDASearchResult = {
          fdcId,
          description: lookup.name,
          servingSize: lookup.servingSize,
          servingSizeUnit: lookup.servingUnit,
          macros: {
            calories: lookup.caloriesPerServing,
            proteinG: lookup.proteinGPerServing,
            carbsG: lookup.carbsGPerServing,
            fatG: lookup.fatGPerServing,
          },
        };
        const result: PhotoIdentificationResult = {
          source: "usda",
          food: usdaFood,
          estimatedGrams: identified.estimatedGrams,
          foodName: lookup.name,
        };
        return reply.send(result);
      }

      // Fallback: lookup succeeded but fetch failed
      const result: PhotoIdentificationResult = {
        source: null,
        food: null,
        estimatedGrams: identified.estimatedGrams,
        foodName: identified.foodName,
      };
      return reply.send(result);
    },
  );

  // GET /api/food/entries/summary?from=YYYY-MM-DD&to=YYYY-MM-DD
  app.get<{ Querystring: { from: string; to: string } }>(
    "/api/food/entries/summary",
    async (request, reply) => {
      const userId = request.userId;
      const { from, to } = request.query;

      if (!from || !to) {
        return reply
          .code(400)
          .send({ error: "from and to query parameters are required" });
      }

      const groups = await prisma.foodEntry.groupBy({
        by: ["date"],
        where: {
          userId,
          date: { gte: new Date(from), lte: new Date(to) },
        },
        _sum: {
          calories: true,
          proteinG: true,
          carbsG: true,
          fatG: true,
        },
        _count: { id: true },
      });

      // Resolve goals for unique dates via GoalTimeline
      const goalTimeline = await prisma.goalTimeline.findMany({
        where: {
          userId,
          effectiveDate: { lte: new Date(to) },
        },
        orderBy: [{ effectiveDate: "desc" }, { createdAt: "desc" }],
      });

      function getGoalForDate(date: Date) {
        for (const g of goalTimeline) {
          if (g.effectiveDate <= date) {
            return {
              calories: g.calories,
              proteinG: g.proteinG,
              carbsG: g.carbsG,
              fatG: g.fatG,
            };
          }
        }
        return null;
      }

      const summaries = groups.map((g) => {
        const dateStr = g.date.toISOString().split("T")[0];
        const goal = getGoalForDate(g.date);
        return {
          date: dateStr,
          totalCalories: g._sum.calories ?? 0,
          totalProteinG: g._sum.proteinG ?? 0,
          totalCarbsG: g._sum.carbsG ?? 0,
          totalFatG: g._sum.fatG ?? 0,
          entryCount: g._count.id,
          goalCalories: goal?.calories ?? undefined,
          goalProteinG: goal?.proteinG ?? undefined,
          goalCarbsG: goal?.carbsG ?? undefined,
          goalFatG: goal?.fatG ?? undefined,
        };
      });

      return reply.send({ summaries });
    },
  );

  // GET /api/food/entries/export?from=YYYY-MM-DD&to=YYYY-MM-DD&format=csv
  app.get<{ Querystring: { from: string; to: string; format?: string } }>(
    "/api/food/entries/export",
    async (request, reply) => {
      const userId = request.userId;
      const { from, to } = request.query;

      if (!from || !to) {
        return reply
          .code(400)
          .send({ error: "from and to query parameters are required" });
      }

      const entries = await prisma.foodEntry.findMany({
        where: {
          userId,
          date: { gte: new Date(from), lte: new Date(to) },
        },
        orderBy: [{ date: "asc" }, { createdAt: "asc" }],
      });

      const header =
        "Date,Meal,Food Name,Quantity,Unit,Calories,Protein (g),Carbs (g),Fat (g),Source";
      const rows = entries.map((e) => {
        const dateStr = e.date.toISOString().split("T")[0];
        const escapedName = `"${e.name.replace(/"/g, '""')}"`;
        return `${dateStr},${e.mealLabel},${escapedName},${e.quantity},${e.unit},${e.calories},${e.proteinG},${e.carbsG},${e.fatG},${e.source}`;
      });

      const csv = [header, ...rows].join("\n");

      reply
        .header("Content-Type", "text/csv")
        .header(
          "Content-Disposition",
          `attachment; filename="macrotrack-${from}-to-${to}.csv"`,
        )
        .send(csv);
    },
  );
}
