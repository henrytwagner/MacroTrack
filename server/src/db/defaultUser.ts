import { prisma } from "./client.js";

let cachedUserId: string | null = null;

export async function getDefaultUserId(): Promise<string> {
  if (cachedUserId) return cachedUserId;

  let user = await prisma.user.findFirst({
    orderBy: { createdAt: "asc" },
  });
  if (!user) {
    user = await prisma.user.create({ data: { name: "Default User" } });
  }
  cachedUserId = user.id;
  return cachedUserId;
}
