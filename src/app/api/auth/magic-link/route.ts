import { createClient } from "@supabase/supabase-js";
import { sendMagicLinkEmail } from "@/lib/email";

function getServiceClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    throw new Error("Missing Supabase service role key");
  }
  return createClient(url, key);
}

function getBaseUrl(): string {
  return process.env.NEXT_PUBLIC_SITE_URL || "https://howdoihelp.ai";
}

export async function POST(req: Request) {
  try {
    const { email, next } = (await req.json()) as {
      email?: string;
      next?: string;
    };

    if (!email?.trim() || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return Response.json({ error: "Valid email required" }, { status: 400 });
    }

    const supabase = getServiceClient();
    const base = getBaseUrl();

    const { data, error } = await supabase.auth.admin.generateLink({
      type: "magiclink",
      email: email.trim(),
    });

    if (error) {
      console.error("[magic-link] generateLink error:", error);
      return Response.json({ error: "Failed to generate link" }, { status: 500 });
    }

    // Build our own verify URL so the token is verified server-side.
    // This avoids the implicit flow hash fragment issues entirely.
    const tokenHash = data.properties.hashed_token;
    const verifyUrl = `${base}/api/auth/verify?token_hash=${encodeURIComponent(tokenHash)}&type=magiclink&next=${encodeURIComponent(next || "/dashboard")}`;

    await sendMagicLinkEmail(email.trim(), verifyUrl);

    return Response.json({ ok: true });
  } catch (err) {
    console.error("[magic-link] Error:", err);
    return Response.json({ error: "Something went wrong" }, { status: 500 });
  }
}
