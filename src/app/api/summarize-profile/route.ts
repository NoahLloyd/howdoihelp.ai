import { detectPlatform } from "@/lib/profile";
import type { EnrichedProfile } from "@/types";

export const dynamic = "force-dynamic";

/**
 * Takes free-text self-description + extracted URLs, scrapes the URLs,
 * and combines everything into an enriched profile + profile text
 * suitable for the recommendation engine.
 */
export async function POST(req: Request) {
  try {
    const body = (await req.json()) as {
      text: string;
      urls: string[];
    };

    const { text, urls } = body;

    if (!text) {
      return Response.json({ error: "text required" }, { status: 400 });
    }

    // Scrape all URLs in parallel
    const scrapeResults = await Promise.allSettled(
      urls.map(async (url) => {
        const platform = detectPlatform(url);
        try {
          const res = await fetch(new URL("/api/scrape-profile", req.url), {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ url }),
          });
          if (res.ok) {
            const data = await res.json();
            return { url, platform, profile: data.profile as EnrichedProfile | null };
          }
        } catch { /* continue */ }
        return { url, platform, profile: null };
      })
    );

    // Merge scraped profiles - take the first one with meaningful data as the base
    let mergedProfile: EnrichedProfile | undefined;
    const scrapedTexts: string[] = [];

    for (const result of scrapeResults) {
      if (result.status !== "fulfilled") continue;
      const { profile, url, platform } = result.value;
      if (!profile) {
        scrapedTexts.push(`[Link: ${url}]`);
        continue;
      }

      if (!mergedProfile) {
        mergedProfile = profile;
      } else {
        // Merge additional data into the base profile
        if (!mergedProfile.fullName && profile.fullName) mergedProfile.fullName = profile.fullName;
        if (!mergedProfile.headline && profile.headline) mergedProfile.headline = profile.headline;
        if (!mergedProfile.currentTitle && profile.currentTitle) mergedProfile.currentTitle = profile.currentTitle;
        if (!mergedProfile.currentCompany && profile.currentCompany) mergedProfile.currentCompany = profile.currentCompany;
        if (!mergedProfile.location && profile.location) mergedProfile.location = profile.location;
        if (!mergedProfile.photo && profile.photo) mergedProfile.photo = profile.photo;
        if (!mergedProfile.summary && profile.summary) mergedProfile.summary = profile.summary;
        if (profile.skills.length > 0) {
          const existing = new Set(mergedProfile.skills);
          for (const s of profile.skills) {
            if (!existing.has(s)) mergedProfile.skills.push(s);
          }
        }
        if (profile.experience.length > 0) {
          mergedProfile.experience.push(...profile.experience);
        }
        if (profile.education.length > 0) {
          mergedProfile.education.push(...profile.education);
        }
        if (profile.repos && profile.repos.length > 0) {
          mergedProfile.repos = [...(mergedProfile.repos || []), ...profile.repos];
        }
      }

      // Build a text snippet from the profile for the recommendation prompt
      const parts: string[] = [];
      if (profile.fullName) parts.push(`Name: ${profile.fullName}`);
      if (profile.headline) parts.push(`Headline: ${profile.headline}`);
      if (profile.currentTitle && profile.currentCompany) {
        parts.push(`Role: ${profile.currentTitle} at ${profile.currentCompany}`);
      }
      if (parts.length > 0) {
        scrapedTexts.push(`[From ${platform} profile: ${url}]\n${parts.join(", ")}`);
      }
    }

    // Combine the user's self-description with scraped data
    const combinedText = [
      `[User's self-description]\n${text}`,
      ...scrapedTexts,
    ].join("\n\n");

    return Response.json({
      profile: mergedProfile || undefined,
      profileText: combinedText,
      scrapedUrls: urls.filter((_, i) => {
        const r = scrapeResults[i];
        return r.status === "fulfilled" && r.value.profile;
      }),
    });
  } catch (err) {
    console.error("[summarize-profile] Error:", err);
    return Response.json({ error: "Profile summarization failed" }, { status: 500 });
  }
}
