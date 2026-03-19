import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import Link from "next/link";
import { ThemeProvider } from "@/components/theme-provider";
import {
  LayoutDashboard,
  MessageSquare,
  Database,
  Settings,
  Cpu,
  ChevronsUpDown,
  Building2,
  Plus,
  Globe,
  Zap
} from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";


const inter = Inter({
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "GeoRank AI | Open-Source GEO Tracker",
  description: "Track your brand visibility across LLMs.",
};

const WORKSPACES = [
  { id: "1", name: "Main Workspace", plan: "Enterprise", icon: Building2 },
  { id: "2", name: "Global Marketing", plan: "Pro", icon: Globe },
  { id: "3", name: "R&D Experiments", plan: "Free", icon: Zap },
];

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className={`${inter.className} bg-background text-foreground flex h-screen overflow-hidden`}>
      <ThemeProvider>

      <aside className="w-64 bg-card border-r border-border flex flex-col shrink-0">
          <div className="h-16 flex items-center px-4 border-b border-border">
              <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                      <button className="flex items-center w-full gap-3 px-2 py-1.5 rounded-md hover:bg-accent transition-colors text-left group outline-none">
                          <div className="w-8 h-8 rounded bg-primary flex items-center justify-center shrink-0">
                              <Building2 className="w-5 h-5 text-primary-foreground" />
                          </div>
                          <div className="flex-1 min-w-0">
                              <p className="text-sm font-semibold text-foreground truncate">Main Workspace</p>
                              <p className="text-xs text-muted-foreground truncate">Enterprise Plan</p>
                          </div>
                          <ChevronsUpDown className="w-4 h-4 text-muted-foreground group-hover:text-foreground shrink-0" />
                      </button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent className="w-56" align="start">
                      <DropdownMenuLabel>Workspaces</DropdownMenuLabel>
                      <div className="max-h-60 overflow-y-auto">
                          {WORKSPACES.map((ws) => (
                              <DropdownMenuItem key={ws.id} className="flex items-center gap-2 px-2 py-1.5 cursor-pointer">
                                  <div className="w-6 h-6 rounded bg-muted flex items-center justify-center shrink-0">
                                      <ws.icon className="w-3.5 h-3.5 text-muted-foreground" />
                                  </div>
                                  <div className="flex-1 min-w-0">
                                      <p className="text-sm font-medium truncate">{ws.name}</p>
                                  </div>
                              </DropdownMenuItem>
                          ))}
                      </div>
                      <DropdownMenuSeparator />
                      <DropdownMenuItem className="flex items-center gap-2 px-2 py-1.5 cursor-pointer text-blue-600 focus:text-blue-600">
                          <Plus className="w-4 h-4" />
                          <span className="text-sm font-medium">Add Workspace</span>
                      </DropdownMenuItem>
                  </DropdownMenuContent>
              </DropdownMenu>
          </div>

          <div className="flex-1 flex flex-col overflow-y-auto p-4 space-y-8">
              <nav className="space-y-1">
                  <Link href="/" className="flex items-center gap-3 px-3 py-2 text-sm font-medium text-muted-foreground hover:text-foreground hover:bg-accent rounded-md transition-colors">
                      <LayoutDashboard className="w-5 h-5" />
                      Dashboard
                  </Link>
                  <Link href="/prompts" className="flex items-center gap-3 px-3 py-2 text-sm font-medium text-muted-foreground hover:text-foreground hover:bg-accent rounded-md transition-colors">
                      <MessageSquare className="w-5 h-5" />
                      Prompts
                  </Link>
                  <Link href="/runs" className="flex items-center gap-3 px-3 py-2 text-sm font-medium text-muted-foreground hover:text-foreground hover:bg-accent rounded-md transition-colors">
                      <Database className="w-5 h-5" />
                      Data & Runs
                  </Link>
                  <Link href="/system" className="flex items-center gap-3 px-3 py-2 text-sm font-medium text-muted-foreground hover:text-foreground hover:bg-accent rounded-md transition-colors">
                      <Cpu className="w-5 h-5" />
                      System
                  </Link>
              </nav>
          </div>

          <div className="p-4 border-t border-border bg-card space-y-1">
              <Link href="/settings" className="flex items-center gap-3 px-3 py-2 text-sm font-medium text-muted-foreground hover:text-foreground hover:bg-accent rounded-md transition-colors">
                  <Settings className="w-5 h-5" />
                  Settings
              </Link>
          </div>
      </aside>

      <main className="flex-1 overflow-y-auto p-8">
          {children}
      </main>

      </ThemeProvider>

      </body>
    </html>
  );
}
