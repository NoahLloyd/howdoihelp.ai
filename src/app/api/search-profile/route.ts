import { NextResponse } from "next/server";

export async function POST(req: Request) {
  try {
    const { query } = await req.json();

    if (!query || typeof query !== "string" || query.trim().length < 2) {
      return NextResponse.json({ url: null, error: "Query is required" }, { status: 400 });
    }

    // TODO: Implement with Perplexity API
    // const perplexityKey = process.env.PERPLEXITY_API_KEY;
    // Prompt: "Find the most likely LinkedIn, GitHub, or X profile URL for: {query}.
    //          Return only the single best-matching profile URL."
    // Parse the response to extract a URL, then return { url }.

    return NextResponse.json({
      url: null,
      message: "Profile search is not yet configured. Please paste a direct profile link.",
    });
  } catch {
    return NextResponse.json({ url: null, error: "Invalid request" }, { status: 400 });
  }
}
