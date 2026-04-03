/**
 * Seed script for Dialed Core Data.
 *
 * Reads dialed-core-data.json (exported from Dialed_Core_Data_1.xlsx) and
 * upserts CommunityFood records with dataSource="DIALED" plus system-level
 * FoodUnitConversion records (userId=null).
 *
 * Idempotent: safe to re-run. Foods are matched by name + dataSource="DIALED".
 * Existing records are updated; new ones are created.
 *
 * Usage (from server/):
 *   npx tsx src/scripts/seedDialedFoods.ts
 */

import { prisma } from "../db/client.js";
import { readFileSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));

interface FoodRow {
  name: string;
  category: string;
  defaultServingSize: number;
  defaultServingUnit: string;
  calories: number;
  proteinG: number;
  fatG: number;
  saturatedFatG: number | null;
  transFatG: number | null;
  carbsG: number;
  fiberG: number | null;
  sugarG: number | null;
  cholesterolMg: number | null;
  sodiumMg: number | null;
  potassiumMg: number | null;
  commonName: string | null;
  aliases: string[];
}

interface ConversionRow {
  foodName: string;
  unitName: string;
  quantityInBaseServings: number;
  measurementSystem: string;
}

interface SeedData {
  foods: FoodRow[];
  conversions: ConversionRow[];
}

async function main() {
  const dataPath = resolve(__dirname, "dialed-core-data.json");
  const raw = readFileSync(dataPath, "utf-8");
  const data: SeedData = JSON.parse(raw);

  console.log(`Seeding ${data.foods.length} Dialed foods and ${data.conversions.length} conversions...\n`);

  // Group conversions by food name for efficient lookup
  const conversionsByFood = new Map<string, ConversionRow[]>();
  for (const conv of data.conversions) {
    const key = conv.foodName;
    if (!conversionsByFood.has(key)) conversionsByFood.set(key, []);
    conversionsByFood.get(key)!.push(conv);
  }

  let created = 0;
  let updated = 0;
  let convsCreated = 0;
  let convsUpdated = 0;

  for (const food of data.foods) {
    // Check if this Dialed food already exists
    const existing = await prisma.communityFood.findFirst({
      where: { name: food.name, dataSource: "DIALED" },
    });

    const foodData = {
      name: food.name,
      category: food.category as any,
      defaultServingSize: food.defaultServingSize,
      defaultServingUnit: food.defaultServingUnit,
      calories: food.calories,
      proteinG: food.proteinG,
      carbsG: food.carbsG,
      fatG: food.fatG,
      saturatedFatG: food.saturatedFatG,
      transFatG: food.transFatG,
      fiberG: food.fiberG,
      sugarG: food.sugarG,
      cholesterolMg: food.cholesterolMg,
      sodiumMg: food.sodiumMg,
      potassiumMg: food.potassiumMg,
      commonName: food.commonName || null,
      dataSource: "DIALED",
      trustScore: 0.95,
      status: "ACTIVE" as const,
      createdByUserId: null,
    };

    let communityFoodId: string;

    if (existing) {
      await prisma.communityFood.update({
        where: { id: existing.id },
        data: foodData,
      });
      communityFoodId = existing.id;
      updated++;
    } else {
      const record = await prisma.communityFood.create({ data: foodData });
      communityFoodId = record.id;
      created++;
    }

    // Upsert aliases: delete-and-recreate
    await prisma.communityFoodAlias.deleteMany({
      where: { communityFoodId },
    });
    if (food.aliases.length > 0) {
      await prisma.communityFoodAlias.createMany({
        data: food.aliases.map((alias) => ({
          communityFoodId,
          alias: alias.trim(),
        })),
      });
    }

    // Upsert conversions: match by communityFoodId + unitName, userId=null
    const foodConversions = conversionsByFood.get(food.name) ?? [];
    for (const conv of foodConversions) {
      const existingConv = await prisma.foodUnitConversion.findFirst({
        where: {
          communityFoodId,
          unitName: conv.unitName,
          userId: null,
        },
      });

      if (existingConv) {
        await prisma.foodUnitConversion.update({
          where: { id: existingConv.id },
          data: {
            quantityInBaseServings: conv.quantityInBaseServings,
            measurementSystem: conv.measurementSystem,
          },
        });
        convsUpdated++;
      } else {
        await prisma.foodUnitConversion.create({
          data: {
            communityFoodId,
            unitName: conv.unitName,
            quantityInBaseServings: conv.quantityInBaseServings,
            measurementSystem: conv.measurementSystem,
            userId: null,
            createdByUserId: null,
          },
        });
        convsCreated++;
      }
    }
  }

  console.log(`Foods:       ${created} created, ${updated} updated`);
  console.log(`Conversions: ${convsCreated} created, ${convsUpdated} updated`);
  console.log("\nDone.");
}

main()
  .catch((e) => {
    console.error("Seed failed:", e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect?.());
