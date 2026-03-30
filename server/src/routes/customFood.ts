import type { FastifyInstance } from "fastify";
import { prisma } from "../db/client.js";

import { mapCommunityFood } from "./communityFood.js";
import type {
  CustomFood,
  CreateCustomFoodRequest,
  UpdateCustomFoodRequest,
} from "../../../shared/types.js";

const MAX_COMMUNITY_CREATIONS_PER_DAY = 20;

interface PublishCustomFoodBody {
  brandName?: string;
  barcode?: string;
  barcodeType?: string;
}

// ---------------------------------------------------------------------------
// Prisma-to-shared-type mapper
// ---------------------------------------------------------------------------

export function mapCustomFood(food: {
  id: string;
  name: string;
  brandName?: string | null;
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
  barcode: string | null;
  createdAt: Date;
  updatedAt: Date;
}): CustomFood {
  return {
    id: food.id,
    name: food.name,
    brandName: food.brandName ?? undefined,
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
    barcode: food.barcode ?? undefined,
    createdAt: food.createdAt.toISOString(),
    updatedAt: food.updatedAt.toISOString(),
  };
}

// ---------------------------------------------------------------------------
// Route plugin
// ---------------------------------------------------------------------------

export async function customFoodRoutes(app: FastifyInstance) {
  // GET /api/food/custom — list all custom foods
  app.get("/api/food/custom", async (request, reply) => {
    const userId = request.userId;

    const foods = await prisma.customFood.findMany({
      where: { userId },
      orderBy: { name: "asc" },
    });

    return reply.send(foods.map(mapCustomFood));
  });

  // POST /api/food/custom — create a custom food
  app.post<{ Body: CreateCustomFoodRequest }>(
    "/api/food/custom",
    async (request, reply) => {
      const userId = request.userId;
      const body = request.body;

      if (
        !body.name ||
        body.servingSize == null ||
        !body.servingUnit ||
        body.calories == null ||
        body.proteinG == null ||
        body.carbsG == null ||
        body.fatG == null
      ) {
        return reply.code(400).send({
          error:
            "name, servingSize, servingUnit, calories, proteinG, carbsG, and fatG are required",
        });
      }

      const food = await prisma.customFood.create({
        data: {
          userId,
          name: body.name,
          brandName: body.brandName?.trim() || null,
          servingSize: body.servingSize,
          servingUnit: body.servingUnit,
          calories: body.calories,
          proteinG: body.proteinG,
          carbsG: body.carbsG,
          fatG: body.fatG,
          sodiumMg: body.sodiumMg,
          cholesterolMg: body.cholesterolMg,
          fiberG: body.fiberG,
          sugarG: body.sugarG,
          saturatedFatG: body.saturatedFatG,
          transFatG: body.transFatG,
          barcode: body.barcode ?? null,
        },
      });

      return reply.code(201).send(mapCustomFood(food));
    },
  );

  // PUT /api/food/custom/:id — update a custom food
  app.put<{ Params: { id: string }; Body: UpdateCustomFoodRequest }>(
    "/api/food/custom/:id",
    async (request, reply) => {
      const { id } = request.params;
      const body = request.body;

      const existing = await prisma.customFood.findUnique({ where: { id } });
      if (!existing) {
        return reply.code(404).send({ error: "Custom food not found" });
      }

      const food = await prisma.customFood.update({
        where: { id },
        data: {
          ...(body.name !== undefined && { name: body.name }),
          ...(body.brandName !== undefined && { brandName: body.brandName?.trim() || null }),
          ...(body.servingSize !== undefined && {
            servingSize: body.servingSize,
          }),
          ...(body.servingUnit !== undefined && {
            servingUnit: body.servingUnit,
          }),
          ...(body.calories !== undefined && { calories: body.calories }),
          ...(body.proteinG !== undefined && { proteinG: body.proteinG }),
          ...(body.carbsG !== undefined && { carbsG: body.carbsG }),
          ...(body.fatG !== undefined && { fatG: body.fatG }),
          ...(body.sodiumMg !== undefined && { sodiumMg: body.sodiumMg }),
          ...(body.cholesterolMg !== undefined && {
            cholesterolMg: body.cholesterolMg,
          }),
          ...(body.fiberG !== undefined && { fiberG: body.fiberG }),
          ...(body.sugarG !== undefined && { sugarG: body.sugarG }),
          ...(body.saturatedFatG !== undefined && {
            saturatedFatG: body.saturatedFatG,
          }),
          ...(body.transFatG !== undefined && { transFatG: body.transFatG }),
          ...(body.barcode !== undefined && { barcode: body.barcode || null }),
        },
      });

      return reply.send(mapCustomFood(food));
    },
  );

  // DELETE /api/food/custom/:id — delete a custom food
  app.delete<{ Params: { id: string } }>(
    "/api/food/custom/:id",
    async (request, reply) => {
      const { id } = request.params;

      const existing = await prisma.customFood.findUnique({ where: { id } });
      if (!existing) {
        return reply.code(404).send({ error: "Custom food not found" });
      }

      await prisma.customFood.delete({ where: { id } });
      return reply.code(204).send();
    },
  );

  // POST /api/food/custom/:id/publish — atomically convert a custom food to a community food
  app.post<{ Params: { id: string }; Body: PublishCustomFoodBody }>(
    "/api/food/custom/:id/publish",
    async (request, reply) => {
      const { id } = request.params;
      const userId = request.userId;
      const body = request.body ?? {};

      const custom = await prisma.customFood.findUnique({ where: { id } });
      if (!custom) {
        return reply.code(404).send({ error: "Custom food not found" });
      }

      const dayStart = new Date();
      dayStart.setHours(0, 0, 0, 0);
      const todayCount = await prisma.communityFood.count({
        where: { createdByUserId: userId, createdAt: { gte: dayStart } },
      });
      if (todayCount >= MAX_COMMUNITY_CREATIONS_PER_DAY) {
        return reply.code(429).send({
          error: `Rate limit: max ${MAX_COMMUNITY_CREATIONS_PER_DAY} community foods per day`,
        });
      }

      if (body.barcode) {
        const existingBarcode = await prisma.communityFoodBarcode.findUnique({
          where: { barcode: body.barcode },
        });
        if (existingBarcode) {
          return reply.code(409).send({
            error: "A community food with this barcode already exists",
            existingCommunityFoodId: existingBarcode.communityFoodId,
          });
        }
      }

      const communityFood = await prisma.$transaction(async (tx) => {
        const cf = await tx.communityFood.create({
          data: {
            name: custom.name,
            brandName: body.brandName?.trim() || null,
            defaultServingSize: custom.servingSize,
            defaultServingUnit: custom.servingUnit,
            calories: custom.calories,
            proteinG: custom.proteinG,
            carbsG: custom.carbsG,
            fatG: custom.fatG,
            sodiumMg: custom.sodiumMg,
            cholesterolMg: custom.cholesterolMg,
            fiberG: custom.fiberG,
            sugarG: custom.sugarG,
            saturatedFatG: custom.saturatedFatG,
            transFatG: custom.transFatG,
            createdByUserId: userId,
            ...(body.barcode && {
              barcodes: {
                create: {
                  barcode: body.barcode,
                  type: (body.barcodeType as "UPC_A" | "EAN_13" | "CODE_128" | "OTHER") ?? "OTHER",
                  createdByUserId: userId,
                },
              },
            }),
          },
        });

        await tx.foodEntry.updateMany({
          where: { customFoodId: id },
          data: {
            communityFoodId: cf.id,
            source: "COMMUNITY",
            customFoodId: null,
          },
        });

        await tx.customFood.delete({ where: { id } });

        return cf;
      });

      return reply.code(201).send(mapCommunityFood(communityFood));
    },
  );
}
