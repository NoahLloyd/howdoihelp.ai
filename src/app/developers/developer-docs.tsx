"use client";

import { useState, useCallback, useEffect, useRef } from "react";
import Link from "next/link";

// ─── Nav sections ────────────────────────────────────────────

const NAV = [
  { id: "overview", label: "Overview" },
  { id: "playground", label: "Try It" },
  { id: "communities", label: "Communities" },
  { id: "events", label: "Events" },
  { id: "shared-params", label: "Shared Parameters" },
  { id: "response", label: "Response Format" },
  { id: "csv", label: "CSV Export" },
  { id: "fields", label: "Data Fields" },
  { id: "rate-limits", label: "Rate Limits" },
  { id: "use-cases", label: "Use Cases" },
] as const;

// ─── Small components ────────────────────────────────────────

function CodeBlock({ children, title }: { children: string; title?: string }) {
  const [copied, setCopied] = useState(false);
  const copy = () => {
    navigator.clipboard.writeText(children);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };
  return (
    <div className="rounded-lg border border-border overflow-hidden group relative">
      {title && (
        <div className="px-4 py-2 bg-muted/30 border-b border-border text-[11px] font-mono text-muted-foreground uppercase tracking-wider flex items-center justify-between">
          <span>{title}</span>
          <button
            onClick={copy}
            className="text-[10px] text-muted-foreground hover:text-foreground transition-colors cursor-pointer"
          >
            {copied ? "Copied" : "Copy"}
          </button>
        </div>
      )}
      <pre className="p-4 bg-[#0a0a0a] text-sm font-mono text-neutral-200 overflow-x-auto leading-relaxed">
        <code>{children}</code>
      </pre>
    </div>
  );
}

function ParamRow({
  name,
  type,
  desc,
  example,
  defaultVal,
}: {
  name: string;
  type: string;
  desc: string;
  example?: string;
  defaultVal?: string;
}) {
  return (
    <tr className="border-b border-border/50 hover:bg-muted/5 transition-colors">
      <td className="px-4 py-3 font-mono text-sm text-accent whitespace-nowrap">{name}</td>
      <td className="px-4 py-3 text-xs text-muted-foreground font-mono whitespace-nowrap">{type}</td>
      <td className="px-4 py-3 text-sm text-foreground">
        {desc}
        {defaultVal && (
          <span className="text-muted-foreground text-xs ml-1">
            (default: <code className="font-mono text-accent/70">{defaultVal}</code>)
          </span>
        )}
        {example && (
          <code className="text-muted-foreground ml-2 text-xs font-mono bg-muted/20 px-1.5 py-0.5 rounded">
            {example}
          </code>
        )}
      </td>
    </tr>
  );
}

function SectionHeading({ id, children }: { id: string; children: React.ReactNode }) {
  return (
    <h2
      id={id}
      className="text-lg font-semibold text-foreground tracking-tight mt-16 mb-4 scroll-mt-24 flex items-center gap-2"
    >
      <span className="text-accent/30 font-mono text-sm">#</span>
      {children}
    </h2>
  );
}

function Badge({ children, variant = "default" }: { children: React.ReactNode; variant?: "default" | "green" }) {
  return (
    <span
      className={`inline-flex items-center px-2 py-0.5 text-[11px] font-mono font-bold rounded ${
        variant === "green"
          ? "bg-emerald-500/10 text-emerald-400"
          : "bg-accent/10 text-accent"
      }`}
    >
      {children}
    </span>
  );
}

function TableWrapper({ children }: { children: React.ReactNode }) {
  return (
    <div className="border border-border rounded-lg overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full text-left">{children}</table>
      </div>
    </div>
  );
}

function TableHead({ columns }: { columns: string[] }) {
  return (
    <thead className="bg-muted/20 text-[10px] font-mono text-muted-foreground uppercase tracking-wider">
      <tr>
        {columns.map((col) => (
          <th key={col} className="px-4 py-2.5 font-medium">
            {col}
          </th>
        ))}
      </tr>
    </thead>
  );
}

// ─── API Playground ──────────────────────────────────────────

function ApiPlayground() {
  const [endpoint, setEndpoint] = useState<"communities" | "events">("communities");
  const [params, setParams] = useState("");
  const [response, setResponse] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState<number | null>(null);
  const [duration, setDuration] = useState<number | null>(null);
  const [resultCount, setResultCount] = useState<number | null>(null);
  const responseRef = useRef<HTMLPreElement>(null);

  const [baseUrl, setBaseUrl] = useState("");
  useEffect(() => {
    setBaseUrl(window.location.origin);
  }, []);
  const fullUrl = `${baseUrl}/api/v1/${endpoint}${params ? `?${params}` : ""}`;

  const sendRequest = useCallback(async () => {
    setLoading(true);
    setResponse(null);
    setStatus(null);
    setDuration(null);
    setResultCount(null);

    const start = performance.now();
    try {
      const res = await fetch(`/api/v1/${endpoint}${params ? `?${params}` : ""}`);
      const elapsed = Math.round(performance.now() - start);
      setDuration(elapsed);
      setStatus(res.status);

      const json = await res.json();
      setResultCount(json.total ?? json.data?.length ?? null);
      setResponse(JSON.stringify(json, null, 2));
    } catch {
      setResponse('{"error": "Request failed. Is the server running?"}');
      setStatus(0);
    } finally {
      setLoading(false);
    }
  }, [endpoint, params]);

  const presets = [
    { label: "All communities", ep: "communities" as const, p: "" },
    { label: "Online communities", ep: "communities" as const, p: "online=true" },
    { label: "Search 'alignment'", ep: "communities" as const, p: "q=alignment" },
    { label: "All upcoming events", ep: "events" as const, p: "" },
    { label: "Events in London", ep: "events" as const, p: "location=London" },
    { label: "Events as CSV", ep: "events" as const, p: "format=csv" },
  ];

  return (
    <div className="border border-border rounded-xl overflow-hidden bg-card">
      {/* Header bar */}
      <div className="px-4 py-3 bg-muted/20 border-b border-border flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Badge variant="green">GET</Badge>
          <span className="text-sm font-mono text-foreground">/api/v1/{endpoint}</span>
        </div>
        <button
          onClick={sendRequest}
          disabled={loading}
          className="px-4 py-1.5 bg-accent text-background text-xs font-medium rounded-md hover:bg-accent/90 disabled:opacity-50 transition-colors cursor-pointer"
        >
          {loading ? "Sending..." : "Send Request"}
        </button>
      </div>

      {/* URL + params */}
      <div className="px-4 py-3 border-b border-border/50 space-y-3">
        <div className="flex items-center gap-2">
          <label className="text-xs text-muted-foreground font-mono w-16 shrink-0">Endpoint</label>
          <div className="flex gap-1">
            {(["communities", "events"] as const).map((ep) => (
              <button
                key={ep}
                onClick={() => { setEndpoint(ep); setResponse(null); }}
                className={`px-3 py-1 text-xs font-mono rounded-md border transition-colors cursor-pointer ${
                  endpoint === ep
                    ? "bg-accent/10 border-accent/40 text-accent"
                    : "border-border text-muted-foreground hover:text-foreground hover:border-border"
                }`}
              >
                {ep}
              </button>
            ))}
          </div>
        </div>
        <div className="flex items-center gap-2">
          <label className="text-xs text-muted-foreground font-mono w-16 shrink-0">Params</label>
          <input
            type="text"
            value={params}
            onChange={(e) => setParams(e.target.value)}
            placeholder="q=alignment&location=London"
            className="flex-1 px-3 py-1.5 bg-muted/10 border border-border rounded-md text-sm font-mono text-foreground placeholder:text-muted-foreground focus:border-accent/50 focus:outline-none transition-colors"
          />
        </div>
        <div className="flex items-center gap-2">
          <span className="text-xs text-muted-foreground font-mono w-16 shrink-0">URL</span>
          <code className="text-xs font-mono text-muted-foreground truncate">{fullUrl}</code>
        </div>
      </div>

      {/* Presets */}
      <div className="px-4 py-2.5 border-b border-border/50 flex items-center gap-1.5 overflow-x-auto">
        <span className="text-[10px] text-muted-foreground font-mono uppercase tracking-wider shrink-0 mr-1">Try:</span>
        {presets.map((preset) => (
          <button
            key={preset.label}
            onClick={() => { setEndpoint(preset.ep); setParams(preset.p); setResponse(null); }}
            className="px-2.5 py-1 text-[11px] font-mono text-muted-foreground hover:text-foreground bg-muted/10 hover:bg-muted/30 rounded-md transition-colors cursor-pointer whitespace-nowrap shrink-0"
          >
            {preset.label}
          </button>
        ))}
      </div>

      {/* Response */}
      <div className="bg-[#0a0a0a]">
        {/* Status bar */}
        {status !== null && (
          <div className="px-4 py-2 border-b border-border/30 flex items-center gap-3 text-xs font-mono">
            <span className={status >= 200 && status < 300 ? "text-emerald-400" : "text-red-400"}>
              {status} {status >= 200 && status < 300 ? "OK" : "Error"}
            </span>
            {duration !== null && (
              <span className="text-muted-foreground">{duration}ms</span>
            )}
            {resultCount !== null && (
              <span className="text-muted-foreground">{resultCount} results</span>
            )}
          </div>
        )}
        <pre
          ref={responseRef}
          className="p-4 text-sm font-mono text-neutral-200 overflow-x-auto max-h-96 overflow-y-auto leading-relaxed"
        >
          {loading ? (
            <span className="text-neutral-500 animate-pulse">Loading...</span>
          ) : response ? (
            response
          ) : (
            <span className="text-neutral-500">Click &quot;Send Request&quot; to see the response</span>
          )}
        </pre>
      </div>
    </div>
  );
}

// ─── Sidebar Nav ─────────────────────────────────────────────

function SideNav() {
  const [active, setActive] = useState("overview");

  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            setActive(entry.target.id);
          }
        }
      },
      { rootMargin: "-20% 0px -70% 0px" }
    );

    for (const section of NAV) {
      const el = document.getElementById(section.id);
      if (el) observer.observe(el);
    }

    return () => observer.disconnect();
  }, []);

  return (
    <nav className="hidden lg:block fixed top-24 w-48">
      <div className="space-y-0.5">
        {NAV.map((section) => (
          <a
            key={section.id}
            href={`#${section.id}`}
            className={`block px-3 py-1.5 text-xs rounded-md transition-colors ${
              active === section.id
                ? "text-accent bg-accent/5 font-medium"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            {section.label}
          </a>
        ))}
      </div>
    </nav>
  );
}

// ─── Main ────────────────────────────────────────────────────

export function DeveloperDocs() {
  return (
    <div className="min-h-dvh bg-background text-foreground">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 pt-16 pb-32">
        <div className="lg:grid lg:grid-cols-[200px_1fr] lg:gap-12">
          {/* Sidebar */}
          <aside className="relative">
            <SideNav />
          </aside>

          {/* Main content */}
          <div className="max-w-3xl">
            {/* ── Overview ── */}
            <header id="overview" className="mb-16 scroll-mt-24">
              <div className="flex items-center gap-3 mb-4">
                <Badge>v1</Badge>
                <Badge variant="green">Public</Badge>
                <Badge variant="green">No Auth Required</Badge>
              </div>
              <h1 className="text-3xl sm:text-4xl font-semibold tracking-tighter mb-4">
                howdoihelp.ai API
              </h1>
              <p className="text-base text-muted-foreground leading-relaxed max-w-2xl">
                Free, open access to the most comprehensive directory of AI safety
                communities and events. No API key needed. Just make a request and get data back.
              </p>

              <div className="mt-8 p-4 bg-card border border-border rounded-lg">
                <p className="text-xs font-mono text-muted-foreground uppercase tracking-wider mb-3">Base URL</p>
                <code className="text-sm font-mono text-foreground">https://howdoihelp.ai/api/v1</code>
              </div>
            </header>

            {/* ── Playground ── */}
            <SectionHeading id="playground">Try It</SectionHeading>
            <p className="text-sm text-muted-foreground mb-4">
              Make a live request right here. Pick an endpoint, add parameters, and hit send.
            </p>
            <ApiPlayground />

            {/* ── Communities endpoint ── */}
            <SectionHeading id="communities">Communities</SectionHeading>
            <div className="p-4 bg-card border border-border rounded-lg mb-4">
              <div className="flex items-center gap-3 mb-2">
                <Badge variant="green">GET</Badge>
                <code className="text-sm font-mono text-foreground">/api/v1/communities</code>
              </div>
              <p className="text-sm text-muted-foreground">
                Returns all approved AI safety communities. Returns everything by default, or filter with query parameters.
              </p>
            </div>

            <p className="text-xs font-mono text-muted-foreground uppercase tracking-wider mb-3">Quick examples</p>
            <div className="space-y-3 mb-6">
              <CodeBlock title="Get all communities">{`curl https://howdoihelp.ai/api/v1/communities`}</CodeBlock>
              <CodeBlock title="Search by keyword">{`curl "https://howdoihelp.ai/api/v1/communities?q=alignment"`}</CodeBlock>
              <CodeBlock title="Online communities only">{`curl "https://howdoihelp.ai/api/v1/communities?online=true"`}</CodeBlock>
              <CodeBlock title="Filter by source">{`curl "https://howdoihelp.ai/api/v1/communities?source=EA+Forum"`}</CodeBlock>
            </div>

            <p className="text-xs font-mono text-muted-foreground uppercase tracking-wider mb-3">Parameters</p>
            <TableWrapper>
              <TableHead columns={["Param", "Type", "Description"]} />
              <tbody>
                <ParamRow name="q" type="string" desc="Search title, description, and organization" example="q=alignment" />
                <ParamRow name="location" type="string" desc="Filter by location substring" example="location=London" />
                <ParamRow name="country" type="string" desc="Filter by country" example="country=United States" />
                <ParamRow name="online" type="boolean" desc="true for online only, false for in-person only" />
                <ParamRow name="source" type="string" desc="Filter by source platform or organization" example="source=EA Forum" />
                <ParamRow name="tags" type="string" desc="Comma-separated background or position tags" example="tags=ai_tech,policy_gov" />
                <ParamRow name="sort" type="string" desc="Sort by: title, location, created_at, activity_score" />
                <ParamRow name="order" type="string" desc="asc or desc" defaultVal="desc" />
                <ParamRow name="format" type="string" desc="json or csv" defaultVal="json" />
              </tbody>
            </TableWrapper>

            {/* ── Events endpoint ── */}
            <SectionHeading id="events">Events</SectionHeading>
            <div className="p-4 bg-card border border-border rounded-lg mb-4">
              <div className="flex items-center gap-3 mb-2">
                <Badge variant="green">GET</Badge>
                <code className="text-sm font-mono text-foreground">/api/v1/events</code>
              </div>
              <p className="text-sm text-muted-foreground">
                Returns all approved AI safety events. Only shows upcoming events by default. Set <code className="font-mono text-accent text-xs">upcoming=false</code> to include past events.
              </p>
            </div>

            <p className="text-xs font-mono text-muted-foreground uppercase tracking-wider mb-3">Quick examples</p>
            <div className="space-y-3 mb-6">
              <CodeBlock title="Get all upcoming events">{`curl https://howdoihelp.ai/api/v1/events`}</CodeBlock>
              <CodeBlock title="Events in a date range">{`curl "https://howdoihelp.ai/api/v1/events?from=2026-04-01&to=2026-06-30"`}</CodeBlock>
              <CodeBlock title="Events by type">{`curl "https://howdoihelp.ai/api/v1/events?type=conference"`}</CodeBlock>
              <CodeBlock title="Include past events">{`curl "https://howdoihelp.ai/api/v1/events?upcoming=false"`}</CodeBlock>
            </div>

            <p className="text-xs font-mono text-muted-foreground uppercase tracking-wider mb-3">Parameters</p>
            <TableWrapper>
              <TableHead columns={["Param", "Type", "Description"]} />
              <tbody>
                <ParamRow name="q" type="string" desc="Search title, description, and organization" example="q=hackathon" />
                <ParamRow name="location" type="string" desc="Filter by location substring" example="location=London" />
                <ParamRow name="country" type="string" desc="Filter by country" example="country=United Kingdom" />
                <ParamRow name="online" type="boolean" desc="true for online only, false for in-person only" />
                <ParamRow name="from" type="date" desc="Events on or after this date (ISO 8601)" example="from=2026-03-01" />
                <ParamRow name="to" type="date" desc="Events on or before this date (ISO 8601)" example="to=2026-06-30" />
                <ParamRow name="type" type="string" desc="Filter by event type" example="type=conference" />
                <ParamRow name="organizer" type="string" desc="Filter by organizing body" example="organizer=MIRI" />
                <ParamRow name="upcoming" type="boolean" desc="Only show future events" defaultVal="true" />
                <ParamRow name="tags" type="string" desc="Comma-separated background or position tags" example="tags=ai_tech" />
                <ParamRow name="sort" type="string" desc="Sort by: title, location, created_at, activity_score, event_date" />
                <ParamRow name="order" type="string" desc="asc or desc" defaultVal="asc for event_date" />
                <ParamRow name="format" type="string" desc="json or csv" defaultVal="json" />
              </tbody>
            </TableWrapper>

            {/* ── Shared params ── */}
            <SectionHeading id="shared-params">Shared Parameters</SectionHeading>
            <p className="text-sm text-muted-foreground mb-4">
              These parameters work on both endpoints.
            </p>
            <TableWrapper>
              <TableHead columns={["Param", "Type", "Description"]} />
              <tbody>
                <ParamRow name="q" type="string" desc="Full-text search across title, description, and organization" />
                <ParamRow name="location" type="string" desc="Filter by location substring match" />
                <ParamRow name="country" type="string" desc="Filter by exact country name (extracted from the location field)" />
                <ParamRow name="online" type="boolean" desc='Set to "true" for online/global only, "false" for in-person only' />
                <ParamRow name="tags" type="string" desc="Comma-separated list of background_tags or position_tags to match" />
                <ParamRow name="sort" type="string" desc="Sort field: title, location, created_at, activity_score, event_date" />
                <ParamRow name="order" type="string" desc="Sort direction: asc or desc" />
                <ParamRow name="format" type="string" desc='Response format: "json" (default) or "csv" for spreadsheet export' />
              </tbody>
            </TableWrapper>

            {/* ── Response format ── */}
            <SectionHeading id="response">Response Format</SectionHeading>
            <p className="text-sm text-muted-foreground mb-4">
              JSON responses include the data array and total count. When filters are active, the response echoes back the applied parameters.
            </p>
            <div className="space-y-4">
              <CodeBlock title="Unfiltered response">{`{
  "data": [
    {
      "id": "ea-forum-aisafety",
      "title": "AI Safety Discussion Group",
      "description": "Weekly discussions on alignment research...",
      "url": "https://example.com/group",
      "source_org": "EA Forum",
      "location": "London, United Kingdom",
      "category": "communities",
      "min_minutes": 30,
      "ev_general": 0.7,
      "ev_positioned": null,
      "friction": 0.2,
      "activity_score": 0.85,
      "background_tags": ["ai_tech"],
      "position_tags": [],
      "source": "ea-forum",
      "source_id": "abc123",
      "created_at": "2025-09-15T00:00:00.000Z"
    },
    ...
  ],
  "total": 247,
  "filtered": false
}`}</CodeBlock>

              <CodeBlock title="Filtered response">{`{
  "data": [...],
  "total": 12,
  "filtered": true,
  "params": {
    "q": "alignment",
    "country": "United States"
  }
}`}</CodeBlock>
            </div>

            {/* ── CSV ── */}
            <SectionHeading id="csv">CSV Export</SectionHeading>
            <p className="text-sm text-muted-foreground mb-4">
              Add <code className="text-accent font-mono text-xs bg-accent/5 px-1.5 py-0.5 rounded">format=csv</code> to
              any request to download a CSV file. Works with all filters.
            </p>
            <div className="space-y-3">
              <CodeBlock title="Download CSV">{`curl "https://howdoihelp.ai/api/v1/communities?format=csv" -o communities.csv`}</CodeBlock>
              <CodeBlock title="Load into Python">{`import pandas as pd

df = pd.read_csv("https://howdoihelp.ai/api/v1/events?format=csv")
print(f"{len(df)} events loaded")
print(df[["title", "location", "event_date"]].head())`}</CodeBlock>
              <CodeBlock title="JavaScript">{`const res = await fetch("https://howdoihelp.ai/api/v1/communities");
const { data, total } = await res.json();
console.log(\`\${total} communities\`);

// Filter client-side or server-side
const online = data.filter(c => c.location === "Online");`}</CodeBlock>
            </div>

            {/* ── Data Fields ── */}
            <SectionHeading id="fields">Data Fields</SectionHeading>
            <p className="text-sm text-muted-foreground mb-4">
              Every item in the <code className="font-mono text-accent text-xs bg-accent/5 px-1.5 py-0.5 rounded">data</code> array includes these fields.
            </p>
            <TableWrapper>
              <TableHead columns={["Field", "Type", "Description"]} />
              <tbody className="text-sm">
                <ParamRow name="id" type="string" desc="Unique identifier" />
                <ParamRow name="title" type="string" desc="Name of the community or event" />
                <ParamRow name="description" type="string" desc="Full description text" />
                <ParamRow name="url" type="string" desc="Link to the resource" />
                <ParamRow name="source_org" type="string" desc="Organization or platform name" />
                <ParamRow name="location" type="string" desc='e.g. "London, United Kingdom" or "Online"' />
                <ParamRow name="category" type="string" desc='"communities" or "events"' />
                <ParamRow name="event_date" type="string | null" desc="ISO date (events only)" />
                <ParamRow name="event_type" type="string | null" desc="Event type: conference, meetup, workshop, etc." />
                <ParamRow name="deadline_date" type="string | null" desc="Registration or application deadline" />
                <ParamRow name="min_minutes" type="number" desc="Estimated minimum time commitment in minutes" />
                <ParamRow name="ev_general" type="number" desc="Expected value score (0 to 1)" />
                <ParamRow name="ev_positioned" type="number | null" desc="Expected value for people in relevant positions" />
                <ParamRow name="friction" type="number" desc="Friction/effort score (0 to 1, lower is easier)" />
                <ParamRow name="activity_score" type="number | null" desc="Activity and quality score (0 to 1)" />
                <ParamRow name="background_tags" type="string[]" desc="Relevant background tags" />
                <ParamRow name="position_tags" type="string[]" desc="Relevant position tags" />
                <ParamRow name="source" type="string | null" desc="Data source identifier" />
                <ParamRow name="source_id" type="string | null" desc="ID from the original source platform" />
                <ParamRow name="created_at" type="string" desc="When the record was created (ISO 8601)" />
              </tbody>
            </TableWrapper>

            {/* ── Rate Limits ── */}
            <SectionHeading id="rate-limits">Rate Limits</SectionHeading>
            <p className="text-sm text-muted-foreground mb-4">
              100 requests per minute per IP. Since you can get all the data in a single call, this is plenty for any use case.
            </p>
            <TableWrapper>
              <TableHead columns={["Header", "Description"]} />
              <tbody>
                <tr className="border-b border-border/50">
                  <td className="px-4 py-3 font-mono text-sm text-accent">X-RateLimit-Limit</td>
                  <td className="px-4 py-3 text-sm text-foreground">Max requests per window (100)</td>
                </tr>
                <tr className="border-b border-border/50">
                  <td className="px-4 py-3 font-mono text-sm text-accent">X-RateLimit-Remaining</td>
                  <td className="px-4 py-3 text-sm text-foreground">Requests remaining in current window</td>
                </tr>
                <tr className="border-b border-border/50">
                  <td className="px-4 py-3 font-mono text-sm text-accent">X-RateLimit-Reset</td>
                  <td className="px-4 py-3 text-sm text-foreground">Unix timestamp when the window resets</td>
                </tr>
                <tr>
                  <td className="px-4 py-3 font-mono text-sm text-accent">Retry-After</td>
                  <td className="px-4 py-3 text-sm text-foreground">Seconds to wait (only on 429 responses)</td>
                </tr>
              </tbody>
            </TableWrapper>

            <div className="mt-4">
              <CodeBlock title="429 Too Many Requests">{`{
  "error": {
    "code": "rate_limit_exceeded",
    "message": "Too many requests. Please retry after 45 seconds."
  }
}`}</CodeBlock>
            </div>

            {/* ── Use Cases ── */}
            <SectionHeading id="use-cases">Use Cases</SectionHeading>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
              {[
                {
                  title: "Research datasets",
                  desc: "Export the full database for analysis of the AI safety ecosystem.",
                },
                {
                  title: "Calendar sync",
                  desc: "Sync events to Google Calendar, Outlook, or your scheduling tool.",
                },
                {
                  title: "Slack / Discord bots",
                  desc: "Auto-post new events or nearby communities to your channels.",
                },
                {
                  title: "Dashboards",
                  desc: "Track community growth and event activity over time.",
                },
                {
                  title: "Location-based apps",
                  desc: "Show the nearest communities and events based on user location.",
                },
                {
                  title: "Newsletter automation",
                  desc: "Pull upcoming events weekly to generate newsletter content.",
                },
              ].map((item) => (
                <div
                  key={item.title}
                  className="p-3.5 bg-card border border-border rounded-lg hover:border-accent/20 transition-colors"
                >
                  <h3 className="text-sm font-medium text-foreground mb-0.5">
                    {item.title}
                  </h3>
                  <p className="text-xs text-muted-foreground leading-relaxed">
                    {item.desc}
                  </p>
                </div>
              ))}
            </div>

            {/* ── Attribution ── */}
            <div className="mt-16 p-5 bg-card border border-border rounded-lg">
              <h3 className="text-sm font-medium text-foreground mb-2">Attribution</h3>
              <p className="text-sm text-muted-foreground leading-relaxed">
                This data is free for any use. If you build something with it,
                we&apos;d appreciate a link back to{" "}
                <a href="https://howdoihelp.ai" className="text-accent hover:underline">
                  howdoihelp.ai
                </a>
                , but it&apos;s not required. Questions or want to share what
                you&apos;ve built? Reach out at{" "}
                <a href="mailto:n@noahlr.com" className="text-accent hover:underline">
                  n@noahlr.com
                </a>
              </p>
            </div>

            {/* ── Back ── */}
            <div className="mt-12 pt-6 border-t border-border/50">
              <Link
                href="/"
                className="text-sm text-muted-foreground hover:text-foreground transition-colors"
              >
                &larr; howdoihelp.ai
              </Link>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
