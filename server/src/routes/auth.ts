import type { FastifyInstance } from "fastify";
import crypto from "crypto";
import bcrypt from "bcrypt";
import { prisma } from "../db/client.js";
import { verifyAppleIdentityToken, revokeAppleToken } from "../services/appleAuth.js";
import {
  signAccessToken,
  signRefreshToken,
  rotateRefreshToken,
  deleteRefreshTokensForUser,
} from "../services/jwt.js";
import { sendPasswordResetEmail } from "../services/email.js";

const BCRYPT_ROUNDS = 10;
const RESET_CODE_EXPIRY_MINUTES = 15;

export async function authRoutes(app: FastifyInstance) {
  // -----------------------------------------------------------------------
  // Email / password auth
  // -----------------------------------------------------------------------

  /**
   * POST /api/auth/register — Create account with email + password
   */
  app.post<{
    Body: { email: string; password: string; name?: string };
  }>("/api/auth/register", async (request, reply) => {
    const { email, password, name } = request.body;

    if (!email || !password) {
      return reply.code(400).send({ error: "Email and password are required" });
    }
    if (password.length < 6) {
      return reply.code(400).send({ error: "Password must be at least 6 characters" });
    }

    const existing = await prisma.user.findUnique({ where: { email } });
    if (existing) {
      return reply.code(409).send({ error: "An account with this email already exists" });
    }

    const passwordHash = await bcrypt.hash(password, BCRYPT_ROUNDS);

    // Migration path: claim orphaned default user (same as Apple flow)
    const orphanedUsers = await prisma.user.findMany({
      where: { appleUserId: null, email: null },
    });

    let user;
    if (orphanedUsers.length === 1) {
      user = await prisma.user.update({
        where: { id: orphanedUsers[0].id },
        data: { email, passwordHash, name: name || orphanedUsers[0].name },
      });
    } else {
      user = await prisma.user.create({
        data: {
          email,
          passwordHash,
          name: name || "User",
          dailyGoal: {
            create: { calories: 2000, proteinG: 150, carbsG: 200, fatG: 65 },
          },
        },
      });
    }

    const [accessToken, refreshToken] = await Promise.all([
      signAccessToken(user.id),
      signRefreshToken(user.id),
    ]);

    return reply.code(201).send({
      accessToken,
      refreshToken,
      user: { id: user.id, name: user.name, email: user.email },
    });
  });

  /**
   * POST /api/auth/login — Sign in with email + password
   */
  app.post<{
    Body: { email: string; password: string };
  }>("/api/auth/login", async (request, reply) => {
    const { email, password } = request.body;

    if (!email || !password) {
      return reply.code(400).send({ error: "Email and password are required" });
    }

    const user = await prisma.user.findUnique({ where: { email } });
    if (!user || !user.passwordHash) {
      return reply.code(401).send({ error: "Invalid email or password" });
    }

    const valid = await bcrypt.compare(password, user.passwordHash);
    if (!valid) {
      return reply.code(401).send({ error: "Invalid email or password" });
    }

    const [accessToken, refreshToken] = await Promise.all([
      signAccessToken(user.id),
      signRefreshToken(user.id),
    ]);

    return reply.send({
      accessToken,
      refreshToken,
      user: { id: user.id, name: user.name, email: user.email },
    });
  });

  // -----------------------------------------------------------------------
  // Password reset
  // -----------------------------------------------------------------------

  /**
   * POST /api/auth/forgot-password — Send a 6-digit reset code via email
   */
  app.post<{
    Body: { email: string };
  }>("/api/auth/forgot-password", async (request, reply) => {
    const { email } = request.body;

    if (!email) {
      return reply.code(400).send({ error: "Email is required" });
    }

    // Always return 200 to avoid revealing whether the email exists
    const user = await prisma.user.findUnique({ where: { email } });
    if (!user || !user.passwordHash) {
      return reply.send({ message: "If an account exists, a reset code has been sent" });
    }

    // Delete any existing unused resets for this user
    await prisma.passwordReset.deleteMany({
      where: { userId: user.id, used: false },
    });

    // Generate 6-digit code
    const code = crypto.randomInt(100000, 999999).toString();
    const expiresAt = new Date();
    expiresAt.setMinutes(expiresAt.getMinutes() + RESET_CODE_EXPIRY_MINUTES);

    await prisma.passwordReset.create({
      data: { userId: user.id, code, expiresAt },
    });

    try {
      await sendPasswordResetEmail(email, code);
    } catch (err) {
      console.error("[Auth] Failed to send reset email:", err);
      return reply.code(500).send({ error: "Failed to send reset email" });
    }

    return reply.send({ message: "If an account exists, a reset code has been sent" });
  });

  /**
   * POST /api/auth/reset-password — Verify code and set new password
   */
  app.post<{
    Body: { email: string; code: string; newPassword: string };
  }>("/api/auth/reset-password", async (request, reply) => {
    const { email, code, newPassword } = request.body;

    if (!email || !code || !newPassword) {
      return reply.code(400).send({ error: "Email, code, and new password are required" });
    }
    if (newPassword.length < 6) {
      return reply.code(400).send({ error: "Password must be at least 6 characters" });
    }

    const user = await prisma.user.findUnique({ where: { email } });
    if (!user) {
      return reply.code(400).send({ error: "Invalid or expired reset code" });
    }

    const resetRecord = await prisma.passwordReset.findFirst({
      where: {
        userId: user.id,
        code,
        used: false,
        expiresAt: { gt: new Date() },
      },
    });

    if (!resetRecord) {
      return reply.code(400).send({ error: "Invalid or expired reset code" });
    }

    const passwordHash = await bcrypt.hash(newPassword, BCRYPT_ROUNDS);

    await prisma.$transaction([
      prisma.user.update({
        where: { id: user.id },
        data: { passwordHash },
      }),
      prisma.passwordReset.update({
        where: { id: resetRecord.id },
        data: { used: true },
      }),
      prisma.refreshToken.deleteMany({ where: { userId: user.id } }),
    ]);

    return reply.send({ message: "Password reset successful" });
  });

  // -----------------------------------------------------------------------
  // Apple auth
  // -----------------------------------------------------------------------

  /**
   * POST /api/auth/apple — Sign in or register with Apple
   */
  app.post<{
    Body: {
      identityToken: string;
      fullName?: { givenName?: string; familyName?: string };
    };
  }>("/api/auth/apple", async (request, reply) => {
    const { identityToken, fullName } = request.body;

    if (!identityToken) {
      return reply.code(400).send({ error: "identityToken is required" });
    }

    let payload;
    try {
      payload = await verifyAppleIdentityToken(identityToken);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Token verification failed";
      return reply.code(401).send({ error: message });
    }

    // Look up existing user by Apple ID
    let user = await prisma.user.findUnique({
      where: { appleUserId: payload.appleUserId },
    });

    if (!user) {
      // Migration path: claim the orphaned default user if exactly one exists
      // with no appleUserId. This preserves existing single-user data.
      const orphanedUsers = await prisma.user.findMany({
        where: { appleUserId: null },
      });

      if (orphanedUsers.length === 1) {
        user = await prisma.user.update({
          where: { id: orphanedUsers[0].id },
          data: {
            appleUserId: payload.appleUserId,
            email: payload.email ?? orphanedUsers[0].email,
            name: buildName(fullName) ?? orphanedUsers[0].name,
          },
        });
      } else {
        // Create a new user
        const name = buildName(fullName) ?? "User";
        user = await prisma.user.create({
          data: {
            appleUserId: payload.appleUserId,
            email: payload.email,
            name,
            dailyGoal: {
              create: { calories: 2000, proteinG: 150, carbsG: 200, fatG: 65 },
            },
          },
        });
      }
    } else {
      // Update email/name if provided (Apple only sends these on first auth)
      const updates: Record<string, string> = {};
      if (payload.email && !user.email) updates.email = payload.email;
      const name = buildName(fullName);
      if (name && user.name === "Default User") updates.name = name;

      if (Object.keys(updates).length > 0) {
        user = await prisma.user.update({
          where: { id: user.id },
          data: updates,
        });
      }
    }

    const [accessToken, refreshToken] = await Promise.all([
      signAccessToken(user.id),
      signRefreshToken(user.id),
    ]);

    return reply.send({
      accessToken,
      refreshToken,
      user: { id: user.id, name: user.name, email: user.email },
    });
  });

  /**
   * POST /api/auth/refresh — Rotate refresh token
   */
  app.post<{ Body: { refreshToken: string } }>(
    "/api/auth/refresh",
    async (request, reply) => {
      const { refreshToken } = request.body;
      if (!refreshToken) {
        return reply.code(400).send({ error: "refreshToken is required" });
      }

      try {
        const tokens = await rotateRefreshToken(refreshToken);
        return reply.send(tokens);
      } catch (err) {
        const message = err instanceof Error ? err.message : "Token refresh failed";
        return reply.code(401).send({ error: message });
      }
    }
  );

  /**
   * POST /api/auth/logout — Invalidate all refresh tokens for the user
   */
  app.post("/api/auth/logout", async (request, reply) => {
    const userId = request.userId;
    if (!userId) {
      return reply.code(401).send({ error: "Not authenticated" });
    }

    await deleteRefreshTokensForUser(userId);
    return reply.code(204).send();
  });

  /**
   * DELETE /api/auth/account — Delete user account and all data
   * Apple requires this for apps using Sign in with Apple.
   */
  app.delete("/api/auth/account", async (request, reply) => {
    const userId = request.userId;
    if (!userId) {
      return reply.code(401).send({ error: "Not authenticated" });
    }

    // Attempt Apple token revocation (best-effort — don't block deletion on failure)
    try {
      const user = await prisma.user.findUnique({ where: { id: userId } });
      if (user?.appleUserId) {
        const tokens = await prisma.refreshToken.findMany({
          where: { userId },
        });
        if (tokens.length > 0) {
          await revokeAppleToken(tokens[0].token).catch((err: unknown) => {
            console.error("[Auth] Apple token revocation failed:", err);
          });
        }
      }
    } catch (err) {
      console.error("[Auth] Error during Apple revocation attempt:", err);
    }

    // Cascade-delete all user data
    await prisma.$transaction([
      prisma.refreshToken.deleteMany({ where: { userId } }),
      prisma.foodEntry.deleteMany({ where: { userId } }),
      prisma.savedMealItem.deleteMany({
        where: { savedMeal: { userId } },
      }),
      prisma.savedMeal.deleteMany({ where: { userId } }),
      prisma.foodUnitConversion.deleteMany({ where: { userId } }),
      prisma.voiceSession.deleteMany({ where: { userId } }),
      prisma.goalTimeline.deleteMany({ where: { userId } }),
      prisma.dailyGoal.deleteMany({ where: { userId } }),
      prisma.customFood.deleteMany({ where: { userId } }),
      prisma.goalProfile.deleteMany({ where: { userId } }),
      prisma.communityFoodReport.deleteMany({ where: { reporterUserId: userId } }),
      prisma.communityFoodBarcode.deleteMany({ where: { createdByUserId: userId } }),
      prisma.communityFood.updateMany({
        where: { createdByUserId: userId },
        data: { createdByUserId: null },
      }),
      prisma.user.delete({ where: { id: userId } }),
    ]);

    return reply.code(204).send();
  });
}

function buildName(
  fullName?: { givenName?: string; familyName?: string }
): string | null {
  if (!fullName) return null;
  const parts = [fullName.givenName, fullName.familyName].filter(Boolean);
  return parts.length > 0 ? parts.join(" ") : null;
}
