import type { FastifyInstance } from "fastify";
import { prisma } from "../db/client.js";

import type { UserPreferences } from "../../../shared/types.js";

export async function userPreferencesRoutes(app: FastifyInstance) {
  // GET /api/user/preferences
  app.get("/api/user/preferences", async (request, reply) => {
    const userId = request.userId;
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { suppressUsdaWarning: true },
    });
    const prefs: UserPreferences = {
      suppressUsdaWarning: user?.suppressUsdaWarning ?? false,
    };
    return reply.send(prefs);
  });

  // PATCH /api/user/preferences
  app.patch<{ Body: Partial<UserPreferences> }>(
    "/api/user/preferences",
    async (request, reply) => {
      const userId = request.userId;
      const body = request.body;

      const updated = await prisma.user.update({
        where: { id: userId },
        data: {
          ...(body.suppressUsdaWarning !== undefined && {
            suppressUsdaWarning: body.suppressUsdaWarning,
          }),
        },
        select: { suppressUsdaWarning: true },
      });

      const prefs: UserPreferences = {
        suppressUsdaWarning: updated.suppressUsdaWarning,
      };
      return reply.send(prefs);
    },
  );
}
