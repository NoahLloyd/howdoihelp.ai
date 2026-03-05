import { getSupabase } from "@/lib/supabase";
import { llmComplete, extractJson } from "@/lib/llm";
import type {
  EnrichedProfile,
  UserAnswers,
  GeoData,
  Resource,
  RecommendedResource,
  GuideRecommendation,
} from "@/types";
import type { PublicGuide } from "@/app/api/guides/route";

export const dynamic = "force-dynamic";

// ─── System Prompt ───────────────────────────────────────────

const SYSTEM_PROMPT = `You are a personalized recommendation engine for howdoihelp.ai, a site that helps people find the best ways to contribute to AI safety.

You will receive:
1. A user's profile (from LinkedIn, GitHub, or another source) — their job, skills, experience, education, location
2. Their answers to our intake questions — how much time they can commit and what they're looking for
3. Their geographic location
4. A list of available resources (events, communities, programs, letters, and other actions)
5. Optionally, a list of available guides — real people who volunteer to have 1:1 calls with newcomers to AI safety

Your job is to rank the resources from most to least relevant FOR THIS SPECIFIC PERSON and write a personalized description for each one. You may also recommend a guide if there's a strong match.

## CRITICAL: Profile Data Quality Warning

The profile data is automatically scraped and may contain noise, errors, or content that is NOT about this person. Common issues:
- Activity feed content (other people's posts this person liked/commented on) may have been incorrectly attributed to them
- Text in a foreign language that doesn't match the person's actual location/background is likely from someone else's content
- Job titles or companies may belong to connections, not the profile owner

Use your best judgment to determine what is actually true about this person. Look for consistency — their name, headline, current role, and About section are the most reliable signals. If profile details seem contradictory or unlikely (e.g., a Nashville-based person with a Danish-language job description), ignore the suspect information and rely on what you're confident about. It is better to give slightly less personalized recommendations than to personalize based on wrong information.

## Ranking Principles

- **Match skills to impact**: A software engineer should see technical volunteer projects before petition-signing. A policy professional should see advocacy and governance opportunities first.
- **Match commitment level**: Someone with "a few minutes" shouldn't see 8-week courses at the top. Someone with "significant" commitment shouldn't see one-click petitions first.
- **Match location**: In-person events near the user should rank higher. Suppress location-specific resources that are far away.
- **Match intent**: If they said "understand the problem", prioritize educational content. If they said "find others who care", prioritize communities and events.
- **Be honest**: If something is a weak match, rank it lower. Don't try to make everything sound great.

## Guide Recommendations

If guides are available, you may recommend ONE guide alongside the resources. Only recommend a guide when there is a genuinely strong match based on:
- The guide's topics align with what this person needs
- The guide's preferred career stages / backgrounds match this person
- The guide's "best for" description fits this person
- The guide did NOT say this person would be "not a good fit"

If no guide is a strong match, do NOT include one. A bad match wastes both people's time.

When you do recommend a guide, include it as a separate object in the JSON with "guideId" instead of "resourceId". Give it a rank position where it naturally fits among the resources (often rank 2-4). Write a personalized description explaining why this specific guide would be valuable for this specific person.

## Output Rules

1. **Return exactly 4 to 6 resource items** plus optionally 1 guide. Pick the absolute best matches for this person.
2. **At most 1 event or community — often zero.** Events (category "events") and communities (category "communities") are displayed in a special grouped card in the UI — you pick the single best one (if any), and all other nearby events/communities auto-populate beneath it. So you must NEVER include more than one event or community in your output.
   - For many users — especially those deeper into AI safety, technical contributors, or people with significant time — a fellowship, course, or career resource is far more impactful than an event. In these cases, include ZERO events/communities.
   - Only include an event/community when it's a genuinely strong match (e.g. a nearby conference in their exact field, or someone new to the space who would benefit from connecting with others).
   - When you do include one, it will usually NOT be the #1 recommendation. Typically the top pick is a course, career resource, or action that's a great skill match. The event/community might be rank 3, 4, or 5.
   - Only rank an event/community as #1 if it's exceptionally relevant — e.g. a nearby conference perfectly aligned with their field.
3. **No markdown.** Return ONLY a valid JSON array. No \`\`\`json fences, no explanation.

## Output Format

For resources:
{
  "resourceId": "the-resource-id",
  "rank": 1,
  "description": "A personalized 1-2 sentence description.",
  "title": "Optional custom title"
}

For a guide (optional, at most 1):
{
  "guideId": "the-guide-id",
  "rank": 3,
  "description": "A personalized 1-2 sentence description of why talking to this guide would help."
}

### description
Write a personalized description (1 sentence, sometimes 2) that is heavily inspired by the resource's existing description but rewritten to speak directly to this person. Weave in specific details from their profile — their job, skills, company, background — to make it feel personal. For example, instead of "A research program for aspiring alignment researchers", write "A 10-week research sprint where your ML engineering experience at DeepMind would be a huge asset." The description should make the person feel like this resource was hand-picked for them.

For guides, write something like "Sarah transitioned from software engineering to alignment research two years ago and mentors people making the same switch. Your ML background at Google makes you exactly who she's looking to help."

### title (optional, resources only)
Only include a "title" field if you think a custom title would be more compelling for this specific user than the existing one. Otherwise, omit "title" entirely and the existing title will be used.

IMPORTANT: Write in second person ("you", "your"). Be specific and reference their actual job title, company, skills, or background. Never be generic.

IMPORTANT: Never use em dashes in titles or descriptions. Use commas, periods, or semicolons instead.`;

// ─── Guide Fetcher ──────────────────────────────────────────

interface GuideWithProfile {
  id: string;
  display_name: string | null;
  headline: string | null;
  bio: string | null;
  topics: string[];
  best_for: string | null;
  not_a_good_fit: string | null;
  location: string | null;
  preferred_career_stages: string[];
  preferred_backgrounds: string[];
  preferred_experience_level: string[];
  languages: string[];
  calendar_link: string;
  booking_mode: string;
  avatar_url: string | null;
  linkedin_url: string | null;
  website_url: string | null;
  is_available_in_person: boolean;
}

async function fetchActiveGuides(): Promise<GuideWithProfile[]> {
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

  return guides.map((g: Record<string, unknown>): GuideWithProfile => {
    const p = profileMap.get(g.id as string) as { display_name: string | null; avatar_url: string | null; bio: string | null } | undefined;
    return {
      id: g.id as string,
      display_name: p?.display_name ?? null,
      headline: g.headline as string | null,
      bio: p?.bio ?? null,
      topics: (g.topics as string[]) || [],
      best_for: g.best_for as string | null,
      not_a_good_fit: g.not_a_good_fit as string | null,
      location: g.location as string | null,
      preferred_career_stages: (g.preferred_career_stages as string[]) || [],
      preferred_backgrounds: (g.preferred_backgrounds as string[]) || [],
      preferred_experience_level: (g.preferred_experience_level as string[]) || [],
      languages: (g.languages as string[]) || [],
      calendar_link: g.calendar_link as string,
      booking_mode: (g.booking_mode as string) || "direct",
      avatar_url: p?.avatar_url ?? null,
      linkedin_url: g.linkedin_url as string | null,
      website_url: g.website_url as string | null,
      is_available_in_person: (g.is_available_in_person as boolean) || false,
    };
  });
}

// ─── Request Handler ─────────────────────────────────────────

interface RecommendRequest {
  profile?: EnrichedProfile;
  answers: UserAnswers;
  geo: GeoData;
  resources: Resource[];
  userId?: string;
}

export async function POST(req: Request) {
  try {
    const body = (await req.json()) as RecommendRequest;
    const { profile, answers, geo, resources, userId } = body;

    if (!resources?.length) {
      return Response.json({ error: "resources required" }, { status: 400 });
    }

    // Fetch guides in parallel with prompt building
    const guides = await fetchActiveGuides();

    // Build the user prompt with all context
    const userPrompt = buildUserPrompt(profile, answers, geo, resources, guides);

    const result = await llmComplete({
      task: "recommend",
      system: SYSTEM_PROMPT,
      user: userPrompt,
      maxTokens: 8192,
      endpoint: "messages.create",
    });

    const jsonStr = extractJson(result.text);

    let recommendations: RecommendedResource[];
    let guideRecommendation: GuideRecommendation | undefined;

    try {
      const parsed = JSON.parse(jsonStr);
      recommendations = [];

      for (const item of parsed as Record<string, unknown>[]) {
        // Guide recommendation
        if (item.guideId) {
          const guide = guides.find((g) => g.id === item.guideId);
          if (guide) {
            guideRecommendation = {
              guideId: item.guideId as string,
              rank: item.rank as number,
              description: (item.description as string) || "",
              guide: {
                id: guide.id,
                display_name: guide.display_name,
                avatar_url: guide.avatar_url,
                headline: guide.headline,
                bio: guide.bio,
                topics: guide.topics,
                calendar_link: guide.calendar_link,
                location: guide.location,
                is_available_in_person: guide.is_available_in_person,
                preferred_career_stages: guide.preferred_career_stages,
                preferred_backgrounds: guide.preferred_backgrounds,
                languages: guide.languages,
                linkedin_url: guide.linkedin_url,
                website_url: guide.website_url,
                booking_mode: guide.booking_mode as "direct" | "approval_required",
              },
            };
            continue;
          }
        }

        // Resource recommendation
        const rec: RecommendedResource = {
          resourceId: item.resourceId as string,
          rank: item.rank as number,
          description: (item.description as string) ||
            (item.personalFit as string) ||
            (item.reasoning as string) ||
            "",
        };
        if (item.title) rec.title = item.title as string;
        recommendations.push(rec);
      }
    } catch {
      console.error("[recommend] Failed to parse LLM response:", result.text.slice(0, 300));
      return Response.json({ error: "Failed to parse recommendations" }, { status: 500 });
    }

    // Log usage to Supabase
    const { usage } = result;
    const supabase = getSupabase();
    if (supabase) {
      await supabase
        .from("api_usage")
        .insert({
          provider: usage.provider,
          model: usage.model,
          endpoint: usage.endpoint,
          input_tokens: usage.input_tokens,
          output_tokens: usage.output_tokens,
          estimated_cost_usd: usage.estimated_cost_usd,
          user_id: userId || undefined,
        })
        .then(() => {}, () => {});
    }

    return Response.json({
      recommendations,
      guideRecommendation,
      usage: {
        inputTokens: usage.input_tokens,
        outputTokens: usage.output_tokens,
        estimatedCost: usage.estimated_cost_usd,
      },
    });
  } catch (err) {
    console.error("[recommend] Error:", err);
    return Response.json({ error: "Recommendation engine unavailable" }, { status: 500 });
  }
}

// ─── Prompt Builder ──────────────────────────────────────────

function buildUserPrompt(
  profile: EnrichedProfile | undefined,
  answers: UserAnswers,
  geo: GeoData,
  resources: Resource[],
  guides: GuideWithProfile[]
): string {
  // Build profile section
  const profileLines: string[] = [];

  // If we have raw Perplexity text, use it directly — it's already a comprehensive overview
  if (answers.profileText) {
    profileLines.push(answers.profileText);
  } else if (profile) {
    if (profile.fullName) profileLines.push(`Name: ${profile.fullName}`);
    if (profile.headline) profileLines.push(`Headline: ${profile.headline}`);
    if (profile.currentTitle && profile.currentCompany) {
      profileLines.push(`Current role: ${profile.currentTitle} at ${profile.currentCompany}`);
    } else if (profile.currentTitle) {
      profileLines.push(`Current role: ${profile.currentTitle}`);
    }
    if (profile.location) profileLines.push(`Location: ${profile.location}`);
    if (profile.currentCompany && !profile.currentTitle) {
      profileLines.push(`Company: ${profile.currentCompany}`);
    }
    if (profile.summary) profileLines.push(`Summary: ${profile.summary}`);
    if (profile.skills.length > 0) {
      profileLines.push(`Background & credentials:\n${profile.skills.slice(0, 30).map((s) => `  - ${s}`).join("\n")}`);
    }
    if (profile.experience.length > 0) {
      const expLines = profile.experience.slice(0, 5).map(
        (e) => `  - ${e.title ? `${e.title} at ` : ""}${e.company}${e.description ? `: ${e.description.slice(0, 100)}` : ""}`
      );
      profileLines.push(`Experience:\n${expLines.join("\n")}`);
    }
    if (profile.education.length > 0) {
      const eduLines = profile.education.slice(0, 3).map((e) => {
        let line = `  - ${e.degree || ""} ${e.field || ""} at ${e.school}`.trim();
        if (e.description) line += ` (${e.description})`;
        if (e.activities) line += ` — Activities: ${e.activities.slice(0, 200)}`;
        return line;
      });
      profileLines.push(`Education:\n${eduLines.join("\n")}`);
    }
    if (profile.repos && profile.repos.length > 0) {
      const repoLines = profile.repos.slice(0, 5).map(
        (r) => `  - ${r.name} (${r.language || "unknown"}, ${r.stars} stars)${r.description ? `: ${r.description}` : ""}`
      );
      profileLines.push(`Top GitHub repos:\n${repoLines.join("\n")}`);
    }
    if (profile.followers != null) profileLines.push(`GitHub followers: ${profile.followers}`);
    profileLines.push(`Profile platform: ${profile.platform}`);
  }
  // Include profile URL from answers if available
  if (answers.profileUrl && !answers.profileText) profileLines.push(`Profile URL: ${answers.profileUrl}`);
  if (answers.profilePlatform && !profile && !answers.profileText) profileLines.push(`Profile platform: ${answers.profilePlatform}`);
  if (profileLines.length === 0) profileLines.push("No profile data available — personalize based on answers and location only.");

  // Build answers section
  const answerLines: string[] = [];
  answerLines.push(`Time commitment: ${answers.time}`);
  if (answers.intent) answerLines.push(`Intent: ${answers.intent}`);
  if (answers.positioned) answerLines.push(`Self-identified as uniquely positioned`);
  if (answers.positionType) answerLines.push(`Position type: ${answers.positionType}`);

  // Build geo section
  const geoLines: string[] = [];
  if (geo.city) geoLines.push(`City: ${geo.city}`);
  if (geo.region) geoLines.push(`Region: ${geo.region}`);
  geoLines.push(`Country: ${geo.country} (${geo.countryCode})`);

  // Build resources section — compact format to save tokens
  const resourceLines = resources.map((r) => {
    const tags = [
      r.category,
      r.location,
      `${r.min_minutes}min`,
      `ev=${r.ev_general}`,
      `friction=${r.friction}`,
    ];
    if (r.position_tags?.length) tags.push(`position_tags=[${r.position_tags.join(",")}]`);
    if (r.event_date) tags.push(`date=${r.event_date}`);
    if (r.deadline_date) tags.push(`deadline=${r.deadline_date}`);
    return `[${r.id}] "${r.title}" — ${r.description} (${tags.join(", ")})`;
  });

  // Build guides section
  let guidesSection = "";
  if (guides.length > 0) {
    const guideLines = guides.map((g) => {
      const parts = [`[${g.id}] "${g.display_name || "Guide"}"${g.headline ? ` — ${g.headline}` : ""}`];
      if (g.topics.length > 0) parts.push(`  Topics: ${g.topics.join(", ")}`);
      if (g.best_for) parts.push(`  Best for: ${g.best_for}`);
      if (g.not_a_good_fit) parts.push(`  NOT a good fit for: ${g.not_a_good_fit}`);
      if (g.preferred_career_stages.length > 0) parts.push(`  Preferred career stages: ${g.preferred_career_stages.join(", ")}`);
      if (g.preferred_backgrounds.length > 0) parts.push(`  Preferred backgrounds: ${g.preferred_backgrounds.join(", ")}`);
      if (g.location) parts.push(`  Location: ${g.location}`);
      if (g.languages.length > 1) parts.push(`  Languages: ${g.languages.join(", ")}`);
      return parts.join("\n");
    });
    guidesSection = `\n\n<available_guides>
${guideLines.join("\n\n")}
</available_guides>`;
  }

  return `<user_profile>
${profileLines.join("\n")}
</user_profile>

<user_answers>
${answerLines.join("\n")}
</user_answers>

<user_location>
${geoLines.join("\n")}
</user_location>

<available_resources>
${resourceLines.join("\n\n")}
</available_resources>${guidesSection}

Pick the 4-6 BEST resources for this specific person. Include at most 1 event or community.${guides.length > 0 ? " You may also include 1 guide if there's a strong match." : ""} Return a JSON array ordered by rank (1 = best match).`;
}
