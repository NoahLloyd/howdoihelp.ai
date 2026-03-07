import { NextRequest } from "next/server";

export const dynamic = "force-dynamic";

// In-memory cache: only cache successful results (found images).
// Null results are NOT cached so they retry on each page load.
const cache = new Map<string, { image: string; fetchedAt: number }>();
const CACHE_TTL = 1000 * 60 * 60; // 1 hour

/**
 * Fetches the og:image from a given URL.
 * GET /api/og-image?url=https://example.com
 * Returns { image: "https://..." } or { image: null }
 */
export async function GET(req: NextRequest) {
  const url = req.nextUrl.searchParams.get("url");
  if (!url) {
    return Response.json({ error: "url parameter required" }, { status: 400 });
  }

  // Check cache (only hits are cached)
  const cached = cache.get(url);
  if (cached && Date.now() - cached.fetchedAt < CACHE_TTL) {
    return Response.json(
      { image: cached.image },
      { headers: { "Cache-Control": "public, max-age=3600" } }
    );
  }

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 8000);

    const res = await fetch(url, {
      signal: controller.signal,
      headers: {
        // Use a real browser UA — many sites block bot user agents
        "User-Agent":
          "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        Accept: "text/html,application/xhtml+xml",
      },
      redirect: "follow",
    });

    clearTimeout(timeout);

    if (!res.ok) {
      return Response.json({ image: null });
    }

    // Read the full response but only keep the head section for parsing
    const html = await res.text();
    const headEnd = html.indexOf("</head>");
    const headSection = headEnd > 0 ? html.slice(0, headEnd + 7) : html.slice(0, 50_000);

    const image = extractOgImage(headSection);
    const resolvedImage = image ? resolveUrl(image, url) : null;

    // Only cache successful results
    if (resolvedImage) {
      cache.set(url, { image: resolvedImage, fetchedAt: Date.now() });
    }

    return Response.json(
      { image: resolvedImage },
      { headers: { "Cache-Control": resolvedImage ? "public, max-age=3600" : "no-cache" } }
    );
  } catch (err) {
    console.error(`[og-image] Failed for ${url}:`, err instanceof Error ? err.message : err);
    return Response.json({ image: null });
  }
}

/** Extract og:image (or twitter:image) from HTML head */
function extractOgImage(html: string): string | null {
  // Try og:image first (property before or after content)
  const ogMatch =
    html.match(/<meta[^>]*property=["']og:image["'][^>]*content=["']([^"']+)["']/i) ||
    html.match(/<meta[^>]*content=["']([^"']+)["'][^>]*property=["']og:image["']/i);
  if (ogMatch?.[1]) return ogMatch[1];

  // Fallback to twitter:image
  const twMatch =
    html.match(/<meta[^>]*name=["']twitter:image["'][^>]*content=["']([^"']+)["']/i) ||
    html.match(/<meta[^>]*content=["']([^"']+)["'][^>]*name=["']twitter:image["']/i);
  if (twMatch?.[1]) return twMatch[1];

  return null;
}

/** Resolve a potentially relative URL against a base */
function resolveUrl(imageUrl: string, baseUrl: string): string {
  if (imageUrl.startsWith("http://") || imageUrl.startsWith("https://")) {
    return imageUrl;
  }
  try {
    return new URL(imageUrl, baseUrl).toString();
  } catch {
    return imageUrl;
  }
}
