import type { FastifyInstance } from "fastify";
import type { Sex, UnitSystem, ActivityLevel } from "@prisma/client";
import { prisma } from "../db/client.js";
import { getDefaultUserId } from "../db/defaultUser.js";
import { calculateAgeFromDob, parseDateOfBirth } from "../utils/age.js";
import type { UserProfile } from "../../../shared/types.js";

function profileFromUser(user: {
  heightCm: number | null;
  weightKg: number | null;
  sex: string;
  dateOfBirth: Date | null;
  activityLevel: string | null;
  preferredUnits: string;
  currentGoalProfileId: string | null;
}): UserProfile {
  const dateOfBirth = user.dateOfBirth
    ? user.dateOfBirth.toISOString().slice(0, 10)
    : undefined;
  const ageYears =
    user.dateOfBirth != null ? calculateAgeFromDob(user.dateOfBirth) : undefined;
  return {
    heightCm: user.heightCm ?? undefined,
    weightKg: user.weightKg ?? undefined,
    sex: user.sex as UserProfile["sex"],
    dateOfBirth,
    ageYears,
    activityLevel: (user.activityLevel as UserProfile["activityLevel"]) ?? undefined,
    preferredUnits: user.preferredUnits as UserProfile["preferredUnits"],
    currentGoalProfileId: user.currentGoalProfileId ?? undefined,
  };
}

export async function profileRoutes(app: FastifyInstance) {
  app.get("/api/profile", async (_request, reply) => {
    const userId = await getDefaultUserId();
    const user = await prisma.user.findUnique({ where: { id: userId } });

    if (!user) {
      return reply.code(404).send({ error: "User not found" });
    }

    return reply.send(profileFromUser(user));
  });

  app.put<{ Body: Partial<UserProfile> }>("/api/profile", async (request, reply) => {
    const userId = await getDefaultUserId();
    const body = request.body;

    const data: {
      sex?: Sex;
      preferredUnits?: UnitSystem;
      heightCm?: number | null;
      weightKg?: number | null;
      dateOfBirth?: Date | null;
      activityLevel?: ActivityLevel | null;
    } = {};
    if (body.sex !== undefined) data.sex = body.sex as Sex;
    if (body.preferredUnits !== undefined) data.preferredUnits = body.preferredUnits as UnitSystem;
    if (body.heightCm !== undefined) data.heightCm = body.heightCm;
    if (body.weightKg !== undefined) data.weightKg = body.weightKg;
    if (body.activityLevel !== undefined) data.activityLevel = body.activityLevel as ActivityLevel;
    if (body.dateOfBirth !== undefined) {
      data.dateOfBirth =
        body.dateOfBirth === null || body.dateOfBirth === ""
          ? null
          : parseDateOfBirth(body.dateOfBirth) ?? undefined;
      if (
        body.dateOfBirth !== null &&
        body.dateOfBirth !== "" &&
        data.dateOfBirth === undefined
      ) {
        return reply.code(400).send({
          error: "Invalid date of birth. Use YYYY-MM-DD.",
        });
      }
    }

    const updated = await prisma.user.update({
      where: { id: userId },
      data,
    });

    return reply.send(profileFromUser(updated));
  });
}

