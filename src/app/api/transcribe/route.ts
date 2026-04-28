import Groq from "groq-sdk";
import { checkRateLimit } from "@/lib/rate-limit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 30;

const MAX_FILE_BYTES = 4 * 1024 * 1024;
const ALLOWED_MIME_PREFIXES = ["audio/"];

function clientIp(req: Request): string {
  return (
    req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    req.headers.get("x-real-ip") ||
    "unknown"
  );
}

function errorResponse(code: string, message: string, status: number, retryAfter?: number) {
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (retryAfter != null) headers["Retry-After"] = String(retryAfter);
  return new Response(JSON.stringify({ error: { code, message } }), { status, headers });
}

export function GET() {
  return Response.json({ ok: true });
}

export async function POST(req: Request) {
  if (!process.env.GROQ_API_KEY) {
    return errorResponse("misconfigured", "Transcription is not configured.", 500);
  }

  const ip = clientIp(req);
  const rl = checkRateLimit(ip, { bucket: "transcribe", windowMs: 60_000, maxRequests: 10 });
  if (!rl.allowed) {
    const retryAfter = Math.ceil((rl.resetAt - Date.now()) / 1000);
    return errorResponse(
      "rate_limit_exceeded",
      `Too many transcription requests. Retry in ${retryAfter}s.`,
      429,
      retryAfter
    );
  }

  let formData: FormData;
  try {
    formData = await req.formData();
  } catch {
    return errorResponse("invalid_form_data", "Expected multipart/form-data.", 400);
  }

  const audio = formData.get("audio");
  if (!(audio instanceof File)) {
    return errorResponse("missing_audio", "Field 'audio' is required.", 400);
  }
  if (audio.size === 0) {
    return errorResponse("empty_audio", "Audio file is empty.", 400);
  }
  if (audio.size > MAX_FILE_BYTES) {
    return errorResponse(
      "file_too_large",
      `Audio file exceeds ${MAX_FILE_BYTES / 1024 / 1024}MB limit.`,
      413
    );
  }
  if (audio.type && !ALLOWED_MIME_PREFIXES.some((p) => audio.type.startsWith(p))) {
    return errorResponse("invalid_mime_type", `Unsupported audio type: ${audio.type}`, 415);
  }

  const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });

  try {
    const transcription = await groq.audio.transcriptions.create({
      file: audio,
      model: "whisper-large-v3-turbo",
      language: "en",
      response_format: "json",
      temperature: 0,
    });
    const text = (transcription.text || "").trim();
    return Response.json({ text });
  } catch (err) {
    const e = err as { status?: number; error?: { message?: string }; message?: string };
    const status = e?.status ?? 502;
    const upstreamMsg = e?.error?.message || e?.message || "Upstream transcription failed.";
    if (status === 429) {
      return errorResponse("upstream_rate_limit", upstreamMsg, 429, 30);
    }
    if (status === 401 || status === 403) {
      return errorResponse("upstream_auth", "Transcription auth failed.", 502);
    }
    return errorResponse("upstream_error", upstreamMsg, status >= 400 && status < 600 ? status : 502);
  }
}
