import { runAisafetySync } from "@scripts/lib/aisafety-sync";
import { getCronAuthFailure } from "@/lib/cron-auth";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 60;

/** Refresh the normalized Supabase cache from AISafety.com's public API. */
export async function GET(request: Request) {
  const authFailure = getCronAuthFailure(request);
  if (authFailure) {
    return Response.json(
      { error: authFailure.error },
      { status: authFailure.status },
    );
  }

  try {
    const plan = await runAisafetySync();
    return Response.json({
      ok: true,
      fetched: plan.fetchedCounts,
      summary: plan.summary,
      warnings: plan.warnings.length,
    });
  } catch (error) {
    console.error(
      "[sync-aisafety] Cron failed:",
      error instanceof Error ? error.message : error,
    );
    return Response.json({ error: "AISafety sync failed" }, { status: 500 });
  }
}
