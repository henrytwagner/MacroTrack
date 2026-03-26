import type { FastifyInstance } from "fastify";
import { prisma } from "../db/client.js";
import { getDefaultUserId } from "../db/defaultUser.js";
import type { CommunityFood } from "../../../shared/types.js";

const REPORT_THRESHOLD = 5;
const TRUST_PENALTY_PER_REPORT = 0.08;
const MAX_CALORIES_PER_SERVING = 10_000;
const MAX_CREATIONS_PER_DAY = 20;

interface CommunityFoodRow {
  id: string;
  name: string;
  brandName: string | null;
  description: string | null;
  defaultServingSize: number;
  defaultServingUnit: string;
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
  usdaFdcId: number | null;
  createdByUserId: string | null;
  status: string;
  usesCount: number;
  reportsCount: number;
  trustScore: number;
  lastUsedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

export function mapCommunityFood(food: CommunityFoodRow): CommunityFood {
  return {
    id: food.id,
    name: food.name,
    brandName: food.brandName ?? undefined,
    description: food.description ?? undefined,
    defaultServingSize: food.defaultServingSize,
    defaultServingUnit: food.defaultServingUnit,
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
    usdaFdcId: food.usdaFdcId ?? undefined,
    createdByUserId: food.createdByUserId ?? undefined,
    status: food.status as CommunityFood["status"],
    usesCount: food.usesCount,
    reportsCount: food.reportsCount,
    trustScore: food.trustScore,
    lastUsedAt: food.lastUsedAt?.toISOString(),
    createdAt: food.createdAt.toISOString(),
    updatedAt: food.updatedAt.toISOString(),
  };
}

interface CreateCommunityFoodBody {
  name: string;
  brandName?: string;
  description?: string;
  defaultServingSize: number;
  defaultServingUnit: string;
  calories: number;
  proteinG: number;
  carbsG: number;
  fatG: number;
  sodiumMg?: number;
  cholesterolMg?: number;
  fiberG?: number;
  sugarG?: number;
  saturatedFatG?: number;
  transFatG?: number;
  barcode?: string;
  barcodeType?: string;
}

type UpdateCommunityFoodBody = Partial<CreateCommunityFoodBody>;

interface ReportBody {
  reason: string;
  details?: string;
}

function validateMacros(body: CreateCommunityFoodBody): string | null {
  if (!body.name?.trim()) return "name is required";
  if (body.defaultServingSize == null || body.defaultServingSize <= 0)
    return "defaultServingSize must be positive";
  if (!body.defaultServingUnit?.trim()) return "defaultServingUnit is required";
  if (body.calories == null || body.proteinG == null || body.carbsG == null || body.fatG == null)
    return "calories, proteinG, carbsG, and fatG are required";
  if (body.calories < 0 || body.proteinG < 0 || body.carbsG < 0 || body.fatG < 0)
    return "Macro values cannot be negative";
  if (body.calories > MAX_CALORIES_PER_SERVING)
    return `calories cannot exceed ${MAX_CALORIES_PER_SERVING} per serving`;
  return null;
}

export async function communityFoodRoutes(app: FastifyInstance) {
  // GET /api/food/community — list community foods
  app.get<{ Querystring: { status?: string; page?: string; limit?: string } }>(
    "/api/food/community",
    async (request, reply) => {
      const status = request.query.status ?? "ACTIVE";
      const page = Math.max(1, parseInt(request.query.page ?? "1", 10));
      const limit = Math.min(100, Math.max(1, parseInt(request.query.limit ?? "20", 10)));

      const foods = await prisma.communityFood.findMany({
        ...(status !== "ALL" && { where: { status: status as "ACTIVE" | "PENDING" | "RETIRED" } }),
        orderBy: [{ trustScore: "desc" }, { usesCount: "desc" }, { name: "asc" }],
        skip: (page - 1) * limit,
        take: limit,
      });

      return reply.send(foods.map(mapCommunityFood));
    },
  );

  // GET /api/food/community/:id — get a single community food with barcodes
  app.get<{ Params: { id: string } }>(
    "/api/food/community/:id",
    async (request, reply) => {
      const { id } = request.params;

      const food = await prisma.communityFood.findUnique({
        where: { id },
        include: { barcodes: true },
      });

      if (!food) {
        return reply.code(404).send({ error: "Community food not found" });
      }

      return reply.send({
        ...mapCommunityFood(food),
        barcodes: food.barcodes.map((b) => ({
          id: b.id,
          barcode: b.barcode,
          type: b.type,
        })),
      });
    },
  );

  // POST /api/food/community — create a community food
  app.post<{ Body: CreateCommunityFoodBody }>(
    "/api/food/community",
    async (request, reply) => {
      const userId = await getDefaultUserId();
      const body = request.body;

      const validationError = validateMacros(body);
      if (validationError) {
        return reply.code(400).send({ error: validationError });
      }

      // Rate limit: max creations per user per day
      const dayStart = new Date();
      dayStart.setHours(0, 0, 0, 0);
      const todayCount = await prisma.communityFood.count({
        where: {
          createdByUserId: userId,
          createdAt: { gte: dayStart },
        },
      });
      if (todayCount >= MAX_CREATIONS_PER_DAY) {
        return reply.code(429).send({
          error: `Rate limit: max ${MAX_CREATIONS_PER_DAY} community foods per day`,
        });
      }

      // If a barcode is provided, check uniqueness
      if (body.barcode) {
        const existing = await prisma.communityFoodBarcode.findUnique({
          where: { barcode: body.barcode },
        });
        if (existing) {
          return reply.code(409).send({
            error: "A community food with this barcode already exists",
            existingCommunityFoodId: existing.communityFoodId,
          });
        }
      }

      const food = await prisma.communityFood.create({
        data: {
          name: body.name.trim(),
          brandName: body.brandName?.trim() || null,
          description: body.description?.trim() || null,
          defaultServingSize: body.defaultServingSize,
          defaultServingUnit: body.defaultServingUnit,
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
        include: { barcodes: true },
      });

      return reply.code(201).send({
        ...mapCommunityFood(food),
        barcodes: food.barcodes.map((b) => ({
          id: b.id,
          barcode: b.barcode,
          type: b.type,
        })),
      });
    },
  );

  // PUT /api/food/community/:id — update a community food
  app.put<{ Params: { id: string }; Body: UpdateCommunityFoodBody }>(
    "/api/food/community/:id",
    async (request, reply) => {
      const { id } = request.params;
      const body = request.body;
      const userId = await getDefaultUserId();

      const existing = await prisma.communityFood.findUnique({ where: { id } });
      if (!existing) {
        return reply.code(404).send({ error: "Community food not found" });
      }

      const trimmedBarcode =
        typeof body.barcode === "string" ? body.barcode.trim() : "";
      if (trimmedBarcode) {
        const barcodeRow = await prisma.communityFoodBarcode.findUnique({
          where: { barcode: trimmedBarcode },
        });
        if (barcodeRow && barcodeRow.communityFoodId !== id) {
          return reply.code(409).send({
            error: "A community food with this barcode already exists",
            existingCommunityFoodId: barcodeRow.communityFoodId,
          });
        }
      }

      const food = await prisma.$transaction(async (tx) => {
        const updated = await tx.communityFood.update({
          where: { id },
          data: {
            ...(body.name !== undefined && { name: body.name.trim() }),
            ...(body.brandName !== undefined && { brandName: body.brandName?.trim() || null }),
            ...(body.description !== undefined && { description: body.description?.trim() || null }),
            ...(body.defaultServingSize !== undefined && { defaultServingSize: body.defaultServingSize }),
            ...(body.defaultServingUnit !== undefined && { defaultServingUnit: body.defaultServingUnit }),
            ...(body.calories !== undefined && { calories: body.calories }),
            ...(body.proteinG !== undefined && { proteinG: body.proteinG }),
            ...(body.carbsG !== undefined && { carbsG: body.carbsG }),
            ...(body.fatG !== undefined && { fatG: body.fatG }),
            ...(body.sodiumMg !== undefined && { sodiumMg: body.sodiumMg }),
            ...(body.cholesterolMg !== undefined && { cholesterolMg: body.cholesterolMg }),
            ...(body.fiberG !== undefined && { fiberG: body.fiberG }),
            ...(body.sugarG !== undefined && { sugarG: body.sugarG }),
            ...(body.saturatedFatG !== undefined && { saturatedFatG: body.saturatedFatG }),
            ...(body.transFatG !== undefined && { transFatG: body.transFatG }),
          },
        });

        if (trimmedBarcode) {
          const stillMissing = await tx.communityFoodBarcode.findUnique({
            where: { barcode: trimmedBarcode },
          });
          if (!stillMissing) {
            await tx.communityFoodBarcode.create({
              data: {
                barcode: trimmedBarcode,
                type: (body.barcodeType as "UPC_A" | "EAN_13" | "CODE_128" | "OTHER") ?? "OTHER",
                communityFoodId: id,
                createdByUserId: userId,
              },
            });
          }
        }

        return updated;
      });

      return reply.send(mapCommunityFood(food));
    },
  );

  // DELETE /api/food/community/:id — delete a community food
  app.delete<{ Params: { id: string } }>(
    "/api/food/community/:id",
    async (request, reply) => {
      const { id } = request.params;

      const existing = await prisma.communityFood.findUnique({ where: { id } });
      if (!existing) {
        return reply.code(404).send({ error: "Community food not found" });
      }

      await prisma.communityFood.delete({ where: { id } });
      return reply.code(204).send();
    },
  );

  // POST /api/food/community/:id/report — report incorrect data
  app.post<{ Params: { id: string }; Body: ReportBody }>(
    "/api/food/community/:id/report",
    async (request, reply) => {
      const { id } = request.params;
      const { reason, details } = request.body;
      const userId = await getDefaultUserId();

      if (!reason?.trim()) {
        return reply.code(400).send({ error: "reason is required" });
      }

      const food = await prisma.communityFood.findUnique({ where: { id } });
      if (!food) {
        return reply.code(404).send({ error: "Community food not found" });
      }

      const newReportsCount = food.reportsCount + 1;
      const newTrustScore = Math.max(0, food.trustScore - TRUST_PENALTY_PER_REPORT);
      const newStatus =
        newReportsCount >= REPORT_THRESHOLD && food.status === "ACTIVE"
          ? "PENDING"
          : food.status;

      await prisma.$transaction([
        prisma.communityFoodReport.create({
          data: {
            communityFoodId: id,
            reporterUserId: userId,
            reason: reason.trim(),
            details: details?.trim() || null,
          },
        }),
        prisma.communityFood.update({
          where: { id },
          data: {
            reportsCount: newReportsCount,
            trustScore: newTrustScore,
            status: newStatus as "ACTIVE" | "PENDING" | "RETIRED",
          },
        }),
      ]);

      return reply.code(201).send({ reported: true });
    },
  );
}
