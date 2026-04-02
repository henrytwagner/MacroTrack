#!/usr/bin/env npx tsx
/**
 * Copies all account data for a specific user from the dev database to the local database.
 * Uses raw SQL fallback for tables where the dev DB schema is behind the local Prisma client.
 *
 * Usage:
 *   npx tsx scripts/copy-user-from-dev.ts <email>
 */

import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import pg from "pg";

const DEV_DATABASE_URL =
  "postgresql://postgres:bCERTOfBVjVkYyQrzBwLMaYnzrCrgQOo@gondola.proxy.rlwy.net:51614/railway";
const LOCAL_DATABASE_URL =
  process.env.DATABASE_URL ??
  "postgresql://postgres:postgres@localhost:5432/macrotrack?schema=public";

const email = process.argv[2];
if (!email) {
  console.error("Usage: npx tsx scripts/copy-user-from-dev.ts <email>");
  process.exit(1);
}

function makeClient(url: string) {
  const host = new URL(url).hostname;
  const needsSsl = host.endsWith(".proxy.rlwy.net");
  const pool = new pg.Pool({
    connectionString: url,
    ssl: needsSsl ? { rejectUnauthorized: false } : false,
  });
  const adapter = new PrismaPg(pool);
  return { prisma: new PrismaClient({ adapter }), pool };
}

const { prisma: dev, pool: devPool } = makeClient(DEV_DATABASE_URL);
const { prisma: local, pool: localPool } = makeClient(LOCAL_DATABASE_URL);

async function main() {
  console.log(`Looking up user ${email} in dev database...`);

  const user = await dev.user.findUnique({ where: { email } });
  if (!user) {
    console.error(`User with email ${email} not found in dev database.`);
    process.exit(1);
  }

  const userId = user.id;
  console.log(`Found user: ${user.name} (${userId})`);

  console.log("Fetching data from dev...");

  // Tables with matching schemas — use Prisma
  const [
    dailyGoal,
    foodEntries,
    voiceSessions,
    goalProfiles,
    goalTimeline,
    savedMeals,
    weightEntries,
    barcodesCreated,
    foodReports,
  ] = await Promise.all([
    dev.dailyGoal.findUnique({ where: { userId } }),
    dev.foodEntry.findMany({ where: { userId } }),
    dev.voiceSession.findMany({ where: { userId } }),
    dev.goalProfile.findMany({ where: { userId } }),
    dev.goalTimeline.findMany({ where: { userId } }),
    dev.savedMeal.findMany({ where: { userId }, include: { items: true } }),
    dev.weightEntry.findMany({ where: { userId } }),
    dev.communityFoodBarcode.findMany({ where: { createdByUserId: userId } }),
    dev.communityFoodReport.findMany({ where: { reporterUserId: userId } }),
  ]);

  // Tables with schema mismatches — use raw SQL via devPool
  // CustomFood: dev is missing potassiumMg, calciumMg, ironMg, vitaminDMcg, addedSugarG, category
  const customFoodsRaw = (
    await devPool.query('SELECT * FROM "CustomFood" WHERE "userId" = $1', [userId])
  ).rows;

  // CommunityFood: dev is missing several columns
  const communityFoodsCreatedRaw = (
    await devPool.query('SELECT * FROM "CommunityFood" WHERE "createdByUserId" = $1', [userId])
  ).rows;

  // FoodUnitConversion: dev is missing communityFoodId
  const unitConversionsRaw = (
    await devPool.query('SELECT * FROM "FoodUnitConversion" WHERE "userId" = $1', [userId])
  ).rows;

  // Fetch community foods referenced by food entries
  const referencedCommunityFoodIds = [
    ...new Set(
      foodEntries
        .map((e) => e.communityFoodId)
        .filter((id): id is string => id !== null)
    ),
  ];
  const createdCommunityFoodIds = new Set(communityFoodsCreatedRaw.map((f: any) => f.id));
  const missingCommunityFoodIds = referencedCommunityFoodIds.filter(
    (id) => !createdCommunityFoodIds.has(id)
  );
  const referencedCommunityFoodsRaw =
    missingCommunityFoodIds.length > 0
      ? (
          await devPool.query(
            `SELECT * FROM "CommunityFood" WHERE id = ANY($1)`,
            [missingCommunityFoodIds]
          )
        ).rows
      : [];

  // Helper: safe raw SQL query (returns [] if table doesn't exist)
  async function safeQuery(label: string, sql: string, params: any[]): Promise<any[]> {
    try {
      return (await devPool.query(sql, params)).rows;
    } catch (e: any) {
      if (e?.code === "42P01" || e?.code === "42703") {
        console.warn(`  [SKIP] ${label} — missing table or column in dev DB`);
        return [];
      }
      throw e;
    }
  }

  // Community food aliases
  const allCommunityFoodIds = [
    ...createdCommunityFoodIds,
    ...missingCommunityFoodIds,
  ];
  const communityFoodAliasesRaw =
    allCommunityFoodIds.length > 0
      ? await safeQuery("CommunityFoodAlias",
          `SELECT * FROM "CommunityFoodAlias" WHERE "communityFoodId" = ANY($1)`,
          [allCommunityFoodIds])
      : [];

  // Barcodes for referenced community foods
  const referencedBarcodes =
    missingCommunityFoodIds.length > 0
      ? await safeQuery("CommunityFoodBarcode (referenced)",
          `SELECT * FROM "CommunityFoodBarcode" WHERE "communityFoodId" = ANY($1)`,
          [missingCommunityFoodIds])
      : [];

  // Community unit conversions (communityFoodId column may not exist)
  const communityUnitConversionsRaw =
    allCommunityFoodIds.length > 0
      ? await safeQuery("CommunityUnitConversions",
          `SELECT * FROM "FoodUnitConversion" WHERE "communityFoodId" = ANY($1) AND "userId" IS NULL`,
          [allCommunityFoodIds])
      : [];

  console.log(`\nData summary:`);
  console.log(`  DailyGoal: ${dailyGoal ? 1 : 0}`);
  console.log(`  FoodEntries: ${foodEntries.length}`);
  console.log(`  CustomFoods: ${customFoodsRaw.length}`);
  console.log(`  VoiceSessions: ${voiceSessions.length}`);
  console.log(`  GoalProfiles: ${goalProfiles.length}`);
  console.log(`  GoalTimeline: ${goalTimeline.length}`);
  console.log(`  UnitConversions: ${unitConversionsRaw.length}`);
  console.log(`  SavedMeals: ${savedMeals.length}`);
  console.log(`  WeightEntries: ${weightEntries.length}`);
  console.log(`  CommunityFoods (created): ${communityFoodsCreatedRaw.length}`);
  console.log(`  CommunityFoods (referenced): ${referencedCommunityFoodsRaw.length}`);
  console.log(`  CommunityFoodAliases: ${communityFoodAliasesRaw.length}`);
  console.log(`  CommunityFoodBarcodes: ${barcodesCreated.length + referencedBarcodes.length}`);
  console.log(`  FoodReports: ${foodReports.length}`);
  console.log(`  CommunityUnitConversions: ${communityUnitConversionsRaw.length}`);

  // Insert into local database
  console.log("\nInserting into local database...");

  await local.$transaction(async (tx) => {
    // 1. User (without currentGoalProfileId FK)
    const { currentGoalProfileId, ...userWithoutGoalProfile } = user;
    await tx.user.upsert({
      where: { id: userId },
      create: { ...userWithoutGoalProfile, currentGoalProfileId: null },
      update: { ...userWithoutGoalProfile, currentGoalProfileId: null },
    });
    console.log("  [OK] User");

    // 2. DailyGoal
    if (dailyGoal) {
      await tx.dailyGoal.upsert({
        where: { userId },
        create: dailyGoal,
        update: dailyGoal,
      });
      console.log("  [OK] DailyGoal");
    }

    // 3. GoalProfiles
    for (const gp of goalProfiles) {
      await tx.goalProfile.upsert({
        where: { id: gp.id },
        create: gp,
        update: gp,
      });
    }
    if (goalProfiles.length) console.log("  [OK] GoalProfiles");

    if (currentGoalProfileId) {
      await tx.user.update({
        where: { id: userId },
        data: { currentGoalProfileId },
      });
    }

    // 4. GoalTimeline
    for (const gt of goalTimeline) {
      await tx.goalTimeline.upsert({
        where: { id: gt.id },
        create: gt,
        update: gt,
      });
    }
    if (goalTimeline.length) console.log("  [OK] GoalTimeline");

    // 5. CustomFoods (via Prisma upsert, filling in missing columns with defaults)
    for (const raw of customFoodsRaw) {
      await tx.customFood.upsert({
        where: { id: raw.id },
        create: {
          id: raw.id,
          userId: raw.userId,
          name: raw.name,
          brandName: raw.brandName ?? null,
          servingSize: raw.servingSize,
          servingUnit: raw.servingUnit,
          calories: raw.calories,
          proteinG: raw.proteinG,
          carbsG: raw.carbsG,
          fatG: raw.fatG,
          sodiumMg: raw.sodiumMg ?? null,
          cholesterolMg: raw.cholesterolMg ?? null,
          fiberG: raw.fiberG ?? null,
          sugarG: raw.sugarG ?? null,
          saturatedFatG: raw.saturatedFatG ?? null,
          transFatG: raw.transFatG ?? null,
          potassiumMg: raw.potassiumMg ?? null,
          calciumMg: raw.calciumMg ?? null,
          ironMg: raw.ironMg ?? null,
          vitaminDMcg: raw.vitaminDMcg ?? null,
          addedSugarG: raw.addedSugarG ?? null,
          category: raw.category ?? null,
          barcode: raw.barcode ?? null,
          createdAt: raw.createdAt,
          updatedAt: raw.updatedAt,
        },
        update: {
          name: raw.name,
          brandName: raw.brandName ?? null,
          servingSize: raw.servingSize,
          servingUnit: raw.servingUnit,
          calories: raw.calories,
          proteinG: raw.proteinG,
          carbsG: raw.carbsG,
          fatG: raw.fatG,
          sodiumMg: raw.sodiumMg ?? null,
          cholesterolMg: raw.cholesterolMg ?? null,
          fiberG: raw.fiberG ?? null,
          sugarG: raw.sugarG ?? null,
          saturatedFatG: raw.saturatedFatG ?? null,
          transFatG: raw.transFatG ?? null,
          potassiumMg: raw.potassiumMg ?? null,
          calciumMg: raw.calciumMg ?? null,
          ironMg: raw.ironMg ?? null,
          vitaminDMcg: raw.vitaminDMcg ?? null,
          addedSugarG: raw.addedSugarG ?? null,
          category: raw.category ?? null,
          barcode: raw.barcode ?? null,
        },
      });
    }
    if (customFoodsRaw.length) console.log("  [OK] CustomFoods");

    // 6. CommunityFoods (filling in missing columns with defaults)
    const allCommunityFoodsRaw = [...referencedCommunityFoodsRaw, ...communityFoodsCreatedRaw];
    for (const raw of allCommunityFoodsRaw) {
      await tx.communityFood.upsert({
        where: { id: raw.id },
        create: {
          id: raw.id,
          name: raw.name,
          brandName: raw.brandName ?? null,
          description: raw.description ?? null,
          defaultServingSize: raw.defaultServingSize,
          defaultServingUnit: raw.defaultServingUnit,
          calories: raw.calories,
          proteinG: raw.proteinG,
          carbsG: raw.carbsG,
          fatG: raw.fatG,
          sodiumMg: raw.sodiumMg ?? null,
          cholesterolMg: raw.cholesterolMg ?? null,
          fiberG: raw.fiberG ?? null,
          sugarG: raw.sugarG ?? null,
          saturatedFatG: raw.saturatedFatG ?? null,
          transFatG: raw.transFatG ?? null,
          potassiumMg: raw.potassiumMg ?? null,
          calciumMg: raw.calciumMg ?? null,
          ironMg: raw.ironMg ?? null,
          vitaminDMcg: raw.vitaminDMcg ?? null,
          addedSugarG: raw.addedSugarG ?? null,
          category: raw.category ?? null,
          commonName: raw.commonName ?? null,
          dataSource: raw.dataSource ?? null,
          usdaFdcId: raw.usdaFdcId ?? null,
          createdByUserId: raw.createdByUserId === userId ? userId : null,
          status: raw.status ?? "ACTIVE",
          usesCount: raw.usesCount ?? 0,
          reportsCount: raw.reportsCount ?? 0,
          trustScore: raw.trustScore ?? 0.5,
          lastUsedAt: raw.lastUsedAt ?? null,
          createdAt: raw.createdAt,
          updatedAt: raw.updatedAt,
        },
        update: {
          name: raw.name,
          calories: raw.calories,
          proteinG: raw.proteinG,
          carbsG: raw.carbsG,
          fatG: raw.fatG,
        },
      });
    }
    const insertedCommunityFoodIds = new Set(allCommunityFoodsRaw.map((f: any) => f.id));
    if (allCommunityFoodsRaw.length) console.log("  [OK] CommunityFoods");

    // 7. CommunityFoodAliases
    for (const raw of communityFoodAliasesRaw) {
      await tx.communityFoodAlias.upsert({
        where: { id: raw.id },
        create: {
          id: raw.id,
          communityFoodId: raw.communityFoodId,
          alias: raw.alias,
          createdAt: raw.createdAt,
        },
        update: { alias: raw.alias },
      });
    }
    if (communityFoodAliasesRaw.length) console.log("  [OK] CommunityFoodAliases");

    // 8. CommunityFoodBarcodes
    const allBarcodesPrisma = barcodesCreated.filter((b) =>
      insertedCommunityFoodIds.has(b.communityFoodId)
    );
    const allBarcodesRaw = referencedBarcodes.filter((b: any) =>
      insertedCommunityFoodIds.has(b.communityFoodId)
    );
    for (const b of allBarcodesPrisma) {
      await tx.communityFoodBarcode.upsert({
        where: { id: b.id },
        create: b,
        update: b,
      });
    }
    for (const raw of allBarcodesRaw) {
      await tx.communityFoodBarcode.upsert({
        where: { id: raw.id },
        create: {
          id: raw.id,
          barcode: raw.barcode,
          type: raw.type ?? "OTHER",
          communityFoodId: raw.communityFoodId,
          createdByUserId: raw.createdByUserId === userId ? userId : null,
          createdAt: raw.createdAt,
        },
        update: { barcode: raw.barcode },
      });
    }
    if (allBarcodesPrisma.length + allBarcodesRaw.length)
      console.log("  [OK] CommunityFoodBarcodes");

    // 9. CommunityFoodReports
    const validReports = foodReports.filter((r) =>
      insertedCommunityFoodIds.has(r.communityFoodId)
    );
    for (const r of validReports) {
      await tx.communityFoodReport.upsert({
        where: { id: r.id },
        create: r,
        update: r,
      });
    }
    if (validReports.length) console.log("  [OK] CommunityFoodReports");

    // 10. VoiceSessions
    for (const vs of voiceSessions) {
      await tx.voiceSession.upsert({
        where: { id: vs.id },
        create: vs,
        update: vs,
      });
    }
    if (voiceSessions.length) console.log("  [OK] VoiceSessions");

    // 11. FoodEntries — null out FKs that reference skipped/missing records
    const insertedCustomFoodIds = new Set(customFoodsRaw.map((f: any) => f.id));
    const insertedVoiceSessionIds = new Set(voiceSessions.map((v) => v.id));
    for (const fe of foodEntries) {
      const cleaned = {
        ...fe,
        communityFoodId:
          fe.communityFoodId && insertedCommunityFoodIds.has(fe.communityFoodId)
            ? fe.communityFoodId
            : null,
        customFoodId:
          fe.customFoodId && insertedCustomFoodIds.has(fe.customFoodId)
            ? fe.customFoodId
            : null,
        voiceSessionId:
          fe.voiceSessionId && insertedVoiceSessionIds.has(fe.voiceSessionId)
            ? fe.voiceSessionId
            : null,
      };
      await tx.foodEntry.upsert({
        where: { id: fe.id },
        create: cleaned,
        update: cleaned,
      });
    }
    if (foodEntries.length) console.log("  [OK] FoodEntries");

    // 12. UnitConversions (user-scoped, from raw SQL)
    for (const raw of unitConversionsRaw) {
      await tx.foodUnitConversion.upsert({
        where: { id: raw.id },
        create: {
          id: raw.id,
          userId: raw.userId ?? null,
          customFoodId: raw.customFoodId ?? null,
          communityFoodId: raw.communityFoodId ?? null,
          usdaFdcId: raw.usdaFdcId ?? null,
          unitName: raw.unitName,
          quantityInBaseServings: raw.quantityInBaseServings,
          measurementSystem: raw.measurementSystem ?? "abstract",
          createdAt: raw.createdAt,
          updatedAt: raw.updatedAt,
        },
        update: {
          unitName: raw.unitName,
          quantityInBaseServings: raw.quantityInBaseServings,
        },
      });
    }
    if (unitConversionsRaw.length) console.log("  [OK] UnitConversions");

    // 13. Community unit conversions
    for (const raw of communityUnitConversionsRaw) {
      await tx.foodUnitConversion.upsert({
        where: { id: raw.id },
        create: {
          id: raw.id,
          userId: raw.userId ?? null,
          customFoodId: raw.customFoodId ?? null,
          communityFoodId: raw.communityFoodId ?? null,
          usdaFdcId: raw.usdaFdcId ?? null,
          unitName: raw.unitName,
          quantityInBaseServings: raw.quantityInBaseServings,
          measurementSystem: raw.measurementSystem ?? "abstract",
          createdAt: raw.createdAt,
          updatedAt: raw.updatedAt,
        },
        update: {
          unitName: raw.unitName,
          quantityInBaseServings: raw.quantityInBaseServings,
        },
      });
    }
    if (communityUnitConversionsRaw.length) console.log("  [OK] CommunityUnitConversions");

    // 14. SavedMeals + items
    for (const sm of savedMeals) {
      const { items, ...mealData } = sm;
      await tx.savedMeal.upsert({
        where: { id: sm.id },
        create: mealData,
        update: mealData,
      });
      for (const item of items) {
        await tx.savedMealItem.upsert({
          where: { id: item.id },
          create: item,
          update: item,
        });
      }
    }
    if (savedMeals.length) console.log("  [OK] SavedMeals");

    // 15. WeightEntries
    for (const we of weightEntries) {
      await tx.weightEntry.upsert({
        where: { id: we.id },
        create: we,
        update: we,
      });
    }
    if (weightEntries.length) console.log("  [OK] WeightEntries");
  });

  console.log("\nDone! All data copied successfully.");
}

main()
  .catch((e) => {
    console.error("Error:", e);
    process.exit(1);
  })
  .finally(async () => {
    await dev.$disconnect();
    await local.$disconnect();
    await devPool.end();
    await localPool.end();
  });
