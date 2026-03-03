import type { EnrichedProfile, ApiUsageEntry } from "@/types";

/**
 * Scrape a public LinkedIn profile URL to extract structured profile data.
 *
 * LinkedIn blocks most server-side requests (HTTP 999), but serves full HTML
 * to social media crawlers (Facebook, Twitter, Slack) for link previews.
 * We use the facebookexternalhit User-Agent which returns rich JSON-LD data.
 */
export async function scrapeLinkedInProfile(url: string): Promise<{
  profile: EnrichedProfile | null;
  usage: ApiUsageEntry;
  rawText?: string;
}> {
  const usage: ApiUsageEntry = {
    provider: "scrape",
    endpoint: "linkedin-scraper",
    estimated_cost_usd: 0,
  };

  // Normalize URL
  const normalized = url.match(/^https?:\/\//) ? url : `https://${url}`;

  // Ensure it's actually a LinkedIn profile URL
  if (!normalized.match(/^https?:\/\/([a-z]+\.)?linkedin\.com\/in\//i)) {
    return { profile: null, usage };
  }

  try {
    const html = await fetchLinkedIn(normalized);
    if (!html) return { profile: null, usage };

    // Extract data from all available sources
    const jsonLd = extractJsonLd(html);
    const ogData = extractOpenGraph(html);
    const metaData = extractProfileMeta(html);
    const textData = extractTextContent(html);
    const ogParsed = parseOgTags(ogData);

    // Merge — prefer JSON-LD (richest) > OG > meta > text
    const fullName =
      jsonLd.name ||
      ogParsed.name ||
      combineNames(metaData.firstName, metaData.lastName) ||
      nameFromSlug(normalized) ||
      undefined;

    const headline =
      jsonLd.headline ||
      ogParsed.headline ||
      textData.headline ||
      undefined;

    // Parse title/company from headline if JSON-LD doesn't have them
    let currentTitle: string | undefined;
    let currentCompany: string | undefined;
    if (jsonLd.currentCompany) {
      currentCompany = jsonLd.currentCompany;
    } else if (headline) {
      // Try to split "Title at Company" or "Title, Company" patterns
      const atMatch = headline.match(/^(.+?)\s+at\s+(.+?)(?:\s*[/|]|$)/i);
      const commaMatch = headline.match(/^(.+?),\s+(.+?)(?:\s*[/|]|$)/i);
      if (atMatch) {
        currentTitle = atMatch[1].trim();
        currentCompany = atMatch[2].trim();
      } else if (commaMatch) {
        currentTitle = commaMatch[1].trim();
        currentCompany = commaMatch[2].trim();
      } else {
        currentCompany = headline;
      }
    }

    const location =
      jsonLd.location ||
      ogParsed.location ||
      textData.location ||
      undefined;

    const photo = jsonLd.image || ogData.image || undefined;

    // Clean HTML from summary — use OG description as fallback
    const rawSummary = jsonLd.description || textData.about || ogParsed.about || undefined;
    const summary = rawSummary?.replace(/<br\s*\/?>/gi, "\n").replace(/<[^>]+>/g, "").trim() || undefined;

    // Education — merge JSON-LD with text activities, fallback to OG-parsed
    let education = jsonLd.education.length > 0 ? jsonLd.education : textData.education;
    if (education.length === 0 && ogParsed.education) {
      education = [{ school: ogParsed.education }];
    }
    // Attach activities from text extraction to matching education entries
    if (textData.education.length > 0 && jsonLd.education.length > 0) {
      for (const textEdu of textData.education) {
        if (textEdu.activities) {
          const match = education.find((e) => e.school === textEdu.school);
          if (match) match.activities = textEdu.activities;
        }
      }
    }

    // Experience from JSON-LD, fallback to OG-parsed
    let experience = jsonLd.experience.length > 0 ? jsonLd.experience : [];
    if (experience.length === 0 && ogParsed.experience) {
      experience = [{ title: "", company: ogParsed.experience }];
    }

    // Build a rich skills/context array from all sources
    const skills: string[] = [];

    // Certifications (very valuable context)
    if (textData.certifications.length > 0) {
      skills.push(...textData.certifications.map((c) =>
        c.issuer ? `${c.name} (${c.issuer})` : c.name
      ));
    }

    // Awards with descriptions
    const awards = textData.awards.length > 0 ? textData.awards : jsonLd.awards.map((a) => ({ name: a }));
    if (awards.length > 0) {
      skills.push(...awards.map((a) =>
        "description" in a && a.description ? `${a.name}: ${a.description}` : a.name
      ));
    }

    // Languages
    if (jsonLd.languages.length > 0) {
      skills.push(...jsonLd.languages.map((l) => `Language: ${l}`));
    }

    // Volunteer work — shows values and interests
    if (textData.volunteer.length > 0) {
      skills.push(...textData.volunteer.map((v) =>
        v.description
          ? `Volunteer: ${v.role} at ${v.org} — ${v.description}`
          : `Volunteer: ${v.role} at ${v.org}`
      ));
    }

    // Publications
    if (textData.publications.length > 0) {
      skills.push(...textData.publications.map((p) =>
        p.journal ? `Publication: "${p.title}" in ${p.journal}` : `Publication: "${p.title}"`
      ));
    }

    // Build a richer summary that includes about + activity interests
    let fullSummary = summary || "";
    if (textData.activityPosts.length > 0) {
      const interestSnippets = textData.activityPosts
        .map((p) => p.slice(0, 150))
        .join(" | ");
      fullSummary = fullSummary
        ? `${fullSummary}\n\nRecent interests/activity: ${interestSnippets}`
        : `Recent interests/activity: ${interestSnippets}`;
    }

    // Build cleaned text for Claude fallback extraction
    // Include og:description at the top since it often has rich About text
    let cleanedText = buildCleanedText(html);
    if (ogData.description && ogData.description.length > 50) {
      cleanedText = `[OG Description]: ${ogData.description}\n\n${cleanedText}`;
    }

    // If we got basically nothing, return null profile but still return rawText
    if (!fullName && !currentCompany) {
      return { profile: null, usage, rawText: cleanedText };
    }

    return {
      profile: {
        fullName,
        headline,
        currentTitle,
        currentCompany,
        location,
        photo,
        summary: fullSummary || undefined,
        skills,
        experience,
        education,
        followers: jsonLd.followers,
        platform: "linkedin",
        sourceUrl: url,
        linkedinUrl: normalized,
        fetchedAt: new Date().toISOString(),
      },
      usage,
      rawText: cleanedText,
    };
  } catch (err) {
    console.error("[linkedin-scraper] Error:", err);
    return { profile: null, usage };
  }
}

// ─── Fetch ──────────────────────────────────────────────────

async function fetchLinkedIn(url: string): Promise<string | null> {
  // LinkedIn serves full HTML to social media crawlers for link previews.
  // facebookexternalhit gets the richest JSON-LD data.
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
        // Verify we got real content
        if (html.includes("og:title") || html.includes("application/ld+json")) {
          return html;
        }
      }
    } catch {
      // Try next UA
    }
  }

  return null;
}

// ─── JSON-LD Extraction ──────────────────────────────────────

interface JsonLdResult {
  name?: string;
  headline?: string;
  description?: string;
  image?: string;
  location?: string;
  currentCompany?: string;
  followers?: number;
  languages: string[];
  awards: string[];
  education: { school: string; degree?: string; field?: string; description?: string; activities?: string }[];
  experience: { title: string; company: string; description?: string }[];
}

function extractJsonLd(html: string): JsonLdResult {
  const result: JsonLdResult = {
    languages: [],
    awards: [],
    education: [],
    experience: [],
  };

  const ldRegex = /<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;
  let match;

  while ((match = ldRegex.exec(html)) !== null) {
    try {
      const data = JSON.parse(match[1]);
      const graph = data["@graph"] || [data];

      for (const item of graph) {
        if (item["@type"] !== "Person") continue;

        result.name = item.name || result.name;
        result.description = item.description || result.description;

        // Image
        if (item.image) {
          result.image = typeof item.image === "string"
            ? item.image
            : item.image?.contentUrl || item.image?.url;
        }

        // Location
        if (item.address) {
          const addr = item.address;
          result.location = typeof addr === "string"
            ? addr
            : [addr.addressLocality, addr.addressRegion, addr.addressCountry]
                .filter(Boolean).join(", ") || undefined;
        }

        // Current company (first worksFor with a name)
        if (item.worksFor) {
          const orgs = Array.isArray(item.worksFor) ? item.worksFor : [item.worksFor];
          for (const org of orgs) {
            if (org.name) {
              result.currentCompany = result.currentCompany || org.name;
              result.experience.push({
                title: org.member?.roleName || "",
                company: org.name,
                description: org.member?.description,
              });
            }
          }
        }

        // Education
        if (item.alumniOf) {
          const schools = Array.isArray(item.alumniOf) ? item.alumniOf : [item.alumniOf];
          for (const school of schools) {
            const name = typeof school === "string" ? school : school.name;
            if (name) {
              result.education.push({
                school: name,
                description: school.member?.description,
              });
            }
          }
        }

        // Awards
        if (item.awards) {
          result.awards = Array.isArray(item.awards) ? item.awards : [item.awards];
        }

        // Languages
        if (item.knowsLanguage) {
          const langs = Array.isArray(item.knowsLanguage) ? item.knowsLanguage : [item.knowsLanguage];
          result.languages = langs
            .map((l: unknown) => typeof l === "string" ? l : (l as Record<string, string>)?.name)
            .filter(Boolean);
        }

        // Followers
        if (item.interactionStatistic?.userInteractionCount) {
          result.followers = Number(item.interactionStatistic.userInteractionCount);
        }

        // Job title — LinkedIn returns an array of empty strings for hidden titles,
        // so only use if we find a non-empty one
        if (item.jobTitle) {
          const titles = Array.isArray(item.jobTitle) ? item.jobTitle : [item.jobTitle];
          const nonEmpty = titles.find((t: string) => t && t.trim().length > 0);
          if (nonEmpty) result.headline = nonEmpty;
        }
      }
    } catch {
      // Invalid JSON — skip
    }
  }

  return result;
}

// ─── Open Graph Extraction ───────────────────────────────────

interface OgData {
  title?: string;
  description?: string;
  image?: string;
}

function extractOpenGraph(html: string): OgData {
  return {
    title: extractMetaContent(html, "og:title"),
    description: extractMetaContent(html, "og:description"),
    image: extractMetaContent(html, "og:image"),
  };
}

// ─── OG Tag Parser ──────────────────────────────────────────

interface OgParsed {
  name?: string;
  headline?: string;
  about?: string;
  experience?: string;
  education?: string;
  location?: string;
}

/** Parse structured data from OG tags — very reliable across all LinkedIn profiles */
function parseOgTags(og: OgData): OgParsed {
  const result: OgParsed = {};

  // og:title format: "Name - Headline | LinkedIn"
  if (og.title) {
    const titleMatch = og.title.match(/^(.+?)\s*[-–]\s*(.+?)\s*\|\s*LinkedIn$/);
    if (titleMatch) {
      result.name = titleMatch[1].trim();
      result.headline = titleMatch[2].trim();
    }
  }

  // og:description format: "Headline · About text · Experience: Company · Education: School · Location: City · N connections..."
  if (og.description) {
    const parts = og.description.split(" · ");
    for (const part of parts) {
      if (part.startsWith("Experience: ")) {
        result.experience = part.replace("Experience: ", "").trim();
      } else if (part.startsWith("Education: ")) {
        result.education = part.replace("Education: ", "").trim();
      } else if (part.startsWith("Location: ")) {
        result.location = part.replace("Location: ", "").trim();
      } else if (
        !part.includes("connections on LinkedIn") &&
        !part.includes("View ") &&
        !part.includes("professional community") &&
        part !== result.headline && // Skip the headline (it's the first part)
        parts.indexOf(part) > 0 && // Skip first part (headline)
        part.length > 20
      ) {
        // This is likely the About section summary
        if (!result.about) result.about = part;
      }
    }
  }

  return result;
}

// ─── Profile Meta Tags ──────────────────────────────────────

function extractProfileMeta(html: string): { firstName?: string; lastName?: string } {
  return {
    firstName: extractMetaContent(html, "profile:first_name"),
    lastName: extractMetaContent(html, "profile:last_name"),
  };
}

// ─── Text Content Extraction ────────────────────────────────

interface TextContent {
  headline?: string;
  location?: string;
  about?: string;
  education: { school: string; degree?: string; field?: string; description?: string; activities?: string }[];
  certifications: { name: string; issuer?: string }[];
  volunteer: { role: string; org: string; description?: string }[];
  publications: { title: string; journal?: string }[];
  awards: { name: string; issuer?: string; description?: string }[];
  activityPosts: string[];
}

function extractTextContent(html: string): TextContent {
  const result: TextContent = {
    education: [],
    certifications: [],
    volunteer: [],
    publications: [],
    awards: [],
    activityPosts: [],
  };

  // Strip HTML tags, decode entities, filter CSS class junk
  const text = decodeHtmlEntities(html.replace(/<[^>]+>/g, "\n"));
  const lines = text
    .split("\n")
    .map((l) => l.trim())
    .filter((l) =>
      l.length > 0 &&
      !l.startsWith("*]:") &&         // CSS class junk
      !l.includes("mb-0") &&          // CSS class junk
      !l.includes("text-color-") &&   // CSS class junk
      !l.includes("leading-[") &&     // CSS class junk
      !l.includes("group-hover") &&   // CSS class junk
      !l.startsWith("font-") &&       // CSS class junk
      l !== "-"                        // Separator
    );

  // Find section boundaries
  const sectionHeaders = [
    "About", "Activity", "Experience", "Education",
    "Licenses & Certifications", "Volunteer Experience",
    "Publications", "Honors & Awards", "Languages",
    "More activity by",
  ];

  function findSection(header: string): string[] {
    const startIdx = lines.findIndex((l) =>
      l === header || l.startsWith(header)
    );
    if (startIdx === -1) return [];
    const endIdx = lines.findIndex((l, i) =>
      i > startIdx && sectionHeaders.some((h) => l === h || (l.startsWith(h) && h !== header))
    );
    return lines.slice(startIdx + 1, endIdx === -1 ? undefined : endIdx);
  }

  // About
  const aboutLines = findSection("About");
  if (aboutLines.length > 0) {
    result.about = aboutLines
      .filter((l) => !l.startsWith("See credential") && l !== "see more")
      .join("\n")
      .slice(0, 500);
  }

  // Activity posts — shows what the person is interested in
  const activityLines = findSection("Activity");
  if (activityLines.length > 0) {
    // Extract post snippets (lines > 30 chars that aren't UI elements)
    const posts = activityLines
      .filter((l) =>
        l.length > 30 &&
        !l.startsWith("Liked by") &&
        !l.startsWith("Join now") &&
        !l.includes("See credential") &&
        !l.startsWith("Follow")
      )
      .slice(0, 5); // Keep top 5 activity snippets
    result.activityPosts = [...new Set(posts)]; // Deduplicate
  }

  // Education with activities/societies
  const eduLines = findSection("Education");
  if (eduLines.length > 0) {
    // Look for school names and activities
    for (let i = 0; i < eduLines.length; i++) {
      const line = eduLines[i];
      if (line.startsWith("Activities and Societies:")) {
        // Attach to the most recent education entry
        if (result.education.length > 0) {
          result.education[result.education.length - 1].activities =
            line.replace("Activities and Societies:", "").trim();
        }
      }
    }
  }

  // Helper: classify a line as metadata/junk vs content
  function isMetaLine(line: string): boolean {
    return !!(
      line.startsWith("Issued") ||
      line.startsWith("Credential") ||
      line.startsWith("See credential") ||
      line.startsWith("See publication") ||
      line.endsWith("Graphic") ||
      line === "Present" ||
      line.match(/^\d+ (?:months?|years?)$/) ||                    // "4 months"
      line.match(/^[A-Z][a-z]{2,8} \d{4}$/) ||                    // "Jan 2026", "February 2025"
      line.match(/^[A-Z][a-z]{2,8} \d{4}\s*-\s*/) ||              // "Dec 2025 - Present 4 months"
      line.match(/^[A-Z][a-z]+ \d{1,2},?\s+\d{4}$/) ||           // "February 3, 2025"
      line.match(/^\d{4}\s*-\s*\d{4}$/) ||                        // "2022 - 2024"
      line.match(/^- /) ||                                         // "- Present"
      line.match(/^\d{4}$/) ||                                     // "2022"
      line.length < 3
    );
  }

  // Certifications
  // Pattern: [title, issuer, "Issued DATE", optional "Credential ID ...", "See credential"]
  const certLines = findSection("Licenses & Certifications");
  if (certLines.length > 0) {
    const contentLines = certLines.filter((l) => !isMetaLine(l));
    // Content lines alternate: name, issuer, name, issuer...
    for (let i = 0; i < contentLines.length; i += 2) {
      const name = contentLines[i];
      const issuer = i + 1 < contentLines.length ? contentLines[i + 1] : undefined;
      if (name && name.length > 3) {
        result.certifications.push({ name, issuer });
      }
    }
  }

  // Volunteer experience
  // Pattern: [role, org, date-start, "- Present", duration, optional-description]
  const volLines = findSection("Volunteer Experience");
  if (volLines.length > 0) {
    // Group into items: each item starts at a content line (non-meta)
    // then has org, dates, optional description
    const items: { role: string; org: string; description?: string }[] = [];
    let i = 0;
    while (i < volLines.length) {
      // Skip meta lines to find the role
      if (isMetaLine(volLines[i])) { i++; continue; }
      const role = volLines[i];
      i++;
      // Next content line is the org
      while (i < volLines.length && isMetaLine(volLines[i])) i++;
      if (i >= volLines.length) break;
      const org = volLines[i];
      i++;
      // Skip dates/duration, look for optional description
      let description: string | undefined;
      while (i < volLines.length && isMetaLine(volLines[i])) i++;
      // Check if the next content line is a description (long sentence) or the next role
      if (i < volLines.length) {
        const next = volLines[i];
        // Descriptions are typically long sentences; role names are short titles
        if (next.length > 40 || (next.length > 20 && /[a-z]{4,}/.test(next) && (next.includes(" ") && next.split(" ").length > 4))) {
          description = next;
          i++;
        }
      }
      items.push({ role, org, description });
    }
    result.volunteer = items;
  }

  // Publications
  // Pattern: [title, journal + date, "See publication"]
  const pubLines = findSection("Publications");
  if (pubLines.length > 0) {
    const contentLines = pubLines.filter((l) =>
      !isMetaLine(l) &&
      l !== "See publication" &&
      // Filter standalone dates that slip through isMetaLine
      !l.match(/^[A-Z][a-z]+ \d{1,2},?\s+\d{4}$/)
    );
    // Pairs: title, journal
    for (let i = 0; i < contentLines.length; i += 2) {
      const title = contentLines[i];
      const journal = i + 1 < contentLines.length ? contentLines[i + 1] : undefined;
      if (title && title.length > 10) {
        result.publications.push({ title, journal });
      }
    }
  }

  // Honors & Awards
  // Pattern: [name, issuer, date, optional description, name, issuer, date, ...]
  // Description is tricky — it's optional and can look like another award name.
  // We detect descriptions by checking if the next-next content line is an issuer (short org name)
  // vs another award title.
  const awardLines = findSection("Honors & Awards");
  if (awardLines.length > 0) {
    // First, collect all content lines (non-meta)
    const contentLines = awardLines.filter((l) => !isMetaLine(l));
    // Awards come in groups of 2 (name + issuer) or 3 (name + issuer + description)
    // We detect: if line[i+2] exists and line[i+3] exists, then line[i+2] is a description
    // only if it starts lowercase or is clearly a sentence (contains spaces and > 30 chars)
    const items: { name: string; issuer?: string; description?: string }[] = [];
    let i = 0;
    while (i < contentLines.length) {
      const name = contentLines[i];
      const issuer = i + 1 < contentLines.length ? contentLines[i + 1] : undefined;
      i += 2;
      // Check if the next line is a description (sentence-like) rather than the next award name
      let description: string | undefined;
      if (i < contentLines.length) {
        const candidate = contentLines[i];
        // A description typically: starts with a verb/lowercase, or is clearly a sentence
        const looksLikeDescription = (
          candidate.length > 30 &&
          (candidate[0] === candidate[0].toLowerCase() || candidate.includes(" the ") || candidate.includes(" a "))
        );
        if (looksLikeDescription) {
          description = candidate;
          i++;
        }
      }
      if (name.length > 5) items.push({ name, issuer, description });
    }
    result.awards = items;
  }

  return result;
}

// ─── Helpers ────────────────────────────────────────────────

function extractMetaContent(html: string, property: string): string | undefined {
  const patterns = [
    new RegExp(
      `<meta[^>]+(?:property|name)=["']${escapeRegex(property)}["'][^>]+content=["']([^"']+)["']`,
      "i"
    ),
    new RegExp(
      `<meta[^>]+content=["']([^"']+)["'][^>]+(?:property|name)=["']${escapeRegex(property)}["']`,
      "i"
    ),
  ];

  for (const rx of patterns) {
    const m = html.match(rx);
    if (m?.[1]) return decodeHtmlEntities(m[1].trim());
  }
  return undefined;
}

function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function decodeHtmlEntities(str: string): string {
  return str
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&#x27;/g, "'")
    .replace(/&#x2F;/g, "/");
}

function combineNames(first?: string, last?: string): string | undefined {
  const combined = [first, last].filter(Boolean).join(" ").trim();
  return combined || undefined;
}

/** Build cleaned text from HTML for Claude-based extraction fallback */
function buildCleanedText(html: string): string {
  const text = decodeHtmlEntities(html.replace(/<[^>]+>/g, "\n"));
  const lines = text
    .split("\n")
    .map((l) => l.trim())
    .filter((l) =>
      l.length > 2 &&
      !l.startsWith("*]:") &&
      !l.includes("mb-0") &&
      !l.includes("text-color-") &&
      !l.includes("leading-[") &&
      !l.includes("group-hover") &&
      !l.startsWith("font-") &&
      !l.startsWith("function ") &&
      !l.startsWith("window.") &&
      !l.startsWith("getDfd") &&
      !l.includes("getDfd") &&
      !l.includes("Cookie Policy") &&
      !l.includes("User Agreement") &&
      !l.includes("Privacy Policy") &&
      l !== "-"
    );

  // Deduplicate consecutive identical lines
  const deduped: string[] = [];
  for (const line of lines) {
    if (deduped.length === 0 || deduped[deduped.length - 1] !== line) {
      deduped.push(line);
    }
  }

  // Truncate to ~8000 chars — enough for Claude to extract rich data while keeping costs low (~$0.002)
  return deduped.join("\n").slice(0, 8000);
}

/** Extract a probable name from a LinkedIn URL slug */
function nameFromSlug(url: string): string | undefined {
  const slug = url.match(/linkedin\.com\/in\/([^/?#]+)/i)?.[1];
  if (!slug) return undefined;
  // Convert "noah-lloyd" → "Noah Lloyd"
  return slug
    .split("-")
    .map((s) => s.charAt(0).toUpperCase() + s.slice(1))
    .join(" ");
}
