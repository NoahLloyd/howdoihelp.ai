interface Entry {
  count: number;
  resetAt: number;
}

interface Bucket {
  store: Map<string, Entry>;
  lastCleanup: number;
  windowMs: number;
  maxRequests: number;
}

const buckets = new Map<string, Bucket>();

function getBucket(name: string, windowMs: number, maxRequests: number): Bucket {
  let b = buckets.get(name);
  if (!b) {
    b = { store: new Map(), lastCleanup: Date.now(), windowMs, maxRequests };
    buckets.set(name, b);
  }
  return b;
}

function cleanup(b: Bucket) {
  const now = Date.now();
  if (now - b.lastCleanup < 300_000) return;
  b.lastCleanup = now;
  for (const [key, entry] of b.store) {
    if (entry.resetAt < now) b.store.delete(key);
  }
}

export interface RateLimitResult {
  allowed: boolean;
  limit: number;
  remaining: number;
  resetAt: number;
}

export interface RateLimitOptions {
  bucket?: string;
  windowMs?: number;
  maxRequests?: number;
}

export function checkRateLimit(ip: string, opts: RateLimitOptions = {}): RateLimitResult {
  const bucketName = opts.bucket ?? "default";
  const windowMs = opts.windowMs ?? 60_000;
  const maxRequests = opts.maxRequests ?? 100;
  const b = getBucket(bucketName, windowMs, maxRequests);
  cleanup(b);

  const now = Date.now();
  let entry = b.store.get(ip);

  if (!entry || entry.resetAt < now) {
    entry = { count: 0, resetAt: now + windowMs };
    b.store.set(ip, entry);
  }

  entry.count++;

  return {
    allowed: entry.count <= maxRequests,
    limit: maxRequests,
    remaining: Math.max(0, maxRequests - entry.count),
    resetAt: entry.resetAt,
  };
}
