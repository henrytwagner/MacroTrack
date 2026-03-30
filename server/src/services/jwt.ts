import { SignJWT, jwtVerify } from "jose";
import crypto from "crypto";
import { prisma } from "../db/client.js";

const ACCESS_TOKEN_EXPIRY = "15m";
const REFRESH_TOKEN_EXPIRY_DAYS = 30;

function getJwtSecret(): Uint8Array {
  const secret = process.env.JWT_SECRET;
  if (!secret) {
    throw new Error("JWT_SECRET environment variable is not set");
  }
  return new TextEncoder().encode(secret);
}

export async function signAccessToken(userId: string): Promise<string> {
  return new SignJWT({ userId })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(ACCESS_TOKEN_EXPIRY)
    .sign(getJwtSecret());
}

export async function verifyAccessToken(
  token: string
): Promise<{ userId: string }> {
  const { payload } = await jwtVerify(token, getJwtSecret());
  return { userId: payload.userId as string };
}

export async function signRefreshToken(userId: string): Promise<string> {
  const token = crypto.randomBytes(64).toString("hex");
  const expiresAt = new Date();
  expiresAt.setDate(expiresAt.getDate() + REFRESH_TOKEN_EXPIRY_DAYS);

  await prisma.refreshToken.create({
    data: { userId, token, expiresAt },
  });

  return token;
}

export async function rotateRefreshToken(
  oldToken: string
): Promise<{ accessToken: string; refreshToken: string }> {
  const record = await prisma.refreshToken.findUnique({
    where: { token: oldToken },
  });

  if (!record) {
    throw new Error("Invalid refresh token");
  }

  if (record.expiresAt < new Date()) {
    await prisma.refreshToken.delete({ where: { id: record.id } });
    throw new Error("Refresh token expired");
  }

  // Delete old token and issue new pair
  await prisma.refreshToken.delete({ where: { id: record.id } });

  const [accessToken, refreshToken] = await Promise.all([
    signAccessToken(record.userId),
    signRefreshToken(record.userId),
  ]);

  return { accessToken, refreshToken };
}

export async function deleteRefreshTokensForUser(
  userId: string
): Promise<void> {
  await prisma.refreshToken.deleteMany({ where: { userId } });
}
