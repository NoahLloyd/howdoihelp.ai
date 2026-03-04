import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import OpenAI from "openai";

export const dynamic = "force-dynamic";

const BASE_URL = "https://api.perplexity.ai";
const MODEL = "sonar";

async function verifyAdmin() {
  const session = (await cookies()).get("admin_session");
  if (!session || session.value !== "authenticated") {
    throw new Error("Unauthorized");
  }
}

export async function POST(req: Request) {
  try {
    await verifyAdmin();
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const { query, systemPrompt } = (await req.json()) as {
      query: string;
      systemPrompt: string;
    };

    if (!query?.trim()) {
      return NextResponse.json({ error: "query required" }, { status: 400 });
    }
    if (!systemPrompt?.trim()) {
      return NextResponse.json({ error: "systemPrompt required" }, { status: 400 });
    }

    const apiKey = process.env.PERPLEXITY_API_KEY;
    if (!apiKey) {
      return NextResponse.json({ error: "PERPLEXITY_API_KEY not configured" }, { status: 500 });
    }

    const client = new OpenAI({ apiKey, baseURL: BASE_URL });

    const start = Date.now();
    const response = await client.chat.completions.create({
      model: MODEL,
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
    });
  } catch (err) {
    console.error("[test-prompt] Error:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Unknown error" },
      { status: 500 },
    );
  }
}
