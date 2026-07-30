import { createHash } from "node:crypto";
import type { ResourceCategory } from "../../src/types";

export const AISAFETY_API_BASE = "https://aisafety.com/api/v1";

export const AISAFETY_COLLECTIONS = ["communities", "events", "training"] as const;
export type AisafetyCollection = (typeof AISAFETY_COLLECTIONS)[number];

export const COLLECTION_TO_CATEGORY: Record<AisafetyCollection, ResourceCategory> = {
  communities: "communities",
  events: "events",
  training: "programs",
};

const DEFAULT_MIN_HEALTHY_COUNTS: Record<AisafetyCollection, number> = {
  communities: 100,
  events: 5,
  training: 20,
};

const COLLECTION_ENV_KEYS: Record<AisafetyCollection, string> = {
  communities: "AISAFETY_MIN_COMMUNITIES",
  events: "AISAFETY_MIN_EVENTS",
  training: "AISAFETY_MIN_TRAINING",
};

const COLLECTION_ORDER: Record<AisafetyCollection, number> = {
  communities: 0,
  events: 1,
  training: 2,
};

export const LEGACY_GENERATED_SOURCES = new Set([
  "aisafety",
  "ea-forum",
  "lesswrong",
  "pauseai",
  "eventbrite",
  "luma",
  "meetup",
  "bluedot",
]);

const PRESERVED_ON_MATCH = [
  "id",
  "created_at",
  "ev_general",
  "ev_positioned",
  "friction",
  "min_minutes",
  "background_tags",
  "position_tags",
] as const;

const CORE_COMPARE_FIELDS = [
  "title",
  "description",
  "url",
  "category",
  "location",
  "source_org",
  "event_date",
  "event_end_date",
  "deadline_date",
  "event_type",
  "event_time",
  "is_online",
  "activity_score",
  "enabled",
  "status",
  "source",
  "source_id",
  "url_status",
  "verification_notes",
  "upstream_managed",
  "upstream_collection",
  "upstream_missing_count",
  "upstream_payload_hash",
] as const;

export interface AisafetyApiRecord {
  id: string;
  payload: Record<string, unknown>;
}

export interface AisafetyApiResponse {
  collection: AisafetyCollection;
  data: AisafetyApiRecord[];
  meta: Record<string, unknown> & { count: number };
}

export interface AisafetyFetchOptions {
  baseUrl?: string;
  timeoutMs?: number;
  minHealthyCounts?: Partial<Record<AisafetyCollection, number>>;
}

export interface ExistingResource {
  id: string;
  title: string;
  description?: string | null;
  url: string;
  category: ResourceCategory;
  source_org?: string | null;
  location?: string | null;
  min_minutes?: number | null;
  ev_general?: number | null;
  ev_positioned?: number | null;
  friction?: number | null;
  enabled?: boolean | null;
  status?: string | null;
  event_date?: string | null;
  deadline_date?: string | null;
  event_type?: string | null;
  background_tags?: string[] | null;
  position_tags?: string[] | null;
  source?: string | null;
  source_id?: string | null;
  created_at?: string | null;
  submitted_by?: string | null;
  event_end_date?: string | null;
  event_time?: string | null;
  is_online?: boolean | null;
  verified_at?: string | null;
  url_status?: string | null;
  activity_score?: number | null;
  verification_notes?: string | null;
  upstream_managed?: boolean | null;
  upstream_collection?: AisafetyCollection | string | null;
  upstream_last_seen_at?: string | null;
  upstream_missing_count?: number | null;
  upstream_payload_hash?: string | null;
}

export type ResourceWriteRow = Omit<Partial<ExistingResource>, "category"> & {
  id: string;
  title: string;
  description: string;
  url: string;
  source_org: string;
  category: ResourceCategory;
  location: string;
  min_minutes: number;
  ev_general: number;
  ev_positioned: number | null;
  friction: number;
  enabled: boolean;
  status: "approved";
  created_at: string;
  background_tags: string[];
  position_tags: string[];
  source: "aisafety";
  source_id: string;
  upstream_managed: boolean;
  upstream_collection: AisafetyCollection;
  upstream_last_seen_at: string;
  upstream_missing_count: number;
  upstream_payload_hash: string;
};

export interface MappedAisafetyResource {
  collection: AisafetyCollection;
  record: AisafetyApiRecord;
  canonicalSourceId: string;
  legacySourceId: string;
  payloadHash: string;
  row: Omit<ResourceWriteRow, "id" | "created_at" | "upstream_last_seen_at">;
}

export type MatchReason =
  | "canonical-source-id"
  | "legacy-aisafety-record-id"
  | "normalized-url"
  | "normalized-title-category";

export interface PlannedSeenRow {
  mapped: MappedAisafetyResource;
  row: ResourceWriteRow;
  existing?: ExistingResource;
  matchReason?: MatchReason;
  changed: boolean;
  takeover: boolean;
}

export interface PlannedMissingRow {
  existing: ExistingResource;
  nextMissingCount: number;
  willDisable: boolean;
  update: Record<string, unknown>;
}

export interface PlannedRetirementRow {
  existing: ExistingResource;
  update: Record<string, unknown>;
}

export interface AisafetySyncPlan {
  selectedCollections: AisafetyCollection[];
  fetchedCounts: Record<AisafetyCollection, number>;
  seen: PlannedSeenRow[];
  missing: PlannedMissingRow[];
  retirements: PlannedRetirementRow[];
  warnings: string[];
  summary: {
    created: number;
    updated: number;
    unchanged: number;
    missing: number;
    disabledMissing: number;
    retiredLegacy: number;
    takeovers: number;
  };
}

export interface PlanAisafetySyncOptions {
  collections: AisafetyCollection[];
  responses: AisafetyApiResponse[];
  existingResources: ExistingResource[];
  now?: Date;
  retireLegacy?: boolean;
}

export function assertAisafetyCollection(value: string): AisafetyCollection {
  if ((AISAFETY_COLLECTIONS as readonly string[]).includes(value)) {
    return value as AisafetyCollection;
  }
  throw new Error(
    `Unsupported AISafety collection "${value}". Supported collections: ${AISAFETY_COLLECTIONS.join(", ")}.`,
  );
}

export function getMinimumHealthyCount(
  collection: AisafetyCollection,
  overrides: Partial<Record<AisafetyCollection, number>> = {},
): number {
  if (overrides[collection] != null) return Number(overrides[collection]);
  const envValue = process.env[COLLECTION_ENV_KEYS[collection]];
  if (envValue != null && envValue.trim() !== "") {
    const parsed = Number(envValue);
    if (!Number.isFinite(parsed) || parsed < 0) {
      throw new Error(`${COLLECTION_ENV_KEYS[collection]} must be a non-negative number.`);
    }
    return parsed;
  }
  return DEFAULT_MIN_HEALTHY_COUNTS[collection];
}

export async function fetchAisafetyCollection(
  collection: AisafetyCollection,
  options: AisafetyFetchOptions = {},
): Promise<AisafetyApiResponse> {
  const baseUrl = (options.baseUrl || AISAFETY_API_BASE).replace(/\/+$/, "");
  const timeoutMs = options.timeoutMs ?? Number(process.env.AISAFETY_API_TIMEOUT_MS || 20_000);
  if (!Number.isFinite(timeoutMs) || timeoutMs <= 0) {
    throw new Error("AISAFETY_API_TIMEOUT_MS must be a positive number.");
  }

  const url = `${baseUrl}/${collection}`;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  let response: Response;

  try {
    response = await fetch(url, {
      headers: {
        Accept: "application/json",
        "User-Agent": "howdoihelp.ai AISafety mirror (https://howdoihelp.ai)",
      },
      signal: controller.signal,
    });
  } catch (err) {
    const detail = err instanceof Error ? err.message : String(err);
    throw new Error(
      `AISafety API request failed for ${collection}: ${detail}. Check network/DNS access and retry before writing to Supabase.`,
    );
  } finally {
    clearTimeout(timeout);
  }

  if (!response.ok) {
    throw new Error(
      `AISafety API returned HTTP ${response.status} for ${collection}. Refusing to write stale or partial data.`,
    );
  }

  let json: unknown;
  try {
    json = await response.json();
  } catch (err) {
    const detail = err instanceof Error ? err.message : String(err);
    throw new Error(`AISafety API returned invalid JSON for ${collection}: ${detail}.`);
  }

  return validateAisafetyEnvelope(collection, json, {
    minimumCount: getMinimumHealthyCount(collection, options.minHealthyCounts),
  });
}

export async function fetchAisafetyCollections(
  collections: AisafetyCollection[],
  options: AisafetyFetchOptions = {},
): Promise<AisafetyApiResponse[]> {
  const selected = uniqueCollections(collections);
  const responses = await Promise.all(selected.map((collection) => fetchAisafetyCollection(collection, options)));
  return responses;
}

export function validateAisafetyEnvelope(
  collection: AisafetyCollection,
  json: unknown,
  options: { minimumCount?: number } = {},
): AisafetyApiResponse {
  if (!isRecord(json)) {
    throw new Error(`AISafety ${collection} response must be a JSON object with data and meta.`);
  }

  if (!Array.isArray(json.data)) {
    throw new Error(`AISafety ${collection} response is missing a data array.`);
  }

  if (!isRecord(json.meta)) {
    throw new Error(`AISafety ${collection} response is missing a meta object.`);
  }

  const count = Number(json.meta.count);
  if (!Number.isInteger(count)) {
    throw new Error(`AISafety ${collection} response meta.count must be an integer.`);
  }

  if (count !== json.data.length) {
    throw new Error(
      `AISafety ${collection} response meta.count (${count}) does not match data.length (${json.data.length}).`,
    );
  }

  const minimumCount = options.minimumCount ?? DEFAULT_MIN_HEALTHY_COUNTS[collection];
  if (json.data.length < minimumCount) {
    throw new Error(
      `AISafety ${collection} response has ${json.data.length} records, below the healthy minimum of ${minimumCount}. ` +
        `Set ${COLLECTION_ENV_KEYS[collection]} only after confirming the upstream change is intentional.`,
    );
  }

  const seenIds = new Set<string>();
  const data = json.data.map((raw, index) => {
    if (!isRecord(raw)) {
      throw new Error(`AISafety ${collection} record at index ${index} must be an object.`);
    }

    const id = coerceString(raw.id).trim();
    if (!id) {
      throw new Error(`AISafety ${collection} record at index ${index} has an empty id.`);
    }
    if (seenIds.has(id)) {
      throw new Error(`AISafety ${collection} response contains duplicate record id "${id}".`);
    }
    seenIds.add(id);

    validateRequiredMappedFields(collection, id, raw);
    return { id, payload: raw };
  });

  return {
    collection,
    data,
    meta: { ...json.meta, count },
  };
}

function validateRequiredMappedFields(
  collection: AisafetyCollection,
  id: string,
  raw: Record<string, unknown>,
): void {
  const name = pickString(raw, nameKeys(collection));
  const rawUrl = pickString(raw, urlKeys(collection));
  const url = pickUrl(raw, urlKeys(collection));

  if (!name) {
    throw new Error(`AISafety ${collection} record "${id}" is missing a required name/title field.`);
  }
  // AISafety currently uses "#" for a small number of curated, non-actionable
  // invite-only communities. Keep those records in the mirror but map them to
  // a disabled provider-directory fallback below. Other missing URLs remain a
  // hard contract failure.
  if (!url && !(collection === "communities" && rawUrl === "#")) {
    const keyHint = collection === "communities" ? "joinLink" : "url";
    throw new Error(`AISafety ${collection} record "${id}" is missing a required ${keyHint} field.`);
  }
}

export function mapAisafetyRecord(
  collection: AisafetyCollection,
  record: AisafetyApiRecord,
  now: Date = new Date(),
): MappedAisafetyResource {
  if (collection === "communities") return mapCommunity(record, now);
  if (collection === "events") return mapEvent(record, now);
  return mapTraining(record, now);
}

export function mapAisafetyResponses(
  responses: AisafetyApiResponse[],
  now: Date = new Date(),
): MappedAisafetyResource[] {
  return responses
    .flatMap((response) => response.data.map((record) => mapAisafetyRecord(response.collection, record, now)))
    .sort((a, b) => {
      const byCollection = COLLECTION_ORDER[a.collection] - COLLECTION_ORDER[b.collection];
      if (byCollection !== 0) return byCollection;
      const byTitle = a.row.title.localeCompare(b.row.title);
      if (byTitle !== 0) return byTitle;
      return a.record.id.localeCompare(b.record.id);
    });
}

function mapCommunity(record: AisafetyApiRecord, now: Date): MappedAisafetyResource {
  const raw = record.payload;
  const name = requiredString(pickString(raw, nameKeys("communities")), "community name");
  const rawJoinLink = requiredString(pickString(raw, urlKeys("communities")), "community joinLink");
  const hasActionableLink = rawJoinLink !== "#";
  const url = hasActionableLink
    ? requiredString(pickUrl(raw, urlKeys("communities")), "community joinLink")
    : "https://aisafety.com/communities";
  const typeValues = pickStringArray(raw, [
    "type",
    "types",
    "platform",
    "platforms",
    "communityType",
    "Community type",
    "Platform",
  ]);
  const typeText = typeValues.join(", ");
  const location = pickString(raw, ["location", "Location", "city", "country"]) || (containsAny(typeValues, ["online"]) ? "Online" : "Global");
  const isOnline = containsAny(typeValues, ["online"]) || normalizedText(location) === "online";
  const activityLabel = pickString(raw, [
    "activity",
    "activityLevel",
    "activity_level",
    "Activity level",
    "Activity Level",
  ]);
  const activityScore = mapCommunityActivity(activityLabel);
  const focusValues = pickStringArray(raw, ["focus", "Focus", "topics", "topic", "tags"]);
  const { backgroundTags, positionTags } = tagsFromFocus([...focusValues, ...typeValues, name]);
  const description = pickString(raw, ["description", "Description", "summary", "Summary"]) ||
    `AI safety community listed by AISafety.com.`;

  return mapped("communities", record, now, {
    title: name,
    description: truncate(description, 1_000),
    url,
    source_org: name,
    category: "communities",
    location,
    min_minutes: 5,
    ev_general: 0.45,
    ev_positioned: null,
    friction: 0.1,
    enabled: activityScore > 0 && hasActionableLink,
    status: "approved",
    event_date: null,
    event_end_date: null,
    deadline_date: null,
    event_type: typeText || null,
    event_time: null,
    is_online: isOnline,
    activity_score: activityScore,
    background_tags: backgroundTags,
    position_tags: positionTags,
    url_status: "reachable",
    verified_at: now.toISOString(),
    verification_notes: hasActionableLink
      ? `AISafety.com API mirror (${record.id})`
      : `AISafety.com API mirror (${record.id}); disabled because upstream has no actionable join link`,
    source: "aisafety",
    source_id: canonicalSourceId("communities", record.id),
    upstream_managed: true,
    upstream_collection: "communities",
    upstream_missing_count: 0,
    upstream_payload_hash: stablePayloadHash(record.payload),
  });
}

function mapEvent(record: AisafetyApiRecord, now: Date): MappedAisafetyResource {
  const raw = record.payload;
  const name = requiredString(pickString(raw, nameKeys("events")), "event name");
  const url = requiredString(pickUrl(raw, urlKeys("events")), "event url");
  const typeValues = pickStringArray(raw, ["type", "types", "eventType", "Event type", "Format"]);
  const modeValues = pickStringArray(raw, ["mode", "modes", "locationType", "attendanceMode", "Mode"]);
  const startDate = pickDate(raw, ["startDate", "start_date", "startsAt", "date", "Date", "Start date"]);
  const endDate = pickDate(raw, ["endDate", "end_date", "endsAt", "End date"]);
  const deadlineDate = pickDate(raw, [
    "applicationsClose",
    "applications_close",
    "applicationDeadline",
    "application_deadline",
    "deadline",
    "Deadline",
  ]);
  const eventType = firstNonempty(typeValues) || "event";
  const isOnline = containsAny([...modeValues, ...typeValues], ["online", "virtual", "remote"]) ||
    normalizedText(pickString(raw, ["location", "Location", "city", "country"])) === "online";
  const location = pickString(raw, ["location", "Location", "city", "country"]) || (isOnline ? "Online" : "Location TBD");
  const host = pickString(raw, ["host", "hosts", "organizer", "organization", "sourceOrg", "Hosted by"]) || "AISafety.com";
  const description = pickString(raw, ["description", "Description", "summary", "Summary"]) ||
    `AI safety event listed by AISafety.com.`;
  const enabled = isEventStillCurrent(startDate, endDate, now);

  return mapped("events", record, now, {
    title: name,
    description: truncate(description, 1_000),
    url,
    source_org: host,
    category: "events",
    location,
    min_minutes: estimateEventMinutes(eventType, startDate, endDate),
    ev_general: 0.55,
    ev_positioned: null,
    friction: 0.25,
    enabled,
    status: "approved",
    event_date: startDate,
    event_end_date: endDate,
    deadline_date: deadlineDate,
    event_type: eventType,
    event_time: pickString(raw, ["time", "eventTime", "event_time", "Time"]) || null,
    is_online: isOnline,
    activity_score: enabled ? 0.9 : 0,
    background_tags: tagsFromFocus([...typeValues, name]).backgroundTags,
    position_tags: tagsFromFocus([...typeValues, name]).positionTags,
    url_status: "reachable",
    verified_at: now.toISOString(),
    verification_notes: `AISafety.com API mirror (${record.id})`,
    source: "aisafety",
    source_id: canonicalSourceId("events", record.id),
    upstream_managed: true,
    upstream_collection: "events",
    upstream_missing_count: 0,
    upstream_payload_hash: stablePayloadHash(record.payload),
  });
}

function mapTraining(record: AisafetyApiRecord, now: Date): MappedAisafetyResource {
  const raw = record.payload;
  const name = requiredString(pickString(raw, nameKeys("training")), "training name");
  const url = requiredString(pickUrl(raw, urlKeys("training")), "training url");
  const typeValues = pickStringArray(raw, ["type", "types", "trainingType", "courseType", "Format"]);
  const focusValues = pickStringArray(raw, ["focus", "Focus", "topics", "topic", "tags", "tracks", "track"]);
  const modeValues = pickStringArray(raw, ["mode", "modes", "locationType", "attendanceMode", "Mode"]);
  const recurring = isRecurringTraining(raw, typeValues);
  const startDate = recurring ? null : pickDate(raw, ["startDate", "start_date", "startsAt", "date", "Date", "Start date"]);
  const endDate = recurring ? null : pickDate(raw, ["endDate", "end_date", "endsAt", "End date"]);
  const deadlineDate = recurring
    ? null
    : pickDate(raw, [
        "applicationsClose",
        "applications_close",
        "applicationDeadline",
        "application_deadline",
        "deadline",
        "Deadline",
      ]);
  const applicationStatus = pickString(raw, ["applicationStatus", "application_status", "status", "Application status"]);
  const trainingType = firstNonempty(typeValues) || "training";
  const isOnline = containsAny([...modeValues, ...typeValues], ["online", "virtual", "remote", "self-paced"]) ||
    normalizedText(pickString(raw, ["location", "Location", "city", "country"])) === "online";
  const location = pickString(raw, ["location", "Location", "city", "country"]) || (isOnline ? "Online" : "Location TBD");
  const host = pickString(raw, ["host", "hosts", "provider", "organizer", "organization", "sourceOrg", "Hosted by"]) || "AISafety.com";
  const description = pickString(raw, ["description", "Description", "summary", "Summary"]) ||
    `AI safety training listed by AISafety.com.`;
  const enabled = recurring || isScheduledTrainingCurrent(applicationStatus, startDate, endDate, now);
  const tags = tagsFromFocus([...focusValues, ...typeValues, name]);

  return mapped("training", record, now, {
    title: name,
    description: truncate(description, 1_000),
    url,
    source_org: host,
    category: "programs",
    location,
    min_minutes: estimateTrainingMinutes(raw, trainingType),
    ev_general: 0.65,
    ev_positioned: null,
    friction: 0.45,
    enabled,
    status: "approved",
    event_date: startDate,
    event_end_date: endDate,
    deadline_date: deadlineDate,
    event_type: trainingType,
    event_time: pickString(raw, ["time", "eventTime", "event_time", "Time"]) || null,
    is_online: isOnline,
    activity_score: enabled ? 0.9 : 0,
    background_tags: tags.backgroundTags,
    position_tags: tags.positionTags,
    url_status: "reachable",
    verified_at: now.toISOString(),
    verification_notes: `AISafety.com API mirror (${record.id})`,
    source: "aisafety",
    source_id: canonicalSourceId("training", record.id),
    upstream_managed: true,
    upstream_collection: "training",
    upstream_missing_count: 0,
    upstream_payload_hash: stablePayloadHash(record.payload),
  });
}

function mapped(
  collection: AisafetyCollection,
  record: AisafetyApiRecord,
  now: Date,
  row: Omit<ResourceWriteRow, "id" | "created_at" | "upstream_last_seen_at">,
): MappedAisafetyResource {
  return {
    collection,
    record,
    canonicalSourceId: canonicalSourceId(collection, record.id),
    legacySourceId: record.id,
    payloadHash: row.upstream_payload_hash,
    row: {
      ...row,
      verified_at: now.toISOString(),
    },
  };
}

export function planAisafetySync(options: PlanAisafetySyncOptions): AisafetySyncPlan {
  const now = options.now ?? new Date();
  const nowIso = now.toISOString();
  const selectedCollections = uniqueCollections(options.collections);
  const selectedSet = new Set<AisafetyCollection>(selectedCollections);
  const responsesByCollection = new Map(options.responses.map((response) => [response.collection, response]));
  const fetchedCounts = {} as Record<AisafetyCollection, number>;

  for (const collection of selectedCollections) {
    const response = responsesByCollection.get(collection);
    if (!response) {
      throw new Error(`Cannot plan AISafety sync: validated response for ${collection} is missing.`);
    }
    fetchedCounts[collection] = response.data.length;
  }

  const mappedResources = mapAisafetyResponses(
    selectedCollections.map((collection) => responsesByCollection.get(collection)!),
    now,
  );
  const indexes = buildExistingIndexes(options.existingResources);
  const claimedExistingIds = new Set<string>();
  const warnings: string[] = [];
  const seen: PlannedSeenRow[] = [];

  for (const mappedResource of mappedResources) {
    const match = findExistingMatch(mappedResource, indexes, claimedExistingIds, warnings);
    const existing = match?.resource;
    if (existing) claimedExistingIds.add(existing.id);

    const row = materializeRow(mappedResource, existing, nowIso);
    const takeover = Boolean(
      existing &&
        (existing.source !== "aisafety" || existing.source_id !== mappedResource.canonicalSourceId),
    );
    const changed = !existing || takeover || hasCoreChanges(existing, row);

    seen.push({
      mapped: mappedResource,
      row,
      existing,
      matchReason: match?.reason,
      changed,
      takeover,
    });
  }

  const missing = planMissingRows(options.existingResources, selectedSet, claimedExistingIds, nowIso);
  const retirements = options.retireLegacy
    ? planLegacyRetirements(options.existingResources, selectedSet, claimedExistingIds, nowIso)
    : [];

  return {
    selectedCollections,
    fetchedCounts,
    seen,
    missing,
    retirements,
    warnings,
    summary: {
      created: seen.filter((row) => !row.existing).length,
      updated: seen.filter((row) => row.existing && row.changed).length,
      unchanged: seen.filter((row) => row.existing && !row.changed).length,
      missing: missing.length,
      disabledMissing: missing.filter((row) => row.willDisable).length,
      retiredLegacy: retirements.length,
      takeovers: seen.filter((row) => row.takeover).length,
    },
  };
}

function buildExistingIndexes(existingResources: ExistingResource[]) {
  const byCanonical = new Map<string, ExistingResource[]>();
  const byLegacy = new Map<string, ExistingResource[]>();
  const byUrl = new Map<string, ExistingResource[]>();
  const byTitleCategory = new Map<string, ExistingResource[]>();

  for (const resource of [...existingResources].sort(compareExistingResources)) {
    if (resource.source === "aisafety" && resource.source_id) {
      pushMap(byCanonical, resource.source_id, resource);
      if (!resource.source_id.includes(":")) {
        pushMap(byLegacy, resource.source_id, resource);
      }
    }

    if (isTakeoverEligible(resource)) {
      const urlKey = normalizeUrl(resource.url);
      if (urlKey) pushMap(byUrl, `${resource.category}:${urlKey}`, resource);
      const titleKey = normalizeTitle(resource.title);
      if (titleKey) pushMap(byTitleCategory, `${resource.category}:${titleKey}`, resource);
    }
  }

  return { byCanonical, byLegacy, byUrl, byTitleCategory };
}

function findExistingMatch(
  mappedResource: MappedAisafetyResource,
  indexes: ReturnType<typeof buildExistingIndexes>,
  claimedExistingIds: Set<string>,
  warnings: string[],
): { resource: ExistingResource; reason: MatchReason } | null {
  const canonical = firstUnclaimed(indexes.byCanonical.get(mappedResource.canonicalSourceId), claimedExistingIds);
  if (canonical) return { resource: canonical, reason: "canonical-source-id" };

  const legacy = firstUnclaimed(indexes.byLegacy.get(mappedResource.legacySourceId), claimedExistingIds);
  if (legacy) return { resource: legacy, reason: "legacy-aisafety-record-id" };

  const category = mappedResource.row.category;
  const urlKey = normalizeUrl(mappedResource.row.url);
  if (urlKey) {
    const candidates = unclaimed(indexes.byUrl.get(`${category}:${urlKey}`), claimedExistingIds);
    const urlMatch = chooseCandidate(mappedResource, candidates, "url", warnings);
    if (urlMatch) return { resource: urlMatch, reason: "normalized-url" };
  }

  const titleKey = normalizeTitle(mappedResource.row.title);
  if (titleKey) {
    const candidates = unclaimed(indexes.byTitleCategory.get(`${category}:${titleKey}`), claimedExistingIds);
    const titleMatch = chooseCandidate(mappedResource, candidates, "title", warnings);
    if (titleMatch) return { resource: titleMatch, reason: "normalized-title-category" };
  }

  return null;
}

function chooseCandidate(
  mappedResource: MappedAisafetyResource,
  candidates: ExistingResource[],
  matchType: "url" | "title",
  warnings: string[],
): ExistingResource | null {
  if (candidates.length === 0) return null;
  if (candidates.length === 1) return candidates[0];

  const titleKey = normalizeTitle(mappedResource.row.title);
  const sameTitle = candidates.filter((candidate) => normalizeTitle(candidate.title) === titleKey);
  if (sameTitle.length === 1) return sameTitle[0];

  const aisafetyCandidates = candidates.filter((candidate) => candidate.source === "aisafety");
  if (aisafetyCandidates.length === 1) return aisafetyCandidates[0];

  const enabledCandidates = candidates.filter((candidate) => candidate.enabled !== false);
  if (enabledCandidates.length === 1) return enabledCandidates[0];

  // These are generated legacy rows with the same category and normalized URL
  // or title. Reuse one deterministically instead of creating a third
  // duplicate; explicit --retire-legacy can disable the remaining copies.
  const selected = [...candidates].sort(compareExistingResources)[0];

  warnings.push(
    `Ambiguous ${matchType} match for AISafety ${mappedResource.collection}:${mappedResource.record.id} ` +
      `(${mappedResource.row.title}); reusing ${selected.id} deterministically from existing ids: ` +
      `${candidates.map((row) => row.id).join(", ")}.`,
  );
  return selected;
}

function materializeRow(
  mappedResource: MappedAisafetyResource,
  existing: ExistingResource | undefined,
  nowIso: string,
): ResourceWriteRow {
  const generatedId = `aisafety-${mappedResource.collection}-${slugify(mappedResource.record.id)}`;

  return {
    ...mappedResource.row,
    id: existing?.id || generatedId,
    created_at: existing?.created_at || nowIso,
    ev_general: numberOr(existing?.ev_general, mappedResource.row.ev_general),
    ev_positioned: existing?.ev_positioned ?? mappedResource.row.ev_positioned ?? null,
    friction: numberOr(existing?.friction, mappedResource.row.friction),
    min_minutes: Math.round(numberOr(existing?.min_minutes, mappedResource.row.min_minutes)),
    background_tags: stringArrayOr(existing?.background_tags, mappedResource.row.background_tags),
    position_tags: stringArrayOr(existing?.position_tags, mappedResource.row.position_tags),
    upstream_last_seen_at: nowIso,
    upstream_missing_count: 0,
  };
}

function hasCoreChanges(existing: ExistingResource, next: ResourceWriteRow): boolean {
  for (const field of PRESERVED_ON_MATCH) {
    if (field === "id" || field === "created_at") continue;
    if (field in next && !sameValue(existing[field], next[field])) return true;
  }

  for (const field of CORE_COMPARE_FIELDS) {
    if (!sameValue(existing[field], next[field])) return true;
  }

  return false;
}

function planMissingRows(
  existingResources: ExistingResource[],
  selectedCollections: Set<AisafetyCollection>,
  claimedExistingIds: Set<string>,
  nowIso: string,
): PlannedMissingRow[] {
  const missing: PlannedMissingRow[] = [];

  for (const resource of existingResources) {
    if (claimedExistingIds.has(resource.id)) continue;
    if (!resource.upstream_managed) continue;
    if (!isSelectedUpstreamCollection(resource.upstream_collection, selectedCollections)) continue;

    const nextMissingCount = Math.max(0, Number(resource.upstream_missing_count || 0)) + 1;
    const willDisable = nextMissingCount >= 2 && resource.enabled !== false;
    const update: Record<string, unknown> = {
      upstream_missing_count: nextMissingCount,
    };

    if (willDisable) {
      update.enabled = false;
      update.activity_score = 0;
      update.verification_notes = `Disabled after ${nextMissingCount} consecutive healthy AISafety API sync misses at ${nowIso}.`;
    }

    missing.push({ existing: resource, nextMissingCount, willDisable, update });
  }

  return missing.sort((a, b) => compareExistingResources(a.existing, b.existing));
}

function planLegacyRetirements(
  existingResources: ExistingResource[],
  selectedCollections: Set<AisafetyCollection>,
  claimedExistingIds: Set<string>,
  nowIso: string,
): PlannedRetirementRow[] {
  const selectedCategories = new Set(
    [...selectedCollections].map((collection) => COLLECTION_TO_CATEGORY[collection]),
  );

  return existingResources
    .filter((resource) => {
      if (claimedExistingIds.has(resource.id)) return false;
      if (resource.enabled === false) return false;
      if (resource.upstream_managed) return false;
      if (isUserManaged(resource)) return false;
      if (!selectedCategories.has(resource.category)) return false;
      if (!LEGACY_GENERATED_SOURCES.has(String(resource.source || ""))) return false;
      return true;
    })
    .sort(compareExistingResources)
    .map((existing) => ({
      existing,
      update: {
        enabled: false,
        activity_score: 0,
        verification_notes: `Retired unmatched generated legacy row after healthy AISafety API sync at ${nowIso}.`,
      },
    }));
}

export function stablePayloadHash(value: unknown): string {
  return createHash("sha256").update(stableStringify(value)).digest("hex");
}

export function canonicalSourceId(collection: AisafetyCollection, recordId: string): string {
  return `${collection}:${recordId}`;
}

export function normalizeUrl(url: string | null | undefined): string {
  const raw = String(url || "").trim();
  if (!raw) return "";

  try {
    const withProtocol = /^[a-z][a-z0-9+.-]*:\/\//i.test(raw) ? raw : `https://${raw}`;
    const parsed = new URL(withProtocol);
    const host = parsed.hostname.replace(/^www\./i, "").toLowerCase();
    const pathname = parsed.pathname.replace(/\/+$/, "").toLowerCase();
    return `${host}${pathname}`;
  } catch {
    return raw.toLowerCase().replace(/\/+$/, "");
  }
}

export function normalizeTitle(title: string | null | undefined): string {
  return String(title || "")
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .replace(/\s+/g, " ");
}

function nameKeys(collection: AisafetyCollection): string[] {
  if (collection === "training") {
    return ["name", "title", "programName", "courseName", "trainingName", "Name", "Title"];
  }
  return ["name", "title", "eventName", "communityName", "Name", "Title"];
}

function urlKeys(collection: AisafetyCollection): string[] {
  if (collection === "communities") {
    return ["joinLink", "join_link", "url", "link", "website", "Join link", "URL", "Website"];
  }
  return [
    "url",
    "link",
    "website",
    "applicationLink",
    "applyLink",
    "eventLink",
    "trainingLink",
    "URL",
    "Website",
  ];
}

function pickString(raw: Record<string, unknown>, keys: string[]): string | null {
  const value = pickValue(raw, keys);
  return coerceString(value);
}

function pickUrl(raw: Record<string, unknown>, keys: string[]): string | null {
  const value = pickValue(raw, keys);
  const asString = coerceString(value);
  if (!asString) return null;
  const trimmed = asString.trim();
  if (!trimmed || trimmed === "#") return null;
  if (/^(?:mailto|tel):/i.test(trimmed)) return trimmed;
  return /^[a-z][a-z0-9+.-]*:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
}

function pickDate(raw: Record<string, unknown>, keys: string[]): string | null {
  const value = pickValue(raw, keys);
  return coerceDate(value);
}

function pickStringArray(raw: Record<string, unknown>, keys: string[]): string[] {
  return coerceStringArray(pickValue(raw, keys));
}

function pickValue(raw: Record<string, unknown>, keys: string[]): unknown {
  for (const key of keys) {
    if (Object.prototype.hasOwnProperty.call(raw, key)) return raw[key];
  }

  const wanted = new Set(keys.map((key) => key.toLowerCase().replace(/[^a-z0-9]/g, "")));
  for (const [key, value] of Object.entries(raw)) {
    const normalized = key.toLowerCase().replace(/[^a-z0-9]/g, "");
    if (wanted.has(normalized)) return value;
  }

  return undefined;
}

function coerceString(value: unknown): string {
  if (typeof value === "string") return value.trim();
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  if (Array.isArray(value)) return value.map(coerceString).filter(Boolean).join(", ");
  if (isRecord(value)) {
    for (const key of ["url", "href", "label", "name", "title", "value"]) {
      const result = coerceString(value[key]);
      if (result) return result;
    }
  }
  return "";
}

function coerceStringArray(value: unknown): string[] {
  if (value == null) return [];
  if (Array.isArray(value)) {
    return value.map(coerceString).filter(Boolean);
  }
  if (typeof value === "string") {
    return value
      .split(/[,;/|]+/)
      .map((part) => part.trim())
      .filter(Boolean);
  }
  const single = coerceString(value);
  return single ? [single] : [];
}

function coerceDate(value: unknown): string | null {
  const raw = coerceString(value);
  if (!raw) return null;

  const ymd = raw.match(/\b(\d{4})-(\d{2})-(\d{2})\b/);
  if (ymd) return `${ymd[1]}-${ymd[2]}-${ymd[3]}`;

  const dmy = raw.match(/\b(\d{1,2})[/-](\d{1,2})[/-](\d{4})\b/);
  if (dmy) {
    const first = Number(dmy[1]);
    const second = Number(dmy[2]);
    const year = dmy[3];
    const month = first > 12 ? second : first;
    const day = first > 12 ? first : second;
    return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
  }

  const date = new Date(raw);
  if (Number.isNaN(date.getTime())) return null;
  return date.toISOString().slice(0, 10);
}

function mapCommunityActivity(activityLabel: string | null): number {
  const label = normalizedText(activityLabel || "");
  if (!label) return 0.75;
  if (label.includes("inactive")) return 0;
  if (label.includes("semi")) return 0.6;
  if (label.includes("very")) return 1;
  if (label.includes("active")) return 0.85;
  return 0.75;
}

function isEventStillCurrent(startDate: string | null, endDate: string | null, now: Date): boolean {
  const today = todayString(now);
  const expiry = endDate || startDate;
  if (!expiry) return true;
  return expiry >= today;
}

function isScheduledTrainingCurrent(
  applicationStatus: string | null,
  startDate: string | null,
  endDate: string | null,
  now: Date,
): boolean {
  const status = normalizedText(applicationStatus || "");
  if (status === "closed" || status.includes("closed")) return false;
  const expiry = endDate || startDate;
  if (!expiry) return true;
  return expiry >= todayString(now);
}

function isRecurringTraining(raw: Record<string, unknown>, typeValues: string[]): boolean {
  const fields = [
    pickValue(raw, ["recurring", "isRecurring", "is_recurring", "rolling", "selfPaced", "self_paced"]),
    pickValue(raw, ["schedule", "cadence", "applicationStatus", "status"]),
  ];
  if (fields.some((value) => value === true)) return true;
  const text = [...fields.map(coerceString), ...typeValues].join(" ").toLowerCase();
  return /\b(recurring|rolling|self[- ]?paced|ongoing|anytime)\b/.test(text);
}

function estimateEventMinutes(type: string, startDate: string | null, endDate: string | null): number {
  if (startDate && endDate) {
    const days = daysInclusive(startDate, endDate);
    if (days > 1) return Math.min(days, 7) * 8 * 60;
  }

  const label = normalizedText(type);
  if (label.includes("hackathon")) return 8 * 60;
  if (label.includes("conference") || label.includes("retreat")) return 6 * 60;
  if (label.includes("workshop")) return 3 * 60;
  if (label.includes("meetup") || label.includes("talk") || label.includes("webinar")) return 2 * 60;
  return 2 * 60;
}

function estimateTrainingMinutes(raw: Record<string, unknown>, type: string): number {
  const commitment = pickString(raw, ["timeCommitment", "time_commitment", "commitment", "duration", "Duration"]);
  const parsedHours = commitment ? parseHours(commitment) : null;
  if (parsedHours != null) return Math.max(30, Math.round(parsedHours * 60));

  const bucket = normalizedText(pickString(raw, ["lengthBucket", "length_bucket", "length", "Length"]) || "");
  if (bucket.includes("short")) return 3 * 60;
  if (bucket.includes("medium")) return 12 * 60;
  if (bucket.includes("long")) return 40 * 60;

  const label = normalizedText(type);
  if (label.includes("fellowship")) return 40 * 60;
  if (label.includes("bootcamp") || label.includes("intensive")) return 24 * 60;
  if (label.includes("course")) return 12 * 60;
  if (label.includes("reading")) return 8 * 60;
  return 10 * 60;
}

function parseHours(text: string): number | null {
  const lower = text.toLowerCase();
  const hourMatches = [...lower.matchAll(/(\d+(?:\.\d+)?)\s*(?:h|hr|hrs|hour|hours)\b/g)];
  const weekMatch = lower.match(/(\d+(?:\.\d+)?)\s*(?:week|weeks)\b/);
  if (hourMatches.length === 0) return null;
  const hours = Math.max(...hourMatches.map((match) => Number(match[1])).filter(Number.isFinite));
  if (!Number.isFinite(hours)) return null;
  if (/\bper week\b|\/\s*week|\bweekly\b/.test(lower) && weekMatch) {
    return hours * Number(weekMatch[1]);
  }
  return hours;
}

function daysInclusive(startDate: string, endDate: string): number {
  const start = Date.parse(`${startDate}T00:00:00.000Z`);
  const end = Date.parse(`${endDate}T00:00:00.000Z`);
  if (!Number.isFinite(start) || !Number.isFinite(end) || end < start) return 1;
  return Math.floor((end - start) / 86_400_000) + 1;
}

function tagsFromFocus(values: string[]): { backgroundTags: string[]; positionTags: string[] } {
  const text = normalizedText(values.join(" "));
  const backgroundTags = new Set<string>();
  const positionTags = new Set<string>();

  if (/\b(technical|alignment|mechanistic|interpretability|eval|engineering|ml|research)\b/.test(text)) {
    backgroundTags.add("technical");
    positionTags.add("ai_tech");
  }
  if (/\b(policy|governance|law|regulation|government)\b/.test(text)) {
    backgroundTags.add("policy");
    positionTags.add("policy_gov");
  }
  if (/\b(strategy|forecast|macrostrategy)\b/.test(text)) {
    backgroundTags.add("strategy");
  }
  if (/\b(communication|outreach|community|advocacy|media)\b/.test(text)) {
    backgroundTags.add("communications");
    positionTags.add("audience_platform");
  }
  if (/\b(student|university|campus)\b/.test(text)) {
    positionTags.add("student");
  }

  return {
    backgroundTags: [...backgroundTags].sort(),
    positionTags: [...positionTags].sort(),
  };
}

function isSelectedUpstreamCollection(
  value: ExistingResource["upstream_collection"],
  selectedCollections: Set<AisafetyCollection>,
): boolean {
  return AISAFETY_COLLECTIONS.some((collection) => value === collection && selectedCollections.has(collection));
}

function isTakeoverEligible(resource: ExistingResource): boolean {
  return !isUserManaged(resource);
}

function isUserManaged(resource: ExistingResource): boolean {
  const source = String(resource.source || "").toLowerCase();
  return !source || source === "manual" || source === "submission" || Boolean(resource.submitted_by);
}

function compareExistingResources(a: ExistingResource, b: ExistingResource): number {
  const byCategory = String(a.category).localeCompare(String(b.category));
  if (byCategory !== 0) return byCategory;
  return a.id.localeCompare(b.id);
}

function sameValue(a: unknown, b: unknown): boolean {
  const normalizedA = normalizeComparable(a);
  const normalizedB = normalizeComparable(b);
  return JSON.stringify(normalizedA) === JSON.stringify(normalizedB);
}

function normalizeComparable(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(normalizeComparable).sort();
  if (value == null || value === "") return null;
  if (typeof value === "number") return Number(value.toFixed(6));
  return value;
}

function stringArrayOr(value: unknown, fallback: string[]): string[] {
  const arr = coerceStringArray(value);
  return arr.length ? arr : fallback;
}

function numberOr(value: unknown, fallback: number): number {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function uniqueCollections(collections: AisafetyCollection[]): AisafetyCollection[] {
  const seen = new Set<AisafetyCollection>();
  const selected: AisafetyCollection[] = [];
  for (const collection of collections) {
    if (!seen.has(collection)) {
      seen.add(collection);
      selected.push(collection);
    }
  }
  return selected.length ? selected : [...AISAFETY_COLLECTIONS];
}

function pushMap<K, V>(map: Map<K, V[]>, key: K, value: V): void {
  const values = map.get(key) || [];
  values.push(value);
  map.set(key, values);
}

function firstUnclaimed(
  resources: ExistingResource[] | undefined,
  claimedExistingIds: Set<string>,
): ExistingResource | null {
  return unclaimed(resources, claimedExistingIds)[0] || null;
}

function unclaimed(
  resources: ExistingResource[] | undefined,
  claimedExistingIds: Set<string>,
): ExistingResource[] {
  return (resources || []).filter((resource) => !claimedExistingIds.has(resource.id));
}

function stableStringify(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(",")}]`;
  if (isRecord(value)) {
    return `{${Object.keys(value)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${stableStringify(value[key])}`)
      .join(",")}}`;
  }
  return JSON.stringify(value);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function requiredString(value: string | null, label: string): string {
  if (!value) throw new Error(`Missing required AISafety ${label}.`);
  return value;
}

function normalizedText(value: string | null | undefined): string {
  return String(value || "").toLowerCase();
}

function firstNonempty(values: string[]): string | null {
  return values.find((value) => value.trim()) || null;
}

function containsAny(values: string[], needles: string[]): boolean {
  const text = values.join(" ").toLowerCase();
  return needles.some((needle) => text.includes(needle));
}

function todayString(now: Date): string {
  return now.toISOString().slice(0, 10);
}

function truncate(text: string, max: number): string {
  return text.length > max ? `${text.slice(0, max - 1).trim()}...` : text;
}

function slugify(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80) || stablePayloadHash(value).slice(0, 12);
}
