import { enrichProfile } from "@/lib/enrich";
import { detectPlatform } from "@/lib/profile";
import { getSupabase } from "@/lib/supabase";
import type { ApiUsageEntry } from "@/types";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { url, email, userId } = body as {
      url?: string;
      email?: string;
      userId?: string;
    };

    if (!url && !email) {
      return Response.json({ error: "url or email required" }, { status: 400 });
    }

    const platform = url ? detectPlatform(url) : "linkedin";
    const { profile, usageLog } = await enrichProfile({ url, email, platform });

    // Log usage to Supabase
    const supabase = getSupabase();
    if (supabase && usageLog.length > 0) {
      const rows = usageLog.map((entry) => ({
        ...entry,
        user_id: userId || undefined,
      }));

      await supabase.from("api_usage").insert(rows).then(() => {}, () => {});
    }

    if (!profile) {
      return Response.json(
        { error: "Could not fetch profile. The service may be unavailable or the URL may be invalid." },
        { status: 404 }
      );
    }

    return Response.json({ profile });
  } catch (err) {
    console.error("[enrich] Error:", err);
    return Response.json(
      { error: "Profile import temporarily unavailable" },
      { status: 500 }
    );
  }
}
