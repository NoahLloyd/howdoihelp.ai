import { NextResponse } from "next/server";
import { requireAdmin as verifyAdmin } from "@/lib/admin-auth";
import OpenAI from "openai";
import { searchPerson as exaSearch } from "@/lib/exa";
import { searchPerson as tavilySearch } from "@/lib/tavily";

export const dynamic = "force-dynamic";

const PERPLEXITY_BASE_URL = "https://api.perplexity.ai";
const PERPLEXITY_MODEL = "sonar";

type Provider = "perplexity" | "exa" | "tavily";

export async function POST(req: Request) {
  try {
    await verifyAdmin(req);
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const { query, systemPrompt, provider = "perplexity" } = (await req.json()) as {
      query: string;
      systemPrompt: string;
      provider?: Provider;
    };

    if (!query?.trim()) {
      return NextResponse.json({ error: "query required" }, { status: 400 });
    }

    const start = Date.now();

    // ─── Exa ────────────────────────────────────────────
    if (provider === "exa") {
      if (!process.env.EXA_API_KEY) {
        return NextResponse.json({ error: "EXA_API_KEY not configured" }, { status: 500 });
      }
      const { text, citations } = await exaSearch(query.trim());
      const durationMs = Date.now() - start;
      return NextResponse.json({
        text: text || "No results found",
        citations,
        inputTokens: 0,
        outputTokens: 0,
        durationMs,
        provider: "exa",
      });
    }

    // ─── Tavily ─────────────────────────────────────────
    if (provider === "tavily") {
      if (!process.env.TAVILY_API_KEY) {
        return NextResponse.json({ error: "TAVILY_API_KEY not configured" }, { status: 500 });
      }
      const { text, citations } = await tavilySearch(query.trim());
      const durationMs = Date.now() - start;
      return NextResponse.json({
        text: text || "No results found",
        citations,
        inputTokens: 0,
        outputTokens: 0,
        durationMs,
        provider: "tavily",
      });
    }

    // ─── Perplexity (default) ───────────────────────────
    if (!systemPrompt?.trim()) {
      return NextResponse.json({ error: "systemPrompt required" }, { status: 400 });
    }

    const apiKey = process.env.PERPLEXITY_API_KEY;
    if (!apiKey) {
      return NextResponse.json({ error: "PERPLEXITY_API_KEY not configured" }, { status: 500 });
    }

    const client = new OpenAI({ apiKey, baseURL: PERPLEXITY_BASE_URL });

    const response = await client.chat.completions.create({
      model: PERPLEXITY_MODEL,
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: query },
      ],
    });
    const durationMs = Date.now() - start;

    const text = response.choices[0]?.message?.content || "";
    const citations: string[] =
      (response as unknown as { citations?: string[] }).citations ?? [];
    const inputTokens = response.usage?.prompt_tokens || 0;
    const outputTokens = response.usage?.completion_tokens || 0;

    return NextResponse.json({
      text,
      citations,
      inputTokens,
      outputTokens,
      durationMs,
      provider: "perplexity",
    });
  } catch (err) {
    console.error("[test-prompt] Error:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Unknown error" },
      { status: 500 },
    );
  }
}
