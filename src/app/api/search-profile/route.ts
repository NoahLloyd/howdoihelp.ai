import { NextResponse } from "next/server";
import { searchPerson as perplexitySearch } from "@/lib/perplexity";
import { searchPerson as exaSearch } from "@/lib/exa";
import { searchPerson as tavilySearch } from "@/lib/tavily";
import { logApiUsage } from "@/lib/api-usage";

export type SearchProvider = "perplexity" | "exa" | "tavily";

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const query: string | undefined = body.query;
    const provider: SearchProvider = body.provider || "perplexity";

    if (!query || typeof query !== "string" || query.trim().length < 2) {
      return NextResponse.json({ text: null, error: "Query is required" }, { status: 400 });
    }

    // Dispatch to the requested provider
    const search = provider === "exa" ? exaSearch
      : provider === "tavily" ? tavilySearch
      : perplexitySearch;

    // Check that the provider is configured
    const envKey = provider === "exa" ? "EXA_API_KEY"
      : provider === "tavily" ? "TAVILY_API_KEY"
      : "PERPLEXITY_API_KEY";

    if (!process.env[envKey]) {
      return NextResponse.json({
        text: null,
        message: `${provider} is not configured. Please paste a direct profile link.`,
      });
    }

    const { text, citations, usage } = await search(query.trim());

    // Log usage
    if (usage.estimated_cost_usd) {
      await logApiUsage([usage]);
    }

    if (!text) {
      return NextResponse.json({
        text: null,
        message: "Couldn't find information about this person. Try pasting a direct profile link instead.",
      });
    }

    return NextResponse.json({ text, citations, provider });
  } catch {
    return NextResponse.json({ text: null, error: "Invalid request" }, { status: 400 });
  }
}
