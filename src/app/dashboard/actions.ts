"use server";

import { createAuthClient } from "@/lib/supabase-server";

// ─── Auth Helper ─────────────────────────────────────────────

async function getAuthenticatedUser() {
  const supabase = await createAuthClient();
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();

  if (error || !user) {
    throw new Error("Not authenticated");
  }

  return { supabase, user };
}

// ─── Profile ─────────────────────────────────────────────────

export interface ProfileData {
  id: string;
  display_name: string | null;
  email: string | null;
  avatar_url: string | null;
  role: string;
  bio: string | null;
  location: string | null;
}

export async function getProfile(): Promise<ProfileData | null> {
  const { supabase, user } = await getAuthenticatedUser();

  const { data, error } = await supabase
    .from("profiles")
    .select("*")
    .eq("id", user.id)
    .single();

  if (error || !data) return null;
  return data as ProfileData;
}

export async function updateProfile(
  updates: Partial<Pick<ProfileData, "display_name" | "bio" | "location" | "avatar_url">>
): Promise<void> {
  const { supabase, user } = await getAuthenticatedUser();

  const { error } = await supabase
    .from("profiles")
    .update(updates)
    .eq("id", user.id);

  if (error) throw new Error(error.message);
}

// ─── Guide Settings ──────────────────────────────────────────

export interface GuideData {
  id: string;
  status: "draft" | "active" | "paused";
  headline: string | null;
  calendar_link: string | null;
  capacity_per_month: number | null;
  meeting_duration_minutes: number;
  topics: string[];
  expertise_areas: string[];
  best_for: string | null;
  location: string | null;
  is_available_in_person: boolean;
  linkedin_url: string | null;
  website_url: string | null;
  preferred_career_stages: string[];
  preferred_backgrounds: string[];
  preferred_experience_level: string[];
  call_format: "one_off" | "ongoing" | "either";
  languages: string[];
  not_a_good_fit: string | null;
  geographic_preference: string;
  booking_mode: "direct" | "approval_required";
}

// ─── Avatar Upload ──────────────────────────────────────────

export async function uploadAvatar(formData: FormData): Promise<string> {
  const { supabase, user } = await getAuthenticatedUser();

  const file = formData.get("file") as File;
  if (!file) throw new Error("No file provided");

  const ext = file.name.split(".").pop()?.toLowerCase() || "jpg";
  const path = `${user.id}/avatar.${ext}`;

  // Upload (upsert to overwrite existing)
  const { error: uploadError } = await supabase.storage
    .from("avatars")
    .upload(path, file, { upsert: true });

  if (uploadError) throw new Error(uploadError.message);

  // Get public URL
  const { data } = supabase.storage.from("avatars").getPublicUrl(path);
  const avatarUrl = `${data.publicUrl}?t=${Date.now()}`;

  // Update profile
  await supabase
    .from("profiles")
    .update({ avatar_url: avatarUrl })
    .eq("id", user.id);

  return avatarUrl;
}

export async function getGuideSettings(): Promise<GuideData | null> {
  const { supabase, user } = await getAuthenticatedUser();

  const { data, error } = await supabase
    .from("guides")
    .select("*")
    .eq("id", user.id)
    .single();

  if (error || !data) return null;
  return data as GuideData;
}

export async function saveGuideSettings(
  settings: Omit<GuideData, "id">
): Promise<void> {
  const { supabase, user } = await getAuthenticatedUser();

  const { error } = await supabase.from("guides").upsert(
    {
      id: user.id,
      ...settings,
    },
    { onConflict: "id" }
  );

  if (error) throw new Error(error.message);

  // If guide is becoming active, update profile role
  if (settings.status === "active") {
    await supabase
      .from("profiles")
      .update({ role: "guide" })
      .eq("id", user.id);
  }
}
