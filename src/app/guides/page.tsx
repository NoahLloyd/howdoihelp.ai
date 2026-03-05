import type { Metadata } from "next";
import Link from "next/link";
import { getSupabase } from "@/lib/supabase";
import { GuidesListing } from "@/components/public/guides-listing";
import type { PublicGuide } from "@/app/api/guides/route";

export const metadata: Metadata = {
  title: "Talk to a Guide | howdoihelp.ai",
  description:
    "Book a free 30-minute call with experienced AI safety professionals who want to help you navigate the field.",
};

async function fetchGuides(): Promise<PublicGuide[]> {
  const supabase = getSupabase();
  if (!supabase) return [];

  const { data: guides } = await supabase
    .from("guides")
    .select("*")
    .eq("status", "active")
    .not("calendar_link", "is", null)
    .neq("calendar_link", "");

  if (!guides || guides.length === 0) return [];

  const guideIds = guides.map((g: { id: string }) => g.id);
  const { data: profiles } = await supabase
    .from("profiles")
    .select("id, display_name, avatar_url, bio")
    .in("id", guideIds);

  const profileMap = new Map(
    (profiles || []).map((p: { id: string; display_name: string | null; avatar_url: string | null; bio: string | null }) => [p.id, p])
  );

  return guides.map((g: Record<string, unknown>): PublicGuide => {
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
}

export default async function GuidesPage() {
  const guides = await fetchGuides();

  return (
    <main className="min-h-dvh px-6 py-10">
      <div className="mx-auto w-full max-w-2xl">
        {/* Nav */}
        <div className="flex items-center justify-between mb-10">
          <Link
            href="/"
            className="text-sm text-muted hover:text-muted-foreground transition-colors"
          >
            howdoihelp.ai
          </Link>
          <Link
            href="/auth/login"
            className="text-sm text-muted-foreground hover:text-foreground transition-colors"
          >
            Become a guide
          </Link>
        </div>

        {/* Header */}
        <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">
          Talk to a guide
        </h1>
        <p className="mt-3 text-base text-muted-foreground leading-relaxed max-w-lg">
          Tell us a bit about yourself and we&apos;ll match you with a guide
          who can actually help. Free 30-minute video call.
        </p>

        <div className="mt-8">
          <GuidesListing initialGuides={guides} />
        </div>
      </div>
    </main>
  );
}
