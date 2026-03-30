import type { FastifyInstance } from "fastify";

import {
  getGoalForDate,
  listGoalProfiles,
  setGoalsFromDate,
} from "../services/goalService.js";
import type {
  DailyGoal,
  GoalForDateResponse,
  GoalProfilesResponse,
  UpdateGoalsForDateRequest,
} from "../../../shared/types.js";

export async function goalsRoutes(app: FastifyInstance) {
  // Date-aware goal lookup
  app.get<{
    Querystring: { date?: string };
  }>("/api/goals", async (request, reply) => {
    const userId = request.userId;
    const { date } = request.query;

    const targetDate = date ? new Date(date) : new Date();

    const result = await getGoalForDate(userId, targetDate);
    if (!result) {
      const empty: GoalForDateResponse = {
        date: targetDate.toISOString().slice(0, 10),
        goals: null,
        profile: null,
      };
      return reply.send(empty);
    }

    const goals: DailyGoal = {
      id: `${result.profile?.id ?? "default"}:${targetDate
        .toISOString()
        .slice(0, 10)}`,
      calories: result.macros.calories,
      proteinG: result.macros.proteinG,
      carbsG: result.macros.carbsG,
      fatG: result.macros.fatG,
    };

    const response: GoalForDateResponse = {
      date: targetDate.toISOString().slice(0, 10),
      goals,
      profile: result.profile,
    };

    return reply.send(response);
  });

  // List goal profiles for the current user
  app.get("/api/goal-profiles", async (request, reply) => {
    const userId = request.userId;
    const profiles = await listGoalProfiles(userId);
    const response: GoalProfilesResponse = { profiles };
    return reply.send(response);
  });

  // Create a new goal change from an effective date onward
  app.post<{ Body: UpdateGoalsForDateRequest }>(
    "/api/goals/change",
    async (request, reply) => {
      const userId = request.userId;
      const {
        effectiveDate,
        macros,
        goalType,
        aggressiveness,
        profileId,
        newProfileName,
      } = request.body;

      if (
        !effectiveDate ||
        !macros ||
        macros.calories == null ||
        macros.proteinG == null ||
        macros.carbsG == null ||
        macros.fatG == null
      ) {
        return reply.code(400).send({
          error:
            "effectiveDate and macros (calories, proteinG, carbsG, fatG) are required",
        });
      }

      const effective = new Date(effectiveDate);

      const result = await setGoalsFromDate({
        userId,
        effectiveDate: effective,
        macros,
        goalType,
        aggressiveness,
        profileId,
        profileName: newProfileName,
      });

      const goals: DailyGoal = {
        id: `${result.profile?.id ?? "default"}:${effective
          .toISOString()
          .slice(0, 10)}`,
        calories: result.macros.calories,
        proteinG: result.macros.proteinG,
        carbsG: result.macros.carbsG,
        fatG: result.macros.fatG,
      };

      const response: GoalForDateResponse = {
        date: effective.toISOString().slice(0, 10),
        goals,
        profile: result.profile,
      };

      return reply.code(201).send(response);
    },
  );
}

