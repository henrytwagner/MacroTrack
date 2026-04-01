import type { FastifyInstance } from "fastify";
import { prisma } from "../db/client.js";
import { sendWaitlistNotification } from "../services/email.js";

export async function waitlistRoutes(app: FastifyInstance) {
  app.post<{ Body: { name: string; email: string } }>(
    "/api/waitlist",
    async (request, reply) => {
      const { name, email } = request.body ?? {};

      if (!name || !email) {
        return reply.code(400).send({ message: "Name and email are required." });
      }

      const normalizedEmail = email.trim().toLowerCase();

      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizedEmail)) {
        return reply.code(400).send({ message: "Invalid email address." });
      }

      // Check if already on the waitlist
      const existing = await prisma.waitlistEntry.findUnique({
        where: { email: normalizedEmail },
      });

      if (existing) {
        return reply.code(200).send({
          message: "already_on_list",
        });
      }

      await prisma.waitlistEntry.create({
        data: {
          name: name.trim(),
          email: normalizedEmail,
        },
      });

      const totalCount = await prisma.waitlistEntry.count();

      // Best-effort notification — don't fail the signup if email fails
      sendWaitlistNotification(name.trim(), normalizedEmail, totalCount).catch(
        (err) => console.error("[Waitlist] notification email failed:", err)
      );

      return reply.code(201).send({
        message: "success",
      });
    }
  );
}
