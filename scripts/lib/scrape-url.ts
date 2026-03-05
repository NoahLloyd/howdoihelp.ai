/**
 * scrape-url.ts - Shared URL scraping utility for the event pipeline.
 *
 * Fetches a URL, strips HTML, extracts structured metadata (OpenGraph, JSON-LD),
 * and returns clean text + metadata for the AI evaluator.
 */

const TIMEOUT_MS = 10_000;
const MAX_TEXT_LENGTH = 3000;

export interface ScrapedPage {
  text: string;           // Clean text content (first 3000 chars)
  title?: string;         // <title> or og:title
  description?: string;   // meta description or og:description
  date?: string;          // Extracted date from structured data
  location?: string;      // Extracted location from structured data
  imageUrl?: string;      // og:image
  finalUrl?: string;      // After redirects
  error?: string;         // If scrape failed
}

function extractMeta(html: string, property: string): string | undefined {
  // Match both name="..." and property="..." patterns
  const patterns = [
    new RegExp(`<meta[^>]+(?:property|name)=["']${property}["'][^>]+content=["']([^"']+)["']`, 'i'),
    new RegExp(`<meta[^>]+content=["']([^"']+)["'][^>]+(?:property|name)=["']${property}["']`, 'i'),
  ];
  for (const rx of patterns) {
    const m = html.match(rx);
    if (m?.[1]) return m[1].trim();
  }
  return undefined;
}

function extractTitle(html: string): string | undefined {
  const m = html.match(/<title[^>]*>([^<]+)<\/title>/i);
  return m?.[1]?.trim();
}

function extractJsonLd(html: string): Record<string, any> | undefined {
  const rx = /<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;
  let match;
  while ((match = rx.exec(html)) !== null) {
    try {
      const data = JSON.parse(match[1]);
      // Look for Event type
      if (data['@type'] === 'Event') return data;
      if (Array.isArray(data)) {
        const event = data.find((d: any) => d['@type'] === 'Event');
        if (event) return event;
      }
      if (data['@graph']) {
        const event = data['@graph'].find((d: any) => d['@type'] === 'Event');
        if (event) return event;
      }
    } catch {
      // Invalid JSON-LD, skip
    }
  }
  return undefined;
}

function stripHtml(html: string): string {
  return html
    .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')
    .replace(/<style\b[^<]*(?:(?!<\/style>)<[^<]*)*<\/style>/gi, '')
    .replace(/<nav\b[^<]*(?:(?!<\/nav>)<[^<]*)*<\/nav>/gi, '')
    .replace(/<footer\b[^<]*(?:(?!<\/footer>)<[^<]*)*<\/footer>/gi, '')
    .replace(/<header\b[^<]*(?:(?!<\/header>)<[^<]*)*<\/header>/gi, '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&#\d+;/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

export async function scrapeUrl(url: string): Promise<ScrapedPage> {
  try {
    const res = await fetch(url, {
      method: 'GET',
      signal: AbortSignal.timeout(TIMEOUT_MS),
      redirect: 'follow',
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,*/*',
      },
    });

    if (!res.ok) {
      return { text: '', error: `HTTP ${res.status}` };
    }

    const html = await res.text();
    const finalUrl = res.url;

    // Extract structured data
    const ogTitle = extractMeta(html, 'og:title');
    const ogDesc = extractMeta(html, 'og:description');
    const metaDesc = extractMeta(html, 'description');
    const ogImage = extractMeta(html, 'og:image');
    const htmlTitle = extractTitle(html);

    const jsonLd = extractJsonLd(html);

    // Extract date from JSON-LD or meta tags
    let date = jsonLd?.startDate || extractMeta(html, 'event:start_time');
    if (date && typeof date === 'string') {
      // Normalize to ISO date
      try {
        date = new Date(date).toISOString().split('T')[0];
      } catch {
        // keep raw
      }
    }

    // Extract location from JSON-LD
    let location: string | undefined;
    if (jsonLd?.location) {
      if (typeof jsonLd.location === 'string') {
        location = jsonLd.location;
      } else if (jsonLd.location.name) {
        location = jsonLd.location.address
          ? `${jsonLd.location.name}, ${typeof jsonLd.location.address === 'string' ? jsonLd.location.address : jsonLd.location.address.addressLocality || ''}`
          : jsonLd.location.name;
      }
    }

    // Get clean text
    const text = stripHtml(html).slice(0, MAX_TEXT_LENGTH);

    return {
      text,
      title: ogTitle || htmlTitle,
      description: ogDesc || metaDesc,
      date: date || undefined,
      location: location || undefined,
      imageUrl: ogImage,
      finalUrl,
    };
  } catch (err: any) {
    return { text: '', error: err.message };
  }
}
