import type { EnrichedProfile, ProfilePlatform, ApiUsageEntry } from "@/types";
import { detectPlatform } from "./profile";
import { scrapeLinkedInProfile } from "./linkedin-scraper";
import { llmComplete, extractJson } from "./llm";

// ─── LLM Profile Extraction ────────────────────────────────

const EXTRACT_PROMPT = `You are extracting structured profile data from a LinkedIn profile's text content. The text is messy — it was stripped from HTML and contains navigation elements, duplicates, and junk. Your job is to find ALL meaningful profile data.

Return ONLY valid JSON, no markdown fences or explanation.

{
  "fullName": "string or null",
  "headline": "string or null — their tagline/bio that appears right below their name",
  "currentTitle": "string or null — current job title",
  "currentCompany": "string or null — current employer/company",
  "location": "string or null",
  "summary": "string or null — their About section text, condensed to 2-3 sentences max",
  "experience": [{"title": "string", "company": "string"}],
  "education": [{"school": "string", "degree": "string or null", "field": "string or null"}],
  "certifications": ["Name (Issuer)"],
  "awards": ["Award name: description if available"],
  "volunteer": ["Role at Org — description if available"],
  "publications": ["Title in Journal"],
  "languages": ["Language (proficiency if shown)"],
  "skills": ["skills, tools, technologies, or professional interests mentioned anywhere"]
}

IMPORTANT:
- Look for experience entries even if they're just company names without explicit titles
- Look for education even if it's just a school name
- Extract skills from context clues: what they write about, what tools they mention, what their job involves
- The "About" section text is the most valuable — capture it fully
- If someone lists courses, articles, or projects, extract relevant skills from those
- Languages are sometimes listed with proficiency levels (Native, Professional, etc.)
- Be thorough — extract EVERYTHING you can find, even partial data is valuable`;

async function llmExtractProfile(
  rawText: string,
  url: string,
): Promise<{ profile: EnrichedProfile | null; usage: ApiUsageEntry }> {
  if (!rawText) {
    return { profile: null, usage: { provider: "claude", endpoint: "extract", estimated_cost_usd: 0 } };
  }

  try {
    const result = await llmComplete({
      task: "extract",
      system: EXTRACT_PROMPT,
      user: rawText,
      maxTokens: 1500,
      endpoint: "extract",
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
      },
      usage: { provider: "github", endpoint: `users/${username}`, estimated_cost_usd: 0 },
    };
  } catch {
    return { profile: null, usage: { provider: "github", endpoint: "users", estimated_cost_usd: 0 } };
  }
}

// ─── SSRF Protection ────────────────────────────────────────

/** Block private/internal IPs to prevent SSRF */
function isPrivateUrl(urlStr: string): boolean {
  try {
    const hostname = new URL(urlStr).hostname.toLowerCase();
    return (
      hostname === "localhost" ||
      hostname === "127.0.0.1" ||
      hostname === "[::1]" ||
      hostname === "0.0.0.0" ||
      hostname === "169.254.169.254" ||
      hostname.endsWith(".internal") ||
      hostname.endsWith(".local") ||
      /^10\./.test(hostname) ||
      /^172\.(1[6-9]|2\d|3[01])\./.test(hostname) ||
      /^192\.168\./.test(hostname)
    );
  } catch { return true; }
}

// ─── Best-Effort Fetch (Other Platforms) ─────────────────────

export async function bestEffortFetch(url: string): Promise<{
  profile: EnrichedProfile | null;
  usage: ApiUsageEntry;
}> {
  const platform = detectPlatform(url);

  try {
    const normalized = url.match(/^https?:\/\//) ? url : `https://${url}`;
    if (isPrivateUrl(normalized)) {
      return { profile: null, usage: { provider: "scrape", endpoint: url, estimated_cost_usd: 0 } };
    }
    const res = await fetch(normalized, {
      signal: AbortSignal.timeout(10_000),
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
        Accept: "text/html,application/xhtml+xml,*/*",
      },
    });

    if (!res.ok) {
      return {
        profile: { skills: [], experience: [], education: [], platform, sourceUrl: url, fetchedAt: new Date().toISOString() },
        usage: { provider: "scrape", endpoint: url, estimated_cost_usd: 0 },
      };
    }

    const html = await res.text();

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

function extractMeta(html: string, property: string): string | undefined {
  const patterns = [
    new RegExp(`<meta[^>]+(?:property|name)=["']${property}["'][^>]+content=["']([^"']+)["']`, "i"),
    new RegExp(`<meta[^>]+content=["']([^"']+)["'][^>]+(?:property|name)=["']${property}["']`, "i"),
  ];
  for (const rx of patterns) {
    const m = html.match(rx);
    if (m?.[1]) return m[1].trim();
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

/** Merge two profiles — take the richer value for each field */
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

  // LinkedIn: scrape for structured data (JSON-LD, OG), then always use Claude for text extraction
  if (platform === "linkedin" && opts.url) {
    const scraped = await scrapeLinkedInProfile(opts.url);
    usageLog.push(scraped.usage);

    // Always call Claude if we have raw text — it handles every profile layout
    if (scraped.rawText && scraped.rawText.length > 100) {
      const claude = await llmExtractProfile(scraped.rawText, opts.url);
      usageLog.push(claude.usage);

      if (claude.profile && isProfileMeaningful(claude.profile)) {
        if (scraped.profile) {
          // Merge: scraper provides photo/followers/structured data, Claude provides rich text data
          return { profile: mergeProfiles(scraped.profile, claude.profile), usageLog };
        }
        return { profile: claude.profile, usageLog };
      }
    }

    // Fall back to scraper data if Claude failed
    if (isProfileMeaningful(scraped.profile)) {
      return { profile: scraped.profile, usageLog };
    }

    return { profile: null, usageLog };
  }

  // LinkedIn via email only (from OAuth) — no URL to scrape
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
