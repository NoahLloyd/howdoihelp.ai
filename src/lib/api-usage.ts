import { createClient } from "@supabase/supabase-js";
import { cookies } from "next/headers";
import type { ApiUsageEntry } from "@/types";
import { readVisitorSession, VISITOR_SESSION_COOKIE } from "./visitor-session";

type UsageEntry = ApiUsageEntry & { prompt_version?: number };

/** Private cost records are written only by server routes, never the anon client. */
export async function logApiUsage(entries: UsageEntry[]): Promise<void> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key || entries.length === 0) return;
  try {
    const client = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
    const visitorId = readVisitorSession((await cookies()).get(VISITOR_SESSION_COOKIE)?.value);
    const rows = entries.map((entry) => ({
      provider: entry.provider,
      model: entry.model,
      endpoint: entry.endpoint,
      input_tokens: entry.input_tokens,
      output_tokens: entry.output_tokens,
      estimated_cost_usd: entry.estimated_cost_usd,
      prompt_version: entry.prompt_version,
      // A request body or localStorage ID cannot attribute activity to another visitor.
      user_id: visitorId || undefined,
    }));
    const { error } = await client.from("api_usage").insert(rows);
    if (error) console.error("[api-usage] Could not record usage");
  } catch {
    console.error("[api-usage] Could not record usage");
  }
}
