"use server";

import { createAuthClient } from "@/lib/supabase-server";
import type { CreatorFlowStep, CreatorPageData } from "@/types";

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

// ─── Creator Pages ──────────────────────────────────────────

const RESERVED_SLUGS = new Set([
  "dashboard", "admin", "auth", "api", "about", "guides", "events",
  "communities", "programs", "letters", "submit", "developers",
  "positioned", "profile", "browse", "questions",
]);

export async function getCreatorPage(): Promise<CreatorPageData | null> {
  const { supabase, user } = await getAuthenticatedUser();

  const { data, error } = await supabase
    .from("creator_pages")
    .select("*")
    .eq("creator_id", user.id)
    .single();

  if (error || !data) return null;
  return data as CreatorPageData;
}

export async function checkSlugAvailable(slug: string): Promise<{ available: boolean; reason?: string }> {
  if (!slug || slug.length < 2) {
    return { available: false, reason: "Slug must be at least 2 characters" };
  }
  if (slug.length > 40) {
    return { available: false, reason: "Slug must be 40 characters or less" };
  }
  if (!/^[a-z0-9]([a-z0-9-]*[a-z0-9])?$/.test(slug)) {
    return { available: false, reason: "Only lowercase letters, numbers, and hyphens allowed" };
  }
  if (RESERVED_SLUGS.has(slug)) {
    return { available: false, reason: "This URL is reserved" };
  }

  const { supabase, user } = await getAuthenticatedUser();

  const { data } = await supabase
    .from("creator_pages")
    .select("id, creator_id")
    .eq("slug", slug)
    .single();

  if (data && data.creator_id !== user.id) {
    return { available: false, reason: "This URL is already taken" };
  }

  return { available: true };
}

export async function saveCreatorPage(page: {
  slug: string;
  status: "draft" | "active" | "paused";
  flow_config: CreatorFlowStep[];
  excluded_resources: string[];
  boosted_resources: string[];
  resource_weights: Record<string, number>;
}): Promise<void> {
  const { supabase, user } = await getAuthenticatedUser();

  // Check if user already has a creator page
  const { data: existing } = await supabase
    .from("creator_pages")
    .select("id")
    .eq("creator_id", user.id)
    .single();

  if (existing) {
    const { error } = await supabase
      .from("creator_pages")
      .update({
        slug: page.slug,
        status: page.status,
        flow_config: page.flow_config,
        excluded_resources: page.excluded_resources,
        boosted_resources: page.boosted_resources,
        resource_weights: page.resource_weights,
      })
      .eq("id", existing.id);

    if (error) throw new Error(error.message);
  } else {
    const { error } = await supabase
      .from("creator_pages")
      .insert({
        creator_id: user.id,
        slug: page.slug,
        status: page.status,
        flow_config: page.flow_config,
        excluded_resources: page.excluded_resources,
        boosted_resources: page.boosted_resources,
        resource_weights: page.resource_weights,
      });

    if (error) throw new Error(error.message);
  }

  // Update profile role to creator if going active
  if (page.status === "active") {
    await supabase
      .from("profiles")
      .update({ role: "creator" })
      .eq("id", user.id);
  }
}
