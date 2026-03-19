"use client";

import { useMemo, useState } from "react";
import {
  Activity,
  AlertTriangle,
  Clock3,
  DatabaseZap,
  Download,
  Eye,
  PauseCircle,
  PlayCircle,
  RefreshCcw,
  Search,
  X,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { cn } from "@/lib/utils";

type RunStatus = "Completed" | "Running" | "Queued" | "Failed";
type RunType = "Full Eval" | "Prompt Only" | "Re-Ingest" | "Backfill";

type RunRecord = {
  id: string;
  type: RunType;
  workspace: string;
  scope: string;
  models: string[];
  status: RunStatus;
  started: string;
  duration: string;
  prompts: number;
  mentions: number;
  visibilityDelta: string;
  summary: string;
  steps: { label: string; status: "done" | "active" | "pending" | "error" }[];
  perModel: { model: string; status: string; prompts: number }[];
  logs: string[];
};

const runs: RunRecord[] = [
  {
    id: "run_7x2k9l1",
    type: "Full Eval",
    workspace: "GeoRank AI",
    scope: "All prompt categories",
    models: ["GPT-5", "Claude", "Gemini"],
    status: "Completed",
    started: "17 Mar, 09:10",
    duration: "12m 42s",
    prompts: 28,
    mentions: 412,
    visibilityDelta: "+6.2%",
    summary: "Strong documentation citation growth after the latest content push.",
    steps: [
      { label: "Queued", status: "done" },
      { label: "Fetching sources", status: "done" },
      { label: "Running prompts", status: "done" },
      { label: "Scoring", status: "done" },
      { label: "Completed", status: "done" },
    ],
    perModel: [
      { model: "GPT-5", status: "Completed", prompts: 28 },
      { model: "Claude", status: "Completed", prompts: 28 },
      { model: "Gemini", status: "Completed", prompts: 28 },
    ],
    logs: [
      "09:10 Sources refreshed from docs, blog, and reddit connectors.",
      "09:15 Prompt category 'Sales' finished with +8.4% visibility gain.",
      "09:22 Final scoring complete. 412 mentions attributed across 184 citations.",
    ],
  },
  {
    id: "run_4m5p8z3",
    type: "Prompt Only",
    workspace: "GeoRank AI",
    scope: "Sales + Brand",
    models: ["GPT-5", "Claude"],
    status: "Running",
    started: "17 Mar, 10:01",
    duration: "8m 11s",
    prompts: 12,
    mentions: 146,
    visibilityDelta: "Pending",
    summary: "Live run focused on commercial prompts after prompt copy updates.",
    steps: [
      { label: "Queued", status: "done" },
      { label: "Fetching sources", status: "done" },
      { label: "Running prompts", status: "active" },
      { label: "Scoring", status: "pending" },
      { label: "Completed", status: "pending" },
    ],
    perModel: [
      { model: "GPT-5", status: "Running", prompts: 12 },
      { model: "Claude", status: "Queued", prompts: 12 },
    ],
    logs: [
      "10:01 Run created from manual prompt refresh.",
      "10:05 GPT-5 completed 9/12 prompts.",
      "10:09 Claude workers warming up.",
    ],
  },
  {
    id: "run_9c3a1v0",
    type: "Re-Ingest",
    workspace: "GeoRank AI",
    scope: "Docs + GitHub sources",
    models: ["GPT-5"],
    status: "Queued",
    started: "17 Mar, 10:18",
    duration: "0m 42s",
    prompts: 0,
    mentions: 0,
    visibilityDelta: "Pending",
    summary: "Waiting for scraper capacity before a source-only refresh.",
    steps: [
      { label: "Queued", status: "active" },
      { label: "Fetching sources", status: "pending" },
      { label: "Running prompts", status: "pending" },
      { label: "Scoring", status: "pending" },
      { label: "Completed", status: "pending" },
    ],
    perModel: [{ model: "GPT-5", status: "Queued", prompts: 0 }],
    logs: [
      "10:18 Re-ingest requested after docs deployment.",
      "10:19 Waiting for worker slot.",
    ],
  },
  {
    id: "run_2r6n4q7",
    type: "Backfill",
    workspace: "GeoRank AI",
    scope: "Support category historical rerun",
    models: ["Claude", "Gemini"],
    status: "Failed",
    started: "16 Mar, 18:44",
    duration: "5m 03s",
    prompts: 9,
    mentions: 41,
    visibilityDelta: "-1.3%",
    summary: "Run failed during scraper hydration because one source connector timed out.",
    steps: [
      { label: "Queued", status: "done" },
      { label: "Fetching sources", status: "error" },
      { label: "Running prompts", status: "pending" },
      { label: "Scoring", status: "pending" },
      { label: "Completed", status: "pending" },
    ],
    perModel: [
      { model: "Claude", status: "Blocked", prompts: 9 },
      { model: "Gemini", status: "Blocked", prompts: 9 },
    ],
    logs: [
      "18:44 Backfill started for Support prompts.",
      "18:47 Reddit connector timed out after 3 retries.",
      "18:49 Run aborted and marked failed.",
    ],
  },
];

const recentFailures = [
  {
    id: "conn_ui_browser",
    area: "UI scraper connector",
    issue: "Login challenge blocked automated session renewal for Anthropic web scraping mode.",
    time: "17 Mar, 09:54",
  },
  {
    id: "conn_llm_api",
    area: "LLM API connector",
    issue: "Rate-limit burst returned 429s for GPT-backed scraping worker pool.",
    time: "17 Mar, 08:41",
  },
];

const workerQueue = {
  workersTotal: 6,
  workersBusy: 4,
  queuedPromptJobs: 19,
  activeRuns: 2,
  queuedItems: [
    { prompt: "Sales comparison set", connector: "LLM API scraper", assigned: "Worker 02", status: "Running" },
    { prompt: "Brand perception rerun", connector: "UI scraper", assigned: "Worker 04", status: "Running" },
    { prompt: "Support troubleshooting prompts", connector: "LLM API scraper", assigned: "Queued", status: "Queued" },
    { prompt: "Product marketing citations", connector: "UI scraper", assigned: "Queued", status: "Queued" },
  ],
};

const statusOptions: (RunStatus | "All")[] = ["All", "Completed", "Running", "Queued", "Failed"];
const typeOptions: (RunType | "All")[] = ["All", "Full Eval", "Prompt Only", "Re-Ingest", "Backfill"];

const columnSeparatorClass = "border-r border-border/60";

function statusClasses(status: RunStatus) {
  if (status === "Completed") return "border-emerald-200 bg-emerald-100 text-emerald-800";
  if (status === "Running") return "border-sky-200 bg-sky-100 text-sky-800";
  if (status === "Queued") return "border-amber-200 bg-amber-100 text-amber-800";
  return "border-rose-200 bg-rose-100 text-rose-800";
}

function stepClasses(status: RunRecord["steps"][number]["status"]) {
  if (status === "done") return "bg-emerald-500";
  if (status === "active") return "bg-sky-500";
  if (status === "error") return "bg-rose-500";
  return "bg-border";
}

export function RunsManager() {
  const [query, setQuery] = useState("");
  const [selectedStatuses, setSelectedStatuses] = useState<RunStatus[]>([]);
  const [selectedTypes, setSelectedTypes] = useState<RunType[]>([]);
  const [selectedRunId, setSelectedRunId] = useState<string | null>(null);

  const filteredRuns = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();

    return runs.filter((run) => {
      const matchesQuery =
        normalizedQuery.length === 0 ||
        run.id.toLowerCase().includes(normalizedQuery) ||
        run.workspace.toLowerCase().includes(normalizedQuery) ||
        run.scope.toLowerCase().includes(normalizedQuery) ||
        run.models.some((model) => model.toLowerCase().includes(normalizedQuery));
      const matchesStatus = selectedStatuses.length === 0 || selectedStatuses.includes(run.status);
      const matchesType = selectedTypes.length === 0 || selectedTypes.includes(run.type);

      return matchesQuery && matchesStatus && matchesType;
    });
  }, [query, selectedStatuses, selectedTypes]);

  const selectedRun = selectedRunId ? runs.find((run) => run.id === selectedRunId) ?? null : null;

  const kpis = {
    total: runs.length,
    running: runs.filter((run) => run.status === "Running").length,
    failed: runs.filter((run) => run.status === "Failed").length,
    avgDelta: "+2.4%",
    lastCompleted: "17 Mar, 09:22",
  };

  const toggleStatusFilter = (status: RunStatus) => {
    setSelectedStatuses((current) =>
      current.includes(status) ? current.filter((item) => item !== status) : [...current, status]
    );
  };

  const toggleTypeFilter = (type: RunType) => {
    setSelectedTypes((current) => (current.includes(type) ? current.filter((item) => item !== type) : [...current, type]));
  };

  return (
    <div className="space-y-6 pb-8">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Data & Runs</h1>
        <p className="mt-1 text-muted-foreground">Monitor evaluation history, ingestion jobs, and operational issues.</p>
      </div>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-5">
        <Card>
          <CardContent className="pt-6">
            <p className="text-xs uppercase tracking-[0.22em] text-muted-foreground">Total Runs</p>
            <p className="mt-2 text-2xl font-semibold">{kpis.total}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <p className="text-xs uppercase tracking-[0.22em] text-muted-foreground">Running Now</p>
            <p className="mt-2 text-2xl font-semibold">{kpis.running}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <p className="text-xs uppercase tracking-[0.22em] text-muted-foreground">Failed Runs</p>
            <p className="mt-2 text-2xl font-semibold">{kpis.failed}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <p className="text-xs uppercase tracking-[0.22em] text-muted-foreground">Avg Visibility Delta</p>
            <p className="mt-2 text-2xl font-semibold">{kpis.avgDelta}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <p className="text-xs uppercase tracking-[0.22em] text-muted-foreground">Last Completed</p>
            <p className="mt-2 text-base font-semibold">{kpis.lastCompleted}</p>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader className="gap-4 border-b pb-4">
          <div className="flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
            <div className="flex flex-wrap gap-2">
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="outline">
                    {selectedStatuses.length === 0
                      ? "All Statuses"
                      : selectedStatuses.length === 1
                        ? selectedStatuses[0]
                        : `${selectedStatuses.length} statuses`}
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="start" className="w-[240px]">
                  <DropdownMenuLabel>Filter Status</DropdownMenuLabel>
                  <DropdownMenuSeparator />
                  <DropdownMenuCheckboxItem checked={selectedStatuses.length === 0} onCheckedChange={() => setSelectedStatuses([])}>
                    All Statuses
                  </DropdownMenuCheckboxItem>
                  <DropdownMenuSeparator />
                  {statusOptions
                    .filter((status): status is RunStatus => status !== "All")
                    .map((status) => (
                      <DropdownMenuCheckboxItem
                        key={status}
                        checked={selectedStatuses.includes(status)}
                        onCheckedChange={() => toggleStatusFilter(status)}
                      >
                        {status}
                      </DropdownMenuCheckboxItem>
                    ))}
                </DropdownMenuContent>
              </DropdownMenu>

              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="outline">
                    {selectedTypes.length === 0
                      ? "All Run Types"
                      : selectedTypes.length === 1
                        ? selectedTypes[0]
                        : `${selectedTypes.length} types`}
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="start" className="w-[240px]">
                  <DropdownMenuLabel>Filter Run Type</DropdownMenuLabel>
                  <DropdownMenuSeparator />
                  <DropdownMenuCheckboxItem checked={selectedTypes.length === 0} onCheckedChange={() => setSelectedTypes([])}>
                    All Run Types
                  </DropdownMenuCheckboxItem>
                  <DropdownMenuSeparator />
                  {typeOptions
                    .filter((type): type is RunType => type !== "All")
                    .map((type) => (
                      <DropdownMenuCheckboxItem
                        key={type}
                        checked={selectedTypes.includes(type)}
                        onCheckedChange={() => toggleTypeFilter(type)}
                      >
                        {type}
                      </DropdownMenuCheckboxItem>
                    ))}
                </DropdownMenuContent>
              </DropdownMenu>
            </div>

            <div className="relative w-full xl:max-w-sm">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Search run id, scope, workspace, or model"
                className="pl-9"
              />
            </div>
          </div>
        </CardHeader>

        <CardContent className="p-0">
            <Table className="min-w-[1120px]">
              <TableHeader>
                <TableRow>
                  <TableHead className={cn("pl-6", columnSeparatorClass)}>Run ID</TableHead>
                  <TableHead className={columnSeparatorClass}>Type</TableHead>
                  <TableHead className={columnSeparatorClass}>Workspace</TableHead>
                  <TableHead className={columnSeparatorClass}>Scope</TableHead>
                  <TableHead className={columnSeparatorClass}>Models</TableHead>
                  <TableHead className={columnSeparatorClass}>Status</TableHead>
                  <TableHead className={columnSeparatorClass}>Started</TableHead>
                  <TableHead className={columnSeparatorClass}>Duration</TableHead>
                  <TableHead className={columnSeparatorClass}>Prompts</TableHead>
                  <TableHead className={columnSeparatorClass}>Mentions</TableHead>
                  <TableHead className={columnSeparatorClass}>Visibility Delta</TableHead>
                  <TableHead className="pr-6 text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
            <TableBody>
              {filteredRuns.map((run) => (
                <TableRow
                  key={run.id}
                  className={cn("cursor-pointer", selectedRun?.id === run.id && "bg-muted/40")}
                  onClick={() => setSelectedRunId(run.id)}
                >
                  <TableCell className={cn("pl-6 font-mono text-xs font-medium text-muted-foreground", columnSeparatorClass)}>
                    {run.id}
                  </TableCell>
                  <TableCell className={columnSeparatorClass}>{run.type}</TableCell>
                  <TableCell className={columnSeparatorClass}>{run.workspace}</TableCell>
                  <TableCell className={cn("max-w-[220px] truncate", columnSeparatorClass)} title={run.scope}>
                    {run.scope}
                  </TableCell>
                  <TableCell className={cn("max-w-[160px] truncate text-muted-foreground", columnSeparatorClass)} title={run.models.join(", ")}>
                    {run.models.join(", ")}
                  </TableCell>
                  <TableCell className={columnSeparatorClass}>
                    <span className={cn("inline-flex rounded-full border px-2 py-1 text-xs font-medium", statusClasses(run.status))}>
                      {run.status}
                    </span>
                  </TableCell>
                  <TableCell className={columnSeparatorClass}>{run.started}</TableCell>
                  <TableCell className={columnSeparatorClass}>{run.duration}</TableCell>
                  <TableCell className={columnSeparatorClass}>{run.prompts}</TableCell>
                  <TableCell className={columnSeparatorClass}>{run.mentions}</TableCell>
                  <TableCell className={cn("font-medium", columnSeparatorClass)}>{run.visibilityDelta}</TableCell>
                  <TableCell className="pr-6 text-right">
                    <div className="flex justify-end gap-1">
                      <Button
                        variant="ghost"
                        size="icon-sm"
                        title="View details"
                        aria-label={`View ${run.id}`}
                        onClick={(event) => {
                          event.stopPropagation();
                          setSelectedRunId(run.id);
                        }}
                      >
                        <Eye className="h-4 w-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon-sm"
                        title="Retry run"
                        aria-label={`Retry ${run.id}`}
                        onClick={(event) => event.stopPropagation()}
                      >
                        <RefreshCcw className="h-4 w-4" />
                      </Button>
                      {run.status === "Running" ? (
                        <Button
                          variant="ghost"
                          size="icon-sm"
                          title="Cancel run"
                          aria-label={`Cancel ${run.id}`}
                          onClick={(event) => event.stopPropagation()}
                        >
                          <PauseCircle className="h-4 w-4" />
                        </Button>
                      ) : (
                        <Button
                          variant="ghost"
                          size="icon-sm"
                          title="Duplicate configuration"
                          aria-label={`Duplicate ${run.id}`}
                          onClick={(event) => event.stopPropagation()}
                        >
                          <PlayCircle className="h-4 w-4" />
                        </Button>
                      )}
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>

          {filteredRuns.length === 0 && (
            <div className="px-6 py-16 text-center">
              <p className="text-lg font-medium">No runs match the current filters.</p>
              <p className="mt-1 text-sm text-muted-foreground">Adjust the status, type, or search query.</p>
            </div>
          )}
        </CardContent>
      </Card>

      <div className="grid gap-4 xl:grid-cols-[1.5fr_1fr]">
        <Card>
          <CardHeader className="border-b pb-4">
            <CardTitle className="text-base">Worker Queue</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4 pt-6">
            <div className="grid gap-3 sm:grid-cols-4">
              <div className="rounded-xl border bg-muted/20 p-4">
                <p className="text-xs uppercase tracking-[0.22em] text-muted-foreground">Workers</p>
                <p className="mt-2 text-2xl font-semibold">{workerQueue.workersTotal}</p>
              </div>
              <div className="rounded-xl border bg-muted/20 p-4">
                <p className="text-xs uppercase tracking-[0.22em] text-muted-foreground">Busy</p>
                <p className="mt-2 text-2xl font-semibold">{workerQueue.workersBusy}</p>
              </div>
              <div className="rounded-xl border bg-muted/20 p-4">
                <p className="text-xs uppercase tracking-[0.22em] text-muted-foreground">Queued Prompt Jobs</p>
                <p className="mt-2 text-2xl font-semibold">{workerQueue.queuedPromptJobs}</p>
              </div>
              <div className="rounded-xl border bg-muted/20 p-4">
                <p className="text-xs uppercase tracking-[0.22em] text-muted-foreground">Active Runs</p>
                <p className="mt-2 text-2xl font-semibold">{workerQueue.activeRuns}</p>
              </div>
            </div>

            <div className="space-y-3">
              {workerQueue.queuedItems.map((job) => (
                <div key={`${job.prompt}-${job.connector}`} className="rounded-xl border bg-muted/20 p-4">
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <p className="font-medium">{job.prompt}</p>
                      <p className="mt-1 text-sm text-muted-foreground">{job.connector}</p>
                    </div>
                    <span className="text-sm font-medium">{job.status}</span>
                  </div>
                  <p className="mt-2 text-xs text-muted-foreground">Assignment: {job.assigned}</p>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="border-b pb-4">
            <CardTitle className="text-base">Connector Failures</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 pt-6">
            {recentFailures.map((failure) => (
              <div key={failure.id} className="rounded-xl border border-rose-200 bg-rose-50/60 p-4">
                <div className="flex items-start gap-3">
                  <AlertTriangle className="mt-0.5 h-4 w-4 text-rose-700" />
                  <div>
                    <p className="font-medium">{failure.area}</p>
                    <p className="mt-1 text-sm text-rose-900">{failure.issue}</p>
                    <p className="mt-2 text-xs text-muted-foreground">{failure.id} • {failure.time}</p>
                  </div>
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
      </div>

      {selectedRun && (
        <div className="fixed inset-y-0 right-0 z-50 w-full max-w-xl border-l bg-background shadow-2xl">
          <div className="flex h-full flex-col">
            <div className="flex items-start justify-between border-b px-6 py-5">
              <div>
                <p className="font-mono text-xs text-muted-foreground">{selectedRun.id}</p>
                <h2 className="mt-1 text-xl font-semibold">{selectedRun.type}</h2>
                <p className="mt-1 text-sm text-muted-foreground">{selectedRun.summary}</p>
              </div>
              <Button variant="ghost" size="icon-sm" onClick={() => setSelectedRunId(null)} aria-label="Close run details">
                <X className="h-4 w-4" />
              </Button>
            </div>

            <div className="flex-1 space-y-6 overflow-y-auto px-6 py-6">
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="rounded-xl border bg-muted/20 p-4">
                  <div className="flex items-center gap-2 text-sm font-medium">
                    <Activity className="h-4 w-4" />
                    Status
                  </div>
                  <p className="mt-3 text-base font-semibold">{selectedRun.status}</p>
                </div>
                <div className="rounded-xl border bg-muted/20 p-4">
                  <div className="flex items-center gap-2 text-sm font-medium">
                    <Clock3 className="h-4 w-4" />
                    Duration
                  </div>
                  <p className="mt-3 text-base font-semibold">{selectedRun.duration}</p>
                </div>
                <div className="rounded-xl border bg-muted/20 p-4">
                  <div className="flex items-center gap-2 text-sm font-medium">
                    <DatabaseZap className="h-4 w-4" />
                    Mentions Collected
                  </div>
                  <p className="mt-3 text-base font-semibold">{selectedRun.mentions}</p>
                </div>
                <div className="rounded-xl border bg-muted/20 p-4">
                  <div className="flex items-center gap-2 text-sm font-medium">
                    <Download className="h-4 w-4" />
                    Visibility Delta
                  </div>
                  <p className="mt-3 text-base font-semibold">{selectedRun.visibilityDelta}</p>
                </div>
              </div>

              <section className="space-y-3">
                <h3 className="text-sm font-semibold uppercase tracking-[0.18em] text-muted-foreground">Timeline</h3>
                <div className="space-y-3">
                  {selectedRun.steps.map((step) => (
                    <div key={step.label} className="flex items-center gap-3">
                      <span className={cn("h-2.5 w-2.5 rounded-full", stepClasses(step.status))} />
                      <p className="text-sm">{step.label}</p>
                    </div>
                  ))}
                </div>
              </section>

              <section className="space-y-3">
                <h3 className="text-sm font-semibold uppercase tracking-[0.18em] text-muted-foreground">Per-Model Status</h3>
                <div className="space-y-2">
                  {selectedRun.perModel.map((item) => (
                    <div key={item.model} className="flex items-center justify-between rounded-lg border px-3 py-2">
                      <div>
                        <p className="font-medium">{item.model}</p>
                        <p className="text-xs text-muted-foreground">{item.prompts} prompts scoped</p>
                      </div>
                      <p className="text-sm">{item.status}</p>
                    </div>
                  ))}
                </div>
              </section>

              <section className="space-y-3">
                <h3 className="text-sm font-semibold uppercase tracking-[0.18em] text-muted-foreground">Run Logs</h3>
                <div className="space-y-2 rounded-xl border bg-muted/20 p-4">
                  {selectedRun.logs.map((log) => (
                    <p key={log} className="font-mono text-xs text-muted-foreground">
                      {log}
                    </p>
                  ))}
                </div>
              </section>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
