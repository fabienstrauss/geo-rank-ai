const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";

export type Workspace = {
  id: string;
  name: string;
  plan?: string | null;
};

export type PromptCategory = {
  id: string;
  workspace_id: string;
  name: string;
  sort_order: number;
  is_active: boolean;
};

export type PromptStatus = "draft" | "active";

export type Prompt = {
  id: string;
  workspace_id: string;
  category_id: string;
  category_name?: string | null;
  prompt_text: string;
  target_brand: string;
  expected_competitors: string[];
  selected_models: string[];
  status: PromptStatus;
  visibility?: number | null;
  sentiment?: number | null;
  mentions?: number | null;
  last_run_at?: string | null;
};

export type PromptList = {
  items: Prompt[];
  total: number;
  limit: number;
  offset: number;
  summary: {
    total: number;
    visible_categories: number;
    avg_visibility?: number | null;
  };
};

export type Run = {
  id: string;
  workspace_id: string;
  run_type: string;
  status: string;
  scope_description?: string | null;
  selected_models: string[];
  summary?: string | null;
  started_at?: string | null;
  completed_at?: string | null;
  duration_seconds?: number | null;
  prompt_count: number;
  mentions_count: number;
  visibility_delta?: number | null;
};

export type RunList = {
  items: Run[];
  total: number;
  limit: number;
  offset: number;
  summary: {
    total: number;
    running: number;
    failed: number;
    avg_visibility_delta?: number | null;
    last_completed_at?: string | null;
  };
};

export type RunDetail = Run & {
  step_events: { id: string; step_name: string; status: string; message?: string | null; occurred_at: string }[];
  logs: { id: string; level: string; message: string; created_at: string }[];
  scrape_results: {
    id: string;
    prompt_id: string;
    run_id: string;
    llm_provider: string;
    llm_model: string;
    target_mentioned: boolean;
    competitors_mentioned: string[];
    sentiment_score?: number | null;
    mentions_count: number;
    citations?: Record<string, unknown>[] | null;
    sources?: Record<string, unknown>[] | null;
    executed_at: string;
  }[];
};

export type WorkspaceSetting = {
  id: string;
  workspace_id: string;
  key: string;
  value_json: Record<string, unknown>;
};

export type ProviderCredential = {
  id: string;
  workspace_id: string;
  provider: string;
  has_api_key: boolean;
  masked_api_key?: string | null;
  secret_reference?: string | null;
  is_default: boolean;
  is_enabled: boolean;
  metadata_json?: Record<string, unknown> | null;
};

export type Connector = {
  id: string;
  workspace_id: string;
  name: string;
  connector_type: string;
  health_status: string;
  provider_key?: string | null;
  is_enabled: boolean;
  success_rate?: number | null;
  average_latency_ms?: number | null;
  last_error?: string | null;
};

export type Worker = {
  id: string;
  connector_id?: string | null;
  worker_name: string;
  pool_name: string;
  status: string;
  current_job?: string | null;
  queue_depth: number;
  cpu_percent: number;
  memory_percent: number;
  uptime_seconds: number;
  last_heartbeat_at?: string | null;
};

export type QueueJob = {
  id: string;
  workspace_id: string;
  run_id?: string | null;
  prompt_id?: string | null;
  connector_id?: string | null;
  worker_id?: string | null;
  status: string;
  priority: number;
  payload_json?: Record<string, unknown> | null;
  error_message?: string | null;
  queued_at: string;
  started_at?: string | null;
  completed_at?: string | null;
};

export type ConnectorIncident = {
  id: string;
  connector_id?: string | null;
  severity: string;
  title: string;
  detail: string;
  occurred_at: string;
};

export type DashboardData = {
  stats: { label: string; value: string | number; delta?: string | null; subtitle?: string | null }[];
  visibility_chart: { labels: string[]; series: { label: string; values: number[] }[] };
  sentiment_points: { label: string; x: number; y: number }[];
  source_slices: { label: string; value: number }[];
  competitors: { brand: string; avg_rank: number; share: number }[];
  top_sources: { url: string; source_type: string; citations: number }[];
};

async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${API_URL}${path}`, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...(init?.headers ?? {}),
    },
    cache: "no-store",
  });

  if (!response.ok) {
    const message = await response.text();
    throw new Error(message || `Request failed: ${response.status}`);
  }

  if (response.status === 204) {
    return undefined as T;
  }

  return response.json() as Promise<T>;
}

export async function ensureSeeded(): Promise<Workspace> {
  return api<Workspace>("/dev/seed", { method: "POST" });
}

export async function getWorkspaces() {
  return api<Workspace[]>("/workspaces");
}

export async function createWorkspace(payload: { name: string; plan?: string | null }) {
  return api<Workspace>("/workspaces", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export async function updateWorkspace(workspaceId: string, payload: { name?: string; plan?: string | null }) {
  return api<Workspace>(`/workspaces/${workspaceId}`, {
    method: "PATCH",
    body: JSON.stringify(payload),
  });
}

export async function deleteWorkspace(workspaceId: string) {
  return api<void>(`/workspaces/${workspaceId}`, { method: "DELETE" });
}

export async function getDashboard(workspaceId: string) {
  return api<DashboardData>(`/workspaces/${workspaceId}/dashboard`);
}

export async function getCategories(workspaceId: string) {
  return api<PromptCategory[]>(`/workspaces/${workspaceId}/categories`);
}

export async function createCategory(workspaceId: string, payload: { name: string; sort_order?: number; is_active?: boolean }) {
  return api<PromptCategory>(`/workspaces/${workspaceId}/categories`, {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export async function updateCategory(categoryId: string, payload: Partial<{ name: string; sort_order: number; is_active: boolean }>) {
  return api<PromptCategory>(`/categories/${categoryId}`, {
    method: "PATCH",
    body: JSON.stringify(payload),
  });
}

export async function deleteCategory(categoryId: string, moveToCategoryId?: string) {
  const query = moveToCategoryId ? `?move_to_category_id=${moveToCategoryId}` : "";
  return api<void>(`/categories/${categoryId}${query}`, { method: "DELETE" });
}

export async function getPromptsFiltered(
  workspaceId: string,
  params?: {
    categoryIds?: string[];
    status?: PromptStatus;
    search?: string;
    limit?: number;
    offset?: number;
    sortBy?: "created_at" | "updated_at" | "prompt_text" | "status";
    sortOrder?: "asc" | "desc";
  }
) {
  const query = new URLSearchParams();
  params?.categoryIds?.forEach((categoryId) => query.append("category_ids", categoryId));
  if (params?.status) query.set("status", params.status);
  if (params?.search?.trim()) query.set("search", params.search.trim());
  if (params?.limit) query.set("limit", String(params.limit));
  if (params?.offset) query.set("offset", String(params.offset));
  if (params?.sortBy) query.set("sort_by", params.sortBy);
  if (params?.sortOrder) query.set("sort_order", params.sortOrder);
  const suffix = query.toString() ? `?${query.toString()}` : "";
  return api<PromptList>(`/workspaces/${workspaceId}/prompts${suffix}`);
}

export async function createPrompt(
  workspaceId: string,
  payload: {
    category_id: string;
    prompt_text: string;
    target_brand: string;
    expected_competitors: string[];
    selected_models: string[];
    status: PromptStatus;
  }
) {
  return api<Prompt>(`/workspaces/${workspaceId}/prompts`, { method: "POST", body: JSON.stringify(payload) });
}

export async function updatePrompt(
  promptId: string,
  payload: Partial<{
    category_id: string;
    prompt_text: string;
    target_brand: string;
    expected_competitors: string[];
    selected_models: string[];
    status: PromptStatus;
  }>
) {
  return api<Prompt>(`/prompts/${promptId}`, { method: "PATCH", body: JSON.stringify(payload) });
}

export async function deletePrompt(promptId: string) {
  return api<void>(`/prompts/${promptId}`, { method: "DELETE" });
}

export async function getRuns(workspaceId: string) {
  return api<RunList>(`/workspaces/${workspaceId}/runs`);
}

export async function getRunsFiltered(
  workspaceId: string,
  params?: {
    statuses?: string[];
    runTypes?: string[];
    search?: string;
    limit?: number;
    offset?: number;
    sortBy?: "created_at" | "started_at" | "completed_at" | "status" | "run_type" | "visibility_delta";
    sortOrder?: "asc" | "desc";
  }
) {
  const query = new URLSearchParams();
  params?.statuses?.forEach((status) => query.append("statuses", status));
  params?.runTypes?.forEach((type) => query.append("run_types", type));
  if (params?.search?.trim()) query.set("search", params.search.trim());
  if (params?.limit) query.set("limit", String(params.limit));
  if (params?.offset) query.set("offset", String(params.offset));
  if (params?.sortBy) query.set("sort_by", params.sortBy);
  if (params?.sortOrder) query.set("sort_order", params.sortOrder);
  const suffix = query.toString() ? `?${query.toString()}` : "";
  return api<RunList>(`/workspaces/${workspaceId}/runs${suffix}`);
}

export async function getRunDetail(runId: string) {
  return api<RunDetail>(`/runs/${runId}`);
}

export async function getSettings(workspaceId: string) {
  return api<WorkspaceSetting[]>(`/workspaces/${workspaceId}/settings`);
}

export async function upsertSetting(workspaceId: string, key: string, valueJson: Record<string, unknown>) {
  return api<WorkspaceSetting>(`/workspaces/${workspaceId}/settings/${key}`, {
    method: "PUT",
    body: JSON.stringify({ value_json: valueJson }),
  });
}

export async function getProviderCredentials(workspaceId: string) {
  return api<ProviderCredential[]>(`/workspaces/${workspaceId}/provider-credentials`);
}

export async function upsertProviderCredential(
  workspaceId: string,
  provider: string,
  payload: {
    api_key?: string | null;
    secret_reference?: string | null;
    is_default?: boolean;
    is_enabled?: boolean;
    metadata_json?: Record<string, unknown> | null;
  }
) {
  return api<ProviderCredential>(`/workspaces/${workspaceId}/provider-credentials/${provider}`, {
    method: "PUT",
    body: JSON.stringify(payload),
  });
}

export async function getConnectors(workspaceId: string) {
  return api<Connector[]>(`/workspaces/${workspaceId}/connectors`);
}

export async function createConnector(
  workspaceId: string,
  payload: {
    name: string;
    connector_type: string;
    provider_key?: string | null;
    is_enabled?: boolean;
    config_json?: Record<string, unknown> | null;
  }
) {
  return api<Connector>(`/workspaces/${workspaceId}/connectors`, {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export async function updateConnector(
  connectorId: string,
  payload: Partial<{
    name: string;
    connector_type: string;
    provider_key: string | null;
    is_enabled: boolean;
    config_json: Record<string, unknown> | null;
  }>
) {
  return api<Connector>(`/connectors/${connectorId}`, {
    method: "PATCH",
    body: JSON.stringify(payload),
  });
}

export async function deleteConnector(connectorId: string) {
  return api<void>(`/connectors/${connectorId}`, { method: "DELETE" });
}

export async function getConnectorIncidents(workspaceId: string) {
  return api<ConnectorIncident[]>(`/workspaces/${workspaceId}/connector-incidents`);
}

export async function getWorkers() {
  return api<Worker[]>("/workers");
}

export async function getQueueJobs(workspaceId: string) {
  return api<QueueJob[]>(`/workspaces/${workspaceId}/queue-jobs`);
}
