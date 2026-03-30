import { createRemoteJWKSet, jwtVerify } from "jose";

const APPLE_JWKS = createRemoteJWKSet(
  new URL("https://appleid.apple.com/auth/keys")
);

export interface AppleTokenPayload {
  appleUserId: string;
  email?: string;
}

export async function verifyAppleIdentityToken(
  identityToken: string
): Promise<AppleTokenPayload> {
  const bundleId = process.env.APPLE_BUNDLE_ID;
  if (!bundleId) {
    throw new Error("APPLE_BUNDLE_ID environment variable is not set");
  }

  const { payload } = await jwtVerify(identityToken, APPLE_JWKS, {
    issuer: "https://appleid.apple.com",
    audience: bundleId,
  });

  if (!payload.sub) {
    throw new Error("Apple identity token missing 'sub' claim");
  }

  return {
    appleUserId: payload.sub,
    email: (payload as Record<string, unknown>).email as string | undefined,
  };
}

/**
 * Generate a client secret JWT for Apple's token revocation endpoint.
 * Required for account deletion per Apple guidelines.
 */
export async function generateAppleClientSecret(): Promise<string> {
  const { SignJWT, importPKCS8 } = await import("jose");

  const teamId = process.env.APPLE_TEAM_ID;
  const keyId = process.env.APPLE_KEY_ID;
  const privateKeyPem = process.env.APPLE_PRIVATE_KEY;
  const bundleId = process.env.APPLE_BUNDLE_ID;

  if (!teamId || !keyId || !privateKeyPem || !bundleId) {
    throw new Error(
      "Missing Apple environment variables for client secret generation"
    );
  }

  const privateKey = await importPKCS8(privateKeyPem, "ES256");

  return new SignJWT({})
    .setProtectedHeader({ alg: "ES256", kid: keyId })
    .setIssuer(teamId)
    .setIssuedAt()
    .setExpirationTime("5m")
    .setAudience("https://appleid.apple.com")
    .setSubject(bundleId)
    .sign(privateKey);
}

/**
 * Revoke an Apple token (required for account deletion).
 */
export async function revokeAppleToken(
  refreshToken: string
): Promise<void> {
  const clientSecret = await generateAppleClientSecret();
  const bundleId = process.env.APPLE_BUNDLE_ID!;

  const body = new URLSearchParams({
    client_id: bundleId,
    client_secret: clientSecret,
    token: refreshToken,
    token_type_hint: "refresh_token",
  });

  const res = await fetch("https://appleid.apple.com/auth/revoke", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: body.toString(),
  });

  if (!res.ok) {
    console.error(
      `[AppleAuth] Token revocation failed: ${res.status} ${await res.text()}`
    );
  }
}
