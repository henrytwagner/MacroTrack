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
  const from = process.env.EMAIL_FROM ?? "Dialed <onboarding@resend.dev>";

  const { error } = await getResend().emails.send({
    from,
    to,
    subject: "Your Dialed password reset code",
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

export async function sendWaitlistNotification(
  name: string,
  email: string,
  totalCount: number
): Promise<void> {
  const from = process.env.EMAIL_FROM ?? "Dialed <onboarding@resend.dev>";

  const { error } = await getResend().emails.send({
    from,
    to: "htwags22@gmail.com",
    subject: `New Dialed waitlist signup: ${name}`,
    html: `
      <div style="font-family: -apple-system, BlinkMacSystemFont, sans-serif; max-width: 480px; margin: 0 auto; padding: 32px;">
        <h2 style="margin-bottom: 16px;">New Waitlist Request</h2>
        <table style="width: 100%; border-collapse: collapse;">
          <tr>
            <td style="padding: 8px 0; color: #666; width: 80px;">Name</td>
            <td style="padding: 8px 0; font-weight: 600;">${name}</td>
          </tr>
          <tr>
            <td style="padding: 8px 0; color: #666;">Email</td>
            <td style="padding: 8px 0; font-weight: 600;">${email}</td>
          </tr>
          <tr>
            <td style="padding: 8px 0; color: #666;">Time</td>
            <td style="padding: 8px 0;">${new Date().toLocaleString("en-US", { timeZone: "America/New_York" })}</td>
          </tr>
        </table>
        <p style="margin-top: 24px; padding: 12px 16px; background: #f5f5f5; border-radius: 8px; color: #666; font-size: 14px;">
          Total waitlist signups: <strong>${totalCount}</strong>
        </p>
        <p style="margin-top: 16px; color: #999; font-size: 13px;">
          Add them in <a href="https://appstoreconnect.apple.com" style="color: #0066cc;">App Store Connect</a> → TestFlight → External Testers.
        </p>
      </div>
    `,
  });

  if (error) {
    console.error("[Email] Failed to send waitlist notification:", error);
    // Don't throw — the signup was saved, notification is best-effort
  }
}
