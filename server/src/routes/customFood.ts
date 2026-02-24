import type { FastifyInstance } from "fastify";
import { prisma } from "../db/client.js";
import { getDefaultUserId } from "../db/defaultUser.js";
import type {
  CustomFood,
  CreateCustomFoodRequest,
  UpdateCustomFoodRequest,
} from "../../../shared/types.js";

// ---------------------------------------------------------------------------
// Prisma-to-shared-type mapper
// ---------------------------------------------------------------------------

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

export async function customFoodRoutes(app: FastifyInstance) {
  // GET /api/food/custom — list all custom foods
  app.get("/api/food/custom", async (_request, reply) => {
    const userId = await getDefaultUserId();

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
      const userId = await getDefaultUserId();
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
}
