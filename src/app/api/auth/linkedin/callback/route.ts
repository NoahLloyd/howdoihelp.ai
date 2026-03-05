import { redirect } from "next/navigation";
import { cookies } from "next/headers";
import { scrapeLinkedInProfile } from "@/lib/linkedin-scraper";
import { searchPerson } from "@/lib/perplexity";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const code = searchParams.get("code");
  const error = searchParams.get("error");

  if (error || !code) {
    // User denied or something went wrong - redirect back to app
    redirect("/?linkedin_error=1");
  }

  // Derive base URL from the actual request so it works on both localhost and production
  const reqUrl = new URL(req.url);
  const baseUrl = `${reqUrl.protocol}//${reqUrl.host}`;
  const clientId = process.env.LINKEDIN_CLIENT_ID;
  const clientSecret = process.env.LINKEDIN_CLIENT_SECRET;

  if (!clientId || !clientSecret) {
    console.error("[linkedin-oauth] Missing LINKEDIN_CLIENT_ID or LINKEDIN_CLIENT_SECRET");
    redirect("/?linkedin_error=config");
  }

  try {
    // 1. Exchange code for access token
    const tokenRes = await fetch("https://www.linkedin.com/oauth/v2/accessToken", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        grant_type: "authorization_code",
        code,
        redirect_uri: `${baseUrl}/api/auth/linkedin/callback`,
        client_id: clientId,
        client_secret: clientSecret,
      }),
    });

    if (!tokenRes.ok) {
      console.error("[linkedin-oauth] Token exchange failed:", await tokenRes.text());
      redirect("/?linkedin_error=token");
    }

    const { access_token } = await tokenRes.json();

    // 2. Get basic profile from LinkedIn OIDC
    const profileRes = await fetch("https://api.linkedin.com/v2/userinfo", {
      headers: { Authorization: `Bearer ${access_token}` },
    });

    if (!profileRes.ok) {
      console.error("[linkedin-oauth] Profile fetch failed:", await profileRes.text());
      redirect("/?linkedin_error=profile");
    }

    const linkedinUser = await profileRes.json();
    // Returns: { sub, name, given_name, family_name, picture, email, locale }

    // 3. Try /v2/me to get vanityName (profile URL slug)
    //    This may or may not work with standard OIDC scopes - worth trying.
    let vanityName: string | undefined;
    try {
      const meRes = await fetch("https://api.linkedin.com/v2/me", {
        headers: { Authorization: `Bearer ${access_token}` },
      });
      if (meRes.ok) {
        const meData = await meRes.json();
        vanityName = meData.vanityName;
        console.log("[linkedin-oauth] /v2/me response keys:", Object.keys(meData));
        if (vanityName) {
          console.log("[linkedin-oauth] Got vanityName:", vanityName);
        }
      } else {
        console.log("[linkedin-oauth] /v2/me returned", meRes.status, "- vanityName not available");
      }
    } catch {
      console.log("[linkedin-oauth] /v2/me request failed - skipping");
    }

    // 4. If we have vanityName, scrape the full profile for rich data
    let enrichedProfile;
    if (vanityName) {
      const profileUrl = `https://www.linkedin.com/in/${vanityName}/`;
      const { profile: scraped } = await scrapeLinkedInProfile(profileUrl);
      if (scraped) {
        // Merge OAuth data (email, photo) with scraped data
        enrichedProfile = {
          ...scraped,
          email: linkedinUser.email || scraped.email,
          photo: scraped.photo || linkedinUser.picture,
          linkedinUrl: profileUrl,
        };
      }
    }

    // 5. Fall back to basic OIDC profile if scraping didn't work
    if (!enrichedProfile) {
      enrichedProfile = {
        fullName: linkedinUser.name,
        photo: linkedinUser.picture,
        email: linkedinUser.email,
        headline: undefined as string | undefined,
        summary: undefined as string | undefined,
        currentCompany: undefined as string | undefined,
        skills: [] as string[],
        experience: [] as { title: string; company: string }[],
        education: [] as { school: string }[],
        platform: "linkedin" as const,
        linkedinUrl: vanityName ? `https://www.linkedin.com/in/${vanityName}/` : undefined,
        fetchedAt: new Date().toISOString(),
      };
    }

    // 6. Enrich with Perplexity web search - adds context from across the web
    let perplexityText: string | undefined;
    if (enrichedProfile.fullName) {
      try {
        const context = [enrichedProfile.headline, enrichedProfile.currentCompany]
          .filter(Boolean)
          .join(", ");
        const query = context
          ? `"${enrichedProfile.fullName}" - ${context}`
          : `"${enrichedProfile.fullName}"`;
        const { text } = await searchPerson(query);
        if (text) {
          perplexityText = text;
          console.log("[linkedin-oauth] Perplexity enrichment added");
        }
      } catch {
        console.log("[linkedin-oauth] Perplexity enrichment failed - continuing without it");
      }
    }

    // 7. Store in a short-lived cookie so the frontend can pick it up
    const cookieStore = await cookies();
    const cookieData = perplexityText
      ? { ...enrichedProfile, perplexityText }
      : enrichedProfile;
    cookieStore.set("hdih_linkedin_profile", JSON.stringify(cookieData), {
      httpOnly: false, // Frontend needs to read this
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      maxAge: 300, // 5 minutes - just long enough for the frontend to grab it
      path: "/",
    });

    // Redirect back to app with success flag
    redirect("/?linkedin_success=1");
  } catch (err) {
    // redirect() throws a special error in Next.js - let it through
    if (err instanceof Error && err.message === "NEXT_REDIRECT") throw err;
    console.error("[linkedin-oauth] Unexpected error:", err);
    redirect("/?linkedin_error=unknown");
  }
}
