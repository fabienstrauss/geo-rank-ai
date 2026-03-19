"use client";

import { useMemo, useState } from "react";
import {
  AlertTriangle,
  ArrowUpRight,
  Cpu,
  HardDrive,
  Layers3,
  ServerCog,
  ShieldCheck,
  WifiOff,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

type WorkerStatus = "Online" | "Busy" | "Degraded" | "Offline";

type WorkerRecord = {
  id: string;
  pool: string;
  connector: string;
  status: WorkerStatus;
  currentJob: string;
  queueDepth: number;
  cpu: number;
  memory: number;
  uptime: string;
  lastHeartbeat: string;
};

const workers: WorkerRecord[] = [
  {
    id: "worker-01",
    pool: "Primary API Pool",
    connector: "LLM API scraper",
    status: "Busy",
    currentJob: "Sales comparison prompts",
    queueDepth: 4,
    cpu: 72,
    memory: 68,
    uptime: "4d 12h",
    lastHeartbeat: "12s ago",
  },
  {
    id: "worker-02",
    pool: "Primary API Pool",
    connector: "LLM API scraper",
    status: "Online",
    currentJob: "Idle",
    queueDepth: 1,
    cpu: 29,
    memory: 34,
    uptime: "3d 08h",
    lastHeartbeat: "8s ago",
  },
  {
    id: "worker-03",
    pool: "Browser Automation Pool",
    connector: "UI scraper",
    status: "Busy",
    currentJob: "Brand perception rerun",
    queueDepth: 5,
    cpu: 81,
    memory: 76,
    uptime: "1d 19h",
    lastHeartbeat: "11s ago",
  },
  {
    id: "worker-04",
    pool: "Browser Automation Pool",
    connector: "UI scraper",
    status: "Degraded",
    currentJob: "Session recovery",
    queueDepth: 3,
    cpu: 64,
    memory: 83,
    uptime: "19h",
    lastHeartbeat: "39s ago",
  },
  {
    id: "worker-05",
    pool: "Burst Pool",
    connector: "LLM API scraper",
    status: "Online",
    currentJob: "Idle",
    queueDepth: 0,
    cpu: 18,
    memory: 26,
    uptime: "7h",
    lastHeartbeat: "6s ago",
  },
  {
    id: "worker-06",
    pool: "Burst Pool",
    connector: "UI scraper",
    status: "Offline",
    currentJob: "Maintenance",
    queueDepth: 0,
    cpu: 0,
    memory: 0,
    uptime: "0h",
    lastHeartbeat: "14m ago",
  },
];

const connectors = [
  {
    name: "LLM API scraper",
    health: "Healthy",
    successRate: "98.4%",
    latency: "1.8s avg",
    note: "Stable throughput across GPT and Claude provider routes.",
  },
  {
    name: "UI scraper",
    health: "Warning",
    successRate: "89.1%",
    latency: "4.9s avg",
    note: "Session refresh failures on one browser node are increasing retry volume.",
  },
];

const incidents = [
  {
    time: "10:14",
    severity: "Warning",
    title: "UI scraper session renewals failing",
    detail: "Worker-04 hit repeated login challenge loops and was moved to degraded mode.",
  },
  {
    time: "09:52",
    severity: "Info",
    title: "Burst pool scaled up",
    detail: "Two temporary workers were attached after queue depth exceeded 15 prompt jobs.",
  },
  {
    time: "08:41",
    severity: "Critical",
    title: "Provider rate limits spiked",
    detail: "LLM API scraper returned 429 bursts across one region before backoff stabilized.",
  },
];

function workerStatusClasses(status: WorkerStatus) {
  if (status === "Online") return "border-emerald-200 bg-emerald-100 text-emerald-800";
  if (status === "Busy") return "border-sky-200 bg-sky-100 text-sky-800";
  if (status === "Degraded") return "border-amber-200 bg-amber-100 text-amber-800";
  return "border-rose-200 bg-rose-100 text-rose-800";
}

function percentBarClasses(value: number) {
  if (value >= 80) return "bg-rose-500";
  if (value >= 60) return "bg-amber-500";
  return "bg-emerald-500";
}

export function SystemManager() {
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<WorkerStatus | "All">("All");

  const filteredWorkers = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();

    return workers.filter((worker) => {
      const matchesQuery =
        normalizedQuery.length === 0 ||
        worker.id.toLowerCase().includes(normalizedQuery) ||
        worker.pool.toLowerCase().includes(normalizedQuery) ||
        worker.connector.toLowerCase().includes(normalizedQuery) ||
        worker.currentJob.toLowerCase().includes(normalizedQuery);
      const matchesStatus = statusFilter === "All" || worker.status === statusFilter;

      return matchesQuery && matchesStatus;
    });
  }, [query, statusFilter]);

  const totals = {
    online: workers.filter((worker) => worker.status !== "Offline").length,
    busy: workers.filter((worker) => worker.status === "Busy").length,
    degraded: workers.filter((worker) => worker.status === "Degraded").length,
    queueDepth: workers.reduce((sum, worker) => sum + worker.queueDepth, 0),
    avgCpu: Math.round(workers.reduce((sum, worker) => sum + worker.cpu, 0) / workers.length),
    avgMemory: Math.round(workers.reduce((sum, worker) => sum + worker.memory, 0) / workers.length),
  };

  return (
    <div className="space-y-6 pb-8">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">System Infrastructure</h1>
        <p className="mt-1 text-muted-foreground">
          Monitor worker capacity, connector health, queue pressure, and runtime incidents.
        </p>
      </div>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-6">
        <Card>
          <CardContent className="pt-6">
            <p className="text-xs uppercase tracking-[0.22em] text-muted-foreground">Workers Online</p>
            <p className="mt-2 text-2xl font-semibold">{totals.online}/6</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <p className="text-xs uppercase tracking-[0.22em] text-muted-foreground">Busy Workers</p>
            <p className="mt-2 text-2xl font-semibold">{totals.busy}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <p className="text-xs uppercase tracking-[0.22em] text-muted-foreground">Degraded Nodes</p>
            <p className="mt-2 text-2xl font-semibold">{totals.degraded}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <p className="text-xs uppercase tracking-[0.22em] text-muted-foreground">Queue Depth</p>
            <p className="mt-2 text-2xl font-semibold">{totals.queueDepth}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <p className="text-xs uppercase tracking-[0.22em] text-muted-foreground">Avg CPU</p>
            <p className="mt-2 text-2xl font-semibold">{totals.avgCpu}%</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <p className="text-xs uppercase tracking-[0.22em] text-muted-foreground">Avg Memory</p>
            <p className="mt-2 text-2xl font-semibold">{totals.avgMemory}%</p>
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-4 xl:grid-cols-[1.4fr_1fr]">
        <Card>
          <CardHeader className="border-b pb-4">
            <CardTitle className="text-base">Worker Fleet</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4 pt-6">
            <div className="flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
              <div className="flex flex-wrap gap-2">
                {(["All", "Online", "Busy", "Degraded", "Offline"] as const).map((status) => (
                  <Button
                    key={status}
                    size="sm"
                    variant={statusFilter === status ? "default" : "outline"}
                    onClick={() => setStatusFilter(status)}
                  >
                    {status}
                  </Button>
                ))}
              </div>

              <div className="w-full xl:max-w-sm">
                <Input
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                  placeholder="Search worker, pool, connector, or job"
                />
              </div>
            </div>

            <div className="grid gap-3 2xl:grid-cols-2">
              {filteredWorkers.map((worker) => (
                <div key={worker.id} className="rounded-xl border bg-muted/20 p-4">
                  <div className="flex flex-col gap-3 border-b pb-3 md:flex-row md:items-start md:justify-between">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="font-semibold">{worker.id}</p>
                        <span className={cn("inline-flex rounded-full border px-2 py-1 text-xs font-medium", workerStatusClasses(worker.status))}>
                          {worker.status}
                        </span>
                      </div>
                      <p className="mt-1 text-sm text-muted-foreground">{worker.pool}</p>
                      <p className="text-sm text-muted-foreground">{worker.connector}</p>
                    </div>
                    <div className="text-sm text-muted-foreground">
                      <p>Heartbeat: {worker.lastHeartbeat}</p>
                      <p>Uptime: {worker.uptime}</p>
                    </div>
                  </div>

                  <div className="grid gap-3 pt-3 sm:grid-cols-2">
                    <div className="rounded-lg border bg-background px-3 py-2">
                      <p className="text-xs uppercase tracking-[0.2em] text-muted-foreground">Current Job</p>
                      <p className="mt-1 break-words text-sm font-medium">{worker.currentJob}</p>
                    </div>
                    <div className="rounded-lg border bg-background px-3 py-2">
                      <p className="text-xs uppercase tracking-[0.2em] text-muted-foreground">Queue Depth</p>
                      <p className="mt-1 text-sm font-medium">{worker.queueDepth}</p>
                    </div>
                    <div className="rounded-lg border bg-background px-3 py-2">
                      <p className="text-xs uppercase tracking-[0.2em] text-muted-foreground">CPU</p>
                      <div className="mt-2 space-y-1">
                        <div className="h-2 overflow-hidden rounded-full bg-muted">
                          <div className={cn("h-full rounded-full", percentBarClasses(worker.cpu))} style={{ width: `${worker.cpu}%` }} />
                        </div>
                        <p className="text-xs text-muted-foreground">{worker.cpu}%</p>
                      </div>
                    </div>
                    <div className="rounded-lg border bg-background px-3 py-2">
                      <p className="text-xs uppercase tracking-[0.2em] text-muted-foreground">Memory</p>
                      <div className="mt-2 space-y-1">
                        <div className="h-2 overflow-hidden rounded-full bg-muted">
                          <div className={cn("h-full rounded-full", percentBarClasses(worker.memory))} style={{ width: `${worker.memory}%` }} />
                        </div>
                        <p className="text-xs text-muted-foreground">{worker.memory}%</p>
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
              {connectors.map((connector) => (
                <div key={connector.name} className="rounded-xl border bg-muted/20 p-4">
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <p className="font-medium">{connector.name}</p>
                      <p className="mt-1 text-sm text-muted-foreground">{connector.note}</p>
                    </div>
                    <span
                      className={cn(
                        "inline-flex rounded-full border px-2 py-1 text-xs font-medium",
                        connector.health === "Healthy"
                          ? "border-emerald-200 bg-emerald-100 text-emerald-800"
                          : "border-amber-200 bg-amber-100 text-amber-800"
                      )}
                    >
                      {connector.health}
                    </span>
                  </div>
                  <div className="mt-3 grid gap-3 sm:grid-cols-2">
                    <div className="rounded-lg border bg-background px-3 py-2">
                      <p className="text-xs uppercase tracking-[0.2em] text-muted-foreground">Success Rate</p>
                      <p className="mt-1 text-sm font-semibold">{connector.successRate}</p>
                    </div>
                    <div className="rounded-lg border bg-background px-3 py-2">
                      <p className="text-xs uppercase tracking-[0.2em] text-muted-foreground">Latency</p>
                      <p className="mt-1 text-sm font-semibold">{connector.latency}</p>
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
                  Pool Split
                </div>
                <p className="mt-2 text-sm text-muted-foreground">3 API workers, 2 browser workers, 1 burst standby node.</p>
              </div>
              <div className="rounded-xl border bg-muted/20 p-4">
                <div className="flex items-center gap-2 text-sm font-medium">
                  <ServerCog className="h-4 w-4" />
                  Autoscaling
                </div>
                <p className="mt-2 text-sm text-muted-foreground">Burst pool activates when prompt queue depth exceeds 12 jobs.</p>
              </div>
              <div className="rounded-xl border bg-muted/20 p-4">
                <div className="flex items-center gap-2 text-sm font-medium">
                  <ShieldCheck className="h-4 w-4" />
                  Failover
                </div>
                <p className="mt-2 text-sm text-muted-foreground">API routes fail over automatically; UI scraper nodes degrade instead of hard failing.</p>
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
            {incidents.map((incident) => (
              <div
                key={`${incident.time}-${incident.title}`}
                className={cn(
                  "rounded-xl border p-4",
                  incident.severity === "Critical"
                    ? "border-rose-200 bg-rose-50/60"
                    : incident.severity === "Warning"
                      ? "border-amber-200 bg-amber-50/70"
                      : "border-sky-200 bg-sky-50/70"
                )}
              >
                <div className="flex items-start gap-3">
                  {incident.severity === "Critical" ? (
                    <WifiOff className="mt-0.5 h-4 w-4 text-rose-700" />
                  ) : incident.severity === "Warning" ? (
                    <AlertTriangle className="mt-0.5 h-4 w-4 text-amber-700" />
                  ) : (
                    <ArrowUpRight className="mt-0.5 h-4 w-4 text-sky-700" />
                  )}
                  <div>
                    <div className="flex items-center gap-2">
                      <p className="font-medium">{incident.title}</p>
                      <span className="text-xs text-muted-foreground">{incident.time}</span>
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
              <p className="mt-2 text-sm text-muted-foreground">
                Browser automation workers are the limiting resource during peak prompt reruns.
              </p>
            </div>
            <div className="rounded-xl border bg-muted/20 p-4">
              <div className="flex items-center gap-2 text-sm font-medium">
                <HardDrive className="h-4 w-4" />
                Memory Pressure
              </div>
              <p className="mt-2 text-sm text-muted-foreground">
                Session-heavy UI scraper nodes cross 80% memory first; those should be recycled before queue spikes.
              </p>
            </div>
            <div className="rounded-xl border bg-muted/20 p-4">
              <div className="flex items-center gap-2 text-sm font-medium">
                <ShieldCheck className="h-4 w-4" />
                Recommended Next Step
              </div>
              <p className="mt-2 text-sm text-muted-foreground">
                Add connector-specific controls in Settings so operators can pause, disable, or reroute failing scraper modes.
              </p>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
