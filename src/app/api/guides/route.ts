import { NextResponse } from "next/server";
import { getSupabase } from "@/lib/supabase";

export interface PublicGuide {
  id: string;
  display_name: string | null;
  avatar_url: string | null;
  headline: string | null;
  bio: string | null;
  topics: string[];
  calendar_link: string;
  location: string | null;
  is_available_in_person: boolean;
  preferred_career_stages: string[];
  preferred_backgrounds: string[];
  languages: string[];
  linkedin_url: string | null;
  website_url: string | null;
  booking_mode: "direct" | "approval_required";
}

export async function GET(request: Request) {
  const supabase = getSupabase();
  if (!supabase) {
    return NextResponse.json({ guides: [] });
  }

  const { searchParams } = new URL(request.url);
  const topic = searchParams.get("topic");

  // Fetch active guides with calendar links, joined with profiles
  const { data: guides, error: guidesError } = await supabase
    .from("guides")
    .select("*")
    .eq("status", "active")
    .not("calendar_link", "is", null)
    .neq("calendar_link", "");

  if (guidesError || !guides || guides.length === 0) {
    return NextResponse.json({ guides: [] });
  }

  const guideIds = guides.map((g: { id: string }) => g.id);

  // Fetch profiles for these guides
  const { data: profiles } = await supabase
    .from("profiles")
    .select("id, display_name, avatar_url, bio")
    .in("id", guideIds);

  const profileMap = new Map(
    (profiles || []).map((p: { id: string; display_name: string | null; avatar_url: string | null; bio: string | null }) => [p.id, p])
  );

  let result: PublicGuide[] = guides.map((g: Record<string, unknown>) => {
    const p = profileMap.get(g.id as string) as { display_name: string | null; avatar_url: string | null; bio: string | null } | undefined;
    return {
      id: g.id as string,
      display_name: p?.display_name ?? null,
      avatar_url: p?.avatar_url ?? null,
      headline: g.headline as string | null,
      bio: p?.bio ?? null,
      topics: (g.topics as string[]) || [],
      calendar_link: g.calendar_link as string,
      location: g.location as string | null,
      is_available_in_person: (g.is_available_in_person as boolean) || false,
      preferred_career_stages: (g.preferred_career_stages as string[]) || [],
      preferred_backgrounds: (g.preferred_backgrounds as string[]) || [],
      languages: (g.languages as string[]) || [],
      linkedin_url: g.linkedin_url as string | null,
      website_url: g.website_url as string | null,
      booking_mode: (g.booking_mode as "direct" | "approval_required") || "direct",
    };
  });

  // Filter by topic if requested
  if (topic) {
    result = result.filter((g) =>
      g.topics.some((t) => t.toLowerCase().includes(topic.toLowerCase()))
    );
  }

  return NextResponse.json({ guides: result });
}
