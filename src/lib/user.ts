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
  try {
    const response = await fetch("/api/visitor", { cache: "no-store" });
    if (!response.ok) return null;
    const data = await response.json() as UserRecord | null;
    return data?.id === id ? data : null;
  } catch {
    return null;
  }
}

export async function upsertUser(
  _id: string,
  updates: {
    profile_data?: EnrichedProfile;
    profile_platform?: string;
    profile_url?: string;
    linkedin_email?: string;
    answers?: UserAnswers;
    last_recommendations?: RecommendedResource[];
  }
): Promise<void> {
  try {
    const response = await fetch("/api/visitor", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(updates),
    });
    if (response.ok) {
      const { id } = await response.json() as { id: string };
      localStorage.setItem(USER_ID_KEY, id);
    }
  } catch {
    // Persistence is best-effort; recommendations still work without it.
  }
}
