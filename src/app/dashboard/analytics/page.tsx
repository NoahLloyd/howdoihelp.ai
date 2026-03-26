"use client";

import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import {
  BarChart,
  Bar,
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
  PieChart,
  Pie,
  Cell,
  FunnelChart,
  Funnel,
  LabelList,
} from "recharts";
import {
  Eye,
  Users,
  MousePointerClick,
  TrendingUp,
  ArrowRight,
  Globe,
  Monitor,
  BarChart3,
} from "lucide-react";
import { getAnalyticsData, type AnalyticsData, type AnalyticsResult } from "./actions";

const COLORS = [
  "#10b981",
  "#3b82f6",
  "#f59e0b",
  "#ef4444",
  "#8b5cf6",
  "#ec4899",
  "#14b8a6",
  "#f97316",
];

const DATE_RANGES = [
  { label: "7d", value: "7d" },
  { label: "30d", value: "30d" },
  { label: "90d", value: "90d" },
];

export default function AnalyticsPage() {
  const [data, setData] = useState<AnalyticsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [dateRange, setDateRange] = useState("30d");

  useEffect(() => {
    setLoading(true);
    setError(null);
    getAnalyticsData(dateRange)
      .then((result) => {
        if (result.success) {
          setData(result.data);
        } else {
          setError(result.error);
        }
      })
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }, [dateRange]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="h-6 w-6 animate-spin rounded-full border-2 border-accent border-t-transparent" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="rounded-2xl border border-border bg-card p-8 text-center">
        <BarChart3 className="mx-auto h-10 w-10 text-muted-foreground mb-3" />
        <h2 className="text-lg font-semibold text-foreground mb-1">
          Analytics unavailable
        </h2>
        <p className="text-sm text-muted-foreground max-w-md mx-auto">
          {error}
        </p>
      </div>
    );
  }

  if (!data) return null;

  const { overview } = data;

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5, ease: "easeOut" }}
    >
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">
            Analytics
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {data.slug
              ? `Stats for howdoihelp.ai/${data.slug}`
              : "Stats across all your traffic"}
          </p>
        </div>
        <div className="flex gap-1 rounded-lg border border-border bg-card p-1">
          {DATE_RANGES.map((r) => (
            <button
              key={r.value}
              onClick={() => setDateRange(r.value)}
              className={`rounded-md px-3 py-1.5 text-xs font-medium transition-colors cursor-pointer ${
                dateRange === r.value
                  ? "bg-accent text-white"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              {r.label}
            </button>
          ))}
        </div>
      </div>

      {/* Stat Cards */}
      <div className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
        <StatCard
          icon={Eye}
          label="Pageviews"
          value={overview.totalPageviews}
        />
        <StatCard
          icon={Users}
          label="Unique Visitors"
          value={overview.uniqueVisitors}
        />
        <StatCard
          icon={ArrowRight}
          label="Funnels Started"
          value={overview.totalFunnelStarts}
        />
        <StatCard
          icon={MousePointerClick}
          label="Resource Clicks"
          value={overview.totalResourceClicks}
        />
        <StatCard
          icon={TrendingUp}
          label="Conversion Rate"
          value={`${overview.conversionRate}%`}
        />
      </div>

      {/* Daily Visitors Chart */}
      <ChartCard title="Daily Visitors" className="mt-6">
        {data.dailyVisitors.length > 0 ? (
          <ResponsiveContainer width="100%" height={260}>
            <LineChart data={data.dailyVisitors}>
              <CartesianGrid
                strokeDasharray="3 3"
                stroke="var(--color-border)"
              />
              <XAxis
                dataKey="date"
                tick={{ fontSize: 11, fill: "var(--color-muted-foreground)" }}
                tickFormatter={(v) => {
                  const d = new Date(v);
                  return `${d.getMonth() + 1}/${d.getDate()}`;
                }}
              />
              <YAxis
                tick={{ fontSize: 11, fill: "var(--color-muted-foreground)" }}
              />
              <Tooltip
                contentStyle={{
                  background: "var(--color-card)",
                  border: "1px solid var(--color-border)",
                  borderRadius: 8,
                  fontSize: 12,
                }}
              />
              <Line
                type="monotone"
                dataKey="visitors"
                stroke="#10b981"
                strokeWidth={2}
                dot={false}
                name="Unique Visitors"
              />
              <Line
                type="monotone"
                dataKey="pageviews"
                stroke="#3b82f6"
                strokeWidth={2}
                dot={false}
                name="Pageviews"
              />
            </LineChart>
          </ResponsiveContainer>
        ) : (
          <EmptyState />
        )}
      </ChartCard>

      {/* Funnel + Daily Clicks side by side */}
      <div className="mt-4 grid gap-4 md:grid-cols-2">
        <ChartCard title="Conversion Funnel">
          {data.funnel.some((f) => f.count > 0) ? (
            <ResponsiveContainer width="100%" height={260}>
              <FunnelChart>
                <Tooltip
                  contentStyle={{
                    background: "var(--color-card)",
                    border: "1px solid var(--color-border)",
                    borderRadius: 8,
                    fontSize: 12,
                  }}
                  formatter={(value, name, props) => [
                    `${value} (${(props.payload as { rate?: number })?.rate ?? 0}%)`,
                    String(name),
                  ]}
                />
                <Funnel
                  dataKey="count"
                  data={data.funnel.map((f, i) => ({
                    ...f,
                    name: f.step,
                    fill: COLORS[i],
                  }))}
                >
                  <LabelList
                    dataKey="step"
                    position="center"
                    style={{ fontSize: 11, fill: "#fff", fontWeight: 500 }}
                  />
                </Funnel>
              </FunnelChart>
            </ResponsiveContainer>
          ) : (
            <EmptyState />
          )}
        </ChartCard>

        <ChartCard title="Daily Resource Clicks">
          {data.dailyClicks.length > 0 ? (
            <ResponsiveContainer width="100%" height={260}>
              <BarChart data={data.dailyClicks}>
                <CartesianGrid
                  strokeDasharray="3 3"
                  stroke="var(--color-border)"
                />
                <XAxis
                  dataKey="date"
                  tick={{
                    fontSize: 11,
                    fill: "var(--color-muted-foreground)",
                  }}
                  tickFormatter={(v) => {
                    const d = new Date(v);
                    return `${d.getMonth() + 1}/${d.getDate()}`;
                  }}
                />
                <YAxis
                  tick={{
                    fontSize: 11,
                    fill: "var(--color-muted-foreground)",
                  }}
                />
                <Tooltip
                  contentStyle={{
                    background: "var(--color-card)",
                    border: "1px solid var(--color-border)",
                    borderRadius: 8,
                    fontSize: 12,
                  }}
                />
                <Bar
                  dataKey="clicks"
                  fill="#10b981"
                  radius={[4, 4, 0, 0]}
                  name="Clicks"
                />
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <EmptyState />
          )}
        </ChartCard>
      </div>

      {/* Top Resources + Referral Sources */}
      <div className="mt-4 grid gap-4 md:grid-cols-2">
        <ChartCard title="Top Resources Clicked">
          {data.topResources.length > 0 ? (
            <div className="space-y-2">
              {data.topResources.map((r, i) => (
                <div key={i} className="flex items-center gap-3">
                  <span className="w-5 text-xs text-muted-foreground text-right">
                    {i + 1}
                  </span>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <p className="text-sm text-foreground truncate flex-1">
                        {r.title}
                      </p>
                      <span className="text-xs font-medium text-accent shrink-0">
                        {r.clicks}
                      </span>
                    </div>
                    <div className="mt-1 h-1.5 rounded-full bg-card-hover overflow-hidden">
                      <div
                        className="h-full rounded-full bg-accent/60"
                        style={{
                          width: `${
                            data.topResources[0].clicks > 0
                              ? (r.clicks / data.topResources[0].clicks) * 100
                              : 0
                          }%`,
                        }}
                      />
                    </div>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <EmptyState />
          )}
        </ChartCard>

        <ChartCard title="Referral Sources">
          {data.referralSources.length > 0 ? (
            <div className="space-y-2">
              {data.referralSources.map((r, i) => (
                <div key={i} className="flex items-center gap-3">
                  <Globe className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <p className="text-sm text-foreground truncate flex-1">
                        {r.source}
                      </p>
                      <span className="text-xs font-medium text-accent shrink-0">
                        {r.count}
                      </span>
                    </div>
                    <div className="mt-1 h-1.5 rounded-full bg-card-hover overflow-hidden">
                      <div
                        className="h-full rounded-full bg-blue-500/60"
                        style={{
                          width: `${
                            data.referralSources[0].count > 0
                              ? (r.count / data.referralSources[0].count) * 100
                              : 0
                          }%`,
                        }}
                      />
                    </div>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <EmptyState />
          )}
        </ChartCard>
      </div>

      {/* Device + Country breakdown */}
      <div className="mt-4 grid gap-4 md:grid-cols-2">
        <ChartCard title="Devices">
          {data.deviceBreakdown.length > 0 ? (
            <ResponsiveContainer width="100%" height={220}>
              <PieChart>
                <Pie
                  data={data.deviceBreakdown}
                  dataKey="count"
                  nameKey="device"
                  cx="50%"
                  cy="50%"
                  outerRadius={80}
                  label={(props) => {
                    const p = props as unknown as { device: string; percent: number };
                    return `${p.device} ${(p.percent * 100).toFixed(0)}%`;
                  }}
                  labelLine={false}
                >
                  {data.deviceBreakdown.map((_, i) => (
                    <Cell
                      key={i}
                      fill={COLORS[i % COLORS.length]}
                    />
                  ))}
                </Pie>
                <Tooltip
                  contentStyle={{
                    background: "var(--color-card)",
                    border: "1px solid var(--color-border)",
                    borderRadius: 8,
                    fontSize: 12,
                  }}
                />
              </PieChart>
            </ResponsiveContainer>
          ) : (
            <EmptyState />
          )}
        </ChartCard>

        <ChartCard title="Top Countries">
          {data.countryBreakdown.length > 0 ? (
            <div className="space-y-2">
              {data.countryBreakdown.map((r, i) => (
                <div key={i} className="flex items-center gap-3">
                  <span className="w-5 text-xs text-muted-foreground text-right">
                    {i + 1}
                  </span>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <p className="text-sm text-foreground truncate flex-1">
                        {r.country}
                      </p>
                      <span className="text-xs font-medium text-accent shrink-0">
                        {r.count}
                      </span>
                    </div>
                    <div className="mt-1 h-1.5 rounded-full bg-card-hover overflow-hidden">
                      <div
                        className="h-full rounded-full bg-emerald-500/60"
                        style={{
                          width: `${
                            data.countryBreakdown[0].count > 0
                              ? (r.count / data.countryBreakdown[0].count) * 100
                              : 0
                          }%`,
                        }}
                      />
                    </div>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <EmptyState />
          )}
        </ChartCard>
      </div>

      {/* Question Dropoff */}
      {data.questionDropoff.length > 0 && (
        <ChartCard title="Question Engagement" className="mt-4">
          <ResponsiveContainer width="100%" height={260}>
            <BarChart data={data.questionDropoff} layout="vertical">
              <CartesianGrid
                strokeDasharray="3 3"
                stroke="var(--color-border)"
              />
              <XAxis
                type="number"
                tick={{
                  fontSize: 11,
                  fill: "var(--color-muted-foreground)",
                }}
              />
              <YAxis
                type="category"
                dataKey="question"
                tick={{
                  fontSize: 11,
                  fill: "var(--color-muted-foreground)",
                }}
                width={100}
              />
              <Tooltip
                contentStyle={{
                  background: "var(--color-card)",
                  border: "1px solid var(--color-border)",
                  borderRadius: 8,
                  fontSize: 12,
                }}
              />
              <Bar
                dataKey="answered"
                fill="#10b981"
                radius={[0, 4, 4, 0]}
                name="Answered"
              />
              <Bar
                dataKey="skipped"
                fill="#ef4444"
                radius={[0, 4, 4, 0]}
                name="Skipped"
              />
            </BarChart>
          </ResponsiveContainer>
        </ChartCard>
      )}
    </motion.div>
  );
}

// ─── Components ──────────────────────────────────────────────

function StatCard({
  icon: Icon,
  label,
  value,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: number | string;
}) {
  return (
    <div className="rounded-2xl border border-border bg-card p-4">
      <div className="flex items-center gap-2 text-muted-foreground">
        <Icon className="h-4 w-4" />
        <span className="text-xs font-medium">{label}</span>
      </div>
      <p className="mt-2 text-2xl font-semibold text-foreground">
        {typeof value === "number" ? value.toLocaleString() : value}
      </p>
    </div>
  );
}

function ChartCard({
  title,
  children,
  className = "",
}: {
  title: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      className={`rounded-2xl border border-border bg-card p-5 ${className}`}
    >
      <h3 className="mb-4 text-sm font-semibold text-foreground">{title}</h3>
      {children}
    </div>
  );
}

function EmptyState() {
  return (
    <div className="flex h-40 items-center justify-center">
      <p className="text-xs text-muted-foreground">No data yet</p>
    </div>
  );
}
