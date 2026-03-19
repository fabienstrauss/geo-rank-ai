"use client";

import { useEffect, useMemo, useState } from "react";
import { AlertTriangle, ArrowUpRight, Cpu, HardDrive, Layers3, ServerCog, ShieldCheck, WifiOff } from "lucide-react";

import { Button } from "@/components/ui/button";
import { useWorkspace } from "@/components/workspace-provider";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Connector, ConnectorIncident, QueueJob, Worker, getConnectorIncidents, getConnectors, getQueueJobs, getWorkers } from "@/lib/api";
import { cn } from "@/lib/utils";

function workerStatusClasses(status: string) {
  if (status === "online") return "border-emerald-200 bg-emerald-100 text-emerald-800";
  if (status === "busy") return "border-sky-200 bg-sky-100 text-sky-800";
  if (status === "degraded") return "border-amber-200 bg-amber-100 text-amber-800";
  return "border-rose-200 bg-rose-100 text-rose-800";
}

function percentBarClasses(value: number) {
  if (value >= 80) return "bg-rose-500";
  if (value >= 60) return "bg-amber-500";
  return "bg-emerald-500";
}

function formatDuration(seconds: number) {
  const days = Math.floor(seconds / 86400);
  const hours = Math.floor((seconds % 86400) / 3600);
  return `${days}d ${hours}h`;
}

export function SystemManager() {
  const { activeWorkspace } = useWorkspace();
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("All");
  const [workers, setWorkers] = useState<Worker[]>([]);
  const [connectors, setConnectors] = useState<Connector[]>([]);
  const [incidents, setIncidents] = useState<ConnectorIncident[]>([]);
  const [queueJobs, setQueueJobs] = useState<QueueJob[]>([]);

  useEffect(() => {
    async function load() {
      if (!activeWorkspace) return;
      const [workerRows, connectorRows, incidentRows, queueRows] = await Promise.all([
        getWorkers(),
        getConnectors(activeWorkspace.id),
        getConnectorIncidents(activeWorkspace.id),
        getQueueJobs(activeWorkspace.id),
      ]);
      setWorkers(workerRows);
      setConnectors(connectorRows);
      setIncidents(incidentRows);
      setQueueJobs(queueRows);
    }

    void load();
  }, [activeWorkspace]);

  const filteredWorkers = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    return workers.filter((worker) => {
      const matchesQuery =
        normalized.length === 0 ||
        worker.worker_name.toLowerCase().includes(normalized) ||
        worker.pool_name.toLowerCase().includes(normalized) ||
        (worker.current_job ?? "").toLowerCase().includes(normalized);
      const matchesStatus = statusFilter === "All" || worker.status === statusFilter.toLowerCase();
      return matchesQuery && matchesStatus;
    });
  }, [query, statusFilter, workers]);

  const totals = {
    online: workers.filter((worker) => worker.status !== "offline").length,
    busy: workers.filter((worker) => worker.status === "busy").length,
    degraded: workers.filter((worker) => worker.status === "degraded").length,
    queueDepth: workers.reduce((sum, worker) => sum + worker.queue_depth, 0),
    avgCpu: Math.round(workers.reduce((sum, worker) => sum + worker.cpu_percent, 0) / Math.max(workers.length, 1)),
    avgMemory: Math.round(workers.reduce((sum, worker) => sum + worker.memory_percent, 0) / Math.max(workers.length, 1)),
  };
  const hasSystemData = workers.length > 0 || connectors.length > 0 || incidents.length > 0 || queueJobs.length > 0;

  return (
    <div className="space-y-6 pb-8">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">System Infrastructure</h1>
        <p className="mt-1 text-muted-foreground">Monitor worker capacity, connector health, queue pressure, and runtime incidents.</p>
      </div>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-6">
        {[
          ["Workers Online", `${totals.online}/${workers.length || 0}`],
          ["Busy Workers", totals.busy],
          ["Degraded Nodes", totals.degraded],
          ["Queue Depth", totals.queueDepth],
          ["Avg CPU", `${totals.avgCpu}%`],
          ["Avg Memory", `${totals.avgMemory}%`],
        ].map(([label, value]) => (
          <Card key={String(label)}>
            <CardContent className="pt-6">
              <p className="text-xs uppercase tracking-[0.22em] text-muted-foreground">{label}</p>
              <p className="mt-2 text-2xl font-semibold">{value}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      {!hasSystemData ? (
        <Card>
          <CardContent className="flex min-h-[320px] flex-col items-center justify-center text-center">
            <ServerCog className="mb-4 h-10 w-10 text-muted-foreground" />
            <h2 className="text-xl font-semibold">No system records yet</h2>
            <p className="mt-2 max-w-lg text-sm text-muted-foreground">
              This workspace does not have connectors, workers, queue jobs, or incidents yet. System health will appear
              here once those records exist.
            </p>
          </CardContent>
        </Card>
      ) : (
      <>
      <div className="grid gap-4 xl:grid-cols-[1.4fr_1fr]">
        <Card>
          <CardHeader className="border-b pb-4">
            <CardTitle className="text-base">Worker Fleet</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4 pt-6">
            <div className="flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
              <div className="flex flex-wrap gap-2">
                {["All", "Online", "Busy", "Degraded", "Offline"].map((status) => (
                  <Button key={status} size="sm" variant={statusFilter === status ? "default" : "outline"} onClick={() => setStatusFilter(status)}>
                    {status}
                  </Button>
                ))}
              </div>
              <div className="w-full xl:max-w-sm">
                <Input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search worker, pool, or job" />
              </div>
            </div>

            <div className="grid gap-3 2xl:grid-cols-2">
              {filteredWorkers.length === 0 ? (
                <div className="rounded-xl border border-dashed bg-muted/10 p-4 text-sm text-muted-foreground">
                  No workers match the current filters.
                </div>
              ) : filteredWorkers.map((worker) => (
                <div key={worker.id} className="rounded-xl border bg-muted/20 p-4">
                  <div className="flex flex-col gap-3 border-b pb-3 md:flex-row md:items-start md:justify-between">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="font-semibold">{worker.worker_name}</p>
                        <span className={cn("inline-flex rounded-full border px-2 py-1 text-xs font-medium", workerStatusClasses(worker.status))}>
                          {worker.status}
                        </span>
                      </div>
                      <p className="mt-1 text-sm text-muted-foreground">{worker.pool_name}</p>
                    </div>
                    <div className="text-sm text-muted-foreground">
                      <p>Heartbeat: {worker.last_heartbeat_at ? new Date(worker.last_heartbeat_at).toLocaleString() : "n/a"}</p>
                      <p>Uptime: {formatDuration(worker.uptime_seconds)}</p>
                    </div>
                  </div>

                  <div className="grid gap-3 pt-3 sm:grid-cols-2">
                    <div className="rounded-lg border bg-background px-3 py-2">
                      <p className="text-xs uppercase tracking-[0.2em] text-muted-foreground">Current Job</p>
                      <p className="mt-1 break-words text-sm font-medium">{worker.current_job || "Idle"}</p>
                    </div>
                    <div className="rounded-lg border bg-background px-3 py-2">
                      <p className="text-xs uppercase tracking-[0.2em] text-muted-foreground">Queue Depth</p>
                      <p className="mt-1 text-sm font-medium">{worker.queue_depth}</p>
                    </div>
                    <div className="rounded-lg border bg-background px-3 py-2">
                      <p className="text-xs uppercase tracking-[0.2em] text-muted-foreground">CPU</p>
                      <div className="mt-2 space-y-1">
                        <div className="h-2 overflow-hidden rounded-full bg-muted">
                          <div className={cn("h-full rounded-full", percentBarClasses(worker.cpu_percent))} style={{ width: `${worker.cpu_percent}%` }} />
                        </div>
                        <p className="text-xs text-muted-foreground">{Math.round(worker.cpu_percent)}%</p>
                      </div>
                    </div>
                    <div className="rounded-lg border bg-background px-3 py-2">
                      <p className="text-xs uppercase tracking-[0.2em] text-muted-foreground">Memory</p>
                      <div className="mt-2 space-y-1">
                        <div className="h-2 overflow-hidden rounded-full bg-muted">
                          <div className={cn("h-full rounded-full", percentBarClasses(worker.memory_percent))} style={{ width: `${worker.memory_percent}%` }} />
                        </div>
                        <p className="text-xs text-muted-foreground">{Math.round(worker.memory_percent)}%</p>
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        <div className="space-y-4">
          <Card>
            <CardHeader className="border-b pb-4">
              <CardTitle className="text-base">Connector Health</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 pt-6">
              {connectors.length === 0 ? (
                <div className="rounded-xl border border-dashed bg-muted/10 p-4 text-sm text-muted-foreground">
                  No connectors configured for this workspace.
                </div>
              ) : connectors.map((connector) => (
                <div key={connector.id} className="rounded-xl border bg-muted/20 p-4">
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <p className="font-medium">{connector.name}</p>
                      <p className="mt-1 text-sm text-muted-foreground">{connector.last_error || "Stable connector health."}</p>
                    </div>
                    <span className={cn("inline-flex rounded-full border px-2 py-1 text-xs font-medium", connector.health_status === "healthy" ? "border-emerald-200 bg-emerald-100 text-emerald-800" : "border-amber-200 bg-amber-100 text-amber-800")}>
                      {connector.health_status}
                    </span>
                  </div>
                  <div className="mt-3 grid gap-3 sm:grid-cols-2">
                    <div className="rounded-lg border bg-background px-3 py-2">
                      <p className="text-xs uppercase tracking-[0.2em] text-muted-foreground">Success Rate</p>
                      <p className="mt-1 text-sm font-semibold">{connector.success_rate?.toFixed(1)}%</p>
                    </div>
                    <div className="rounded-lg border bg-background px-3 py-2">
                      <p className="text-xs uppercase tracking-[0.2em] text-muted-foreground">Latency</p>
                      <p className="mt-1 text-sm font-semibold">{connector.average_latency_ms} ms</p>
                    </div>
                  </div>
                </div>
              ))}
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="border-b pb-4">
              <CardTitle className="text-base">Capacity Snapshot</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4 pt-6">
              <div className="rounded-xl border bg-muted/20 p-4">
                <div className="flex items-center gap-2 text-sm font-medium">
                  <Layers3 className="h-4 w-4" />
                  Queue Pressure
                </div>
                <p className="mt-2 text-sm text-muted-foreground">{queueJobs.filter((job) => job.status === "queued").length} queued jobs across {connectors.length} connector types.</p>
              </div>
              <div className="rounded-xl border bg-muted/20 p-4">
                <div className="flex items-center gap-2 text-sm font-medium">
                  <ServerCog className="h-4 w-4" />
                  Active Connectors
                </div>
                <p className="mt-2 text-sm text-muted-foreground">{connectors.filter((connector) => connector.is_enabled).length} connectors enabled for scraping and evaluation.</p>
              </div>
              <div className="rounded-xl border bg-muted/20 p-4">
                <div className="flex items-center gap-2 text-sm font-medium">
                  <ShieldCheck className="h-4 w-4" />
                  Recommended Next Step
                </div>
                <p className="mt-2 text-sm text-muted-foreground">Add connector-specific pause/disable controls in Settings once the control plane endpoints exist.</p>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>

      <div className="grid gap-4 xl:grid-cols-[1.1fr_0.9fr]">
        <Card>
          <CardHeader className="border-b pb-4">
            <CardTitle className="text-base">Runtime Incidents</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 pt-6">
            {incidents.length === 0 ? (
              <div className="rounded-xl border border-dashed bg-muted/10 p-4 text-sm text-muted-foreground">
                No runtime incidents reported for this workspace.
              </div>
            ) : incidents.map((incident) => (
              <div key={incident.id} className={cn("rounded-xl border p-4", incident.severity === "critical" ? "border-rose-200 bg-rose-50/60" : incident.severity === "warning" ? "border-amber-200 bg-amber-50/70" : "border-sky-200 bg-sky-50/70")}>
                <div className="flex items-start gap-3">
                  {incident.severity === "critical" ? <WifiOff className="mt-0.5 h-4 w-4 text-rose-700" /> : incident.severity === "warning" ? <AlertTriangle className="mt-0.5 h-4 w-4 text-amber-700" /> : <ArrowUpRight className="mt-0.5 h-4 w-4 text-sky-700" />}
                  <div>
                    <div className="flex items-center gap-2">
                      <p className="font-medium">{incident.title}</p>
                      <span className="text-xs text-muted-foreground">{new Date(incident.occurred_at).toLocaleString()}</span>
                    </div>
                    <p className="mt-1 text-sm text-muted-foreground">{incident.detail}</p>
                  </div>
                </div>
              </div>
            ))}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="border-b pb-4">
            <CardTitle className="text-base">Operational Notes</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 pt-6">
            <div className="rounded-xl border bg-muted/20 p-4">
              <div className="flex items-center gap-2 text-sm font-medium">
                <Cpu className="h-4 w-4" />
                CPU Pressure
              </div>
              <p className="mt-2 text-sm text-muted-foreground">Browser automation workers remain the limiting resource during peak reruns.</p>
            </div>
            <div className="rounded-xl border bg-muted/20 p-4">
              <div className="flex items-center gap-2 text-sm font-medium">
                <HardDrive className="h-4 w-4" />
                Memory Pressure
              </div>
              <p className="mt-2 text-sm text-muted-foreground">High-memory nodes should be recycled before queue spikes cascade into degraded workers.</p>
            </div>
            <div className="rounded-xl border bg-muted/20 p-4">
              <div className="flex items-center gap-2 text-sm font-medium">
                <ShieldCheck className="h-4 w-4" />
                Queue State
              </div>
              <p className="mt-2 text-sm text-muted-foreground">{queueJobs.filter((job) => job.status === "running").length} jobs are actively assigned to workers right now.</p>
            </div>
          </CardContent>
        </Card>
      </div>
      </>
      )}
    </div>
  );
}
