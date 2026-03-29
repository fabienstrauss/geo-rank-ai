"use client";

import { startTransition, useCallback, useEffect, useState } from "react";
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
import { useWorkspace } from "@/components/workspace-provider";
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
import {
  ConnectorIncident,
  QueueJob,
  Run,
  RunDetail,
  RunList,
  Worker,
  createManualRun,
  getConnectorIncidents,
  getQueueJobs,
  getRunDetail,
  getRunsFiltered,
  getWorkers,
} from "@/lib/api";
import { emitDataUpdated } from "@/lib/app-events";
import { cn } from "@/lib/utils";

const columnSeparatorClass = "border-r border-border/60";

function statusClasses(status: string) {
  if (status === "completed") return "border-emerald-200 bg-emerald-100 text-emerald-800";
  if (status === "running") return "border-sky-200 bg-sky-100 text-sky-800";
  if (status === "queued") return "border-amber-200 bg-amber-100 text-amber-800";
  return "border-rose-200 bg-rose-100 text-rose-800";
}

function stepClasses(status: string) {
  if (status === "completed") return "bg-emerald-500";
  if (status === "running") return "bg-sky-500";
  if (status === "failed") return "bg-rose-500";
  return "bg-border";
}

function titleize(value: string) {
  return value.replaceAll("_", " ").replace(/\b\w/g, (match) => match.toUpperCase());
}

function formatDateTime(value?: string | null) {
  return value ? new Date(value).toLocaleString() : "n/a";
}

function formatDuration(seconds?: number | null) {
  if (!seconds) return "n/a";
  const minutes = Math.floor(seconds / 60);
  const remainder = seconds % 60;
  return `${minutes}m ${remainder}s`;
}

function normalizeRunErrorMessage(message: string) {
  return message.replace(/^"+|"+$/g, "").trim();
}

export function RunsManager() {
  const { activeWorkspace } = useWorkspace();
  const pollIntervalMs = 4000;
  const pageSize = 10;
  const [workspaceId, setWorkspaceId] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [selectedStatuses, setSelectedStatuses] = useState<string[]>([]);
  const [selectedTypes, setSelectedTypes] = useState<string[]>([]);
  const [runs, setRuns] = useState<Run[]>([]);
  const [runPage, setRunPage] = useState<RunList>({ items: [], total: 0, limit: pageSize, offset: 0 });
  const [sortBy, setSortBy] = useState<"created_at" | "started_at" | "completed_at" | "status" | "run_type" | "visibility_delta">("created_at");
  const [sortOrder, setSortOrder] = useState<"asc" | "desc">("desc");
  const [workers, setWorkers] = useState<Worker[]>([]);
  const [queueJobs, setQueueJobs] = useState<QueueJob[]>([]);
  const [failures, setFailures] = useState<ConnectorIncident[]>([]);
  const [selectedRunId, setSelectedRunId] = useState<string | null>(null);
  const [selectedRun, setSelectedRun] = useState<RunDetail | null>(null);
  const [isStartingRun, setIsStartingRun] = useState(false);
  const [runActionError, setRunActionError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!activeWorkspace) return;
    const requestOffset = workspaceId === activeWorkspace.id ? runPage.offset : 0;
    const [runRows, workerRows, queueRows, incidentRows] = await Promise.all([
      getRunsFiltered(activeWorkspace.id, {
        statuses: selectedStatuses,
        runTypes: selectedTypes,
        search: query,
        limit: pageSize,
        offset: requestOffset,
        sortBy,
        sortOrder,
      }),
      getWorkers(),
      getQueueJobs(activeWorkspace.id),
      getConnectorIncidents(activeWorkspace.id),
    ]);
    startTransition(() => {
      setWorkspaceId(activeWorkspace.id);
      setRuns(runRows.items);
      setRunPage(runRows);
      setWorkers(workerRows);
      setQueueJobs(queueRows);
      setFailures(incidentRows);
    });
  }, [activeWorkspace, pageSize, query, runPage.offset, selectedStatuses, selectedTypes, sortBy, sortOrder, workspaceId]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (!selectedRunId) return;
    void getRunDetail(selectedRunId).then(setSelectedRun);
  }, [selectedRunId]);

  const kpis = {
    total: runPage.summary?.total ?? runPage.total,
    running: runPage.summary?.running ?? 0,
    failed: runPage.summary?.failed ?? 0,
    avgDelta: runPage.summary?.avg_visibility_delta ?? 0,
    lastCompleted: runPage.summary?.last_completed_at ?? null,
  };

  const statusOptions = ["completed", "running", "queued", "failed"];
  const typeOptions = ["full_eval", "prompt_only", "reingest", "backfill"];
  const hasRunsData = runs.length > 0;
  const shouldPoll =
    isStartingRun ||
    kpis.running > 0 ||
    queueJobs.some((job) => job.status === "queued" || job.status === "running") ||
    selectedRun?.status === "queued" ||
    selectedRun?.status === "running";

  useEffect(() => {
    if (!shouldPoll) return;

    const intervalId = window.setInterval(() => {
      void load();
      if (selectedRunId) {
        void getRunDetail(selectedRunId).then(setSelectedRun);
      }
    }, pollIntervalMs);

    return () => window.clearInterval(intervalId);
  }, [load, pollIntervalMs, selectedRun?.status, selectedRunId, shouldPoll]);

  const handleStartRun = async () => {
    if (!activeWorkspace || isStartingRun) return;
    setIsStartingRun(true);
    setRunActionError(null);
    try {
      const createdRun = await createManualRun(activeWorkspace.id, {
        run_type: "prompt_only",
        scope_description: "Manual run from Runs page",
      });
      setSelectedRunId(createdRun.id);
      setSelectedRun(createdRun);
      await load();
      emitDataUpdated();
    } catch (error) {
      setRunActionError(
        error instanceof Error ? normalizeRunErrorMessage(error.message) : "Failed to start run"
      );
    } finally {
      setIsStartingRun(false);
    }
  };

  return (
    <div className="space-y-6 pb-8">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Data & Runs</h1>
          <p className="mt-1 text-muted-foreground">Monitor evaluation history, ingestion jobs, and operational issues.</p>
        </div>
        <div className="flex flex-col items-start gap-2">
          <Button onClick={() => void handleStartRun()} disabled={isStartingRun || !activeWorkspace}>
            <PlayCircle className="h-4 w-4" />
            {isStartingRun ? "Queueing..." : "Queue Active Prompts"}
          </Button>
          {shouldPoll ? <p className="text-xs text-muted-foreground">Auto-refreshing run state...</p> : null}
          {runActionError ? (
            <div className="max-w-lg rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">
              {runActionError}
            </div>
          ) : null}
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-5">
        {[
          ["Total Runs", kpis.total],
          ["Running Now", kpis.running],
          ["Failed Runs", kpis.failed],
          ["Avg Visibility Delta", `${kpis.avgDelta.toFixed(1)}%`],
          ["Last Completed", kpis.lastCompleted ? formatDateTime(kpis.lastCompleted) : "n/a"],
        ].map(([label, value]) => (
          <Card key={String(label)}>
            <CardContent className="pt-6">
              <p className="text-xs uppercase tracking-[0.22em] text-muted-foreground">{label}</p>
              <p className="mt-2 text-2xl font-semibold">{value}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      <Card>
        <CardHeader className="gap-4 border-b pb-4">
          <div className="flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
            <div className="flex flex-wrap gap-2">
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="outline">{selectedStatuses.length === 0 ? "All Statuses" : `${selectedStatuses.length} statuses`}</Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="start" className="w-[240px]">
                  <DropdownMenuLabel>Filter Status</DropdownMenuLabel>
                  <DropdownMenuSeparator />
                  <DropdownMenuCheckboxItem
                    checked={selectedStatuses.length === 0}
                    onCheckedChange={() => {
                      setRunPage((current) => ({ ...current, offset: 0 }));
                      setSelectedStatuses([]);
                    }}
                  >
                    All Statuses
                  </DropdownMenuCheckboxItem>
                  <DropdownMenuSeparator />
                  {statusOptions.map((status) => (
                    <DropdownMenuCheckboxItem
                      key={status}
                      checked={selectedStatuses.includes(status)}
                      onCheckedChange={() => {
                        setRunPage((current) => ({ ...current, offset: 0 }));
                        setSelectedStatuses((current) => (current.includes(status) ? current.filter((item) => item !== status) : [...current, status]));
                      }}
                    >
                      {titleize(status)}
                    </DropdownMenuCheckboxItem>
                  ))}
                </DropdownMenuContent>
              </DropdownMenu>

              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="outline">{selectedTypes.length === 0 ? "All Run Types" : `${selectedTypes.length} types`}</Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="start" className="w-[240px]">
                  <DropdownMenuLabel>Filter Run Type</DropdownMenuLabel>
                  <DropdownMenuSeparator />
                  <DropdownMenuCheckboxItem
                    checked={selectedTypes.length === 0}
                    onCheckedChange={() => {
                      setRunPage((current) => ({ ...current, offset: 0 }));
                      setSelectedTypes([]);
                    }}
                  >
                    All Run Types
                  </DropdownMenuCheckboxItem>
                  <DropdownMenuSeparator />
                  {typeOptions.map((type) => (
                    <DropdownMenuCheckboxItem
                      key={type}
                      checked={selectedTypes.includes(type)}
                      onCheckedChange={() => {
                        setRunPage((current) => ({ ...current, offset: 0 }));
                        setSelectedTypes((current) => (current.includes(type) ? current.filter((item) => item !== type) : [...current, type]));
                      }}
                    >
                      {titleize(type)}
                    </DropdownMenuCheckboxItem>
                  ))}
                </DropdownMenuContent>
              </DropdownMenu>

              <select
                value={`${sortBy}:${sortOrder}`}
                onChange={(event) => {
                  const [nextSortBy, nextSortOrder] = event.target.value.split(":") as [
                    "created_at" | "started_at" | "completed_at" | "status" | "run_type" | "visibility_delta",
                    "asc" | "desc",
                  ];
                  setRunPage((current) => ({ ...current, offset: 0 }));
                  setSortBy(nextSortBy);
                  setSortOrder(nextSortOrder);
                }}
                className="h-9 rounded-md border border-input bg-background px-3 text-sm shadow-xs outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50"
              >
                <option value="created_at:desc">Newest first</option>
                <option value="created_at:asc">Oldest first</option>
                <option value="started_at:desc">Started recently</option>
                <option value="completed_at:desc">Completed recently</option>
                <option value="status:asc">Status A-Z</option>
                <option value="run_type:asc">Type A-Z</option>
                <option value="visibility_delta:desc">Highest visibility delta</option>
              </select>
            </div>

            <div className="relative w-full xl:max-w-sm">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={query}
                onChange={(event) => {
                  setRunPage((current) => ({ ...current, offset: 0 }));
                  setQuery(event.target.value);
                }}
                placeholder="Search run id, scope, or model"
                className="pl-9"
              />
            </div>
          </div>
        </CardHeader>

        <CardContent className="p-0">
          {!hasRunsData ? (
            <div className="flex min-h-[320px] flex-col items-center justify-center px-6 text-center">
              <DatabaseZap className="mb-4 h-10 w-10 text-muted-foreground" />
              <h2 className="text-xl font-semibold">No runs yet</h2>
              <p className="mt-2 max-w-lg text-sm text-muted-foreground">
                This workspace has not recorded any evaluation runs. Once prompts are executed, run history, queue state,
                and failures will appear here.
              </p>
            </div>
          ) : (
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
              {runs.map((run) => (
                <TableRow key={run.id} className={cn("cursor-pointer", selectedRunId === run.id && "bg-muted/40")} onClick={() => setSelectedRunId(run.id)}>
                  <TableCell className={cn("pl-6 font-mono text-xs font-medium text-muted-foreground", columnSeparatorClass)}>{run.id}</TableCell>
                  <TableCell className={columnSeparatorClass}>{titleize(run.run_type)}</TableCell>
                  <TableCell className={columnSeparatorClass}>{activeWorkspace?.name ?? "n/a"}</TableCell>
                  <TableCell className={cn("max-w-[220px] truncate", columnSeparatorClass)} title={run.scope_description ?? ""}>{run.scope_description}</TableCell>
                  <TableCell className={cn("max-w-[160px] truncate text-muted-foreground", columnSeparatorClass)} title={run.selected_models.join(", ")}>{run.selected_models.join(", ")}</TableCell>
                  <TableCell className={columnSeparatorClass}>
                    <span className={cn("inline-flex rounded-full border px-2 py-1 text-xs font-medium", statusClasses(run.status))}>{titleize(run.status)}</span>
                  </TableCell>
                  <TableCell className={columnSeparatorClass}>{formatDateTime(run.started_at)}</TableCell>
                  <TableCell className={columnSeparatorClass}>{formatDuration(run.duration_seconds)}</TableCell>
                  <TableCell className={columnSeparatorClass}>{run.prompt_count}</TableCell>
                  <TableCell className={columnSeparatorClass}>{run.mentions_count}</TableCell>
                  <TableCell className={cn("font-medium", columnSeparatorClass)}>{run.visibility_delta?.toFixed(1) ?? "Pending"}{run.visibility_delta !== null && run.visibility_delta !== undefined ? "%" : ""}</TableCell>
                  <TableCell className="pr-6 text-right">
                    <div className="flex justify-end gap-1">
                      <Button variant="ghost" size="icon-sm" title="View details" onClick={(event) => { event.stopPropagation(); setSelectedRunId(run.id); }}>
                        <Eye className="h-4 w-4" />
                      </Button>
                      <Button variant="ghost" size="icon-sm" title="Retry run" onClick={(event) => event.stopPropagation()}>
                        <RefreshCcw className="h-4 w-4" />
                      </Button>
                      {run.status === "running" ? (
                        <Button variant="ghost" size="icon-sm" title="Cancel run" onClick={(event) => event.stopPropagation()}>
                          <PauseCircle className="h-4 w-4" />
                        </Button>
                      ) : (
                        <Button variant="ghost" size="icon-sm" title="Duplicate configuration" onClick={(event) => event.stopPropagation()}>
                          <PlayCircle className="h-4 w-4" />
                        </Button>
                      )}
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
      {hasRunsData ? (
        <div className="flex items-center justify-between text-sm text-muted-foreground">
          <p>
            Showing {runPage.offset + 1}-{Math.min(runPage.offset + runs.length, runPage.total)} of {runPage.total}
          </p>
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              disabled={runPage.offset === 0}
              onClick={() => setRunPage((current) => ({ ...current, offset: Math.max(current.offset - current.limit, 0) }))}
            >
              Previous
            </Button>
            <Button
              variant="outline"
              size="sm"
              disabled={runPage.offset + runPage.limit >= runPage.total}
              onClick={() => setRunPage((current) => ({ ...current, offset: current.offset + current.limit }))}
            >
              Next
            </Button>
          </div>
        </div>
      ) : null}

      <div className="grid gap-4 xl:grid-cols-[1.5fr_1fr]">
        <Card>
          <CardHeader className="border-b pb-4">
            <CardTitle className="text-base">Worker Queue</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4 pt-6">
            <div className="grid gap-3 sm:grid-cols-4">
              {[
                ["Workers", workers.length],
                ["Busy", workers.filter((worker) => worker.status === "busy").length],
                ["Queued Prompt Jobs", queueJobs.filter((job) => job.status === "queued").length],
                ["Active Runs", runs.filter((run) => run.status === "running").length],
              ].map(([label, value]) => (
                <div key={String(label)} className="rounded-xl border bg-muted/20 p-4">
                  <p className="text-xs uppercase tracking-[0.22em] text-muted-foreground">{label}</p>
                  <p className="mt-2 text-2xl font-semibold">{value}</p>
                </div>
              ))}
            </div>

            <div className="space-y-3">
              {queueJobs.length === 0 ? (
                <div className="rounded-xl border border-dashed bg-muted/10 p-4 text-sm text-muted-foreground">
                  No queued prompt jobs for this workspace.
                </div>
              ) : (
                queueJobs.slice(0, 4).map((job) => (
                <div key={job.id} className="rounded-xl border bg-muted/20 p-4">
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <p className="font-medium">{String(job.payload_json?.prompt ?? "Queued prompt job")}</p>
                      <p className="mt-1 text-sm text-muted-foreground">{job.connector_id ? `Connector ${job.connector_id.slice(0, 8)}` : "No connector assigned"}</p>
                    </div>
                    <span className="text-sm font-medium">{titleize(job.status)}</span>
                  </div>
                  <p className="mt-2 text-xs text-muted-foreground">Assignment: {job.worker_id ? `Worker ${job.worker_id.slice(0, 8)}` : "Queued"}</p>
                </div>
                ))
              )}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="border-b pb-4">
            <CardTitle className="text-base">Connector Failures</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 pt-6">
            {failures.length === 0 ? (
              <div className="rounded-xl border border-dashed bg-muted/10 p-4 text-sm text-muted-foreground">
                No connector failures reported for this workspace.
              </div>
            ) : failures.map((failure) => (
              <div key={failure.id} className="rounded-xl border border-rose-200 bg-rose-50/60 p-4">
                <div className="flex items-start gap-3">
                  <AlertTriangle className="mt-0.5 h-4 w-4 text-rose-700" />
                  <div>
                    <p className="font-medium">{failure.title}</p>
                    <p className="mt-1 text-sm text-rose-900">{failure.detail}</p>
                    <p className="mt-2 text-xs text-muted-foreground">{formatDateTime(failure.occurred_at)}</p>
                  </div>
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
      </div>

      {selectedRunId && selectedRun && (
        <div className="fixed inset-y-0 right-0 z-50 w-full max-w-xl border-l bg-background shadow-2xl">
          <div className="flex h-full flex-col">
            <div className="flex items-start justify-between border-b px-6 py-5">
              <div>
                <p className="font-mono text-xs text-muted-foreground">{selectedRun.id}</p>
                <h2 className="mt-1 text-xl font-semibold">{titleize(selectedRun.run_type)}</h2>
                <p className="mt-1 text-sm text-muted-foreground">{selectedRun.summary}</p>
              </div>
              <Button variant="ghost" size="icon-sm" onClick={() => setSelectedRunId(null)}>
                <X className="h-4 w-4" />
              </Button>
            </div>

            <div className="flex-1 space-y-6 overflow-y-auto px-6 py-6">
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="rounded-xl border bg-muted/20 p-4">
                  <div className="flex items-center gap-2 text-sm font-medium"><Activity className="h-4 w-4" />Status</div>
                  <p className="mt-3 text-base font-semibold">{titleize(selectedRun.status)}</p>
                </div>
                <div className="rounded-xl border bg-muted/20 p-4">
                  <div className="flex items-center gap-2 text-sm font-medium"><Clock3 className="h-4 w-4" />Duration</div>
                  <p className="mt-3 text-base font-semibold">{formatDuration(selectedRun.duration_seconds)}</p>
                </div>
                <div className="rounded-xl border bg-muted/20 p-4">
                  <div className="flex items-center gap-2 text-sm font-medium"><DatabaseZap className="h-4 w-4" />Mentions Collected</div>
                  <p className="mt-3 text-base font-semibold">{selectedRun.mentions_count}</p>
                </div>
                <div className="rounded-xl border bg-muted/20 p-4">
                  <div className="flex items-center gap-2 text-sm font-medium"><Download className="h-4 w-4" />Visibility Delta</div>
                  <p className="mt-3 text-base font-semibold">{selectedRun.visibility_delta?.toFixed(1) ?? "Pending"}{selectedRun.visibility_delta !== null && selectedRun.visibility_delta !== undefined ? "%" : ""}</p>
                </div>
              </div>

              <section className="space-y-3">
                <h3 className="text-sm font-semibold uppercase tracking-[0.18em] text-muted-foreground">Timeline</h3>
                <div className="space-y-3">
                  {selectedRun.step_events.map((step) => (
                    <div key={step.id} className="flex items-center gap-3">
                      <span className={cn("h-2.5 w-2.5 rounded-full", stepClasses(step.status))} />
                      <p className="text-sm">{step.step_name}</p>
                    </div>
                  ))}
                </div>
              </section>

              <section className="space-y-3">
                <h3 className="text-sm font-semibold uppercase tracking-[0.18em] text-muted-foreground">Per-Model Status</h3>
                <div className="space-y-2">
                  {selectedRun.scrape_results.map((item) => (
                    <div key={item.id} className="flex items-center justify-between rounded-lg border px-3 py-2">
                      <div>
                        <p className="font-medium">{item.llm_model}</p>
                        <p className="text-xs text-muted-foreground">{item.mentions_count} mentions collected</p>
                      </div>
                      <p className="text-sm">{item.target_mentioned ? "Target mentioned" : "No target mention"}</p>
                    </div>
                  ))}
                </div>
              </section>

              <section className="space-y-3">
                <h3 className="text-sm font-semibold uppercase tracking-[0.18em] text-muted-foreground">Run Logs</h3>
                <div className="space-y-2 rounded-xl border bg-muted/20 p-4">
                  {selectedRun.logs.map((log) => (
                    <p key={log.id} className="font-mono text-xs text-muted-foreground">{log.message}</p>
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
