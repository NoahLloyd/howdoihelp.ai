import { scrapeLinkedInProfile } from "@/lib/linkedin-scraper";
import { githubLookup, scrapeXProfile, scrapeInstagramProfile, bestEffortFetch } from "@/lib/enrich";
import { detectPlatform } from "@/lib/profile";

export const dynamic = "force-dynamic";

/**
 * Quick profile scrape - returns basic info (name, photo, headline) fast,
 * without waiting for Claude extraction. Used by the processing flow to
 * show immediate feedback while full enrichment runs in a follow-up call.
 */
export async function POST(req: Request) {
  try {
    const { url } = (await req.json()) as { url?: string };

    if (!url) {
      return Response.json({ error: "url required" }, { status: 400 });
    }

    const platform = detectPlatform(url);

    if (platform === "linkedin") {
      const { profile } = await scrapeLinkedInProfile(url);
      return Response.json({ profile, platform });
    }

    if (platform === "github") {
      const { profile } = await githubLookup(url);
      return Response.json({ profile, platform });
    }

    if (platform === "x") {
      const { profile } = await scrapeXProfile(url);
      return Response.json({ profile, platform });
    }

    if (platform === "instagram") {
      const { profile } = await scrapeInstagramProfile(url);
      return Response.json({ profile, platform });
    }

    // Other platforms - try best-effort with crawler UAs
    const { profile } = await bestEffortFetch(url);
    return Response.json({ profile, platform });
  } catch (err) {
    console.error("[scrape-profile] Error:", err);
    return Response.json({ error: "Scrape failed" }, { status: 500 });
  }
}
