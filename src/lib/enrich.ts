import type { EnrichedProfile, ProfilePlatform, ApiUsageEntry } from "@/types";
import { detectPlatform } from "./profile";
import { scrapeLinkedInProfile } from "./linkedin-scraper";
import { scrapeWithBrightData } from "./brightdata";
import { llmComplete, extractJson } from "./llm";
import { getActivePrompt, interpolateTemplate } from "./prompts";

// ─── LLM Profile Extraction ────────────────────────────────

async function llmExtractProfile(
  rawText: string,
  url: string,
): Promise<{ profile: EnrichedProfile | null; usage: ApiUsageEntry }> {
  if (!rawText) {
    return { profile: null, usage: { provider: "claude", endpoint: "extract", estimated_cost_usd: 0 } };
  }

  try {
    const activePrompt = await getActivePrompt("extract");
    const fullPrompt = interpolateTemplate(activePrompt.content, { raw_text: rawText });
    const result = await llmComplete({
      task: "extract",
      system: "",
      user: fullPrompt,
      maxTokens: 1500,
      endpoint: "extract",
      modelOverride: activePrompt.model || undefined,
    });

    const jsonStr = extractJson(result.text);
    const data = JSON.parse(jsonStr);

    // Build skills array from all the structured fields
    const skills: string[] = [];
    if (data.certifications?.length) skills.push(...data.certifications);
    if (data.awards?.length) skills.push(...data.awards);
    if (data.volunteer?.length) {
      skills.push(...data.volunteer.map((v: string) => `Volunteer: ${v}`));
    }
    if (data.publications?.length) {
      skills.push(...data.publications.map((p: string) => `Publication: ${p}`));
    }
    if (data.languages?.length) {
      skills.push(...data.languages.map((l: string) => `Language: ${l}`));
    }
    if (data.skills?.length) skills.push(...data.skills);

    const profile: EnrichedProfile = {
      fullName: data.fullName || undefined,
      headline: data.headline || undefined,
      currentTitle: data.currentTitle || undefined,
      currentCompany: data.currentCompany || undefined,
      location: data.location || undefined,
      summary: data.summary || undefined,
      skills,
      experience: (data.experience || []).map((e: { title: string; company: string }) => ({
        title: e.title || "",
        company: e.company || "",
      })),
      education: (data.education || []).map((e: { school: string; degree?: string; field?: string }) => ({
        school: e.school || "",
        degree: e.degree || undefined,
        field: e.field || undefined,
      })),
      platform: "linkedin",
      sourceUrl: url,
      linkedinUrl: url,
      fetchedAt: new Date().toISOString(),
    };

    return { profile, usage: result.usage };
  } catch (err) {
    console.error("[enrich] LLM extraction failed:", err);
    return { profile: null, usage: { provider: "claude", endpoint: "extract", estimated_cost_usd: 0 } };
  }
}

// ─── GitHub Public API ───────────────────────────────────────

export async function githubLookup(url: string): Promise<{
  profile: EnrichedProfile | null;
  usage: ApiUsageEntry;
}> {
  // Extract username from URL: github.com/username or github.com/username/...
  const match = url.match(/github\.com\/([^/?\s]+)/i);
  if (!match) {
    return { profile: null, usage: { provider: "github", endpoint: "users", estimated_cost_usd: 0 } };
  }
  const username = match[1];

  try {
    const [userRes, reposRes] = await Promise.all([
      fetch(`https://api.github.com/users/${username}`, {
        headers: { Accept: "application/vnd.github.v3+json", "User-Agent": "howdoihelp-ai" },
        signal: AbortSignal.timeout(10_000),
      }),
      fetch(`https://api.github.com/users/${username}/repos?sort=stars&per_page=10`, {
        headers: { Accept: "application/vnd.github.v3+json", "User-Agent": "howdoihelp-ai" },
        signal: AbortSignal.timeout(10_000),
      }),
    ]);

    if (!userRes.ok) {
      return { profile: null, usage: { provider: "github", endpoint: "users", estimated_cost_usd: 0 } };
    }

    const user = await userRes.json();
    const repos = reposRes.ok ? await reposRes.json() : [];

    // Extract languages from repos as "skills"
    const languages = [...new Set(
      (repos as Array<Record<string, string>>)
        .map((r) => r.language)
        .filter(Boolean)
    )] as string[];

    return {
      profile: {
        fullName: user.name || undefined,
        headline: user.bio || undefined,
        currentCompany: user.company || undefined,
        location: user.location || undefined,
        photo: user.avatar_url || undefined,
        summary: user.bio || undefined,
        email: user.email || undefined,
        skills: languages,
        experience: [],
        education: [],
        platform: "github",
        sourceUrl: url,
        repos: (repos as Array<Record<string, unknown>>).slice(0, 10).map((r) => ({
          name: (r.name as string) || "",
          description: r.description as string | undefined,
          stars: (r.stargazers_count as number) || 0,
          language: r.language as string | undefined,
        })),
        followers: user.followers || 0,
        fetchedAt: new Date().toISOString(),
        dataSource: "github_api",
      },
      usage: { provider: "github", endpoint: `users/${username}`, estimated_cost_usd: 0 },
    };
  } catch {
    return { profile: null, usage: { provider: "github", endpoint: "users", estimated_cost_usd: 0 } };
  }
}

// ─── Social Media Scraper (X / Instagram / others) ──────────

/** Fetch HTML using social‑media crawler UAs (same trick as LinkedIn scraper) */
async function fetchWithCrawlerUA(url: string): Promise<string | null> {
  const crawlerUAs = [
    "facebookexternalhit/1.1 (+http://www.facebook.com/externalhit_uatext.php)",
    "Twitterbot/1.0",
    "Slackbot-LinkExpanding 1.0 (+https://api.slack.com/robots)",
  ];

  for (const ua of crawlerUAs) {
    try {
      const res = await fetch(url, {
        headers: {
          "User-Agent": ua,
          Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
          "Accept-Language": "en-US,en;q=0.9",
        },
        redirect: "follow",
        signal: AbortSignal.timeout(15_000),
      });

      if (res.ok) {
        const html = await res.text();
        if (html.includes("og:title") || html.includes("og:description")) {
          return html;
        }
      }
    } catch {
      // Try next UA
    }
  }

  return null;
}

/** Scrape an X (Twitter) profile using crawler UAs to get OG tags */
export async function scrapeXProfile(url: string): Promise<{
  profile: EnrichedProfile | null;
  usage: ApiUsageEntry;
}> {
  const usage: ApiUsageEntry = { provider: "scrape", endpoint: "x-scraper", estimated_cost_usd: 0 };

  const normalized = url.match(/^https?:\/\//) ? url : `https://${url}`;

  try {
    const html = await fetchWithCrawlerUA(normalized);
    if (!html) return { profile: null, usage };

    const ogTitle = extractMeta(html, "og:title");
    const ogDesc = extractMeta(html, "og:description") || extractMeta(html, "description");
    const ogImage = extractMeta(html, "og:image");

    // X og:title format: "Name (@handle) / X"
    let fullName: string | undefined;
    if (ogTitle) {
      const nameMatch = ogTitle.match(/^(.+?)\s*\(@/);
      fullName = nameMatch ? nameMatch[1].trim() : ogTitle.replace(/\s*[/|]\s*X$/, "").trim();
    }

    // Extract username from URL
    const handleMatch = normalized.match(/(?:x\.com|twitter\.com)\/([^/?#]+)/i);
    const handle = handleMatch ? `@${handleMatch[1]}` : undefined;

    if (!fullName && !ogDesc) return { profile: null, usage };

    return {
      profile: {
        fullName,
        headline: ogDesc || undefined,
        photo: ogImage || undefined,
        summary: ogDesc || undefined,
        skills: [],
        experience: [],
        education: [],
        platform: "x",
        sourceUrl: url,
        ...(handle ? { currentTitle: handle } : {}),
        fetchedAt: new Date().toISOString(),
      },
      usage,
    };
  } catch (err) {
    console.error("[x-scraper] Error:", err);
    return { profile: null, usage };
  }
}

/** Scrape an Instagram profile using crawler UAs to get OG tags */
export async function scrapeInstagramProfile(url: string): Promise<{
  profile: EnrichedProfile | null;
  usage: ApiUsageEntry;
}> {
  const usage: ApiUsageEntry = { provider: "scrape", endpoint: "instagram-scraper", estimated_cost_usd: 0 };

  const normalized = url.match(/^https?:\/\//) ? url : `https://${url}`;

  try {
    const html = await fetchWithCrawlerUA(normalized);
    if (!html) return { profile: null, usage };

    const ogTitle = extractMeta(html, "og:title");
    const ogDesc = extractMeta(html, "og:description") || extractMeta(html, "description");
    const ogImage = extractMeta(html, "og:image");
    const title = html.match(/<title[^>]*>([^<]+)<\/title>/i)?.[1]?.trim();

    // Instagram og:title formats:
    //   "Name (@handle) • Instagram photos and videos"
    //   "@handle • Instagram photos and videos"
    let fullName: string | undefined;
    let handle: string | undefined;
    if (ogTitle) {
      const nameMatch = ogTitle.match(/^(.+?)\s*\(@(\w+)\)/);
      if (nameMatch) {
        fullName = nameMatch[1].trim();
        handle = `@${nameMatch[2]}`;
      } else {
        const handleOnly = ogTitle.match(/^@(\w+)/);
        if (handleOnly) {
          handle = `@${handleOnly[1]}`;
        } else {
          // Fall back to title without the "• Instagram..." suffix
          fullName = ogTitle.replace(/\s*[•·]\s*Instagram.*$/i, "").trim() || undefined;
        }
      }
    }

    // Also try extracting handle from URL
    if (!handle) {
      const urlMatch = normalized.match(/instagram\.com\/([^/?#]+)/i);
      if (urlMatch && urlMatch[1] !== "p" && urlMatch[1] !== "reel") {
        handle = `@${urlMatch[1]}`;
      }
    }

    // og:description often has: "N Followers, N Following, N Posts - See Instagram photos..."
    // or a bio snippet
    let bio: string | undefined;
    if (ogDesc) {
      // Strip the stats prefix if present
      const bioMatch = ogDesc.match(/\d+\s+Posts?\s*[-–]\s*(.+)/i);
      bio = bioMatch ? bioMatch[1].trim() : ogDesc;
      // Clean trailing "See Instagram photos..." boilerplate
      bio = bio.replace(/\s*See Instagram photos.*$/i, "").trim() || undefined;
    }

    if (!fullName && !handle && !bio) return { profile: null, usage };

    return {
      profile: {
        fullName: fullName || (handle ? handle.replace("@", "") : undefined),
        headline: bio || undefined,
        photo: ogImage || undefined,
        summary: bio || undefined,
        skills: [],
        experience: [],
        education: [],
        platform: "instagram",
        sourceUrl: url,
        ...(handle ? { currentTitle: handle } : {}),
        fetchedAt: new Date().toISOString(),
      },
      usage,
    };
  } catch (err) {
    console.error("[instagram-scraper] Error:", err);
    return { profile: null, usage };
  }
}

// ─── Best-Effort Fetch (Other Platforms) ─────────────────────

export async function bestEffortFetch(url: string): Promise<{
  profile: EnrichedProfile | null;
  usage: ApiUsageEntry;
}> {
  const platform = detectPlatform(url);

  try {
    const normalized = url.match(/^https?:\/\//) ? url : `https://${url}`;

    // Try crawler UAs first (works better for social media sites), fall back to browser UA
    let html = await fetchWithCrawlerUA(normalized);
    if (!html) {
      const res = await fetch(normalized, {
        signal: AbortSignal.timeout(10_000),
        headers: {
          "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
          Accept: "text/html,application/xhtml+xml,*/*",
        },
      });
      if (res.ok) html = await res.text();
    }

    if (!html) {
      return {
        profile: { skills: [], experience: [], education: [], platform, sourceUrl: url, fetchedAt: new Date().toISOString() },
        usage: { provider: "scrape", endpoint: url, estimated_cost_usd: 0 },
      };
    }

    // Extract basic metadata from HTML
    const ogTitle = extractMeta(html, "og:title");
    const ogDesc = extractMeta(html, "og:description") || extractMeta(html, "description");
    const ogImage = extractMeta(html, "og:image");
    const title = html.match(/<title[^>]*>([^<]+)<\/title>/i)?.[1]?.trim();

    return {
      profile: {
        fullName: ogTitle || title || undefined,
        headline: ogDesc || undefined,
        photo: ogImage || undefined,
        skills: [],
        experience: [],
        education: [],
        platform,
        sourceUrl: url,
        fetchedAt: new Date().toISOString(),
      },
      usage: { provider: "scrape", endpoint: url, estimated_cost_usd: 0 },
    };
  } catch {
    return {
      profile: { skills: [], experience: [], education: [], platform, sourceUrl: url, fetchedAt: new Date().toISOString() },
      usage: { provider: "scrape", endpoint: url, estimated_cost_usd: 0 },
    };
  }
}

function decodeEntities(str: string): string {
  return str
    .replace(/&#x([0-9a-fA-F]+);/g, (_, hex) => String.fromCharCode(parseInt(hex, 16)))
    .replace(/&#(\d+);/g, (_, dec) => String.fromCharCode(parseInt(dec, 10)))
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'");
}

function extractMeta(html: string, property: string): string | undefined {
  const patterns = [
    new RegExp(`<meta[^>]+(?:property|name)=["']${property}["'][^>]+content=["']([^"']+)["']`, "i"),
    new RegExp(`<meta[^>]+content=["']([^"']+)["'][^>]+(?:property|name)=["']${property}["']`, "i"),
  ];
  for (const rx of patterns) {
    const m = html.match(rx);
    if (m?.[1]) return decodeEntities(m[1].trim());
  }
  return undefined;
}

// ─── Main Enrichment Orchestrator ────────────────────────────

/** Check if a profile has at least basic data */
function isProfileMeaningful(profile: EnrichedProfile | null): boolean {
  if (!profile) return false;
  return !!(
    profile.fullName ||
    profile.headline ||
    profile.currentTitle ||
    profile.summary ||
    profile.skills.length > 0 ||
    profile.experience.length > 0 ||
    profile.education.length > 0 ||
    (profile.repos && profile.repos.length > 0)
  );
}

/** Merge two profiles - take the richer value for each field */
function mergeProfiles(base: EnrichedProfile, overlay: Partial<EnrichedProfile>): EnrichedProfile {
  return {
    ...base,
    fullName: overlay.fullName || base.fullName,
    headline: overlay.headline || base.headline,
    currentTitle: overlay.currentTitle || base.currentTitle,
    currentCompany: overlay.currentCompany || base.currentCompany,
    location: overlay.location || base.location,
    summary: (overlay.summary && overlay.summary.length > (base.summary?.length || 0))
      ? overlay.summary : base.summary,
    photo: base.photo || overlay.photo, // Prefer scraper photo (from JSON-LD, high quality)
    followers: base.followers || overlay.followers,
    // Take whichever has more data
    skills: overlay.skills && overlay.skills.length > base.skills.length
      ? overlay.skills : base.skills,
    experience: overlay.experience && overlay.experience.length > base.experience.length
      ? overlay.experience : base.experience,
    education: overlay.education && overlay.education.length > base.education.length
      ? overlay.education : base.education,
  };
}

export async function enrichProfile(opts: {
  url?: string;
  email?: string;
  platform?: ProfilePlatform;
}): Promise<{ profile: EnrichedProfile | null; usageLog: ApiUsageEntry[] }> {
  const usageLog: ApiUsageEntry[] = [];
  const platform = opts.platform || (opts.url ? detectPlatform(opts.url) : "other");

  // LinkedIn: try Bright Data first (structured API), then fall back to crawler UA + Claude
  if (platform === "linkedin" && opts.url) {
    // Step 1: Try Bright Data — returns rich structured data, no LLM needed
    const bd = await scrapeWithBrightData(opts.url);
    usageLog.push(bd.usage);

    if (bd.profile && isProfileMeaningful(bd.profile)) {
      console.log("[enrich] Bright Data returned rich profile");
      return { profile: bd.profile, usageLog };
    }

    // Step 2: Fall back to crawler UA scraper + Claude extraction
    console.log("[enrich] Bright Data unavailable, falling back to scraper");
    const scraped = await scrapeLinkedInProfile(opts.url);
    usageLog.push(scraped.usage);

    // Use Claude if we have raw text
    if (scraped.rawText && scraped.rawText.length > 100) {
      const claude = await llmExtractProfile(scraped.rawText, opts.url);
      usageLog.push(claude.usage);

      if (claude.profile && isProfileMeaningful(claude.profile)) {
        const profile = scraped.profile
          ? mergeProfiles(scraped.profile, claude.profile)
          : claude.profile;
        profile.dataSource = "llm_extracted";
        return { profile, usageLog };
      }
    }

    // Fall back to scraper data if Claude failed
    if (isProfileMeaningful(scraped.profile)) {
      scraped.profile!.dataSource = "scraper";
      return { profile: scraped.profile, usageLog };
    }

    return { profile: null, usageLog };
  }

  // LinkedIn via email only (from OAuth) - no URL to scrape
  if (platform === "linkedin" && !opts.url) {
    return { profile: null, usageLog };
  }

  // GitHub: public API
  if (platform === "github" && opts.url) {
    const gh = await githubLookup(opts.url);
    usageLog.push(gh.usage);
    return { profile: gh.profile, usageLog };
  }

  // Everything else: best-effort HTML fetch
  if (opts.url) {
    const fetched = await bestEffortFetch(opts.url);
    usageLog.push(fetched.usage);
    // Only return if we actually extracted something useful
    if (isProfileMeaningful(fetched.profile)) return { profile: fetched.profile, usageLog };
    return { profile: null, usageLog };
  }

  return { profile: null, usageLog };
}
