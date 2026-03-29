"use client";

import { useEffect, useState } from "react";
import { MessageCircle, Search, Share2, TrendingUp } from "lucide-react";

import { SentimentQuadrantChart, SourcesPieChart, VisibilityChart } from "@/components/dashboard-charts";
import { useWorkspace } from "@/components/workspace-provider";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { DashboardData, getDashboard } from "@/lib/api";
import { subscribeToDataUpdated } from "@/lib/app-events";

const statIcons = [TrendingUp, Search, Share2, MessageCircle];

export default function Home() {
  const { activeWorkspace } = useWorkspace();
  const [dashboard, setDashboard] = useState<DashboardData | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      if (!activeWorkspace) return;
      const response = await getDashboard(activeWorkspace.id);
      if (!cancelled) {
        setDashboard(response);
      }
    }

    void load();
    return () => {
      cancelled = true;
    };
  }, [activeWorkspace]);

  useEffect(() => {
    return subscribeToDataUpdated(() => {
      if (!activeWorkspace) return;
      void getDashboard(activeWorkspace.id).then(setDashboard);
    });
  }, [activeWorkspace]);

  const hasDashboardData =
    (dashboard?.stats?.length ?? 0) > 0 ||
    (dashboard?.competitors?.length ?? 0) > 0 ||
    (dashboard?.top_sources?.length ?? 0) > 0;

  return (
    <div className="space-y-8 pb-8">
      <div>
        <h1 className="text-3xl font-bold tracking-tight text-foreground">Workspace Overview</h1>
        <p className="text-muted-foreground mt-1">Track your brand visibility and performance across LLMs.</p>
      </div>

      {!hasDashboardData ? (
        <Card>
          <CardContent className="flex min-h-[260px] flex-col items-center justify-center text-center">
            <TrendingUp className="mb-4 h-10 w-10 text-muted-foreground" />
            <h2 className="text-xl font-semibold">No analytics yet</h2>
            <p className="mt-2 max-w-lg text-sm text-muted-foreground">
              This workspace does not have prompts, snapshots, or citation data yet. Add prompts and run evaluations to
              populate the dashboard.
            </p>
          </CardContent>
        </Card>
      ) : (
        <>

          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
            {(dashboard?.stats ?? []).map((stat, index) => {
              const Icon = statIcons[index];
              return (
                <Card key={stat.label}>
                  <CardHeader className="flex flex-row items-center justify-between pb-2 space-y-0">
                    <CardTitle className="text-sm font-medium">{stat.label}</CardTitle>
                    <Icon className="h-4 w-4 text-muted-foreground" />
                  </CardHeader>
                  <CardContent>
                    <div className="text-2xl font-bold">{stat.value}</div>
                    <p className="mt-1 text-xs text-muted-foreground">{stat.delta ?? stat.subtitle}</p>
                  </CardContent>
                </Card>
              );
            })}
          </div>

          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-7">
            <Card className="col-span-4">
              <CardHeader>
                <CardTitle>Visibility over Time</CardTitle>
              </CardHeader>
              <CardContent>
                <VisibilityChart data={dashboard?.visibility_chart} />
              </CardContent>
            </Card>
            <Card className="col-span-3">
              <CardHeader>
                <CardTitle>Competitors</CardTitle>
              </CardHeader>
              <CardContent className="p-0">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="pl-6">Brand</TableHead>
                      <TableHead>Avg Rank</TableHead>
                      <TableHead className="pr-6 text-right">Share</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {(dashboard?.competitors ?? []).map((competitor) => (
                      <TableRow key={competitor.brand}>
                        <TableCell className="pl-6 font-medium">{competitor.brand}</TableCell>
                        <TableCell>{competitor.avg_rank}</TableCell>
                        <TableCell className="pr-6 text-right">{competitor.share}%</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          </div>

          <Card>
            <CardHeader>
              <CardTitle>Sentiment Analysis</CardTitle>
            </CardHeader>
            <CardContent>
              <SentimentQuadrantChart points={dashboard?.sentiment_points} />
            </CardContent>
          </Card>

          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-7">
            <Card className="col-span-3">
              <CardHeader>
                <CardTitle>Source Distribution</CardTitle>
              </CardHeader>
              <CardContent>
                <SourcesPieChart slices={dashboard?.source_slices} />
              </CardContent>
            </Card>
            <Card className="col-span-4">
              <CardHeader>
                <CardTitle>Top Cited Sources</CardTitle>
              </CardHeader>
              <CardContent className="p-0">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="pl-6">Source URL</TableHead>
                      <TableHead>Type</TableHead>
                      <TableHead className="pr-6 text-right">Citations</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {(dashboard?.top_sources ?? []).map((source) => (
                      <TableRow key={source.url}>
                        <TableCell className="max-w-[200px] truncate pl-6 font-medium">{source.url}</TableCell>
                        <TableCell>{source.source_type}</TableCell>
                        <TableCell className="pr-6 text-right">{source.citations}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          </div>
        </>
      )}
    </div>
  );
}
