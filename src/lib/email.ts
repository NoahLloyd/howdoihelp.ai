import { Resend } from "resend";

const resend = new Resend(process.env.RESEND_API_KEY);

const FROM_EMAIL = "howdoihelp.ai <noreply@howdoihelp.ai>";

function getBaseUrl(): string {
  if (process.env.NEXT_PUBLIC_VERCEL_URL) {
    return `https://${process.env.NEXT_PUBLIC_VERCEL_URL}`;
  }
  return process.env.NEXT_PUBLIC_SITE_URL || "https://howdoihelp.ai";
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

  await resend.emails.send({
    from: FROM_EMAIL,
    to: guideEmail,
    subject: `${requesterName} wants to talk with you on howdoihelp.ai`,
    html: `
      <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 500px; margin: 0 auto; padding: 24px;">
        <p style="font-size: 16px; color: #1a1a1a;">Hi ${guideName.split(" ")[0]},</p>

        <p style="font-size: 15px; color: #333; line-height: 1.6;">
          <strong>${requesterName}</strong> (${requesterEmail}) would like to book a call with you through howdoihelp.ai.
        </p>

        <p style="font-size: 14px; margin: 12px 0;">
          <a href="${requesterProfileLink}" style="color: #6366f1; text-decoration: none; font-weight: 500;">View their profile</a>
        </p>

        ${message ? `
        <div style="background: #f5f5f5; border-radius: 12px; padding: 16px 20px; margin: 20px 0;">
          <p style="font-size: 13px; color: #666; margin: 0 0 4px 0; font-weight: 600;">Their message:</p>
          <p style="font-size: 14px; color: #333; line-height: 1.5; margin: 0; white-space: pre-wrap;">${message}</p>
        </div>
        ` : ""}

        <div style="margin: 28px 0; text-align: center;">
          <a href="${approveUrl}" style="display: inline-block; background: #6366f1; color: white; padding: 12px 32px; border-radius: 8px; text-decoration: none; font-size: 14px; font-weight: 600; margin-right: 12px;">
            Approve &amp; share my booking link
          </a>
          <a href="${declineUrl}" style="display: inline-block; color: #888; padding: 12px 16px; text-decoration: none; font-size: 14px;">
            Decline
          </a>
        </div>

        <p style="font-size: 13px; color: #999; margin-top: 32px;">
          When you approve, we'll send ${requesterName} your booking link so they can schedule a call.
        </p>
      </div>
    `,
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
  await resend.emails.send({
    from: FROM_EMAIL,
    to: requesterEmail,
    subject: `${guideName} accepted your call request!`,
    html: `
      <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 500px; margin: 0 auto; padding: 24px;">
        <p style="font-size: 16px; color: #1a1a1a;">Hi ${requesterName.split(" ")[0]},</p>

        <p style="font-size: 15px; color: #333; line-height: 1.6;">
          Great news! <strong>${guideName}</strong>${guideHeadline ? ` (${guideHeadline})` : ""} has approved your request for a call.
        </p>

        <div style="margin: 28px 0; text-align: center;">
          <a href="${calendarLink}" style="display: inline-block; background: #6366f1; color: white; padding: 14px 36px; border-radius: 8px; text-decoration: none; font-size: 15px; font-weight: 600;">
            Book your call
          </a>
        </div>

        <p style="font-size: 13px; color: #999; margin-top: 32px;">
          This link was sent via <a href="https://howdoihelp.ai" style="color: #6366f1; text-decoration: none;">howdoihelp.ai</a>
        </p>
      </div>
    `,
  });
}
