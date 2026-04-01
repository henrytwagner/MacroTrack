import { FastifyRequest, FastifyReply } from "fastify";
import { verifyAccessToken } from "../services/jwt.js";

const PUBLIC_ROUTES = [
  "/health",
  "/api/auth/apple",
  "/api/auth/register",
  "/api/auth/login",
  "/api/auth/refresh",
  "/api/auth/forgot-password",
  "/api/auth/reset-password",
  "/api/waitlist",
];

const WS_ROUTES = [
  "/ws/kitchen-mode",
  "/ws/voice-session",
];

export async function authenticate(
  request: FastifyRequest,
  reply: FastifyReply
): Promise<void> {
  const path = request.url.split("?")[0];
  if (PUBLIC_ROUTES.includes(path)) {
    return;
  }

  // WebSocket routes handle auth inline via query param token
  if (WS_ROUTES.includes(path)) {
    return;
  }

  const header = request.headers.authorization;
  if (!header || !header.startsWith("Bearer ")) {
    return reply.code(401).send({ error: "Missing or invalid Authorization header" });
  }

  const token = header.slice(7);
  try {
    const { userId } = await verifyAccessToken(token);
    request.userId = userId;
  } catch {
    return reply.code(401).send({ error: "Invalid or expired token" });
  }
}
