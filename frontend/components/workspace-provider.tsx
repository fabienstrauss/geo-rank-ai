"use client";

import { createContext, useContext, useEffect, useMemo, useState } from "react";

import { Workspace, createWorkspace, deleteWorkspace, getWorkspaces, updateWorkspace } from "@/lib/api";

type WorkspaceContextValue = {
  workspaces: Workspace[];
  activeWorkspace: Workspace | null;
  isLoading: boolean;
  refreshWorkspaces: () => Promise<void>;
  selectWorkspace: (workspaceId: string) => void;
  createNewWorkspace: (payload: { name: string; plan?: string | null }) => Promise<Workspace>;
  renameWorkspace: (workspaceId: string, payload: { name?: string; plan?: string | null }) => Promise<Workspace>;
  removeWorkspace: (workspaceId: string) => Promise<void>;
};

const WorkspaceContext = createContext<WorkspaceContextValue | null>(null);
const STORAGE_KEY = "georank-active-workspace-id";

export function WorkspaceProvider({ children }: { children: React.ReactNode }) {
  const [workspaces, setWorkspaces] = useState<Workspace[]>([]);
  const [activeWorkspaceId, setActiveWorkspaceId] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const refreshWorkspaces = async () => {
    const rows = await getWorkspaces();
    setWorkspaces(rows);
    setActiveWorkspaceId((current) => {
      const stored = typeof window !== "undefined" ? window.localStorage.getItem(STORAGE_KEY) : null;
      const preferred = current ?? stored;
      if (preferred && rows.some((workspace) => workspace.id === preferred)) {
        return preferred;
      }
      return rows[0]?.id ?? null;
    });
  };

  useEffect(() => {
    async function load() {
      setIsLoading(true);
      const rows = await getWorkspaces();
      const stored = window.localStorage.getItem(STORAGE_KEY);
      const nextActiveId = rows.find((workspace) => workspace.id === stored)?.id ?? rows[0]?.id ?? null;
      setWorkspaces(rows);
      setActiveWorkspaceId(nextActiveId);
      setIsLoading(false);
    }

    void load();
  }, []);

  useEffect(() => {
    if (!activeWorkspaceId) {
      window.localStorage.removeItem(STORAGE_KEY);
      return;
    }
    window.localStorage.setItem(STORAGE_KEY, activeWorkspaceId);
  }, [activeWorkspaceId]);

  const value = useMemo<WorkspaceContextValue>(() => {
    const activeWorkspace = workspaces.find((workspace) => workspace.id === activeWorkspaceId) ?? null;

    return {
      workspaces,
      activeWorkspace,
      isLoading,
      refreshWorkspaces,
      selectWorkspace: (workspaceId) => setActiveWorkspaceId(workspaceId),
      createNewWorkspace: async (payload) => {
        const workspace = await createWorkspace(payload);
        await refreshWorkspaces();
        setActiveWorkspaceId(workspace.id);
        return workspace;
      },
      renameWorkspace: async (workspaceId, payload) => {
        const workspace = await updateWorkspace(workspaceId, payload);
        await refreshWorkspaces();
        return workspace;
      },
      removeWorkspace: async (workspaceId) => {
        await deleteWorkspace(workspaceId);
        await refreshWorkspaces();
      },
    };
  }, [activeWorkspaceId, isLoading, workspaces]);

  return <WorkspaceContext.Provider value={value}>{children}</WorkspaceContext.Provider>;
}

export function useWorkspace() {
  const context = useContext(WorkspaceContext);
  if (!context) {
    throw new Error("useWorkspace must be used within WorkspaceProvider");
  }
  return context;
}
