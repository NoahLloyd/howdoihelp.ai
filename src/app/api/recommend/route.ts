import { getSupabase } from "@/lib/supabase";
import { llmComplete, extractJson } from "@/lib/llm";
import type {
  EnrichedProfile,
  UserAnswers,
  GeoData,
  Resource,
  RecommendedResource,
} from "@/types";

export const dynamic = "force-dynamic";

// ─── System Prompt ───────────────────────────────────────────

const SYSTEM_PROMPT = `You are a personalized recommendation engine for howdoihelp.ai, a site that helps people find the best ways to contribute to AI safety.

You will receive:
1. A user's profile (from LinkedIn, GitHub, or another source) — their job, skills, experience, education, location
2. Their answers to our intake questions — how much time they can commit and what they're looking for
3. Their geographic location
4. A list of available resources (events, communities, programs, letters, and other actions)

Your job is to rank the resources from most to least relevant FOR THIS SPECIFIC PERSON and write a personalized description for each one.

## Ranking Principles

- **Match skills to impact**: A software engineer should see technical volunteer projects before petition-signing. A policy professional should see advocacy and governance opportunities first.
- **Match commitment level**: Someone with "a few minutes" shouldn't see 8-week courses at the top. Someone with "significant" commitment shouldn't see one-click petitions first.
- **Match location**: In-person events near the user should rank higher. Suppress location-specific resources that are far away.
- **Match intent**: If they said "understand the problem", prioritize educational content. If they said "find others who care", prioritize communities and events.
- **Be honest**: If something is a weak match, rank it lower. Don't try to make everything sound great.

## Output Rules

1. **Return exactly 4 to 6 items.** Not more, not less. Pick the absolute best matches for this person.
2. **At most 1 event or community.** Events (category "events") and communities (category "communities") are displayed in a special grouped card in the UI — you pick the single best one (if any), and all other nearby events/communities auto-populate beneath it. So you must NEVER include more than one event or community in your output.
   - The event/community will usually NOT be the #1 recommendation. Typically the top pick is a course, career resource, or action that's a great skill match. The event/community might be rank 3, 4, or 5.
   - Only rank an event/community as #1 if it's exceptionally relevant — e.g. a nearby conference perfectly aligned with their field.
   - It's also fine to include zero events/communities if none are a strong match. The local card will still show nearby ones automatically.
3. **No markdown.** Return ONLY a valid JSON array. No \`\`\`json fences, no explanation.

## Output Format

Each element in the JSON array:
{
  "resourceId": "the-resource-id",
  "rank": 1,
  "description": "A personalized 1-2 sentence description of this resource, tailored to this specific person.",
  "title": "Optional custom title"
}

### description
Write a personalized description (1 sentence, sometimes 2) that is heavily inspired by the resource's existing description but rewritten to speak directly to this person. Weave in specific details from their profile — their job, skills, company, background — to make it feel personal. For example, instead of "A research program for aspiring alignment researchers", write "A 10-week research sprint where your ML engineering experience at DeepMind would be a huge asset." The description should make the person feel like this resource was hand-picked for them.

### title (optional)
Only include a "title" field if you think a custom title would be more compelling for this specific user than the existing one. Otherwise, omit "title" entirely and the existing title will be used. For example, you might customize a generic title like "AI Safety Newsletter" to "Weekly AI Safety Digest for Engineers" for a software engineer.

IMPORTANT: Write in second person ("you", "your"). Be specific — reference their actual job title, company, skills, or background. Never be generic.`;

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

    // Build the user prompt with all context
    const userPrompt = buildUserPrompt(profile, answers, geo, resources);

    const result = await llmComplete({
      task: "recommend",
      system: SYSTEM_PROMPT,
      user: userPrompt,
      maxTokens: 8192,
      endpoint: "messages.create",
    });

    const jsonStr = extractJson(result.text);

    let recommendations: RecommendedResource[];
    try {
      const parsed = JSON.parse(jsonStr);
      // Normalize: handle old-format responses that have reasoning/personalFit instead of description
      recommendations = (parsed as Record<string, unknown>[]).map((item) => {
        const rec: RecommendedResource = {
          resourceId: item.resourceId as string,
          rank: item.rank as number,
          description: (item.description as string) ||
            (item.personalFit as string) ||
            (item.reasoning as string) ||
            "",
        };
        if (item.title) rec.title = item.title as string;
        return rec;
      });
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
  resources: Resource[]
): string {
  // Build profile section
  const profileLines: string[] = [];
  if (profile) {
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
  if (answers.profileUrl) profileLines.push(`Profile URL: ${answers.profileUrl}`);
  if (answers.profilePlatform && !profile) profileLines.push(`Profile platform: ${answers.profilePlatform}`);
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
</available_resources>

Pick the 4-6 BEST resources for this specific person. Include at most 1 event or community. Return a JSON array ordered by rank (1 = best match).`;
}
