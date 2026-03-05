import { createClient } from "@supabase/supabase-js";
import { sendCalendarLinkToRequester } from "@/lib/email";
import Link from "next/link";

export const dynamic = "force-dynamic";

function getServiceClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    throw new Error("Missing Supabase service role key");
  }
  return createClient(url, key);
}

interface PageProps {
  params: Promise<{ token: string }>;
  searchParams: Promise<{ action?: string }>;
}

export default async function GuideRequestPage({ params, searchParams }: PageProps) {
  const { token } = await params;
  const { action } = await searchParams;

  if (!action || !["approve", "decline"].includes(action)) {
    return <ResultCard type="error" title="Invalid Link" message="This link is not valid." />;
  }

  const supabase = getServiceClient();

  const { data: request, error } = await supabase
    .from("guide_requests")
    .select("*")
    .eq("approval_token", token)
    .single();

  if (error || !request) {
    return (
      <ResultCard
        type="error"
        title="Request Not Found"
        message="This request may have already been processed or the link has expired."
      />
    );
  }

  if (request.status !== "pending") {
    const statusText = request.status === "approved" ? "already approved" : "already declined";
    return <ResultCard type="error" title="Already Processed" message={`This request was ${statusText}.`} />;
  }

  const newStatus = action === "approve" ? "approved" : "declined";
  await supabase
    .from("guide_requests")
    .update({ status: newStatus, reviewed_at: new Date().toISOString() })
    .eq("id", request.id);

  if (action === "approve") {
    const { data: guide } = await supabase
      .from("guides")
      .select("calendar_link, headline")
      .eq("id", request.guide_id)
      .single();

    const { data: profile } = await supabase
      .from("profiles")
      .select("display_name")
      .eq("id", request.guide_id)
      .single();

    if (guide?.calendar_link) {
      try {
        await sendCalendarLinkToRequester({
          requesterEmail: request.requester_email,
          requesterName: request.requester_name,
          guideName: profile?.display_name || "Your guide",
          guideHeadline: guide.headline,
          calendarLink: guide.calendar_link,
        });
      } catch (emailErr) {
        console.error("[guide-request] Failed to send calendar link email:", emailErr);
      }
    }

    return (
      <ResultCard
        type="success"
        title="Request Approved"
        message={`We've sent your booking link to ${request.requester_name} (${request.requester_email}). They'll be able to schedule a call with you.`}
        showDashboard
      />
    );
  }

  return (
    <ResultCard
      type="success"
      title="Request Declined"
      message={`We won't share your booking link with ${request.requester_name}. No email will be sent to them.`}
      showDashboard
    />
  );
}

function ResultCard({
  type,
  title,
  message,
  showDashboard,
}: {
  type: "success" | "error";
  title: string;
  message: string;
  showDashboard?: boolean;
}) {
  return (
    <main className="flex min-h-dvh items-center justify-center px-6 bg-background">
      <div className="w-full max-w-sm text-center">
        <div className="mx-auto mb-5 flex h-16 w-16 items-center justify-center rounded-2xl bg-accent/10">
          {type === "success" ? (
            <svg className="h-8 w-8 text-accent" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="m4.5 12.75 6 6 9-13.5" />
            </svg>
          ) : (
            <svg className="h-8 w-8 text-muted-foreground" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m9-.75a9 9 0 1 1-18 0 9 9 0 0 1 18 0Zm-9 3.75h.008v.008H12v-.008Z" />
            </svg>
          )}
        </div>

        <h1 className="text-xl font-semibold text-foreground">{title}</h1>
        <p className="mt-3 text-sm text-muted-foreground leading-relaxed">{message}</p>

        {showDashboard && (
          <Link
            href="/dashboard"
            className="mt-8 inline-flex items-center justify-center rounded-xl bg-accent px-6 py-3 text-sm font-medium text-white hover:bg-accent-hover transition-colors"
          >
            Go to dashboard
          </Link>
        )}
      </div>
    </main>
  );
}
