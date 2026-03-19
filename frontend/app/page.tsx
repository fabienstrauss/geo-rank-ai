import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Table, TableHeader, TableRow, TableHead, TableBody, TableCell } from "@/components/ui/table";
import { SentimentQuadrantChart, SourcesPieChart, VisibilityChart } from "@/components/dashboard-charts";
import { TrendingUp, Search, Share2, MessageCircle } from "lucide-react";

export default function Home() {
  return (
    <div className="space-y-8 pb-8">
      <div>
        <h1 className="text-3xl font-bold tracking-tight text-foreground">Workspace Overview</h1>
        <p className="text-muted-foreground mt-1">Track your brand visibility and performance across LLMs.</p>
      </div>

      {/* Top Stats */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2 space-y-0">
            <CardTitle className="text-sm font-medium">Average Rank</CardTitle>
            <TrendingUp className="w-4 h-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">2.4</div>
            <p className="text-xs text-muted-foreground mt-1">+0.2 from last week</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2 space-y-0">
            <CardTitle className="text-sm font-medium">Keywords Tracked</CardTitle>
            <Search className="w-4 h-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">142</div>
            <p className="text-xs text-muted-foreground mt-1">Across 12 prompt groups</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2 space-y-0">
            <CardTitle className="text-sm font-medium">Visibility Score</CardTitle>
            <Share2 className="w-4 h-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">68%</div>
            <p className="text-xs text-muted-foreground mt-1">+5% from last month</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2 space-y-0">
            <CardTitle className="text-sm font-medium">Positive Sentiment</CardTitle>
            <MessageCircle className="w-4 h-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">84%</div>
            <p className="text-xs text-muted-foreground mt-1">Stable</p>
          </CardContent>
        </Card>
      </div>

      {/* Visibility Graph & Competitor Table */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-7">
        <Card className="col-span-4">
          <CardHeader>
            <CardTitle>Visibility over Time</CardTitle>
          </CardHeader>
          <CardContent>
            <VisibilityChart />
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
                <TableRow>
                  <TableCell className="pl-6 font-medium">Your Brand</TableCell>
                  <TableCell>2.4</TableCell>
                  <TableCell className="pr-6 text-right">32%</TableCell>
                </TableRow>
                <TableRow>
                  <TableCell className="pl-6 font-medium text-muted-foreground">Competitor A</TableCell>
                  <TableCell>3.1</TableCell>
                  <TableCell className="pr-6 text-right">28%</TableCell>
                </TableRow>
                <TableRow>
                  <TableCell className="pl-6 font-medium text-muted-foreground">Competitor B</TableCell>
                  <TableCell>4.5</TableCell>
                  <TableCell className="pr-6 text-right">15%</TableCell>
                </TableRow>
                <TableRow>
                  <TableCell className="pl-6 font-medium text-muted-foreground">Competitor C</TableCell>
                  <TableCell>5.2</TableCell>
                  <TableCell className="pr-6 text-right">12%</TableCell>
                </TableRow>
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </div>

      {/* Sentiment Graph */}
      <Card>
        <CardHeader>
          <CardTitle>Sentiment Analysis</CardTitle>
        </CardHeader>
        <CardContent>
          <SentimentQuadrantChart />
        </CardContent>
      </Card>

      {/* Sources Overview */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-7">
        <Card className="col-span-3">
          <CardHeader>
            <CardTitle>Source Distribution</CardTitle>
          </CardHeader>
          <CardContent>
            <SourcesPieChart />
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
                <TableRow>
                  <TableCell className="pl-6 font-medium truncate max-w-[200px]">docs.yourbrand.com/guide</TableCell>
                  <TableCell>Documentation</TableCell>
                  <TableCell className="pr-6 text-right">63</TableCell>
                </TableRow>
                <TableRow>
                  <TableCell className="pl-6 font-medium truncate max-w-[200px]">blog.industry-news.com/post</TableCell>
                  <TableCell>Blog</TableCell>
                  <TableCell className="pr-6 text-right">44</TableCell>
                </TableRow>
                <TableRow>
                  <TableCell className="pl-6 font-medium truncate max-w-[200px]">reddit.com/r/seo/comments/georank</TableCell>
                  <TableCell>Community</TableCell>
                  <TableCell className="pr-6 text-right">33</TableCell>
                </TableRow>
                <TableRow>
                  <TableCell className="pl-6 font-medium truncate max-w-[200px]">github.com/yourbrand/repo</TableCell>
                  <TableCell>Code</TableCell>
                  <TableCell className="pr-6 text-right">18</TableCell>
                </TableRow>
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
