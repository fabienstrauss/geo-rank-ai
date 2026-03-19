"use client";

import Link from "next/link";
import { useState } from "react";
import {
  Building2,
  ChevronsUpDown,
  Cpu,
  Database,
  FolderPen,
  Globe,
  LayoutDashboard,
  MessageSquare,
  Plus,
  Settings,
  Trash2,
  Zap,
} from "lucide-react";

import { WorkspaceProvider, useWorkspace } from "@/components/workspace-provider";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { ThemeProvider } from "@/components/theme-provider";

const workspaceIcons = [Building2, Globe, Zap];

function WorkspaceEmptyState() {
  const { createNewWorkspace } = useWorkspace();
  const [name, setName] = useState("");

  return (
    <div className="flex min-h-full items-center justify-center">
      <div className="w-full max-w-xl rounded-3xl border bg-card p-8 shadow-sm">
        <div className="mb-6 flex h-14 w-14 items-center justify-center rounded-2xl bg-primary">
          <Building2 className="h-7 w-7 text-primary-foreground" />
        </div>
        <h1 className="text-3xl font-bold tracking-tight">Create your first workspace</h1>
        <p className="mt-2 text-muted-foreground">
          Workspaces separate prompts, settings, runs, and analytics. Start by creating one for your team or project.
        </p>

        <div className="mt-6 space-y-3">
          <label className="text-sm font-medium">Workspace name</label>
          <Input value={name} onChange={(event) => setName(event.target.value)} placeholder="Acme Marketing" />
        </div>

        <div className="mt-6 flex gap-3">
          <Button
            onClick={async () => {
              if (!name.trim()) return;
              await createNewWorkspace({ name: name.trim(), plan: "Free" });
              setName("");
            }}
          >
            Create Workspace
          </Button>
        </div>
      </div>
    </div>
  );
}

function WorkspaceManagerModal({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  const { workspaces, activeWorkspace, createNewWorkspace, renameWorkspace, removeWorkspace, selectWorkspace } =
    useWorkspace();
  const [newName, setNewName] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingName, setEditingName] = useState("");

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="w-full max-w-2xl rounded-2xl border bg-background shadow-xl">
        <div className="flex items-start justify-between border-b px-6 py-4">
          <div>
            <h2 className="text-xl font-semibold">Manage Workspaces</h2>
            <p className="mt-1 text-sm text-muted-foreground">Create, rename, switch, or remove workspaces.</p>
          </div>
          <Button variant="ghost" size="icon-sm" onClick={onClose}>
            <span className="text-lg leading-none">×</span>
          </Button>
        </div>

        <div className="space-y-5 px-6 py-5">
          <div className="rounded-xl border bg-muted/20 p-4">
            <p className="mb-3 text-sm font-medium">Add Workspace</p>
            <div className="flex gap-2">
              <Input value={newName} onChange={(event) => setNewName(event.target.value)} placeholder="Workspace name" />
              <Button
                onClick={async () => {
                  if (!newName.trim()) return;
                  await createNewWorkspace({ name: newName.trim(), plan: "Free" });
                  setNewName("");
                }}
              >
                Add
              </Button>
            </div>
          </div>

          <div className="space-y-3">
            {workspaces.map((workspace, index) => {
              const Icon = workspaceIcons[index % workspaceIcons.length];
              const isEditing = editingId === workspace.id;
              return (
                <div key={workspace.id} className="rounded-xl border bg-card p-4">
                  <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                    <div className="flex items-center gap-3">
                      <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-muted">
                        <Icon className="h-4 w-4 text-muted-foreground" />
                      </div>
                      <div>
                        {isEditing ? (
                          <div className="flex gap-2">
                            <Input value={editingName} onChange={(event) => setEditingName(event.target.value)} />
                            <Button
                              size="sm"
                              onClick={async () => {
                                if (!editingName.trim()) return;
                                await renameWorkspace(workspace.id, { name: editingName.trim() });
                                setEditingId(null);
                              }}
                            >
                              Save
                            </Button>
                          </div>
                        ) : (
                          <>
                            <p className="font-semibold">{workspace.name}</p>
                            <p className="text-sm text-muted-foreground">{workspace.plan ?? "No plan set"}</p>
                          </>
                        )}
                      </div>
                    </div>

                    <div className="flex gap-2">
                      <Button size="sm" variant={activeWorkspace?.id === workspace.id ? "default" : "outline"} onClick={() => selectWorkspace(workspace.id)}>
                        {activeWorkspace?.id === workspace.id ? "Active" : "Switch"}
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => {
                          setEditingId(workspace.id);
                          setEditingName(workspace.name);
                        }}
                      >
                        <FolderPen className="mr-2 h-4 w-4" />
                        Rename
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={async () => {
                          await removeWorkspace(workspace.id);
                          if (activeWorkspace?.id === workspace.id && workspaces.length > 1) {
                            const nextWorkspace = workspaces.find((item) => item.id !== workspace.id);
                            if (nextWorkspace) selectWorkspace(nextWorkspace.id);
                          }
                        }}
                      >
                        <Trash2 className="mr-2 h-4 w-4" />
                        Delete
                      </Button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}

function ShellContent({ children }: { children: React.ReactNode }) {
  const { activeWorkspace, isLoading, workspaces, selectWorkspace } = useWorkspace();
  const [manageOpen, setManageOpen] = useState(false);
  const activeIndex = workspaces.findIndex((workspace) => workspace.id === activeWorkspace?.id);
  const ActiveIcon = workspaceIcons[(activeIndex >= 0 ? activeIndex : 0) % workspaceIcons.length];

  return (
    <ThemeProvider>
      <WorkspaceManagerModal open={manageOpen} onClose={() => setManageOpen(false)} />

      <aside className="w-64 shrink-0 border-r border-border bg-card">
        <div className="flex h-16 items-center border-b border-border px-4">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button className="group flex w-full items-center gap-3 rounded-md px-2 py-1.5 text-left outline-none transition-colors hover:bg-accent">
                <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded bg-primary">
                  <ActiveIcon className="h-5 w-5 text-primary-foreground" />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-semibold text-foreground">{activeWorkspace?.name ?? "No Workspace"}</p>
                  <p className="truncate text-xs text-muted-foreground">{activeWorkspace?.plan ?? "Create a workspace to start"}</p>
                </div>
                <ChevronsUpDown className="h-4 w-4 shrink-0 text-muted-foreground group-hover:text-foreground" />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent className="w-56" align="start">
              <DropdownMenuLabel>Workspaces</DropdownMenuLabel>
              <div className="max-h-60 overflow-y-auto">
                {workspaces.map((workspace, index) => {
                  const Icon = workspaceIcons[index % workspaceIcons.length];
                  return (
                    <DropdownMenuItem key={workspace.id} className="cursor-pointer gap-2 px-2 py-1.5" onClick={() => selectWorkspace(workspace.id)}>
                      <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded bg-muted">
                        <Icon className="h-3.5 w-3.5 text-muted-foreground" />
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-medium">{workspace.name}</p>
                      </div>
                    </DropdownMenuItem>
                  );
                })}
              </div>
              <DropdownMenuSeparator />
              <DropdownMenuItem className="cursor-pointer gap-2 px-2 py-1.5 text-blue-600 focus:text-blue-600" onClick={() => setManageOpen(true)}>
                <Plus className="h-4 w-4" />
                <span className="text-sm font-medium">Manage Workspaces</span>
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>

        <div className="flex flex-1 flex-col overflow-y-auto p-4">
          <nav className="space-y-1">
            <Link href="/" className="flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium text-muted-foreground transition-colors hover:bg-accent hover:text-foreground">
              <LayoutDashboard className="h-5 w-5" />
              Dashboard
            </Link>
            <Link href="/prompts" className="flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium text-muted-foreground transition-colors hover:bg-accent hover:text-foreground">
              <MessageSquare className="h-5 w-5" />
              Prompts
            </Link>
            <Link href="/runs" className="flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium text-muted-foreground transition-colors hover:bg-accent hover:text-foreground">
              <Database className="h-5 w-5" />
              Data & Runs
            </Link>
            <Link href="/system" className="flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium text-muted-foreground transition-colors hover:bg-accent hover:text-foreground">
              <Cpu className="h-5 w-5" />
              System
            </Link>
          </nav>
        </div>

        <div className="border-t border-border bg-card p-4">
          <Link href="/settings" className="flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium text-muted-foreground transition-colors hover:bg-accent hover:text-foreground">
            <Settings className="h-5 w-5" />
            Settings
          </Link>
        </div>
      </aside>

      <main className="flex-1 overflow-y-auto p-8">
        {isLoading ? null : activeWorkspace ? children : <WorkspaceEmptyState />}
      </main>
    </ThemeProvider>
  );
}

export function AppShell({ children }: { children: React.ReactNode }) {
  return (
    <WorkspaceProvider>
      <ShellContent>{children}</ShellContent>
    </WorkspaceProvider>
  );
}
