/**
 * Reusable skeleton primitives and composite layouts.
 *
 * All skeleton blocks use `shimmer-bg` (from tw-shimmer) over `bg-card` so
 * they pick up the same polished shimmer used elsewhere in the app.
 */

/** A single rectangular skeleton block. */
export function SkeletonBox({ className }: { className?: string }) {
  return <div className={`shimmer-bg bg-border/60 rounded ${className ?? ""}`} />;
}

/**
 * Full-page skeleton for the Browse funnel (`/browse`). Mirrors the real
 * layout — heading, three path pills, description line, tabs, search bar,
 * and a stack of card placeholders — so the layout doesn't jump when the
 * real content hydrates in.
 */
export function BrowseSkeleton() {
  return (
    <main
      className="shimmer-container min-h-dvh px-6 py-10"
      aria-busy="true"
      aria-label="Loading resources"
    >
      <div className="mx-auto w-full max-w-lg">
        {/* h1 placeholder */}
        <SkeletonBox className="h-10 w-3/4" />

        {/* Path pills */}
        <div className="mt-6 flex gap-2">
          <SkeletonBox className="h-10 w-28 rounded-full" />
          <SkeletonBox className="h-10 w-24 rounded-full" />
          <SkeletonBox className="h-10 w-28 rounded-full" />
        </div>

        {/* Description */}
        <SkeletonBox className="mt-5 h-4 w-1/2" />

        {/* Sub-tabs */}
        <div className="mt-4 flex gap-4 border-b border-border/40 pb-1">
          <SkeletonBox className="h-6 w-20" />
          <SkeletonBox className="h-6 w-24" />
          <SkeletonBox className="h-6 w-20" />
        </div>

        {/* Search bar */}
        <SkeletonBox className="mt-4 h-11 w-full rounded-xl" />

        {/* Card stack */}
        <div className="mt-6 flex flex-col gap-3">
          {[0, 1, 2, 3].map((i) => (
            <SkeletonCard key={i} />
          ))}
        </div>
      </div>
    </main>
  );
}

/**
 * Skeleton shaped like a ResourceCard — org+minutes pill row, title line,
 * two-line description. Used in BrowseSkeleton and on the branded pages.
 */
export function SkeletonCard() {
  return (
    <div className="rounded-xl border border-border bg-card p-4">
      <div className="flex items-center gap-2">
        <SkeletonBox className="h-4 w-4 rounded-full" />
        <SkeletonBox className="h-3 w-24" />
        <SkeletonBox className="h-5 w-12 rounded-full" />
      </div>
      <SkeletonBox className="mt-3 h-5 w-4/5" />
      <SkeletonBox className="mt-2 h-3 w-full" />
      <SkeletonBox className="mt-1.5 h-3 w-2/3" />
    </div>
  );
}

/**
 * Skeleton for the admin hub (`/admin`) — a grid of category cards plus a
 * small list of "other resources" below.
 */
export function AdminHubSkeleton() {
  return (
    <div
      className="shimmer-container min-h-dvh bg-background px-6 py-10 max-w-4xl mx-auto"
      aria-busy="true"
      aria-label="Loading admin"
    >
      {/* Header */}
      <div className="mb-10">
        <SkeletonBox className="h-7 w-52" />
        <SkeletonBox className="mt-2 h-3.5 w-40" />
      </div>

      {/* Category cards */}
      <div className="grid grid-cols-2 gap-3 mb-12">
        {[0, 1, 2, 3, 4, 5].map((i) => (
          <div key={i} className="rounded-xl bg-card border border-border p-5">
            <div className="flex items-start justify-between mb-3">
              <SkeletonBox className="h-6 w-6 rounded" />
              <SkeletonBox className="h-6 w-6" />
            </div>
            <SkeletonBox className="h-4 w-24" />
            <SkeletonBox className="mt-2 h-3 w-full" />
            <SkeletonBox className="mt-1 h-3 w-3/4" />
            <SkeletonBox className="mt-3 h-3 w-20" />
          </div>
        ))}
      </div>

      {/* Other resources header */}
      <SkeletonBox className="h-5 w-32 mb-4" />

      {/* List rows */}
      <div className="flex flex-col gap-1">
        {[0, 1, 2, 3, 4].map((i) => (
          <div key={i} className="flex items-center gap-3 p-3.5 rounded-lg bg-card">
            <SkeletonBox className="h-[18px] w-8 rounded-full shrink-0" />
            <div className="flex-1">
              <SkeletonBox className="h-4 w-2/3" />
              <SkeletonBox className="mt-1.5 h-3 w-1/2" />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

/**
 * Skeleton for admin category pages (`/admin/events`, `/admin/programs`,
 * etc.). A header row, a few section labels, and a list of card rows.
 */
export function AdminCategorySkeleton() {
  return (
    <div
      className="shimmer-container min-h-dvh bg-background px-6 py-8 max-w-4xl mx-auto"
      aria-busy="true"
      aria-label="Loading category"
    >
      <SkeletonBox className="h-3 w-28 mb-6" />

      {/* Header */}
      <div className="flex items-start justify-between mb-8">
        <div className="flex-1">
          <SkeletonBox className="h-7 w-48" />
          <SkeletonBox className="mt-2 h-3.5 w-64" />
          <SkeletonBox className="mt-2 h-3 w-40" />
        </div>
        <SkeletonBox className="h-8 w-24 rounded-md shrink-0" />
      </div>

      {/* Section label */}
      <SkeletonBox className="h-4 w-40 mb-3" />

      {/* List rows */}
      <div className="flex flex-col gap-1 mb-8">
        {[0, 1, 2, 3, 4, 5].map((i) => (
          <div key={i} className="flex items-center gap-3 p-3.5 rounded-lg bg-card">
            <SkeletonBox className="h-[18px] w-8 rounded-full shrink-0" />
            <div className="flex-1">
              <SkeletonBox className="h-4 w-2/3" />
              <SkeletonBox className="mt-1.5 h-3 w-1/2" />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

/**
 * Skeleton for the pipeline-style admin pages (communities, events,
 * programs). Header row, tabs, filter row, then a table of rows.
 */
export function AdminPipelineSkeleton() {
  return (
    <div
      className="shimmer-container min-h-dvh bg-background p-6 max-w-7xl mx-auto"
      aria-busy="true"
      aria-label="Loading pipeline"
    >
      {/* Header */}
      <SkeletonBox className="h-3 w-24 mb-4" />
      <div className="flex items-center justify-between mb-6">
        <SkeletonBox className="h-7 w-64" />
        <SkeletonBox className="h-10 w-36 rounded-md" />
      </div>

      {/* Tabs row */}
      <div className="flex items-center gap-2 mb-6">
        <SkeletonBox className="h-9 w-40 rounded-md" />
        <SkeletonBox className="h-9 w-32 rounded-md" />
      </div>

      {/* Filter card */}
      <div className="rounded-xl border border-border bg-card p-4 mb-6">
        <div className="flex gap-4">
          <SkeletonBox className="h-9 flex-1 rounded-lg" />
          <SkeletonBox className="h-9 w-32 rounded-lg" />
          <SkeletonBox className="h-9 w-32 rounded-lg" />
        </div>
      </div>

      {/* Table rows */}
      <div className="rounded-xl border border-border bg-card overflow-hidden">
        {[0, 1, 2, 3, 4, 5, 6].map((i) => (
          <div
            key={i}
            className={`flex items-center gap-4 p-4 ${
              i === 0 ? "" : "border-t border-border/50"
            }`}
          >
            <SkeletonBox className="h-4 w-4 rounded shrink-0" />
            <div className="flex-1">
              <SkeletonBox className="h-4 w-3/5" />
              <SkeletonBox className="mt-1.5 h-3 w-2/5" />
            </div>
            <SkeletonBox className="h-5 w-16 rounded-full shrink-0" />
            <SkeletonBox className="h-5 w-16 rounded-full shrink-0" />
          </div>
        ))}
      </div>
    </div>
  );
}

/**
 * Compact centered skeleton for small standalone admin pages that just
 * render a table/summary (`/admin/costs`, etc.).
 */
export function AdminSimpleSkeleton() {
  return (
    <div
      className="shimmer-container min-h-dvh bg-background px-6 py-10 max-w-4xl mx-auto"
      aria-busy="true"
      aria-label="Loading"
    >
      <SkeletonBox className="h-7 w-48 mb-2" />
      <SkeletonBox className="h-3.5 w-56 mb-8" />

      <div className="flex flex-col gap-3">
        {[0, 1, 2, 3].map((i) => (
          <SkeletonBox key={i} className="h-16 w-full rounded-lg" />
        ))}
      </div>
    </div>
  );
}
