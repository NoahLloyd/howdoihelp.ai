/**
 * geo-region.ts - Light-weight continent grouping so the communities feed can
 * surface "near you" entries even when there's no direct city/country match.
 *
 * For a user in Copenhagen we want "AI Safety Berlin" or "AI Safety Sweden"
 * to outrank "AI Safety Brazil" or generic "Online" entries — same continent
 * is a meaningful signal of practical reachability (event travel, timezone).
 */

/** Coarse continental groupings — kept deliberately simple. */
export type Continent =
  | 'europe'
  | 'north-america'
  | 'south-america'
  | 'asia'
  | 'africa'
  | 'oceania';

const CONTINENT_BY_COUNTRY: Record<string, Continent> = {
  // ─── Europe ─────────────────────────────────────────────
  austria: 'europe', at: 'europe',
  belarus: 'europe', by: 'europe',
  belgium: 'europe', be: 'europe',
  'bosnia and herzegovina': 'europe', ba: 'europe',
  bulgaria: 'europe', bg: 'europe',
  croatia: 'europe', hr: 'europe',
  cyprus: 'europe', cy: 'europe',
  'czech republic': 'europe', czechia: 'europe', cz: 'europe',
  denmark: 'europe', dk: 'europe',
  estonia: 'europe', ee: 'europe',
  finland: 'europe', fi: 'europe',
  france: 'europe', fr: 'europe',
  germany: 'europe', deutschland: 'europe', de: 'europe',
  greece: 'europe', gr: 'europe',
  hungary: 'europe', hu: 'europe',
  iceland: 'europe', is: 'europe',
  ireland: 'europe', ie: 'europe',
  italy: 'europe', it: 'europe',
  latvia: 'europe', lv: 'europe',
  lithuania: 'europe', lt: 'europe',
  luxembourg: 'europe', lu: 'europe',
  malta: 'europe', mt: 'europe',
  moldova: 'europe', md: 'europe',
  netherlands: 'europe', holland: 'europe', nl: 'europe',
  norway: 'europe', no: 'europe',
  poland: 'europe', pl: 'europe',
  portugal: 'europe', pt: 'europe',
  romania: 'europe', ro: 'europe',
  russia: 'europe', ru: 'europe',
  serbia: 'europe', rs: 'europe',
  slovakia: 'europe', sk: 'europe',
  slovenia: 'europe', si: 'europe',
  spain: 'europe', es: 'europe',
  sweden: 'europe', schweden: 'europe', se: 'europe',
  switzerland: 'europe', ch: 'europe',
  ukraine: 'europe', ua: 'europe',
  'united kingdom': 'europe', uk: 'europe', england: 'europe', scotland: 'europe', wales: 'europe', gb: 'europe',
  // ─── North America ──────────────────────────────────────
  canada: 'north-america', ca: 'north-america',
  mexico: 'north-america', mx: 'north-america',
  'united states': 'north-america', usa: 'north-america', us: 'north-america', america: 'north-america',
  // ─── South America ──────────────────────────────────────
  argentina: 'south-america', ar: 'south-america',
  bolivia: 'south-america', bo: 'south-america',
  brazil: 'south-america', br: 'south-america',
  chile: 'south-america', cl: 'south-america',
  colombia: 'south-america', co: 'south-america',
  ecuador: 'south-america', ec: 'south-america',
  paraguay: 'south-america', py: 'south-america',
  peru: 'south-america', pe: 'south-america',
  uruguay: 'south-america', uy: 'south-america',
  venezuela: 'south-america', ve: 'south-america',
  // ─── Asia ───────────────────────────────────────────────
  bangladesh: 'asia', bd: 'asia',
  china: 'asia', cn: 'asia',
  'hong kong': 'asia', hk: 'asia',
  india: 'asia', in: 'asia',
  indonesia: 'asia', id: 'asia',
  iran: 'asia', ir: 'asia',
  iraq: 'asia', iq: 'asia',
  israel: 'asia', il: 'asia',
  japan: 'asia', jp: 'asia',
  jordan: 'asia', jo: 'asia',
  kazakhstan: 'asia', kz: 'asia',
  kuwait: 'asia', kw: 'asia',
  lebanon: 'asia', lb: 'asia',
  malaysia: 'asia', my: 'asia',
  pakistan: 'asia', pk: 'asia',
  philippines: 'asia', ph: 'asia',
  qatar: 'asia', qa: 'asia',
  'saudi arabia': 'asia', sa: 'asia',
  singapore: 'asia', sg: 'asia',
  'south korea': 'asia', kr: 'asia',
  'sri lanka': 'asia', lk: 'asia',
  taiwan: 'asia', tw: 'asia',
  thailand: 'asia', th: 'asia',
  turkey: 'asia', tr: 'asia',
  uae: 'asia', 'united arab emirates': 'asia', ae: 'asia',
  vietnam: 'asia', vn: 'asia',
  // ─── Africa ─────────────────────────────────────────────
  algeria: 'africa', dz: 'africa',
  cameroon: 'africa', cm: 'africa',
  egypt: 'africa', eg: 'africa',
  ethiopia: 'africa', et: 'africa',
  ghana: 'africa', gh: 'africa',
  kenya: 'africa', ke: 'africa',
  morocco: 'africa', ma: 'africa',
  nigeria: 'africa', ng: 'africa',
  rwanda: 'africa', rw: 'africa',
  senegal: 'africa', sn: 'africa',
  somalia: 'africa', so: 'africa',
  'south africa': 'africa', za: 'africa',
  tanzania: 'africa', tz: 'africa',
  tunisia: 'africa', tn: 'africa',
  uganda: 'africa', ug: 'africa',
  zimbabwe: 'africa', zw: 'africa',
  // ─── Oceania ────────────────────────────────────────────
  australia: 'oceania', au: 'oceania',
  'new zealand': 'oceania', nz: 'oceania',
};

/**
 * Extract the continent for a given location string. Returns null if the
 * country can't be inferred (e.g. "Online", "Global", or city without country).
 */
export function continentOf(location: string | null | undefined): Continent | null {
  if (!location) return null;
  const trimmed = location.trim();
  if (!trimmed || trimmed === 'Global' || trimmed === 'Online' || trimmed === 'Unknown') return null;

  // Use the comma-tail (often "City, Country" → "Country").
  const parts = trimmed.split(',').map((p) => p.trim().toLowerCase()).filter(Boolean);
  if (parts.length === 0) return null;
  const last = parts[parts.length - 1];

  // Direct hit.
  if (CONTINENT_BY_COUNTRY[last]) return CONTINENT_BY_COUNTRY[last];

  // Try the entire string as a country (location = "Sweden").
  if (CONTINENT_BY_COUNTRY[trimmed.toLowerCase()]) return CONTINENT_BY_COUNTRY[trimmed.toLowerCase()];

  // Try each comma-separated piece.
  for (const p of parts) {
    if (CONTINENT_BY_COUNTRY[p]) return CONTINENT_BY_COUNTRY[p];
  }

  return null;
}

/**
 * Score how relevant a community's location is to a user's geo. 0..100.
 *
 *   100  exact city match
 *    60  same country (or country-only entry that matches)
 *    35  same continent, different country
 *    20  Online (global communities you can join from anywhere)
 *    10  far country
 *     5  Global / Unknown (no useful geo info)
 */
export function locationRelevance(
  location: string | null | undefined,
  userCity?: string,
  userRegion?: string,
  userCountry?: string,
): number {
  if (!location) return 0;
  const loc = location.toLowerCase();

  if (loc === 'online') return 20;
  if (loc === 'global' || loc === 'unknown' || loc === '') return 5;

  if (!userCountry) return 0;

  const country = userCountry.toLowerCase();

  if (userCity && loc.includes(userCity.toLowerCase())) return 100;
  if (userRegion && loc.includes(userRegion.toLowerCase())) return 80;
  if (loc.includes(country)) return 60;

  // Same-continent boost
  const userCont = CONTINENT_BY_COUNTRY[country];
  const itemCont = continentOf(location);
  if (userCont && itemCont && userCont === itemCont) return 35;

  if (itemCont) return 10; // we know the country and it's just far away
  return 0;
}
