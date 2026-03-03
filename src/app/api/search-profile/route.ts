import { NextResponse } from "next/server";
import { searchPerson } from "@/lib/perplexity";
import { getSupabase } from "@/lib/supabase";

export async function POST(req: Request) {
  try {
    const { query } = await req.json();

    if (!query || typeof query !== "string" || query.trim().length < 2) {
      return NextResponse.json({ text: null, error: "Query is required" }, { status: 400 });
    }

    if (!process.env.PERPLEXITY_API_KEY) {
      return NextResponse.json({
        text: null,
        message: "Profile search is not yet configured. Please paste a direct profile link.",
      });
    }

    const { text, usage } = await searchPerson(query.trim());

    // Log usage
    const supabase = getSupabase();
    if (supabase && usage.estimated_cost_usd) {
      await supabase.from("api_usage").insert([usage]).then(() => {}, () => {});
    }

    if (!text) {
      return NextResponse.json({
        text: null,
        message: "Couldn't find information about this person. Try pasting a direct profile link instead.",
      });
    }

    return NextResponse.json({ text });
  } catch {
    return NextResponse.json({ text: null, error: "Invalid request" }, { status: 400 });
  }
}
