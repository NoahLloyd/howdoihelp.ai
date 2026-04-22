import { createClient, SupabaseClient } from "@supabase/supabase-js";

let _client: SupabaseClient | null = null;

/**
 * Fetch all rows from a PostgREST query, paginating past Supabase's 1000-row
 * server cap. The caller supplies a function that builds the range-scoped
 * query for a given [from, to] window.
 */
export async function fetchAllRows<T>(
  buildQuery: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: { message: string } | null }>
): Promise<T[]> {
  const chunk = 1000;
  const out: T[] = [];
  let offset = 0;
  while (true) {
    const { data, error } = await buildQuery(offset, offset + chunk - 1);
    if (error) throw new Error(error.message);
    const rows = data || [];
    out.push(...rows);
    if (rows.length < chunk) break;
    offset += chunk;
  }
  return out;
}

/**
 * Get the Supabase client (lazy-initialized).
 * Returns null if env vars aren't configured.
 *
 * Supports both:
 *  - NEXT_PUBLIC_SUPABASE_ANON_KEY (legacy anon key)
 *  - NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY (new format sb_publishable_xxx)
 */
export function getSupabase(): SupabaseClient | null {
  if (_client) return _client;

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key =
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;

  if (!url || !key || url.includes("your-project")) {
    return null;
  }

  _client = createClient(url, key);
  return _client;
}
