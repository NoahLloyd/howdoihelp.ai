import { Resend } from "resend";

const resend = new Resend(process.env.RESEND_API_KEY);

const FROM_EMAIL = "howdoihelp.ai <noreply@howdoihelp.ai>";

function getBaseUrl(): string {
  return process.env.NEXT_PUBLIC_SITE_URL || "https://howdoihelp.ai";
}

// ─── Brand Constants ────────────────────────────────────────

const BRAND = {
  green: "#0D9373",
  greenHover: "#0B7D62",
  darkBg: "#0a2e23",
  darkBgAlt: "#0d3d2e",
  foreground: "#1A1A2E",
  muted: "#7A7A8E",
  mutedFg: "#4A4A5E",
  warmBg: "#FAF8F5",
  card: "#FFFFFF",
  border: "#E2DFD9",
};

// ─── Shared Layout ──────────────────────────────────────────

function emailLayout(content: string): string {
  return `
<!DOCTYPE html>
<html lang="en">
<head><meta charset="utf-8" /><meta name="viewport" content="width=device-width, initial-scale=1.0" /></head>
<body style="margin: 0; padding: 0; background: ${BRAND.warmBg}; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background: ${BRAND.warmBg};">
    <tr>
      <td align="center" style="padding: 40px 16px;">
        <table role="presentation" width="520" cellpadding="0" cellspacing="0" style="max-width: 520px; width: 100%;">

          <!-- Header -->
          <tr>
            <td style="background: linear-gradient(135deg, ${BRAND.darkBg}, ${BRAND.darkBgAlt}); border-radius: 16px 16px 0 0; padding: 28px 32px;">
              <a href="https://howdoihelp.ai" style="text-decoration: none; display: inline-flex; align-items: center;">
                <img src="https://howdoihelp.ai/icon.png" alt="" width="28" height="28" style="border-radius: 6px; display: block;" />
                <span style="margin-left: 10px; font-size: 15px; font-weight: 500; color: rgba(255,255,255,0.75); letter-spacing: -0.01em;">howdoihelp.ai</span>
              </a>
            </td>
          </tr>

          <!-- Body -->
          <tr>
            <td style="background: ${BRAND.card}; padding: 36px 32px; border-left: 1px solid ${BRAND.border}; border-right: 1px solid ${BRAND.border};">
              ${content}
            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td style="background: ${BRAND.card}; padding: 0 32px 28px; border-left: 1px solid ${BRAND.border}; border-right: 1px solid ${BRAND.border}; border-bottom: 1px solid ${BRAND.border}; border-radius: 0 0 16px 16px;">
              <div style="border-top: 1px solid ${BRAND.border}; padding-top: 20px;">
                <p style="font-size: 12px; color: ${BRAND.muted}; margin: 0; line-height: 1.5;">
                  Sent by <a href="https://howdoihelp.ai" style="color: ${BRAND.green}; text-decoration: none;">howdoihelp.ai</a> &mdash; connecting people with AI safety guides
                </p>
              </div>
            </td>
          </tr>

        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

function primaryButton(href: string, label: string): string {
  return `<a href="${href}" style="display: inline-block; background: ${BRAND.green}; color: white; padding: 13px 36px; border-radius: 10px; text-decoration: none; font-size: 15px; font-weight: 600; letter-spacing: -0.01em;">${label}</a>`;
}

function secondaryButton(href: string, label: string): string {
  return `<a href="${href}" style="display: inline-block; color: ${BRAND.muted}; padding: 13px 20px; text-decoration: none; font-size: 14px; font-weight: 500;">${label}</a>`;
}

// ─── Magic Link Sign-In ─────────────────────────────────────

export async function sendMagicLinkEmail(
  email: string,
  actionLink: string
): Promise<void> {
  const content = `
    <h1 style="font-size: 21px; font-weight: 600; color: ${BRAND.foreground}; margin: 0 0 8px 0; letter-spacing: -0.02em;">
      Sign in to your account
    </h1>

    <p style="font-size: 15px; color: ${BRAND.mutedFg}; line-height: 1.6; margin: 0 0 28px 0;">
      Click below to sign in. This link will expire in 1 hour.
    </p>

    <div style="text-align: center; margin: 28px 0 32px;">
      ${primaryButton(actionLink, "Sign in")}
    </div>

    <p style="font-size: 13px; color: ${BRAND.muted}; line-height: 1.5; margin: 0;">
      If you didn't request this, you can safely ignore this email.
    </p>
  `;

  await resend.emails.send({
    from: FROM_EMAIL,
    to: email,
    subject: "Sign in to howdoihelp.ai",
    html: emailLayout(content),
  });
}

// ─── Guide Request Notification ─────────────────────────────

interface GuideRequestNotification {
  guideEmail: string;
  guideName: string;
  requesterName: string;
  requesterEmail: string;
  requesterProfileLink: string;
  message: string;
  approvalToken: string;
}

export async function sendGuideRequestNotification({
  guideEmail,
  guideName,
  requesterName,
  requesterEmail,
  requesterProfileLink,
  message,
  approvalToken,
}: GuideRequestNotification): Promise<void> {
  const base = getBaseUrl();
  const approveUrl = `${base}/guide-request/${approvalToken}?action=approve`;
  const declineUrl = `${base}/guide-request/${approvalToken}?action=decline`;

  const messageBlock = message
    ? `
    <div style="background: ${BRAND.warmBg}; border: 1px solid ${BRAND.border}; border-radius: 12px; padding: 16px 20px; margin: 20px 0;">
      <p style="font-size: 12px; color: ${BRAND.muted}; margin: 0 0 6px 0; font-weight: 600; text-transform: uppercase; letter-spacing: 0.05em;">Their message</p>
      <p style="font-size: 14px; color: ${BRAND.foreground}; line-height: 1.6; margin: 0; white-space: pre-wrap;">${message}</p>
    </div>
    `
    : "";

  const content = `
    <p style="font-size: 15px; color: ${BRAND.foreground}; margin: 0 0 20px 0;">
      Hi ${guideName.split(" ")[0]},
    </p>

    <p style="font-size: 15px; color: ${BRAND.mutedFg}; line-height: 1.6; margin: 0 0 4px 0;">
      <strong style="color: ${BRAND.foreground};">${requesterName}</strong> would like to book a call with you.
    </p>

    <p style="font-size: 14px; color: ${BRAND.muted}; margin: 0 0 16px 0;">
      ${requesterEmail} &middot; <a href="${requesterProfileLink}" style="color: ${BRAND.green}; text-decoration: none; font-weight: 500;">View profile</a>
    </p>

    ${messageBlock}

    <div style="text-align: center; margin: 28px 0 8px;">
      ${primaryButton(approveUrl, "Approve &amp; share booking link")}
    </div>
    <div style="text-align: center; margin: 0 0 24px;">
      ${secondaryButton(declineUrl, "Decline")}
    </div>

    <p style="font-size: 13px; color: ${BRAND.muted}; line-height: 1.5; margin: 0;">
      When you approve, we'll send ${requesterName} your booking link so they can schedule a time.
    </p>
  `;

  await resend.emails.send({
    from: FROM_EMAIL,
    to: guideEmail,
    subject: `${requesterName} wants to talk with you on howdoihelp.ai`,
    html: emailLayout(content),
  });
}

// ─── Calendar Link to Requester ─────────────────────────────

interface CalendarLinkEmail {
  requesterEmail: string;
  requesterName: string;
  guideName: string;
  guideHeadline: string | null;
  calendarLink: string;
}

export async function sendCalendarLinkToRequester({
  requesterEmail,
  requesterName,
  guideName,
  guideHeadline,
  calendarLink,
}: CalendarLinkEmail): Promise<void> {
  const content = `
    <p style="font-size: 15px; color: ${BRAND.foreground}; margin: 0 0 20px 0;">
      Hi ${requesterName.split(" ")[0]},
    </p>

    <p style="font-size: 15px; color: ${BRAND.mutedFg}; line-height: 1.6; margin: 0 0 24px 0;">
      Great news! <strong style="color: ${BRAND.foreground};">${guideName}</strong>${guideHeadline ? ` &mdash; ${guideHeadline}` : ""} accepted your request for a call.
    </p>

    <div style="text-align: center; margin: 28px 0 32px;">
      ${primaryButton(calendarLink, "Book your call")}
    </div>

    <p style="font-size: 13px; color: ${BRAND.muted}; line-height: 1.5; margin: 0;">
      Pick a time that works for you. The guide is looking forward to connecting.
    </p>
  `;

  await resend.emails.send({
    from: FROM_EMAIL,
    to: requesterEmail,
    subject: `${guideName} accepted your call request!`,
    html: emailLayout(content),
  });
}

// ─── Guide Follow-Up (One-Call Mode) ────────────────────────

interface GuideFollowUpEmail {
  guideEmail: string;
  guideName: string;
}

export async function sendGuideFollowUpEmail({
  guideEmail,
  guideName,
}: GuideFollowUpEmail): Promise<void> {
  const base = getBaseUrl();
  const settingsUrl = `${base}/dashboard/guide`;

  const content = `
    <p style="font-size: 15px; color: ${BRAND.foreground}; margin: 0 0 20px 0;">
      Hi ${guideName.split(" ")[0]},
    </p>

    <p style="font-size: 15px; color: ${BRAND.mutedFg}; line-height: 1.6; margin: 0 0 16px 0;">
      Thanks for taking a call through howdoihelp.ai! Since you chose "just one call for now," you're currently not being recommended to anyone.
    </p>

    <p style="font-size: 15px; color: ${BRAND.mutedFg}; line-height: 1.6; margin: 0 0 24px 0;">
      If you'd like to keep helping people, you can update your availability to take more calls.
    </p>

    <div style="text-align: center; margin: 28px 0 32px;">
      ${primaryButton(settingsUrl, "Update your availability")}
    </div>

    <p style="font-size: 13px; color: ${BRAND.muted}; line-height: 1.5; margin: 0;">
      No pressure at all. If one call was enough, you don't need to do anything.
    </p>
  `;

  await resend.emails.send({
    from: FROM_EMAIL,
    to: guideEmail,
    subject: "Want to take more calls on howdoihelp.ai?",
    html: emailLayout(content),
  });
}
