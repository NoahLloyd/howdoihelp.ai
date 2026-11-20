import Exa from "exa-js";
import type { ApiUsageEntry } from "@/types";

// ─── Client ─────────────────────────────────────────────────

function getClient(): Exa | null {
  const apiKey = process.env.EXA_API_KEY;
  if (!apiKey) return null;
  return new Exa(apiKey);
}

// ─── People Search ──────────────────────────────────────────

/**
 * Search for a person using Exa's people search index.
 * Returns text highlights and source URLs — no hallucination risk
 * since all content comes from real indexed pages.
 */
export async function searchPerson(query: string): Promise<{
  text: string | null;
  citations: string[];
  usage: ApiUsageEntry;
}> {
  const emptyUsage: ApiUsageEntry = {
    provider: "exa",
    endpoint: "search-person",
    estimated_cost_usd: 0,
  };

  const client = getClient();
  if (!client) {
    return { text: null, citations: [], usage: emptyUsage };
  }

  try {
    const results = await client.searchAndContents(query, {
      type: "auto",
      numResults: 10,
      category: "people",
      highlights: {
        maxCharacters: 4000,
      },
    });

    const usage: ApiUsageEntry = {
      provider: "exa",
      endpoint: "search-person",
      estimated_cost_usd: 0.007, // ~$0.007 per search with 10 results
    };

    if (!results.results || results.results.length === 0) {
      return { text: null, citations: [], usage };
    }

    // Build text from highlights, grouped by source
    const sections: string[] = [];
    const citations: string[] = [];

    for (const result of results.results) {
      if (result.url) citations.push(result.url);

      const r = result as unknown as { highlights?: string[]; text?: string; title?: string; url?: string };
      const highlights = r.highlights || [];
      if (highlights.length > 0) {
        const source = r.title || r.url || "Unknown";
        sections.push(`[Source: ${source}]\n${highlights.join("\n")}`);
      } else if (r.text) {
        const source = r.title || r.url || "Unknown";
        // Use first 500 chars of text as fallback
        sections.push(`[Source: ${source}]\n${r.text.slice(0, 500)}`);
      }
    }

    if (sections.length === 0) {
      return { text: null, citations, usage };
    }

    return {
      text: sections.join("\n\n"),
      citations,
      usage,
    };
  } catch (err) {
    console.error("[exa] searchPerson failed:", err);
    return { text: null, citations: [], usage: emptyUsage };
  }
}
