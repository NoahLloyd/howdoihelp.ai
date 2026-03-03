import Link from "next/link";

const PIPELINES = [
  {
    href: "/admin/pipeline/events",
    title: "Events",
    desc: "AISafety, EA Forum, LessWrong, Eventbrite, Luma, Meetup",
  },
  {
    href: "/admin/pipeline/communities",
    title: "Communities",
    desc: "EA Forum, LessWrong, PauseAI, AISafety.com",
  },
  {
    href: "/admin/pipeline/programs",
    title: "Programs",
    desc: "BlueDot Impact courses + rounds",
  },
];

export default function PipelineHubPage() {
  return (
    <div className="min-h-dvh bg-background p-6 max-w-7xl mx-auto">
      <div className="mb-6">
        <Link
          href="/admin"
          className="text-xs font-mono text-muted hover:text-foreground mb-4 inline-block"
        >
          &larr; Dashboard
        </Link>
        <h1 className="text-2xl font-semibold tracking-tight">Pipelines</h1>
        <p className="text-xs text-muted mt-1 font-mono">
          Choose a pipeline to run gatherers and evaluators
        </p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        {PIPELINES.map((p) => (
          <Link
            key={p.href}
            href={p.href}
            className="p-6 rounded-xl bg-card border border-border hover:border-accent/40 transition-all duration-150 group"
          >
            <h2 className="text-lg font-semibold text-foreground group-hover:text-accent transition-colors">
              {p.title}
            </h2>
            <p className="text-xs text-muted font-mono mt-1">{p.desc}</p>
          </Link>
        ))}
      </div>
    </div>
  );
}
