import { Resend } from "resend";

let resendClient: Resend | null = null;

function getResend(): Resend {
  if (!resendClient) {
    const key = process.env.RESEND_API_KEY;
    if (!key) {
      throw new Error("RESEND_API_KEY environment variable is not set");
    }
    resendClient = new Resend(key);
  }
  return resendClient;
}

export async function sendPasswordResetEmail(
  to: string,
  code: string
): Promise<void> {
  const from = process.env.EMAIL_FROM ?? "MacroTrack <onboarding@resend.dev>";

  const { error } = await getResend().emails.send({
    from,
    to,
    subject: "Your MacroTrack password reset code",
    html: `
      <div style="font-family: -apple-system, BlinkMacSystemFont, sans-serif; max-width: 400px; margin: 0 auto; padding: 32px;">
        <h2 style="margin-bottom: 8px;">Password Reset</h2>
        <p style="color: #666; margin-bottom: 24px;">Enter this code in the app to reset your password:</p>
        <div style="font-size: 32px; font-weight: bold; letter-spacing: 8px; text-align: center; background: #f5f5f5; padding: 16px; border-radius: 8px; margin-bottom: 24px;">
          ${code}
        </div>
        <p style="color: #999; font-size: 13px;">This code expires in 15 minutes. If you didn't request this, you can ignore this email.</p>
      </div>
    `,
  });

  if (error) {
    console.error("[Email] Failed to send password reset:", error);
    throw new Error("Failed to send email");
  }
}
