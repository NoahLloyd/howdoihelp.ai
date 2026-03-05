import Anthropic from "@anthropic-ai/sdk";
import OpenAI from "openai";
import type { ApiUsageEntry } from "@/types";

// ─── Model Mapping ──────────────────────────────────────────
// Each Claude model has an OpenAI fallback equivalent

interface ModelConfig {
  claude: string;
  openai: string;
  claudeInputCostPerM: number;
  claudeOutputCostPerM: number;
  openaiInputCostPerM: number;
  openaiOutputCostPerM: number;
}

const MODELS: Record<string, ModelConfig> = {
  extract: {
    claude: "claude-haiku-4-5-20251001",
    openai: "gpt-4.1-nano",
    claudeInputCostPerM: 0.80,
    claudeOutputCostPerM: 4.0,
    openaiInputCostPerM: 0.10,
    openaiOutputCostPerM: 0.40,
  },
  recommend: {
    claude: "claude-sonnet-4-6",
    openai: "gpt-4.1-mini",
    claudeInputCostPerM: 3.0,
    claudeOutputCostPerM: 15.0,
    openaiInputCostPerM: 0.40,
    openaiOutputCostPerM: 1.60,
  },
};

// ─── Response Type ──────────────────────────────────────────

export interface LLMResponse {
  text: string;
  usage: ApiUsageEntry;
}

// ─── Error Classification ───────────────────────────────────

/** Errors that should NOT trigger OpenAI fallback (caller mistakes, not provider issues) */
function isClientError(err: unknown): boolean {
  if (err instanceof Anthropic.BadRequestError) {
    // Content policy violations - OpenAI would likely reject too
    const msg = (err.message || "").toLowerCase();
    if (msg.includes("prompt is too long") || msg.includes("content policy")) return true;
  }
  return false;
}

// ─── Claude Call ─────────────────────────────────────────────

async function callClaude(
  system: string,
  userContent: string,
  config: ModelConfig,
  maxTokens: number,
  endpoint: string,
): Promise<LLMResponse> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error("ANTHROPIC_API_KEY not configured");

  const anthropic = new Anthropic({ apiKey });
  const response = await anthropic.messages.create({
    model: config.claude,
    max_tokens: maxTokens,
    system,
    messages: [{ role: "user", content: userContent }],
  });

  const text = response.content[0].type === "text" ? response.content[0].text : "";
  const inputTokens = response.usage?.input_tokens || 0;
  const outputTokens = response.usage?.output_tokens || 0;
  const estimatedCost =
    (inputTokens / 1_000_000) * config.claudeInputCostPerM +
    (outputTokens / 1_000_000) * config.claudeOutputCostPerM;

  return {
    text,
    usage: {
      provider: "claude",
      model: config.claude,
      endpoint,
      input_tokens: inputTokens,
      output_tokens: outputTokens,
      estimated_cost_usd: estimatedCost,
    },
  };
}

// ─── OpenAI Call ─────────────────────────────────────────────

async function callOpenAI(
  system: string,
  userContent: string,
  config: ModelConfig,
  maxTokens: number,
  endpoint: string,
): Promise<LLMResponse> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) throw new Error("OPENAI_API_KEY not configured");

  const openai = new OpenAI({ apiKey });
  const response = await openai.chat.completions.create({
    model: config.openai,
    max_tokens: maxTokens,
    messages: [
      { role: "system", content: system },
      { role: "user", content: userContent },
    ],
  });

  const text = response.choices[0]?.message?.content || "";
  const inputTokens = response.usage?.prompt_tokens || 0;
  const outputTokens = response.usage?.completion_tokens || 0;
  const estimatedCost =
    (inputTokens / 1_000_000) * config.openaiInputCostPerM +
    (outputTokens / 1_000_000) * config.openaiOutputCostPerM;

  return {
    text,
    usage: {
      provider: "openai",
      model: config.openai,
      endpoint,
      input_tokens: inputTokens,
      output_tokens: outputTokens,
      estimated_cost_usd: estimatedCost,
    },
  };
}

// ─── JSON Extraction ────────────────────────────────────────
// Handles all the ways an LLM might return JSON:
// - Clean JSON
// - Wrapped in ```json ... ```
// - Wrapped in ``` ... ``` (no language tag)
// - Truncated response with opening ``` but no closing ```
// - Truncated JSON array (missing closing ])

export function extractJson(raw: string): string {
  let s = raw.trim();

  // 1. Complete markdown fences
  const fenceMatch = s.match(/```(?:json)?\s*\n?([\s\S]*?)\n?\s*```/);
  if (fenceMatch) {
    s = fenceMatch[1].trim();
  }
  // 2. Truncated fence - opening ``` but no closing ```
  else if (/^```/.test(s)) {
    s = s.replace(/^```(?:json)?\s*\n?/, "").trim();
  }

  // 3. Try to repair truncated JSON arrays
  try {
    JSON.parse(s);
    return s;
  } catch {
    // Find the last complete JSON object in an array
    const lastBrace = s.lastIndexOf("}");
    if (lastBrace > 0) {
      let repaired = s.slice(0, lastBrace + 1);
      // Close any open array brackets
      const opens = (repaired.match(/\[/g) || []).length;
      const closes = (repaired.match(/\]/g) || []).length;
      for (let i = 0; i < opens - closes; i++) repaired += "]";
      try {
        JSON.parse(repaired);
        console.warn("[llm] Repaired truncated JSON response");
        return repaired;
      } catch { /* fall through */ }
    }
  }

  return s;
}

// ─── Main Entry Point ───────────────────────────────────────
// Tries Claude first. On any provider-side error, falls back to OpenAI.

export async function llmComplete(opts: {
  task: "extract" | "recommend";
  system: string;
  user: string;
  maxTokens: number;
  endpoint: string;
}): Promise<LLMResponse> {
  const config = MODELS[opts.task];

  // Try Claude first
  try {
    return await callClaude(opts.system, opts.user, config, opts.maxTokens, opts.endpoint);
  } catch (err) {
    // Only re-throw true client errors (our fault, not provider issues)
    if (isClientError(err)) throw err;

    const reason = err instanceof Error ? err.message : String(err);
    console.warn(`[llm] Claude failed for ${opts.task} (${reason}), falling back to OpenAI (${config.openai})`);
  }

  // Fallback to OpenAI
  return await callOpenAI(opts.system, opts.user, config, opts.maxTokens, opts.endpoint);
}
