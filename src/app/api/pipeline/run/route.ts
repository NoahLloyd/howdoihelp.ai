import { cookies } from "next/headers";
import { spawn } from "child_process";

const SCRIPT_MAP: Record<string, string> = {
  // Event pipeline
  "gather-aisafety": "scripts/gatherers/gather-aisafety.ts",
  "gather-ea-lesswrong": "scripts/gatherers/gather-ea-lesswrong.ts",
  "gather-eventbrite": "scripts/gatherers/gather-eventbrite.ts",
  "gather-luma": "scripts/gatherers/gather-luma.ts",
  "gather-meetup": "scripts/gatherers/gather-meetup.ts",
  "evaluate": "scripts/evaluate-event.ts",
  "sync-all": "scripts/sync-all-events.ts",
  // Community pipeline
  "sync-communities": "scripts/sync-communities.ts",
  "evaluate-community": "scripts/evaluate-community.ts",
  "sync-all-communities": "scripts/sync-all-communities.ts",
  // Programs pipeline
  "gather-bluedot": "scripts/gatherers/gather-bluedot.ts",
  "gather-aisafety-programs": "scripts/gatherers/gather-aisafety.ts",
  "sync-programs": "scripts/sync-programs.ts",
};

export const dynamic = "force-dynamic";

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

  if (!scriptId || !SCRIPT_MAP[scriptId]) {
    return new Response("Invalid script parameter", { status: 400 });
  }

  const scriptPath = SCRIPT_MAP[scriptId];
  const args = ["tsx", scriptPath];

  // AISafety programs gatherer needs the --programs flag
  if (scriptId === "gather-aisafety-programs") {
    args.push("--programs");
  }

  // For individual gatherers, add --dry-run in dry-run mode
  if (mode === "dry-run" && scriptId !== "sync-all" && scriptId !== "evaluate" && scriptId !== "sync-all-communities" && scriptId !== "evaluate-community") {
    args.push("--dry-run");
  }
  // For sync-all in dry-run mode, skip evaluate phase
  if (mode === "dry-run" && scriptId === "sync-all") {
    args.push("--skip-evaluate");
  }
  // For sync-all-communities in dry-run mode, skip evaluate phase
  if (mode === "dry-run" && scriptId === "sync-all-communities") {
    args.push("--skip-evaluate");
  }
  // For sync-communities gatherer, add --dry-run
  if (mode === "dry-run" && scriptId === "sync-communities") {
    args.push("--dry-run");
  }
  // Event evaluator: single URL or full queue
  if (scriptId === "evaluate") {
    const evalUrl = searchParams.get("url");
    if (evalUrl) {
      args.push("--url", evalUrl);
    } else {
      args.push("--process-queue");
    }
  }
  // Community evaluator: single URL or full queue
  if (scriptId === "evaluate-community") {
    const evalUrl = searchParams.get("url");
    if (evalUrl) {
      args.push("--url", evalUrl);
    } else {
      args.push("--process-queue");
    }
  }

  const stream = new ReadableStream({
    start(controller) {
      const encoder = new TextEncoder();

      function send(event: string, data: string) {
        controller.enqueue(encoder.encode(`event: ${event}\ndata: ${data}\n\n`));
      }

      function sendLine(text: string) {
        // SSE data fields can't have newlines, so split them
        const lines = text.split("\n");
        for (const line of lines) {
          if (line.length > 0) {
            controller.enqueue(encoder.encode(`data: ${line}\n\n`));
          }
        }
      }

      send("status", JSON.stringify({ state: "running", script: scriptId }));

      const child = spawn("npx", args, {
        cwd: process.cwd(),
        shell: true,
        env: {
          ...process.env,
          HOME: process.env.HOME || "/tmp",
          npm_config_cache: "/tmp/.npm",
        },
      });

      child.stdout?.on("data", (chunk: Buffer) => {
        sendLine(chunk.toString());
      });

      child.stderr?.on("data", (chunk: Buffer) => {
        const text = chunk.toString();
        // Send stderr lines with a prefix so the client can color them
        const lines = text.split("\n");
        for (const line of lines) {
          if (line.length > 0) {
            send("stderr", line);
          }
        }
      });

      child.on("close", (code) => {
        send("done", JSON.stringify({ code: code ?? 1 }));
        controller.close();
      });

      child.on("error", (err) => {
        send("error", JSON.stringify({ message: err.message }));
        controller.close();
      });

      // Handle client disconnect
      req.signal.addEventListener("abort", () => {
        child.kill("SIGTERM");
      });
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
