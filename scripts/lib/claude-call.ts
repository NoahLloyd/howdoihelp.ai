/**
 * claude-call.ts - A thin wrapper that lets the evaluator call Claude either
 * via the Anthropic API (paid per token) or via the `claude` CLI in headless
 * print mode (which runs on the user's Claude Code subscription quota and is
 * therefore "free" if the subscription has spare capacity).
 *
 * Both paths return the same shape:
 *   {
 *     structured: <object matching jsonSchema>,
 *     durationMs: number,
 *     costUsd: number   // for CLI: hypothetical, billed against subscription
 *   }
 *
 * Provider is selected by the CLAUDE_PROVIDER env var (default "cli").
 *   CLAUDE_PROVIDER=cli   - shell out to `claude -p` (uses subscription)
 *   CLAUDE_PROVIDER=api   - use @anthropic-ai/sdk (uses ANTHROPIC_API_KEY)
 */

import { spawn } from 'node:child_process';
import * as fs from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';
import Anthropic from '@anthropic-ai/sdk';

export type Provider = 'cli' | 'api';

export interface ClaudeCallArgs<S extends object = Record<string, unknown>> {
  /** Anthropic model name or alias ("haiku", "sonnet", "opus", or full id). */
  model: string;
  /** Full system prompt. */
  systemPrompt: string;
  /** The user message text. */
  userText: string;
  /** Optional image bytes for vision; the wrapper saves to a temp file when using CLI. */
  imageBytes?: Buffer;
  /** JSON Schema describing the required structured output. */
  jsonSchema: object;
  /** Defaults to env CLAUDE_PROVIDER, then "cli". */
  provider?: Provider;
  /** Soft cap; only enforced on the API path (CLI ignores). Default 1024. */
  maxTokens?: number;
  /** Description of the JSON tool for the API path. Defaults to a generic line. */
  toolDescription?: string;
}

export interface ClaudeCallResult<T> {
  structured: T;
  durationMs: number;
  /** For CLI provider this is the model's reported "would-cost" — actual usage hits the subscription, not the wallet. */
  costUsd: number;
  provider: Provider;
}

function resolveProvider(explicit?: Provider): Provider {
  if (explicit) return explicit;
  const env = (process.env.CLAUDE_PROVIDER || '').toLowerCase();
  if (env === 'api' || env === 'cli') return env;
  return 'cli';
}

// ─── CLI path ──────────────────────────────────────────────

async function callViaCli<T>(args: ClaudeCallArgs): Promise<ClaudeCallResult<T>> {
  const t0 = Date.now();

  // For vision, save the image bytes to a temp file the CLI can read.
  let imagePath: string | undefined;
  if (args.imageBytes && args.imageBytes.length > 0) {
    const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'claude-eval-'));
    imagePath = path.join(tmpDir, 'screenshot.png');
    await fs.writeFile(imagePath, args.imageBytes);
  }

  // Build the user prompt. When there's an image, instruct the model to read
  // it from disk via the Read tool.
  const promptText = imagePath
    ? `${args.userText}\n\nA screenshot of the rendered page has been saved at:\n${imagePath}\n\nRead that image, then return ONLY the structured JSON answer.`
    : args.userText;

  const cliArgs = [
    '-p',
    '--output-format', 'json',
    '--model', args.model,
    '--system-prompt', args.systemPrompt,
    '--json-schema', JSON.stringify(args.jsonSchema),
  ];
  if (imagePath) {
    // Restrict to just the Read tool so the model can't wander.
    cliArgs.push('--tools', 'Read');
  } else {
    cliArgs.push('--tools', '');
  }

  const stdout = await new Promise<string>((resolve, reject) => {
    const proc = spawn('claude', cliArgs, { stdio: ['pipe', 'pipe', 'pipe'] });
    let out = '';
    let err = '';
    proc.stdout.on('data', d => (out += d.toString()));
    proc.stderr.on('data', d => (err += d.toString()));
    proc.on('error', reject);
    proc.on('close', code => {
      if (code !== 0) {
        reject(new Error(`claude exited ${code}: ${err.slice(0, 500)}`));
      } else {
        resolve(out);
      }
    });
    proc.stdin.write(promptText);
    proc.stdin.end();
  });

  // Clean up tempfile (best effort)
  if (imagePath) {
    fs.rm(path.dirname(imagePath), { recursive: true, force: true }).catch(() => undefined);
  }

  // Parse the JSON envelope from the CLI
  let envelope: any;
  try {
    envelope = JSON.parse(stdout);
  } catch {
    throw new Error(`claude CLI returned non-JSON: ${stdout.slice(0, 300)}`);
  }
  if (envelope.is_error) {
    throw new Error(`claude CLI reported error: ${envelope.result || JSON.stringify(envelope).slice(0, 300)}`);
  }
  const structured = envelope.structured_output;
  if (!structured || typeof structured !== 'object') {
    throw new Error(`claude CLI returned no structured_output. Raw result: ${JSON.stringify(envelope.result).slice(0, 300)}`);
  }

  return {
    structured: structured as T,
    durationMs: Date.now() - t0,
    costUsd: typeof envelope.total_cost_usd === 'number' ? envelope.total_cost_usd : 0,
    provider: 'cli',
  };
}

// ─── API path ──────────────────────────────────────────────

let _api: Anthropic | null = null;
function api(): Anthropic {
  if (!_api) {
    const key = process.env.ANTHROPIC_API_KEY;
    if (!key) throw new Error('Missing ANTHROPIC_API_KEY (needed for CLAUDE_PROVIDER=api)');
    _api = new Anthropic({ apiKey: key });
  }
  return _api;
}

async function callViaApi<T>(args: ClaudeCallArgs): Promise<ClaudeCallResult<T>> {
  const t0 = Date.now();
  const content: Anthropic.MessageParam['content'] = [];
  if (args.imageBytes && args.imageBytes.length > 0) {
    content.push({
      type: 'image',
      source: {
        type: 'base64',
        media_type: 'image/png',
        data: args.imageBytes.toString('base64'),
      },
    });
  }
  content.push({ type: 'text', text: args.userText });

  const resp = await api().messages.create({
    model: args.model,
    max_tokens: args.maxTokens ?? 1024,
    system: args.systemPrompt,
    tools: [
      {
        name: 'submit_result',
        description: args.toolDescription ?? 'Submit your structured answer.',
        input_schema: args.jsonSchema as Anthropic.Tool.InputSchema,
      },
    ],
    tool_choice: { type: 'tool', name: 'submit_result' },
    messages: [{ role: 'user', content }],
  });

  const toolUse = resp.content.find(b => b.type === 'tool_use');
  if (!toolUse || toolUse.type !== 'tool_use') {
    throw new Error('API path: model did not return a tool_use block');
  }
  const inputTokens = resp.usage?.input_tokens ?? 0;
  const outputTokens = resp.usage?.output_tokens ?? 0;
  // Rough cost estimate: doesn't try to be exact about which model.
  const isSonnet = /sonnet/i.test(args.model);
  const inRate = isSonnet ? 3 / 1_000_000 : 1 / 1_000_000;
  const outRate = isSonnet ? 15 / 1_000_000 : 5 / 1_000_000;
  const costUsd = inputTokens * inRate + outputTokens * outRate;

  return {
    structured: toolUse.input as T,
    durationMs: Date.now() - t0,
    costUsd,
    provider: 'api',
  };
}

// ─── Public entrypoint ────────────────────────────────────

export async function callClaude<T>(args: ClaudeCallArgs): Promise<ClaudeCallResult<T>> {
  const provider = resolveProvider(args.provider);
  return provider === 'cli' ? callViaCli<T>(args) : callViaApi<T>(args);
}
