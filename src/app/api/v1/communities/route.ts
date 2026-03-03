import { getSupabase } from "@/lib/supabase";
import type { Resource } from "@/types";
import {
  stripInternalFields,
  apiHeaders,
  handleCors,
  enforceRateLimit,
  extractCountry,
  sortResources,
  toCsv,
  matchesSearch,
  isOnlineLocation,
  matchesTags,
  buildParamsEcho,
} from "@/lib/api-helpers";

export const dynamic = "force-dynamic";

export function OPTIONS() {
  return handleCors();
}

export async function GET(request: Request) {
  // Rate limit
  const check = enforceRateLimit(request);
  if (check.response) return check.response;
  const { rateLimit } = check;

  const headers = apiHeaders(rateLimit);

  // Fetch all approved communities from Supabase
  const supabase = getSupabase();
  if (!supabase) {
    return Response.json(
      { error: { code: "service_unavailable", message: "Database not configured." } },
      { status: 503, headers }
    );
  }

  const { data, error } = await supabase
    .from("resources")
    .select("*")
    .eq("category", "communities")
    .eq("status", "approved")
    .eq("enabled", true)
    .order("ev_general", { ascending: false });

  if (error) {
    return Response.json(
      { error: { code: "internal_error", message: "Failed to fetch communities." } },
      { status: 500, headers }
    );
  }

  const url = new URL(request.url);
  const q = url.searchParams.get("q");
  const location = url.searchParams.get("location");
  const country = url.searchParams.get("country");
  const online = url.searchParams.get("online");
  const tags = url.searchParams.get("tags");
  const source = url.searchParams.get("source");
  const sort = url.searchParams.get("sort");
  const order = url.searchParams.get("order");
  const format = url.searchParams.get("format");

  // Strip internal fields
  let results = ((data as Resource[]) || []).map(stripInternalFields);

  // Apply filters
  if (q) {
    results = results.filter((r) => matchesSearch(r, q));
  }
  if (location) {
    const loc = location.toLowerCase();
    results = results.filter((r) =>
      String(r.location || "").toLowerCase().includes(loc)
    );
  }
  if (country) {
    const c = country.toLowerCase();
    results = results.filter(
      (r) => extractCountry(String(r.location || "")).toLowerCase() === c
    );
  }
  if (online === "true") {
    results = results.filter((r) => isOnlineLocation(String(r.location || "")));
  } else if (online === "false") {
    results = results.filter((r) => !isOnlineLocation(String(r.location || "")));
  }
  if (tags) {
    const tagList = tags.split(",").map((t) => t.trim()).filter(Boolean);
    if (tagList.length > 0) {
      results = results.filter((r) => matchesTags(r, tagList));
    }
  }
  if (source) {
    const s = source.toLowerCase();
    results = results.filter((r) =>
      String(r.source_org || "").toLowerCase().includes(s)
    );
  }

  // Sort
  results = sortResources(results, sort, order);

  // Determine if filtered
  const hasFilters = !!(q || location || country || online || tags || source);
  const paramsEcho = buildParamsEcho({ q, location, country, online, tags, source, sort, order });

  // CSV format
  if (format === "csv") {
    return new Response(toCsv(results), {
      status: 200,
      headers: {
        ...headers,
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": "attachment; filename=howdoihelpai-communities.csv",
      },
    });
  }

  return Response.json(
    {
      data: results,
      total: results.length,
      filtered: hasFilters,
      ...(hasFilters ? { params: paramsEcho } : {}),
    },
    { status: 200, headers }
  );
}
