import { createClient } from "@supabase/supabase-js";
import { sendGuideRequestNotification } from "@/lib/email";

function getServiceClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    throw new Error("Missing Supabase service role key");
  }
  return createClient(url, key);
}

interface GuideRequestBody {
  guideId: string;
  name: string;
  email: string;
  profileLink: string;
  message?: string;
}

export async function POST(req: Request) {
  try {
    const body = (await req.json()) as GuideRequestBody;
    const { guideId, name, email, profileLink, message } = body;

    // Validate required fields
    if (!guideId || !name?.trim() || !email?.trim() || !profileLink?.trim()) {
      return Response.json({ error: "Name, email, and profile link are required" }, { status: 400 });
    }

    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return Response.json({ error: "Invalid email address" }, { status: 400 });
    }

    if (message && message.length > 2000) {
      return Response.json({ error: "Message too long" }, { status: 400 });
    }

    const supabase = getServiceClient();

    // Fetch guide + profile to get their email and name
    const { data: guide, error: guideError } = await supabase
      .from("guides")
      .select("id, status, booking_mode, calendar_link, headline")
      .eq("id", guideId)
      .eq("status", "active")
      .single();

    if (guideError || !guide) {
      return Response.json({ error: "Guide not found" }, { status: 404 });
    }

    // Get guide's auth email
    const { data: authData } = await supabase.auth.admin.getUserById(guideId);
    const guideEmail = authData?.user?.email;
    if (!guideEmail) {
      return Response.json({ error: "Guide email not configured" }, { status: 500 });
    }

    // Get guide's display name
    const { data: profile } = await supabase
      .from("profiles")
      .select("display_name")
      .eq("id", guideId)
      .single();

    const guideName = profile?.display_name || "Guide";

    // Insert the request
    const trimmedMessage = message?.trim() || "";

    const { data: request, error: insertError } = await supabase
      .from("guide_requests")
      .insert({
        guide_id: guideId,
        requester_name: name.trim(),
        requester_email: email.trim(),
        requester_profile_link: profileLink.trim(),
        message: trimmedMessage,
      })
      .select("approval_token")
      .single();

    if (insertError) {
      console.error("[guide-request] Insert error:", insertError);
      return Response.json({ error: "Failed to submit request" }, { status: 500 });
    }

    // Send notification email to the guide
    try {
      await sendGuideRequestNotification({
        guideEmail,
        guideName,
        requesterName: name.trim(),
        requesterEmail: email.trim(),
        requesterProfileLink: profileLink.trim(),
        message: trimmedMessage,
        approvalToken: request.approval_token,
      });
    } catch (emailErr) {
      console.error("[guide-request] Email send error:", emailErr);
      // Request is saved even if email fails — guide can see it in dashboard
    }

    return Response.json({ ok: true });
  } catch (err) {
    console.error("[guide-request] Error:", err);
    return Response.json({ error: "Something went wrong" }, { status: 500 });
  }
}
