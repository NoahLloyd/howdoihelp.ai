import { cookies } from "next/headers";

// Gatherers
import { run as runGatherAisafety } from "@scripts/gatherers/gather-aisafety";
import { run as runGatherEaLesswrong } from "@scripts/gatherers/gather-ea-lesswrong";
import { run as runGatherEventbrite } from "@scripts/gatherers/gather-eventbrite";
import { run as runGatherLuma } from "@scripts/gatherers/gather-luma";
import { run as runGatherMeetup } from "@scripts/gatherers/gather-meetup";
import { run as runGatherBluedot } from "@scripts/gatherers/gather-bluedot";
import { assertAisafetyCollection, type AisafetyCollection } from "@scripts/lib/aisafety-api";

// Evaluators
import { run as runEvaluateEvent } from "@scripts/evaluate-event";
import { run as runEvaluateCommunity } from "@scripts/evaluate-community";

// Orchestrators
import { run as runSyncAisafety } from "@scripts/sync-aisafety";
import { run as runSyncAll } from "@scripts/sync-all-events";
import { run as runSyncCommunities } from "@scripts/sync-communities";
import { run as runSyncAllCommunities } from "@scripts/sync-all-communities";
import { run as runSyncPrograms } from "@scripts/sync-programs";

type RunnerFn = (mode: string, searchParams: URLSearchParams) => Promise<void>;

function isDryRun(mode: string): boolean {
  return mode !== "live";
}

function aisafetyCollections(searchParams: URLSearchParams, fallback?: AisafetyCollection) {
  const values = searchParams
    .getAll("collection")
    .flatMap((value) => value.split(","))
    .map((value) => value.trim())
    .filter(Boolean)
    .map(assertAisafetyCollection);

  return values.length ? values : fallback ? [fallback] : undefined;
}

const RUNNERS: Record<string, RunnerFn> = {
  // Canonical AISafety API mirror
  "sync-aisafety": async (mode, searchParams) => {
    await runSyncAisafety({
      dryRun: isDryRun(mode),
      collections: aisafetyCollections(searchParams),
    });
  },
  "sync-aisafety-events": async (mode) => {
    await runSyncAisafety({ dryRun: isDryRun(mode), collections: ["events"] });
  },
  "sync-aisafety-communities": async (mode) => {
    await runSyncAisafety({ dryRun: isDryRun(mode), collections: ["communities"] });
  },
  "sync-aisafety-training": async (mode) => {
    await runSyncAisafety({ dryRun: isDryRun(mode), collections: ["training"] });
  },

  // Event pipeline - gatherers
  "gather-aisafety": async (mode) => {
    await runGatherAisafety({ dryRun: isDryRun(mode) });
  },
  "gather-ea-lesswrong": async (mode) => {
    await runGatherEaLesswrong({ dryRun: isDryRun(mode) });
  },
  "gather-eventbrite": async (mode) => {
    await runGatherEventbrite({ dryRun: isDryRun(mode) });
  },
  "gather-luma": async (mode) => {
    await runGatherLuma({ dryRun: isDryRun(mode) });
  },
  "gather-meetup": async (mode) => {
    await runGatherMeetup({ dryRun: isDryRun(mode) });
  },

  // Event pipeline - evaluate (v2 picks models internally — Haiku stage 1,
  // Sonnet stage 2, Sonnet metadata; the legacy `model` query param is ignored)
  "evaluate": async (mode, searchParams) => {
    if (isDryRun(mode)) {
      console.log("Dry-run mode: event evaluation is skipped because it writes candidate/resource rows.");
      return;
    }
    const evalUrl = searchParams.get("url");
    if (evalUrl) {
      await runEvaluateEvent({ url: evalUrl });
    } else {
      await runEvaluateEvent({ processQueue: true });
    }
  },

  // Event pipeline - full orchestrator
  "sync-all": async (mode) => {
    if (isDryRun(mode)) {
      console.log("Dry-run mode: legacy event pipeline is skipped because it can write candidate rows.");
      return;
    }
    await runSyncAll({
      skipEvaluate: false,
    });
  },

  // Community pipeline
  "sync-communities": async (mode) => {
    await runSyncCommunities({ dryRun: isDryRun(mode) });
  },
  "evaluate-community": async (mode, searchParams) => {
    if (isDryRun(mode)) {
      console.log("Dry-run mode: community evaluation is skipped because it writes candidate/resource rows.");
      return;
    }
    const evalUrl = searchParams.get("url");
    if (evalUrl) {
      await runEvaluateCommunity({ url: evalUrl });
    } else {
      await runEvaluateCommunity({ processQueue: true });
    }
  },
  "sync-all-communities": async (mode) => {
    if (isDryRun(mode)) {
      console.log("Dry-run mode: legacy community pipeline is skipped because it can write candidate rows.");
      return;
    }
    await runSyncAllCommunities({
      skipEvaluate: false,
    });
  },

  // Programs pipeline
  "gather-bluedot": async (mode) => {
    await runGatherBluedot({ dryRun: isDryRun(mode) });
  },
  "gather-aisafety-programs": async (mode) => {
    await runGatherAisafety({ dryRun: isDryRun(mode), programs: true });
  },
  "sync-programs": async (mode) => {
    await runSyncPrograms({ dryRun: isDryRun(mode) });
  },
};

export const dynamic = "force-dynamic";
export const maxDuration = 300;

export async function GET(req: Request) {
  // Auth check
  const cookieStore = await cookies();
  const session = cookieStore.get("admin_session");
  if (!session || session.value !== "authenticated") {
    return new Response("Unauthorized", { status: 401 });
  }

  const { searchParams } = new URL(req.url);
  const scriptId = searchParams.get("script");
  const mode = searchParams.get("mode") || "dry-run";

  if (!scriptId || !RUNNERS[scriptId]) {
    return new Response("Invalid script parameter", { status: 400 });
  }

  const runner = RUNNERS[scriptId];

  const stream = new ReadableStream({
    async start(controller) {
      const encoder = new TextEncoder();

      function send(event: string, data: string) {
        controller.enqueue(encoder.encode(`event: ${event}\ndata: ${data}\n\n`));
      }

      function sendLine(text: string) {
        const lines = text.split("\n");
        for (const line of lines) {
          if (line.length > 0) {
            controller.enqueue(encoder.encode(`data: ${line}\n\n`));
          }
        }
      }

      send("status", JSON.stringify({ state: "running", script: scriptId }));

      // Capture console output for SSE streaming
      const origLog = console.log;
      const origError = console.error;

      console.log = (...args: unknown[]) => {
        const text = args.map((a) => (typeof a === "string" ? a : String(a))).join(" ");
        sendLine(text);
      };

      console.error = (...args: unknown[]) => {
        const text = args.map((a) => (typeof a === "string" ? a : String(a))).join(" ");
        send("stderr", text);
      };

      try {
        await runner(mode, searchParams);
        send("done", JSON.stringify({ code: 0 }));
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : String(err);
        send("error", JSON.stringify({ message }));
        send("done", JSON.stringify({ code: 1 }));
      } finally {
        console.log = origLog;
        console.error = origError;
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
    },
  });
}
