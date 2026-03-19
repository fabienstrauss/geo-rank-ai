"use client";

import { useMemo, useState } from "react";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

type VisibilityKey = "yourBrand" | "competitorA" | "competitorB" | "competitorC";
type TimeRange = "30d" | "90d" | "6m";

const visibilitySeries: Record<
  VisibilityKey,
  {
    label: string;
    color: string;
    values: number[];
  }
> = {
  yourBrand: {
    label: "Your Brand",
    color: "var(--color-chart-1)",
    values: [54, 58, 55, 61, 64, 68],
  },
  competitorA: {
    label: "Competitor A",
    color: "var(--color-chart-2)",
    values: [49, 51, 53, 52, 55, 57],
  },
  competitorB: {
    label: "Competitor B",
    color: "var(--color-chart-3)",
    values: [41, 43, 46, 45, 44, 47],
  },
  competitorC: {
    label: "Competitor C",
    color: "var(--color-chart-4)",
    values: [34, 36, 37, 39, 41, 40],
  },
};

const visibilityLabels: Record<TimeRange, string[]> = {
  "30d": ["Week 1", "Week 2", "Week 3", "Week 4", "Week 5", "Today"],
  "90d": ["Jan", "Feb", "Mar", "Apr", "May", "Jun"],
  "6m": ["Oct", "Nov", "Dec", "Jan", "Feb", "Mar"],
};

const sentimentPoints = [
  { label: "Your Brand", x: 68, y: 74, color: "var(--color-chart-1)" },
  { label: "Competitor A", x: 59, y: 61, color: "var(--color-chart-2)" },
  { label: "Competitor B", x: 44, y: 38, color: "var(--color-chart-3)" },
  { label: "Competitor C", x: 31, y: 57, color: "var(--color-chart-4)" },
];

const sourceSlices = [
  { label: "Documentation", value: 34, color: "var(--color-chart-1)" },
  { label: "Blog Posts", value: 24, color: "var(--color-chart-2)" },
  { label: "Reddit", value: 18, color: "var(--color-chart-3)" },
  { label: "Review Sites", value: 14, color: "var(--color-chart-4)" },
  { label: "GitHub", value: 10, color: "var(--color-chart-5)" },
];

type SourceSliceWithPath = (typeof sourceSlices)[number] & { path: string };

const ranges: { value: TimeRange; label: string }[] = [
  { value: "30d", label: "30D" },
  { value: "90d", label: "90D" },
  { value: "6m", label: "6M" },
];

function polarToCartesian(cx: number, cy: number, radius: number, angle: number) {
  return {
    x: cx + radius * Math.cos(angle),
    y: cy + radius * Math.sin(angle),
  };
}

function describeArc(
  cx: number,
  cy: number,
  outerRadius: number,
  innerRadius: number,
  startAngle: number,
  endAngle: number
) {
  const outerStart = polarToCartesian(cx, cy, outerRadius, startAngle);
  const outerEnd = polarToCartesian(cx, cy, outerRadius, endAngle);
  const innerEnd = polarToCartesian(cx, cy, innerRadius, endAngle);
  const innerStart = polarToCartesian(cx, cy, innerRadius, startAngle);
  const largeArcFlag = endAngle - startAngle > Math.PI ? 1 : 0;

  return [
    `M ${outerStart.x} ${outerStart.y}`,
    `A ${outerRadius} ${outerRadius} 0 ${largeArcFlag} 1 ${outerEnd.x} ${outerEnd.y}`,
    `L ${innerEnd.x} ${innerEnd.y}`,
    `A ${innerRadius} ${innerRadius} 0 ${largeArcFlag} 0 ${innerStart.x} ${innerStart.y}`,
    "Z",
  ].join(" ");
}

export function VisibilityChart() {
  const [range, setRange] = useState<TimeRange>("90d");
  const [visibleKeys, setVisibleKeys] = useState<VisibilityKey[]>([
    "yourBrand",
    "competitorA",
    "competitorB",
    "competitorC",
  ]);

  const labels = visibilityLabels[range];
  const width = 720;
  const height = 280;
  const padding = { top: 16, right: 16, bottom: 30, left: 40 };
  const chartWidth = width - padding.left - padding.right;
  const chartHeight = height - padding.top - padding.bottom;
  const yTicks = [20, 40, 60, 80];

  const linePaths = useMemo(() => {
    return visibleKeys.map((key) => {
      const series = visibilitySeries[key];
      const stepX = chartWidth / (series.values.length - 1);
      const path = series.values
        .map((value, index) => {
          const x = padding.left + index * stepX;
          const y = padding.top + chartHeight - (value / 100) * chartHeight;
          return `${index === 0 ? "M" : "L"} ${x} ${y}`;
        })
        .join(" ");

      return { ...series, path };
    });
  }, [chartHeight, chartWidth, padding.left, padding.top, visibleKeys]);

  const toggleSeries = (key: VisibilityKey) => {
    setVisibleKeys((current) => {
      if (current.includes(key)) {
        return current.length === 1 ? current : current.filter((item) => item !== key);
      }
      return [...current, key];
    });
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div className="flex flex-wrap gap-2">
          {ranges.map((option) => (
            <Button
              key={option.value}
              size="sm"
              variant={range === option.value ? "default" : "outline"}
              onClick={() => setRange(option.value)}
            >
              {option.label}
            </Button>
          ))}
        </div>
        <div className="flex flex-wrap gap-2 text-xs text-muted-foreground">
          <span className="rounded-full border px-3 py-1">Prompt Group: All</span>
          <span className="rounded-full border px-3 py-1">Model: GPT-5 / Claude / Gemini</span>
        </div>
      </div>

      <div className="rounded-xl border bg-muted/20 p-4">
        <svg viewBox={`0 0 ${width} ${height}`} className="h-[280px] w-full">
          {yTicks.map((tick) => {
            const y = padding.top + chartHeight - (tick / 100) * chartHeight;
            return (
              <g key={tick}>
                <line
                  x1={padding.left}
                  x2={padding.left + chartWidth}
                  y1={y}
                  y2={y}
                  stroke="var(--color-border)"
                  strokeDasharray="4 6"
                />
                <text x={padding.left - 10} y={y + 4} textAnchor="end" className="fill-muted-foreground text-[11px]">
                  {tick}
                </text>
              </g>
            );
          })}

          <line
            x1={padding.left}
            x2={padding.left}
            y1={padding.top}
            y2={padding.top + chartHeight}
            stroke="var(--color-border)"
          />
          <line
            x1={padding.left}
            x2={padding.left + chartWidth}
            y1={padding.top + chartHeight}
            y2={padding.top + chartHeight}
            stroke="var(--color-border)"
          />

          {labels.map((label, index) => {
            const x = padding.left + (index * chartWidth) / (labels.length - 1);
            return (
              <text
                key={label}
                x={x}
                y={height - 6}
                textAnchor={index === 0 ? "start" : index === labels.length - 1 ? "end" : "middle"}
                className="fill-muted-foreground text-[11px]"
              >
                {label}
              </text>
            );
          })}

          {linePaths.map((series) => (
            <g key={series.label}>
              <path d={series.path} fill="none" stroke={series.color} strokeWidth="3" strokeLinecap="round" />
              {series.values.map((value, index) => {
                const x = padding.left + (index * chartWidth) / (series.values.length - 1);
                const y = padding.top + chartHeight - (value / 100) * chartHeight;

                return <circle key={`${series.label}-${labels[index]}`} cx={x} cy={y} r="4.5" fill={series.color} />;
              })}
            </g>
          ))}
        </svg>
      </div>

      <div className="flex flex-wrap gap-2">
        {(Object.keys(visibilitySeries) as VisibilityKey[]).map((key) => {
          const series = visibilitySeries[key];
          const active = visibleKeys.includes(key);

          return (
            <button
              key={key}
              type="button"
              onClick={() => toggleSeries(key)}
              className={cn(
                "inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-sm transition-colors",
                active ? "border-foreground/15 bg-background" : "border-border bg-muted/40 text-muted-foreground"
              )}
            >
              <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: series.color }} />
              {series.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}

export function SentimentQuadrantChart() {
  const width = 720;
  const height = 300;
  const padding = { top: 20, right: 20, bottom: 36, left: 42 };
  const chartWidth = width - padding.left - padding.right;
  const chartHeight = height - padding.top - padding.bottom;
  const midpointX = padding.left + chartWidth / 2;
  const midpointY = padding.top + chartHeight / 2;

  return (
    <div className="space-y-4">
      <div className="grid gap-2 text-xs text-muted-foreground md:grid-cols-4">
        <div className="rounded-lg border bg-emerald-50/70 px-3 py-2 text-emerald-900">High visibility / positive sentiment</div>
        <div className="rounded-lg border bg-amber-50/80 px-3 py-2 text-amber-900">High visibility / weak sentiment</div>
        <div className="rounded-lg border bg-sky-50/80 px-3 py-2 text-sky-900">Low visibility / positive sentiment</div>
        <div className="rounded-lg border bg-rose-50/80 px-3 py-2 text-rose-900">Low visibility / weak sentiment</div>
      </div>

      <div className="rounded-xl border bg-muted/20 p-4">
        <svg viewBox={`0 0 ${width} ${height}`} className="h-[300px] w-full">
          <rect x={padding.left} y={padding.top} width={chartWidth / 2} height={chartHeight / 2} fill="#e7f8ee" />
          <rect x={midpointX} y={padding.top} width={chartWidth / 2} height={chartHeight / 2} fill="#fff3d8" />
          <rect x={padding.left} y={midpointY} width={chartWidth / 2} height={chartHeight / 2} fill="#e5f2ff" />
          <rect x={midpointX} y={midpointY} width={chartWidth / 2} height={chartHeight / 2} fill="#ffe7eb" />

          <line
            x1={padding.left}
            x2={padding.left + chartWidth}
            y1={midpointY}
            y2={midpointY}
            stroke="var(--color-border)"
            strokeDasharray="4 6"
          />
          <line
            x1={midpointX}
            x2={midpointX}
            y1={padding.top}
            y2={padding.top + chartHeight}
            stroke="var(--color-border)"
            strokeDasharray="4 6"
          />

          <line
            x1={padding.left}
            x2={padding.left}
            y1={padding.top}
            y2={padding.top + chartHeight}
            stroke="var(--color-border)"
          />
          <line
            x1={padding.left}
            x2={padding.left + chartWidth}
            y1={padding.top + chartHeight}
            y2={padding.top + chartHeight}
            stroke="var(--color-border)"
          />

          <text x={width / 2} y={height - 4} textAnchor="middle" className="fill-muted-foreground text-[12px]">
            Visibility Score
          </text>
          <text
            x={14}
            y={height / 2}
            textAnchor="middle"
            transform={`rotate(-90 14 ${height / 2})`}
            className="fill-muted-foreground text-[12px]"
          >
            Sentiment Score
          </text>

          {[0, 25, 50, 75, 100].map((tick) => {
            const x = padding.left + (tick / 100) * chartWidth;
            const y = padding.top + chartHeight - (tick / 100) * chartHeight;
            return (
              <g key={tick}>
                <text x={x} y={height - 18} textAnchor="middle" className="fill-muted-foreground text-[11px]">
                  {tick}
                </text>
                <text x={padding.left - 10} y={y + 4} textAnchor="end" className="fill-muted-foreground text-[11px]">
                  {tick}
                </text>
              </g>
            );
          })}

          {sentimentPoints.map((point) => {
            const x = padding.left + (point.x / 100) * chartWidth;
            const y = padding.top + chartHeight - (point.y / 100) * chartHeight;

            return (
              <g key={point.label}>
                <circle cx={x} cy={y} r="10" fill={point.color} fillOpacity="0.16" />
                <circle cx={x} cy={y} r="5" fill={point.color} />
                <text x={x + 10} y={y - 10} className="fill-foreground text-[12px] font-medium">
                  {point.label}
                </text>
              </g>
            );
          })}
        </svg>
      </div>
    </div>
  );
}

export function SourcesPieChart() {
  const total = sourceSlices.reduce((sum, slice) => sum + slice.value, 0);
  const slices = sourceSlices.reduce<SourceSliceWithPath[]>((accumulator, slice, index) => {
    const startAngle =
      index === 0
        ? -Math.PI / 2
        : accumulator.reduce((sum, item) => sum + (item.value / total) * Math.PI * 2, -Math.PI / 2);
    const angle = (slice.value / total) * Math.PI * 2;
    const path = describeArc(100, 100, 78, 40, startAngle, startAngle + angle);

    return [...accumulator, { ...slice, path }];
  }, []);

  return (
    <div className="grid gap-4 md:grid-cols-[220px_1fr] md:items-center">
      <div className="mx-auto flex w-full max-w-[220px] justify-center rounded-xl border bg-muted/20 p-4">
        <svg viewBox="0 0 200 200" className="h-[200px] w-[200px]">
          {slices.map((slice) => (
            <path key={slice.label} d={slice.path} fill={slice.color} stroke="var(--color-background)" strokeWidth="2" />
          ))}
          <circle cx="100" cy="100" r="32" fill="var(--color-background)" />
          <text x="100" y="94" textAnchor="middle" className="fill-muted-foreground text-[10px] uppercase tracking-[0.24em]">
            Sources
          </text>
          <text x="100" y="114" textAnchor="middle" className="fill-foreground text-[18px] font-semibold">
            {total}
          </text>
        </svg>
      </div>

      <div className="space-y-3">
        {sourceSlices.map((slice) => (
          <div key={slice.label} className="flex items-center justify-between rounded-lg border px-3 py-2">
            <div className="flex items-center gap-3">
              <span className="h-3 w-3 rounded-full" style={{ backgroundColor: slice.color }} />
              <div>
                <p className="text-sm font-medium">{slice.label}</p>
                <p className="text-xs text-muted-foreground">Citations from that source category</p>
              </div>
            </div>
            <div className="text-right">
              <p className="text-sm font-semibold">{slice.value}%</p>
              <p className="text-xs text-muted-foreground">{Math.round((slice.value / 100) * 184)} mentions</p>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
