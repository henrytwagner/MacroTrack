import { prisma } from "../db/client.js";
import { getDefaultUserId } from "../db/defaultUser.js";

async function main() {
  const userId = await getDefaultUserId();

  // Create (or reuse) a simple historical profile
  const profile = await prisma.goalProfile.create({
    data: {
      userId,
      name: "Old Cut Phase",
    },
  });

  // Historical effective date (one month before today)
  const effectiveDate = new Date();
  effectiveDate.setMonth(effectiveDate.getMonth() - 1);

  await prisma.goalTimeline.create({
    data: {
      userId,
      profileId: profile.id,
      effectiveDate,
      calories: 2200,
      proteinG: 180,
      carbsG: 180,
      fatG: 70,
      goalType: "CUT",
      aggressiveness: "STANDARD",
    },
  });

  // eslint-disable-next-line no-console
  console.log("Historical goal added for", effectiveDate.toISOString().slice(0, 10));
}

main()
  .catch((err) => {
    // eslint-disable-next-line no-console
    console.error(err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

