import { prisma } from "../db/client.js";
import type { MealLabel } from "../../../shared/types.js";

interface EntryForCategorization {
  id: string;
  createdAt: Date;
  calories: number;
  mealLabel: string;
  voiceSessionId: string | null;
}

interface Cluster {
  entries: EntryForCategorization[];
  representativeTime: Date;
  totalCalories: number;
}

type TimeGate = "morning" | "midday" | "evening";

const PRIMARY_LABEL: Record<TimeGate, MealLabel> = {
  morning: "breakfast",
  midday: "lunch",
  evening: "dinner",
};

const GAP_THRESHOLD_MS = 60 * 60 * 1000; // 1 hour

function getTimeGate(date: Date): TimeGate {
  const hour = date.getHours();
  if (hour < 11) return "morning";
  if (hour < 15) return "midday";
  return "evening";
}

export function buildClusters(
  entries: EntryForCategorization[]
): Cluster[] {
  if (entries.length === 0) return [];

  // Group entries that share a voiceSessionId
  const sessionGroups = new Map<string, EntryForCategorization[]>();
  const ungrouped: EntryForCategorization[] = [];

  for (const entry of entries) {
    if (entry.voiceSessionId) {
      const group = sessionGroups.get(entry.voiceSessionId);
      if (group) {
        group.push(entry);
      } else {
        sessionGroups.set(entry.voiceSessionId, [entry]);
      }
    } else {
      ungrouped.push(entry);
    }
  }

  // Build session clusters
  const clusters: Cluster[] = [];
  for (const sessionEntries of Array.from(sessionGroups.values())) {
    sessionEntries.sort(
      (a, b) => a.createdAt.getTime() - b.createdAt.getTime()
    );
    clusters.push({
      entries: sessionEntries,
      representativeTime: sessionEntries[0].createdAt,
      totalCalories: sessionEntries.reduce((sum, e) => sum + e.calories, 0),
    });
  }

  // Cluster ungrouped entries by time proximity (1-hour gap)
  ungrouped.sort(
    (a, b) => a.createdAt.getTime() - b.createdAt.getTime()
  );

  let currentCluster: EntryForCategorization[] = [];

  for (const entry of ungrouped) {
    if (currentCluster.length === 0) {
      currentCluster.push(entry);
    } else {
      const lastTime =
        currentCluster[currentCluster.length - 1].createdAt.getTime();
      if (entry.createdAt.getTime() - lastTime > GAP_THRESHOLD_MS) {
        // Gap exceeded — finalize current cluster and start new one
        clusters.push({
          entries: currentCluster,
          representativeTime: currentCluster[0].createdAt,
          totalCalories: currentCluster.reduce(
            (sum, e) => sum + e.calories,
            0
          ),
        });
        currentCluster = [entry];
      } else {
        currentCluster.push(entry);
      }
    }
  }

  if (currentCluster.length > 0) {
    clusters.push({
      entries: currentCluster,
      representativeTime: currentCluster[0].createdAt,
      totalCalories: currentCluster.reduce((sum, e) => sum + e.calories, 0),
    });
  }

  // Sort clusters by representative time
  clusters.sort(
    (a, b) =>
      a.representativeTime.getTime() - b.representativeTime.getTime()
  );

  return clusters;
}

export function assignLabels(
  clusters: Cluster[]
): Map<string, MealLabel> {
  // Group clusters by time gate
  const gateGroups = new Map<TimeGate, Cluster[]>();
  for (const cluster of clusters) {
    const gate = getTimeGate(cluster.representativeTime);
    const group = gateGroups.get(gate);
    if (group) {
      group.push(cluster);
    } else {
      gateGroups.set(gate, [cluster]);
    }
  }

  const labelMap = new Map<string, MealLabel>();

  for (const [gate, gateClusters] of Array.from(gateGroups.entries())) {
    // Find highest-calorie cluster (ties broken by earlier cluster, which is first due to sort)
    let primaryCluster = gateClusters[0];
    for (let i = 1; i < gateClusters.length; i++) {
      if (gateClusters[i].totalCalories > primaryCluster.totalCalories) {
        primaryCluster = gateClusters[i];
      }
    }

    for (const cluster of gateClusters) {
      const label =
        cluster === primaryCluster ? PRIMARY_LABEL[gate] : "snack";
      for (const entry of cluster.entries) {
        labelMap.set(entry.id, label);
      }
    }
  }

  return labelMap;
}

export async function recategorizeMealsForDay(
  userId: string,
  date: Date
): Promise<void> {
  // Normalize date to start of day for query
  const dayStart = new Date(date);
  dayStart.setHours(0, 0, 0, 0);

  const entries = await prisma.foodEntry.findMany({
    where: { userId, date: dayStart },
    orderBy: { createdAt: "asc" },
    select: {
      id: true,
      createdAt: true,
      calories: true,
      mealLabel: true,
      voiceSessionId: true,
    },
  });

  if (entries.length === 0) return;

  const clusters = buildClusters(entries);
  const labelMap = assignLabels(clusters);

  // Batch update only entries whose label changed
  const updates = entries
    .filter((e) => labelMap.get(e.id) !== e.mealLabel)
    .map((e) =>
      prisma.foodEntry.update({
        where: { id: e.id },
        data: { mealLabel: labelMap.get(e.id)! },
      })
    );

  if (updates.length > 0) {
    await prisma.$transaction(updates);
  }
}
