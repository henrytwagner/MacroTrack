import { prisma } from "../db/client.js";
import type { Macros } from "../../../shared/types.js";

export type GoalType = "CUT" | "MAINTAIN" | "GAIN";
export type GoalAggressiveness = "MILD" | "STANDARD" | "AGGRESSIVE";

export interface GoalProfileSummary {
  id: string;
  name: string;
  goalType: GoalType;
  aggressiveness: GoalAggressiveness;
  effectiveDate: string; // YYYY-MM-DD
}

export interface GoalForDateResult {
  macros: Macros;
  profile: GoalProfileSummary | null;
}

export async function getGoalForDate(
  userId: string,
  date: Date,
): Promise<GoalForDateResult | null> {
  const goal = await prisma.goalTimeline.findFirst({
    where: {
      userId,
      effectiveDate: {
        lte: date,
      },
    },
    // Pick the most recent effectiveDate; when there are multiple
    // rows on the same date (e.g. migrated default + updated goals),
    // prefer the latest created entry as the canonical one.
    orderBy: [
      { effectiveDate: "desc" },
      { createdAt: "desc" },
      { id: "desc" },
    ],
    include: {
      profile: true,
    },
  });

  if (!goal) {
    return null;
  }

  const macros: Macros = {
    calories: goal.calories,
    proteinG: goal.proteinG,
    carbsG: goal.carbsG,
    fatG: goal.fatG,
  };

  const profile: GoalProfileSummary | null = goal.profile
    ? {
        id: goal.profile.id,
        name: goal.profile.name,
        goalType: goal.goalType,
        aggressiveness: goal.aggressiveness,
        effectiveDate: goal.effectiveDate.toISOString().slice(0, 10),
      }
    : null;

  return { macros, profile };
}

interface SetGoalsFromDateArgs {
  userId: string;
  effectiveDate: Date;
  macros: Macros;
  goalType: GoalType;
  aggressiveness: GoalAggressiveness;
  profileId?: string;
  profileName?: string;
}

export async function setGoalsFromDate({
  userId,
  effectiveDate,
  macros,
  goalType,
  aggressiveness,
  profileId,
  profileName,
}: SetGoalsFromDateArgs) {
  // Ensure we have a profile
  let resolvedProfileId = profileId ?? null;
  if (!resolvedProfileId) {
    const name = profileName?.trim() || "Default Goals";
    const profile = await prisma.goalProfile.create({
      data: {
        userId,
        name,
      },
    });
    resolvedProfileId = profile.id;
  }

  const timeline = await prisma.goalTimeline.create({
    data: {
      userId,
      profileId: resolvedProfileId,
      effectiveDate,
      calories: macros.calories,
      proteinG: macros.proteinG,
      carbsG: macros.carbsG,
      fatG: macros.fatG,
      goalType,
      aggressiveness,
    },
    include: {
      profile: true,
    },
  });

  // Optionally mark this profile as current for the user
  await prisma.user.update({
    where: { id: userId },
    data: {
      currentGoalProfileId: resolvedProfileId,
    },
  });

  const resultMacros: Macros = {
    calories: timeline.calories,
    proteinG: timeline.proteinG,
    carbsG: timeline.carbsG,
    fatG: timeline.fatG,
  };

  const profileSummary: GoalProfileSummary | null = timeline.profile
    ? {
        id: timeline.profile.id,
        name: timeline.profile.name,
        goalType: timeline.goalType,
        aggressiveness: timeline.aggressiveness,
        effectiveDate: timeline.effectiveDate.toISOString().slice(0, 10),
      }
    : null;

  return { macros: resultMacros, profile: profileSummary };
}

export async function listGoalProfiles(userId: string) {
  const profiles = await prisma.goalProfile.findMany({
    where: { userId },
    orderBy: { createdAt: "asc" },
  });

  const latestByProfile = await prisma.goalTimeline.groupBy({
    by: ["profileId"],
    where: {
      userId,
      profileId: {
        not: null,
      },
    },
    _max: {
      effectiveDate: true,
    },
  });

  const latestMap = new Map<
    string,
    {
      effectiveDate: Date | null;
    }
  >();

  for (const row of latestByProfile) {
    if (row.profileId && row._max.effectiveDate) {
      latestMap.set(row.profileId, {
        effectiveDate: row._max.effectiveDate,
      });
    }
  }

  return profiles.map((p) => {
    const latest = latestMap.get(p.id);
    return {
      id: p.id,
      name: p.name,
      createdAt: p.createdAt.toISOString(),
      archivedAt: p.archivedAt ? p.archivedAt.toISOString() : null,
      lastEffectiveDate: latest?.effectiveDate
        ? latest.effectiveDate.toISOString().slice(0, 10)
        : null,
    };
  });
}

