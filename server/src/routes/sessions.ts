import type { FastifyInstance } from "fastify";
import { prisma } from "../db/client.js";
import type {
  VoiceSessionSummary,
  FoodEntry,
  DraftItem,
  FoodSource,
  MealLabel,
} from "../../../shared/types.js";

// ---------------------------------------------------------------------------
// Mapper: DB rows → VoiceSessionSummary
// ---------------------------------------------------------------------------

function mapSessionSummary(
  session: {
    id: string;
    date: Date | null;
    status: string;
    startedAt: Date;
    draftItems: unknown;
    foodEntries: Array<{
      id: string;
      date: Date;
      mealLabel: string;
      name: string;
      quantity: number;
      unit: string;
      calories: number;
      proteinG: number;
      carbsG: number;
      fatG: number;
      source: string;
      confirmedViaScale: boolean;
      usdaFdcId: number | null;
      customFoodId: string | null;
      communityFoodId: string | null;
      savedMealId: string | null;
      mealInstanceId: string | null;
      createdAt: Date;
    }>;
  },
): VoiceSessionSummary {
  const confirmedItems: FoodEntry[] = session.foodEntries.map((e) => ({
    id: e.id,
    date: e.date.toISOString().slice(0, 10),
    mealLabel: e.mealLabel as MealLabel,
    name: e.name,
    quantity: e.quantity,
    unit: e.unit,
    calories: e.calories,
    proteinG: e.proteinG,
    carbsG: e.carbsG,
    fatG: e.fatG,
    source: e.source as FoodSource,
    confirmedViaScale: e.confirmedViaScale,
    usdaFdcId: e.usdaFdcId ?? undefined,
    customFoodId: e.customFoodId ?? undefined,
    communityFoodId: e.communityFoodId ?? undefined,
    savedMealId: e.savedMealId ?? undefined,
    mealInstanceId: e.mealInstanceId ?? undefined,
    createdAt: e.createdAt.toISOString(),
  }));

  const draftItems: DraftItem[] = Array.isArray(session.draftItems)
    ? (session.draftItems as DraftItem[])
    : [];

  const allNormalItems = [
    ...confirmedItems,
    ...draftItems.filter((d) => d.state === "normal"),
  ];

  const totalCalories = allNormalItems.reduce((s, i) => s + i.calories, 0);
  const totalProteinG = allNormalItems.reduce((s, i) => s + i.proteinG, 0);
  const totalCarbsG = allNormalItems.reduce((s, i) => s + i.carbsG, 0);
  const totalFatG = allNormalItems.reduce((s, i) => s + i.fatG, 0);

  return {
    id: session.id,
    date: session.date?.toISOString().slice(0, 10) ?? "",
    status: session.status as VoiceSessionSummary["status"],
    startedAt: session.startedAt.toISOString(),
    confirmedItems,
    draftItems,
    totalCalories,
    totalProteinG,
    totalCarbsG,
    totalFatG,
    itemCount: confirmedItems.length + draftItems.length,
  };
}

// ---------------------------------------------------------------------------
// Routes
// ---------------------------------------------------------------------------

export async function sessionRoutes(fastify: FastifyInstance): Promise<void> {
  // GET /api/sessions?date=YYYY-MM-DD — list paused sessions for a date
  fastify.get("/api/sessions", async (request, reply) => {
    const userId = request.userId;
    const { date } = request.query as { date?: string };

    if (!date) {
      return reply.status(400).send({ error: "date query parameter is required" });
    }

    const sessions = await prisma.voiceSession.findMany({
      where: {
        userId,
        date: new Date(date),
        status: "paused",
      },
      include: { foodEntries: true },
      orderBy: { startedAt: "desc" },
    });

    return sessions.map(mapSessionSummary);
  });

  // GET /api/sessions/:id — get a single session
  fastify.get("/api/sessions/:id", async (request, reply) => {
    const userId = request.userId;
    const { id } = request.params as { id: string };

    const session = await prisma.voiceSession.findUnique({
      where: { id },
      include: { foodEntries: true },
    });

    if (!session || session.userId !== userId) {
      return reply.status(404).send({ error: "Session not found" });
    }

    return mapSessionSummary(session);
  });

  // DELETE /api/sessions/:id — delete a paused session and its entries
  fastify.delete("/api/sessions/:id", async (request, reply) => {
    const userId = request.userId;
    const { id } = request.params as { id: string };

    const session = await prisma.voiceSession.findUnique({
      where: { id },
      select: { userId: true, status: true },
    });

    if (!session || session.userId !== userId) {
      return reply.status(404).send({ error: "Session not found" });
    }

    // Delete associated food entries, then the session itself
    await prisma.$transaction(async (tx) => {
      await tx.foodEntry.deleteMany({
        where: { voiceSessionId: id },
      });
      await tx.voiceSession.update({
        where: { id },
        data: { status: "cancelled", endedAt: new Date() },
      });
    });

    return { success: true };
  });
}
