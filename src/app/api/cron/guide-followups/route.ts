import { createClient } from "@supabase/supabase-js";
import { sendGuideFollowUpEmail } from "@/lib/email";

export const dynamic = "force-dynamic";

function getServiceClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    throw new Error("Missing Supabase service role key");
  }
  return createClient(url, key);
}

/**
 * Cron endpoint: sends follow-up emails to one_call guides
 * whose approved request is older than 3 days.
 *
 * Triggered daily via Vercel cron or similar scheduler.
 * Protected by CRON_SECRET header.
 */
export async function GET(req: Request) {
  // Verify cron secret
  const authHeader = req.headers.get("authorization");
  const cronSecret = process.env.CRON_SECRET;
  if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const supabase = getServiceClient();
  const threeDaysAgo = new Date(Date.now() - 3 * 24 * 60 * 60 * 1000).toISOString();

  // Find approved requests for one_call guides, older than 3 days, not yet followed up
  const { data: requests, error } = await supabase
    .from("guide_requests")
    .select("id, guide_id, reviewed_at")
    .eq("status", "approved")
    .eq("follow_up_sent", false)
    .lt("reviewed_at", threeDaysAgo);

  if (error) {
    console.error("[guide-followups] Query error:", error);
    return Response.json({ error: "Query failed" }, { status: 500 });
  }

  if (!requests || requests.length === 0) {
    return Response.json({ sent: 0 });
  }

  // Get guide IDs and check which are in one_call mode
  const guideIds = [...new Set(requests.map((r: { guide_id: string }) => r.guide_id))];

  const { data: guides } = await supabase
    .from("guides")
    .select("id, availability_mode")
    .in("id", guideIds)
    .eq("availability_mode", "one_call");

  if (!guides || guides.length === 0) {
    return Response.json({ sent: 0 });
  }

  const oneCallGuideIds = new Set(guides.map((g: { id: string }) => g.id));

  // Filter requests to only one_call guides
  const eligibleRequests = requests.filter(
    (r: { guide_id: string }) => oneCallGuideIds.has(r.guide_id)
  );

  if (eligibleRequests.length === 0) {
    return Response.json({ sent: 0 });
  }

  // Get guide profiles for email
  const eligibleGuideIds = [...new Set(eligibleRequests.map((r: { guide_id: string }) => r.guide_id))];

  const { data: profiles } = await supabase
    .from("profiles")
    .select("id, display_name")
    .in("id", eligibleGuideIds);

  const profileMap = new Map(
    (profiles || []).map((p: { id: string; display_name: string | null }) => [p.id, p])
  );

  // Get guide auth emails
  let sent = 0;
  for (const guideId of eligibleGuideIds) {
    const { data: authData } = await supabase.auth.admin.getUserById(guideId);
    const guideEmail = authData?.user?.email;
    if (!guideEmail) continue;

    const profile = profileMap.get(guideId);
    const guideName = profile?.display_name || "there";

    try {
      await sendGuideFollowUpEmail({ guideEmail, guideName });

      // Mark all eligible requests for this guide as followed up
      const requestIds = eligibleRequests
        .filter((r: { guide_id: string }) => r.guide_id === guideId)
        .map((r: { id: string }) => r.id);

      await supabase
        .from("guide_requests")
        .update({ follow_up_sent: true })
        .in("id", requestIds);

      sent++;
    } catch (err) {
      console.error(`[guide-followups] Failed to send to ${guideId}:`, err);
    }
  }

  return Response.json({ sent });
}
