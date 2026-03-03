import { getSupabase } from "./supabase";
import type { EnrichedProfile, UserAnswers, RecommendedResource } from "@/types";

// ─── Types ──────────────────────────────────────────────────

interface UserRecord {
  id: string;
  profile_data: EnrichedProfile | null;
  profile_platform: string | null;
  profile_url: string | null;
  linkedin_email: string | null;
  answers: UserAnswers | null;
  last_recommendations: RecommendedResource[] | null;
  last_visit_at: string;
  created_at: string;
  updated_at: string;
}

// ─── Client-Side ID ─────────────────────────────────────────

const USER_ID_KEY = "hdih_user_id";

export function getUserId(): string {
  if (typeof window === "undefined") return "";

  let id = localStorage.getItem(USER_ID_KEY);
  if (!id) {
    id = crypto.randomUUID();
    localStorage.setItem(USER_ID_KEY, id);
  }
  return id;
}

// ─── CRUD ───────────────────────────────────────────────────

export async function getUser(id: string): Promise<UserRecord | null> {
  const supabase = getSupabase();
  if (!supabase) return null;

  const { data, error } = await supabase
    .from("users")
    .select("*")
    .eq("id", id)
    .single();

  if (error || !data) return null;
  return data as UserRecord;
}

export async function upsertUser(
  id: string,
  updates: {
    profile_data?: EnrichedProfile;
    profile_platform?: string;
    profile_url?: string;
    linkedin_email?: string;
    answers?: UserAnswers;
    last_recommendations?: RecommendedResource[];
  }
): Promise<void> {
  const supabase = getSupabase();
  if (!supabase) return;

  const now = new Date().toISOString();

  await supabase
    .from("users")
    .upsert(
      {
        id,
        ...updates,
        last_visit_at: now,
        updated_at: now,
      },
      { onConflict: "id" }
    )
    .then(() => {}, () => {});
}
