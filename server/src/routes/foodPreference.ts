import type { FastifyInstance } from "fastify";
import { prisma } from "../db/client.js";
import type { UserFoodPreference, UpsertFoodPreferenceRequest } from "../../../shared/types.js";

function parseFoodRef(foodRef: string): { customFoodId?: string; communityFoodId?: string; usdaFdcId?: number } | null {
  const [type, id] = foodRef.split(":");
  if (!type || !id) return null;
  switch (type) {
    case "custom":    return { customFoodId: id };
    case "dialed":
    case "community": return { communityFoodId: id };
    case "usda": {
      const parsed = Number.parseInt(id, 10);
      return Number.isFinite(parsed) ? { usdaFdcId: parsed } : null;
    }
    default: return null;
  }
}

function mapPreference(row: {
  id: string;
  customFoodId: string | null;
  communityFoodId: string | null;
  usdaFdcId: number | null;
  defaultQuantity: number | null;
  defaultUnit: string | null;
}): UserFoodPreference {
  return {
    id: row.id,
    customFoodId: row.customFoodId ?? undefined,
    communityFoodId: row.communityFoodId ?? undefined,
    usdaFdcId: row.usdaFdcId ?? undefined,
    defaultQuantity: row.defaultQuantity ?? undefined,
    defaultUnit: row.defaultUnit ?? undefined,
  };
}

export async function foodPreferenceRoutes(app: FastifyInstance) {
  // GET /api/food/preferences — list all user preferences
  app.get("/api/food/preferences", async (request, reply) => {
    const userId = request.userId;
    const prefs = await prisma.userFoodPreference.findMany({ where: { userId } });
    return reply.send(prefs.map(mapPreference));
  });

  // GET /api/food/preferences/:foodRef — get preference for a specific food
  app.get<{ Params: { foodRef: string } }>(
    "/api/food/preferences/:foodRef",
    async (request, reply) => {
      const userId = request.userId;
      const ref = parseFoodRef(request.params.foodRef);
      if (!ref) return reply.code(400).send({ error: "Invalid foodRef format. Use custom:<id>, dialed:<id>, community:<id>, or usda:<fdcId>" });

      const pref = await prisma.userFoodPreference.findFirst({
        where: { userId, ...ref },
      });

      if (!pref) return reply.code(404).send({ error: "No preference found" });
      return reply.send(mapPreference(pref));
    },
  );

  // PUT /api/food/preferences/:foodRef — create or update preference
  app.put<{ Params: { foodRef: string }; Body: UpsertFoodPreferenceRequest }>(
    "/api/food/preferences/:foodRef",
    async (request, reply) => {
      const userId = request.userId;
      const ref = parseFoodRef(request.params.foodRef);
      if (!ref) return reply.code(400).send({ error: "Invalid foodRef format" });

      const body = request.body;
      if (body.defaultQuantity == null && body.defaultUnit == null) {
        return reply.code(400).send({ error: "At least one of defaultQuantity or defaultUnit is required" });
      }

      // Build the unique constraint for upsert
      const uniqueWhere = ref.customFoodId
        ? { userId_customFoodId: { userId, customFoodId: ref.customFoodId } }
        : ref.communityFoodId
          ? { userId_communityFoodId: { userId, communityFoodId: ref.communityFoodId } }
          : { userId_usdaFdcId: { userId, usdaFdcId: ref.usdaFdcId! } };

      const pref = await prisma.userFoodPreference.upsert({
        where: uniqueWhere,
        create: {
          userId,
          ...ref,
          defaultQuantity: body.defaultQuantity,
          defaultUnit: body.defaultUnit,
        },
        update: {
          ...(body.defaultQuantity !== undefined && { defaultQuantity: body.defaultQuantity }),
          ...(body.defaultUnit !== undefined && { defaultUnit: body.defaultUnit }),
        },
      });

      return reply.send(mapPreference(pref));
    },
  );

  // DELETE /api/food/preferences/:foodRef — remove preference
  app.delete<{ Params: { foodRef: string } }>(
    "/api/food/preferences/:foodRef",
    async (request, reply) => {
      const userId = request.userId;
      const ref = parseFoodRef(request.params.foodRef);
      if (!ref) return reply.code(400).send({ error: "Invalid foodRef format" });

      await prisma.userFoodPreference.deleteMany({
        where: { userId, ...ref },
      });

      return reply.code(204).send();
    },
  );
}
