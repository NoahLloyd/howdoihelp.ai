import OpenAI from "openai";
import type { ApiUsageEntry } from "@/types";

// Perplexity's Sonar API is OpenAI-compatible
const BASE_URL = "https://api.perplexity.ai";
const MODEL = "sonar";

// Pricing: $1/M input, $1/M output
const INPUT_COST_PER_M = 1.0;
const OUTPUT_COST_PER_M = 1.0;

function getClient(): OpenAI | null {
  const apiKey = process.env.PERPLEXITY_API_KEY;
  if (!apiKey) return null;
  return new OpenAI({ apiKey, baseURL: BASE_URL });
}

function buildUsage(
  response: OpenAI.Chat.ChatCompletion,
  endpoint: string,
): ApiUsageEntry {
  const inputTokens = response.usage?.prompt_tokens || 0;
  const outputTokens = response.usage?.completion_tokens || 0;
  return {
    provider: "perplexity",
    model: MODEL,
    endpoint,
    input_tokens: inputTokens,
    output_tokens: outputTokens,
    estimated_cost_usd:
      (inputTokens / 1_000_000) * INPUT_COST_PER_M +
      (outputTokens / 1_000_000) * OUTPUT_COST_PER_M,
  };
}

// ─── Search for a person — returns raw text ─────────────────

export async function searchPerson(query: string): Promise<{
  text: string | null;
  usage: ApiUsageEntry;
}> {
  const emptyUsage: ApiUsageEntry = {
    provider: "perplexity",
    endpoint: "search-person",
    estimated_cost_usd: 0,
  };

  const client = getClient();
  if (!client) {
    return { text: null, usage: emptyUsage };
  }

  try {
    const response = await client.chat.completions.create({
      model: MODEL,
      messages: [
        {
          role: "system",
          content: `Search for this person and look them up anywhere you can find. Extract all information you can find about them. Output sections with bullet lists in each of every idea or thing about them you can find. This should be a fairly comprehensive overview extracting every single thing about them from their public presence.`,
        },
        {
          role: "user",
          content: query,
        },
      ],
    });

    const usage = buildUsage(response, "search-person");
    const text = response.choices[0]?.message?.content || "";

    if (!text.trim()) {
      return { text: null, usage };
    }

    return { text: text.trim(), usage };
  } catch (err) {
    console.error("[perplexity] searchPerson failed:", err);
    return { text: null, usage: emptyUsage };
  }
}
