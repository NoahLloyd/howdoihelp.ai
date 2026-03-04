import { GeoData } from "@/types";

// Authoritarian countries where advocacy resources should be suppressed
const AUTHORITARIAN_COUNTRIES = new Set([
  "CN", "RU", "IR", "KP", "SA", "SY", "BY", "CU", "VE", "MM",
  "TM", "TJ", "EG", "AE", "QA", "BH", "OM",
]);

// Map common timezones to country info for fallback
const TZ_TO_COUNTRY: Record<string, { country: string; countryCode: string; city?: string }> = {
  "America/New_York": { country: "United States", countryCode: "US", city: "New York" },
  "America/Chicago": { country: "United States", countryCode: "US", city: "Chicago" },
  "America/Denver": { country: "United States", countryCode: "US", city: "Denver" },
  "America/Los_Angeles": { country: "United States", countryCode: "US", city: "Los Angeles" },
  "America/Phoenix": { country: "United States", countryCode: "US", city: "Phoenix" },
  "America/Anchorage": { country: "United States", countryCode: "US" },
  "Pacific/Honolulu": { country: "United States", countryCode: "US" },
  "America/Toronto": { country: "Canada", countryCode: "CA", city: "Toronto" },
  "America/Vancouver": { country: "Canada", countryCode: "CA", city: "Vancouver" },
  "America/Edmonton": { country: "Canada", countryCode: "CA" },
  "America/Winnipeg": { country: "Canada", countryCode: "CA" },
  "Europe/London": { country: "United Kingdom", countryCode: "GB", city: "London" },
  "Europe/Paris": { country: "France", countryCode: "FR", city: "Paris" },
  "Europe/Berlin": { country: "Germany", countryCode: "DE", city: "Berlin" },
  "Europe/Amsterdam": { country: "Netherlands", countryCode: "NL", city: "Amsterdam" },
  "Europe/Brussels": { country: "Belgium", countryCode: "BE", city: "Brussels" },
  "Europe/Zurich": { country: "Switzerland", countryCode: "CH", city: "Zurich" },
  "Europe/Stockholm": { country: "Sweden", countryCode: "SE", city: "Stockholm" },
  "Europe/Oslo": { country: "Norway", countryCode: "NO", city: "Oslo" },
  "Europe/Copenhagen": { country: "Denmark", countryCode: "DK", city: "Copenhagen" },
  "Europe/Helsinki": { country: "Finland", countryCode: "FI", city: "Helsinki" },
  "Europe/Madrid": { country: "Spain", countryCode: "ES", city: "Madrid" },
  "Europe/Rome": { country: "Italy", countryCode: "IT", city: "Rome" },
  "Europe/Lisbon": { country: "Portugal", countryCode: "PT", city: "Lisbon" },
  "Europe/Vienna": { country: "Austria", countryCode: "AT", city: "Vienna" },
  "Europe/Warsaw": { country: "Poland", countryCode: "PL", city: "Warsaw" },
  "Europe/Prague": { country: "Czech Republic", countryCode: "CZ", city: "Prague" },
  "Europe/Dublin": { country: "Ireland", countryCode: "IE", city: "Dublin" },
  "Australia/Sydney": { country: "Australia", countryCode: "AU", city: "Sydney" },
  "Australia/Melbourne": { country: "Australia", countryCode: "AU", city: "Melbourne" },
  "Australia/Perth": { country: "Australia", countryCode: "AU", city: "Perth" },
  "Australia/Brisbane": { country: "Australia", countryCode: "AU", city: "Brisbane" },
  "Pacific/Auckland": { country: "New Zealand", countryCode: "NZ", city: "Auckland" },
  "Asia/Tokyo": { country: "Japan", countryCode: "JP", city: "Tokyo" },
  "Asia/Seoul": { country: "South Korea", countryCode: "KR", city: "Seoul" },
  "Asia/Singapore": { country: "Singapore", countryCode: "SG", city: "Singapore" },
  "Asia/Kolkata": { country: "India", countryCode: "IN" },
  "Asia/Calcutta": { country: "India", countryCode: "IN" },
  "Asia/Shanghai": { country: "China", countryCode: "CN" },
  "Asia/Hong_Kong": { country: "Hong Kong", countryCode: "HK", city: "Hong Kong" },
  "Asia/Taipei": { country: "Taiwan", countryCode: "TW", city: "Taipei" },
  "Asia/Bangkok": { country: "Thailand", countryCode: "TH", city: "Bangkok" },
  "Asia/Jakarta": { country: "Indonesia", countryCode: "ID", city: "Jakarta" },
  "Asia/Dubai": { country: "United Arab Emirates", countryCode: "AE", city: "Dubai" },
  "Asia/Jerusalem": { country: "Israel", countryCode: "IL", city: "Jerusalem" },
  "Africa/Johannesburg": { country: "South Africa", countryCode: "ZA", city: "Johannesburg" },
  "Africa/Lagos": { country: "Nigeria", countryCode: "NG", city: "Lagos" },
  "Africa/Nairobi": { country: "Kenya", countryCode: "KE", city: "Nairobi" },
  "America/Sao_Paulo": { country: "Brazil", countryCode: "BR", city: "São Paulo" },
  "America/Argentina/Buenos_Aires": { country: "Argentina", countryCode: "AR", city: "Buenos Aires" },
  "America/Mexico_City": { country: "Mexico", countryCode: "MX", city: "Mexico City" },
  "America/Bogota": { country: "Colombia", countryCode: "CO", city: "Bogotá" },
  "America/Santiago": { country: "Chile", countryCode: "CL", city: "Santiago" },
  "America/Lima": { country: "Peru", countryCode: "PE", city: "Lima" },
};

/**
 * Get geo data from free IP lookup services (HTTPS).
 * Tries multiple providers and falls back gracefully.
 */
export async function getGeoData(): Promise<GeoData> {
  // Try ipapi.co first (HTTPS, no key needed, 1k/day free)
  try {
    const res = await fetch("https://ipapi.co/json/", {
      signal: AbortSignal.timeout(3000),
    });

    if (res.ok) {
      const data = await res.json();
      if (data.country_code && data.country_code !== "Undefined") {
        return {
          country: data.country_name || "Unknown",
          countryCode: data.country_code || "XX",
          city: data.city || undefined,
          region: data.region || undefined,
          timezone: data.timezone || undefined,
          isAuthoritarian: AUTHORITARIAN_COUNTRIES.has(data.country_code),
        };
      }
    }
  } catch {
    // Fall through to next provider
  }

  // Fallback 2: ipwho.is (HTTPS, no key needed, 10k/month free)
  try {
    const res = await fetch("https://ipwho.is/", {
      signal: AbortSignal.timeout(3000),
    });

    if (res.ok) {
      const data = await res.json();
      if (data.success !== false && data.country_code) {
        return {
          country: data.country || "Unknown",
          countryCode: data.country_code || "XX",
          city: data.city || undefined,
          region: data.region || undefined,
          timezone: data.timezone?.id || undefined,
          isAuthoritarian: AUTHORITARIAN_COUNTRIES.has(data.country_code),
        };
      }
    }
  } catch {
    // Fall through to next provider
  }

  // Fallback 3: ip-api.com (HTTP only — works in dev/non-HTTPS contexts)
  try {
    const res = await fetch("http://ip-api.com/json/?fields=country,countryCode,city,regionName,timezone", {
      signal: AbortSignal.timeout(3000),
    });

    if (res.ok) {
      const data = await res.json();
      return {
        country: data.country || "Unknown",
        countryCode: data.countryCode || "XX",
        city: data.city || undefined,
        region: data.regionName || undefined,
        timezone: data.timezone || undefined,
        isAuthoritarian: AUTHORITARIAN_COUNTRIES.has(data.countryCode),
      };
    }
  } catch {
    // Fall through to default
  }

  return defaultGeo();
}

function defaultGeo(): GeoData {
  // Try to infer country from timezone as a fallback
  try {
    const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
    const match = TZ_TO_COUNTRY[tz];
    if (match) {
      return {
        country: match.country,
        countryCode: match.countryCode,
        city: match.city,
        timezone: tz,
        isAuthoritarian: AUTHORITARIAN_COUNTRIES.has(match.countryCode),
      };
    }
    return {
      country: "Unknown",
      countryCode: "XX",
      timezone: tz,
      isAuthoritarian: false,
    };
  } catch {
    return {
      country: "Unknown",
      countryCode: "XX",
      isAuthoritarian: false,
    };
  }
}
