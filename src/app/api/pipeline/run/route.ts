import { cookies } from "next/headers";

// Gatherers
import { run as runGatherAisafety } from "@scripts/gatherers/gather-aisafety";
import { run as runGatherEaLesswrong } from "@scripts/gatherers/gather-ea-lesswrong";
import { run as runGatherEventbrite } from "@scripts/gatherers/gather-eventbrite";
import { run as runGatherLuma } from "@scripts/gatherers/gather-luma";
import { run as runGatherMeetup } from "@scripts/gatherers/gather-meetup";
import { run as runGatherBluedot } from "@scripts/gatherers/gather-bluedot";

// Evaluators
import { run as runEvaluateEvent } from "@scripts/evaluate-event";
import { run as runEvaluateCommunity } from "@scripts/evaluate-community";

// Orchestrators
import { run as runSyncAll } from "@scripts/sync-all-events";
import { run as runSyncCommunities } from "@scripts/sync-communities";
import { run as runSyncAllCommunities } from "@scripts/sync-all-communities";
import { run as runSyncPrograms } from "@scripts/sync-programs";

type RunnerFn = (mode: string, searchParams: URLSearchParams) => Promise<void>;

const RUNNERS: Record<string, RunnerFn> = {
  // Event pipeline - gatherers
  "gather-aisafety": async (mode) => {
    await runGatherAisafety({ dryRun: mode === "dry-run" });
  },
  "gather-ea-lesswrong": async (mode) => {
    await runGatherEaLesswrong({ dryRun: mode === "dry-run" });
  },
  "gather-eventbrite": async (mode) => {
    await runGatherEventbrite({ dryRun: mode === "dry-run" });
  },
  "gather-luma": async (mode) => {
    await runGatherLuma({ dryRun: mode === "dry-run" });
  },
  "gather-meetup": async (mode) => {
    await runGatherMeetup({ dryRun: mode === "dry-run" });
  },

  // Event pipeline - evaluate
  "evaluate": async (mode, searchParams) => {
    const evalUrl = searchParams.get("url");
    const model = searchParams.get("model") || undefined;
    if (evalUrl) {
      await runEvaluateEvent({ url: evalUrl, model });
    } else {
      await runEvaluateEvent({ processQueue: true, model });
    }
  },

  // Event pipeline - full orchestrator
  "sync-all": async (mode) => {
    await runSyncAll({
      skipEvaluate: mode === "dry-run",
    });
  },

  // Community pipeline
  "sync-communities": async (mode) => {
    await runSyncCommunities({ dryRun: mode === "dry-run" });
  },
  "evaluate-community": async (mode, searchParams) => {
    const evalUrl = searchParams.get("url");
    const model = searchParams.get("model") || undefined;
    if (evalUrl) {
      await runEvaluateCommunity({ url: evalUrl, model });
    } else {
      await runEvaluateCommunity({ processQueue: true, model });
    }
  },
  "sync-all-communities": async (mode) => {
    await runSyncAllCommunities({
      skipEvaluate: mode === "dry-run",
    });
  },

  // Programs pipeline
  "gather-bluedot": async (mode) => {
    await runGatherBluedot({ dryRun: mode === "dry-run" });
  },
  "gather-aisafety-programs": async (mode) => {
    await runGatherAisafety({ dryRun: mode === "dry-run", programs: true });
  },
  "sync-programs": async (mode) => {
    await runSyncPrograms({ dryRun: mode === "dry-run" });
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
