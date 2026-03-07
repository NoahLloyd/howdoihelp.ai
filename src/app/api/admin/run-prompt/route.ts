import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import OpenAI from "openai";
import { llmComplete, extractJson } from "@/lib/llm";
import { searchPerson as exaSearch } from "@/lib/exa";
import { searchPerson as tavilySearch } from "@/lib/tavily";

export const dynamic = "force-dynamic";

async function verifyAdmin() {
  const session = (await cookies()).get("admin_session");
  if (!session || session.value !== "authenticated") {
    throw new Error("Unauthorized");
  }
}

interface RunPromptRequest {
  promptKey: "recommend" | "extract" | "search" | "evaluate-event" | "evaluate-community";
  systemPrompt: string;
  userContent: string;
  model?: string;
  maxTokens?: number;
  searchProvider?: "perplexity" | "exa" | "tavily";
}

export async function POST(req: Request) {
  try {
    await verifyAdmin();
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const body = (await req.json()) as RunPromptRequest;
    const { promptKey, systemPrompt, userContent, model, maxTokens, searchProvider } = body;

    const start = Date.now();

    // Search prompts can use different providers
    if (promptKey === "search") {
      const provider = searchProvider || "perplexity";

      // Exa search
      if (provider === "exa") {
        if (!process.env.EXA_API_KEY) {
          return NextResponse.json({ error: "EXA_API_KEY not configured" }, { status: 500 });
        }
        const { text, citations } = await exaSearch(userContent.trim());
        return NextResponse.json({
          text: text || "No results found",
          citations,
          inputTokens: 0,
          outputTokens: 0,
          estimatedCost: 0.007,
          latencyMs: Date.now() - start,
          model: "exa",
        });
      }

      // Tavily search
      if (provider === "tavily") {
        if (!process.env.TAVILY_API_KEY) {
          return NextResponse.json({ error: "TAVILY_API_KEY not configured" }, { status: 500 });
        }
        const { text, citations } = await tavilySearch(userContent.trim());
        return NextResponse.json({
          text: text || "No results found",
          citations,
          inputTokens: 0,
          outputTokens: 0,
          estimatedCost: 0.016,
          latencyMs: Date.now() - start,
          model: "tavily",
        });
      }

      // Perplexity search (default)
      const apiKey = process.env.PERPLEXITY_API_KEY;
      if (!apiKey) {
        return NextResponse.json({ error: "PERPLEXITY_API_KEY not configured" }, { status: 500 });
      }

      if (!systemPrompt?.trim()) {
        return NextResponse.json({ error: "systemPrompt required for Perplexity" }, { status: 400 });
      }

      const client = new OpenAI({ apiKey, baseURL: "https://api.perplexity.ai" });
      const response = await client.chat.completions.create({
        model: "sonar",
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userContent },
        ],
      });

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
        estimatedCost: (inputTokens / 1_000_000) + (outputTokens / 1_000_000),
        latencyMs: Date.now() - start,
        model: "sonar",
      });
    }

    // Claude/OpenAI prompts (recommend, extract, evaluate-event, evaluate-community)
    if (!systemPrompt?.trim() && !userContent?.trim()) {
      return NextResponse.json({ error: "prompt content required" }, { status: 400 });
    }

    const task = promptKey === "extract" ? "extract" : "recommend";
    const defaultMaxTokens = promptKey === "extract" ? 1500
      : (promptKey === "evaluate-event" || promptKey === "evaluate-community") ? 2000
      : 8192;
    const result = await llmComplete({
      task,
      system: systemPrompt || "",
      user: userContent || "",
      maxTokens: maxTokens || defaultMaxTokens,
      endpoint: "workbench",
      modelOverride: model || undefined,
    });

    // Try to extract JSON for recommendation/extraction tasks
    let parsedJson: unknown = null;
    try {
      const jsonStr = extractJson(result.text);
      parsedJson = JSON.parse(jsonStr);
    } catch {
      // Not JSON, that's fine
    }

    return NextResponse.json({
      text: result.text,
      parsedJson,
      inputTokens: result.usage.input_tokens || 0,
      outputTokens: result.usage.output_tokens || 0,
      estimatedCost: result.usage.estimated_cost_usd || 0,
      latencyMs: Date.now() - start,
      model: result.usage.model || model || "default",
    });
  } catch (err) {
    console.error("[run-prompt] Error:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Unknown error" },
      { status: 500 },
    );
  }
}
