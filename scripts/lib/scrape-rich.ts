/**
 * scrape-rich.ts - A richer scraper for the v2 evaluator.
 *
 * Captures everything a human-acting evaluator needs: HTTP status, content
 * type, redirect chain, full HTML (no truncation), basic structured metadata.
 * Different from scrape-url.ts: that one strips & truncates aggressively for
 * the old evaluator. This one preserves the data needed to detect dead sites,
 * parked domains, redirects to bad neighbourhoods, and "shell" pages.
 */

const TIMEOUT_MS = 15_000;

export interface RichScrape {
  /** Final URL after redirects (may differ from the requested URL). */
  finalUrl: string;
  /** HTTP status code of the final response, or null if the request failed at the network layer. */
  status: number | null;
  /** Network-level error message, e.g. ECONNREFUSED, timeout. Empty when the request succeeded. */
  networkError?: string;
  /** Content-Type header. */
  contentType?: string;
  /** True if at least one redirect happened. (Manual redirect tracking is not available in fetch; this is inferred from finalUrl !== url.) */
  redirected: boolean;
  /** Full HTML body. No truncation. */
  html: string;
  /** Stripped, single-line text body. Useful for keyword checks. */
  textBody: string;
  /** Approximate visible word count after stripping. */
  textWordCount: number;
  /** og:title or <title>. */
  title?: string;
  /** og:description or meta description. */
  description?: string;
  /** og:image. */
  imageUrl?: string;
  /** First JSON-LD blob with @type Event, if any. */
  eventJsonLd?: Record<string, unknown>;
  /** Hostname of finalUrl (lowercased, no www). */
  finalHost: string;
}

function extractMeta(html: string, property: string): string | undefined {
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

function extractEventJsonLd(html: string): Record<string, unknown> | undefined {
  const rx = /<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;
  let match;
  while ((match = rx.exec(html)) !== null) {
    try {
      const data = JSON.parse(match[1]);
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
      // skip
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

function hostOf(u: string): string {
  try {
    return new URL(u).hostname.replace(/^www\./, '').toLowerCase();
  } catch {
    return '';
  }
}

export async function scrapeRich(url: string): Promise<RichScrape> {
  let res: Response;
  try {
    res = await fetch(url, {
      method: 'GET',
      signal: AbortSignal.timeout(TIMEOUT_MS),
      redirect: 'follow',
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,*/*',
      },
    });
  } catch (err: any) {
    return {
      finalUrl: url,
      finalHost: hostOf(url),
      status: null,
      networkError: err?.message || String(err),
      redirected: false,
      html: '',
      textBody: '',
      textWordCount: 0,
    };
  }

  const finalUrl = res.url || url;
  const html = await res.text().catch(() => '');
  const textBody = stripHtml(html);
  const textWordCount = textBody ? textBody.split(/\s+/).length : 0;

  return {
    finalUrl,
    finalHost: hostOf(finalUrl),
    status: res.status,
    contentType: res.headers.get('content-type') || undefined,
    redirected: hostOf(finalUrl) !== hostOf(url) || finalUrl !== url,
    html,
    textBody,
    textWordCount,
    title: extractMeta(html, 'og:title') || extractTitle(html),
    description: extractMeta(html, 'og:description') || extractMeta(html, 'description'),
    imageUrl: extractMeta(html, 'og:image'),
    eventJsonLd: extractEventJsonLd(html),
  };
}
