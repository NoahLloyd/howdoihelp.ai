// ─── Variants ───────────────────────────────────────────────

export type Variant = "A" | "B" | "C";

export const VARIANT_NAMES: Record<Variant, string> = {
  A: "Profile",
  B: "Browse",
  C: "Guided",
};

// ─── Questions ──────────────────────────────────────────────

export type TimeCommitment = "minutes" | "hours" | "significant";

export type IntentTag =
  | "understand"
  | "connect"
  | "impact"
  | "do_part";

export interface QuestionOption {
  id: string;
  label: string;
  description?: string;
}

export interface Question {
  id: string;
  question: string;
  subtitle?: string;
  options: QuestionOption[];
  multiSelect?: boolean;
}

// ─── User State ─────────────────────────────────────────────

export interface UserAnswers {
  time: TimeCommitment;
  intent?: IntentTag;
  positioned?: boolean;
  positionType?: PositionTag;
  profileUrl?: string;
  profilePlatform?: ProfilePlatform;
  enrichedProfile?: EnrichedProfile;
  profileText?: string;
}

export interface GeoData {
  country: string;
  countryCode: string;
  city?: string;
  region?: string;
  timezone?: string;
  isAuthoritarian?: boolean;
}

// ─── Resources ──────────────────────────────────────────────

export type ResourceCategory =
  | "events"
  | "programs"
  | "letters"
  | "communities"
  | "other";

export type ResourceStatus = "approved" | "pending" | "rejected";

export interface Resource {
  id: string;
  title: string;
  description: string;
  url: string;
  source_org: string;

  category: ResourceCategory;
  location: string;

  min_minutes: number;

  ev_general: number;
  ev_positioned?: number;
  friction: number;

  enabled: boolean;
  status: ResourceStatus;

  event_date?: string;
  event_type?: string;
  deadline_date?: string;

  created_at: string;
  submitted_by?: string;

  background_tags?: string[];
  position_tags?: string[];

  source?: string;
  source_id?: string;

  verified_at?: string;
  url_status?: string;
  activity_score?: number;
  verification_notes?: string;
}

// ─── Ranking ────────────────────────────────────────────────

export interface ScoredResource {
  resource: Resource;
  score: number;
  matchReasons: string[];
}

export interface LocalCard {
  anchor: ScoredResource;
  extras: ScoredResource[];
  score: number;
}

// ─── Positioned Person ──────────────────────────────────────

export type PositionTag =
  | "ai_tech"
  | "policy_gov"
  | "audience_platform"
  | "donor"
  | "student"
  | "other";

// ─── Profile ────────────────────────────────────────────────

export type ProfilePlatform =
  | "linkedin"
  | "github"
  | "x"
  | "instagram"
  | "facebook"
  | "personal_website"
  | "other";

// ─── Enriched Profile ───────────────────────────────────────

export interface ProfileExperience {
  title: string;
  company: string;
  startDate?: string;
  endDate?: string;
  description?: string;
}

export interface ProfileEducation {
  school: string;
  degree?: string;
  field?: string;
  startYear?: number;
  endYear?: number;
  description?: string;
  activities?: string;
}

export interface ProfileRepo {
  name: string;
  description?: string;
  stars: number;
  language?: string;
}

export interface EnrichedProfile {
  fullName?: string;
  headline?: string;
  currentTitle?: string;
  currentCompany?: string;
  location?: string;
  photo?: string;
  summary?: string;
  skills: string[];
  experience: ProfileExperience[];
  education: ProfileEducation[];
  platform: ProfilePlatform;
  sourceUrl?: string;
  linkedinUrl?: string;
  email?: string;
  repos?: ProfileRepo[];
  followers?: number;
  fetchedAt: string;
}

// ─── Claude Recommendations ─────────────────────────────────

export interface RecommendedResource {
  resourceId: string;
  rank: number;
  description: string;
  title?: string;
}

// ─── API Usage ──────────────────────────────────────────────

export interface ApiUsageEntry {
  id?: number;
  provider: "claude" | "openai" | "github" | "scrape" | "perplexity";
  model?: string;
  endpoint?: string;
  input_tokens?: number;
  output_tokens?: number;
  estimated_cost_usd?: number;
  user_id?: string;
  created_at?: string;
}
