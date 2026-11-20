import { createClient } from "@supabase/supabase-js";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { createVisitorSession, readVisitorSession, VISITOR_SESSION_COOKIE, VISITOR_SESSION_MAX_AGE } from "@/lib/visitor-session";
import { parseVisitorUpdates } from "@/lib/visitor-updates";
import { checkRateLimit } from "@/lib/rate-limit";
import { isSameOrigin } from "@/lib/request-origin";

export const dynamic = "force-dynamic";
const MAX_BODY_BYTES = 256 * 1024;
const PRIVATE_HEADERS = { "Cache-Control": "private, no-store" };

function serviceClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("Visitor storage is not configured");
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
}

export async function GET() {
  const token = (await cookies()).get(VISITOR_SESSION_COOKIE)?.value;
  const id = readVisitorSession(token);
  if (!id) return NextResponse.json({ error: "Unauthorized" }, { status: 401, headers: PRIVATE_HEADERS });
  const { data, error } = await serviceClient().from("users").select("*").eq("id", id).maybeSingle();
  if (error) return NextResponse.json({ error: "Could not load visitor profile" }, { status: 500, headers: PRIVATE_HEADERS });
  return NextResponse.json(data, { headers: PRIVATE_HEADERS });
}

export async function POST(request: Request) {
  // SameSite cookies plus an explicit origin check protect cookie-authenticated writes.
  if (!isSameOrigin(request, request.headers.get("origin") || "")) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const ip = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
  if (!checkRateLimit(ip, { bucket: "visitor-save", maxRequests: 30 }).allowed) {
    return NextResponse.json({ error: "Too many requests" }, { status: 429 });
  }
  if (!request.headers.get("content-type")?.startsWith("application/json")) {
    return NextResponse.json({ error: "JSON required" }, { status: 415 });
  }
  if (Number(request.headers.get("content-length")) > MAX_BODY_BYTES) {
    return NextResponse.json({ error: "Profile too large" }, { status: 413 });
  }
  let updates: Record<string, unknown> | null;
  try {
    const body = await request.text();
    if (Buffer.byteLength(body) > MAX_BODY_BYTES) return NextResponse.json({ error: "Profile too large" }, { status: 413 });
    updates = parseVisitorUpdates(JSON.parse(body));
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  if (!updates) return NextResponse.json({ error: "Invalid profile updates" }, { status: 400 });
  const cookieStore = await cookies();
  const previousToken = cookieStore.get(VISITOR_SESSION_COOKIE)?.value;
  const previousId = readVisitorSession(previousToken);
  if (previousToken && !previousId) return NextResponse.json({ error: "Invalid visitor session" }, { status: 401 });

  try {
    // Never adopt a client-supplied or legacy localStorage id: it proves no ownership.
    const { id, token } = createVisitorSession(previousId || undefined);
    const now = new Date().toISOString();
    const { error } = await serviceClient().from("users").upsert({ ...updates, id, last_visit_at: now, updated_at: now }, { onConflict: "id" });
    if (error) return NextResponse.json({ error: "Could not save visitor profile" }, { status: 500 });
    cookieStore.set(VISITOR_SESSION_COOKIE, token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      maxAge: VISITOR_SESSION_MAX_AGE,
      path: "/",
    });
    return NextResponse.json({ id }, { headers: PRIVATE_HEADERS });
  } catch {
    return NextResponse.json({ error: "Visitor storage is unavailable" }, { status: 503 });
  }
}
