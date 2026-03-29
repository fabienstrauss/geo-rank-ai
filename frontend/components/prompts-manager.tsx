"use client";

import { Fragment, startTransition, useCallback, useEffect, useMemo, useState } from "react";
import { ChevronRight, FolderPen, MoreHorizontal, PlayCircle, Plus, Search } from "lucide-react";

import { Button } from "@/components/ui/button";
import { useWorkspace } from "@/components/workspace-provider";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import {
  Prompt,
  PromptList,
  PromptCategory,
  PromptStatus,
  createManualRun,
  createCategory,
  createPrompt,
  deleteCategory,
  deletePrompt,
  getCategories,
  getPromptsFiltered,
  getSettings,
  updateCategory,
  updatePrompt,
} from "@/lib/api";
import { emitDataUpdated, subscribeToDataUpdated } from "@/lib/app-events";
import { cn } from "@/lib/utils";

type ModelOption = "GPT-5" | "Claude" | "Gemini" | "Perplexity";

type PromptForm = {
  categoryId: string;
  prompt: string;
  models: ModelOption[];
  status: PromptStatus;
};

const modelOptions: ModelOption[] = ["GPT-5", "Claude", "Gemini", "Perplexity"];
const emptyForm: PromptForm = { categoryId: "", prompt: "", models: ["GPT-5", "Claude"], status: "draft" };
const selectClassName =
  "h-9 w-full rounded-md border border-input bg-background px-3 text-sm leading-9 shadow-xs outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50";

function statusClasses(status: PromptStatus) {
  return status === "active"
    ? "border-emerald-200 bg-emerald-100 text-emerald-800"
    : "border-amber-200 bg-amber-100 text-amber-800";
}

function formatStatus(status: PromptStatus) {
  return status === "active" ? "Active" : "Draft";
}

function formatLastRun(value?: string | null) {
  if (!value) return "Not run yet";
  return new Date(value).toLocaleString();
}

function normalizeRunErrorMessage(message: string) {
  return message.replace(/^"+|"+$/g, "").trim();
}

function CategoryManagerModal({
  open,
  categories,
  promptCounts,
  onClose,
  onAddCategory,
  onRenameCategory,
  onDeleteCategory,
}: {
  open: boolean;
  categories: PromptCategory[];
  promptCounts: Record<string, number>;
  onClose: () => void;
  onAddCategory: (name: string) => Promise<void>;
  onRenameCategory: (categoryId: string, name: string) => Promise<void>;
  onDeleteCategory: (categoryId: string, moveToCategoryId?: string) => Promise<void>;
}) {
  const [newCategoryName, setNewCategoryName] = useState("");
  const [editingCategoryId, setEditingCategoryId] = useState<string | null>(null);
  const [editingValue, setEditingValue] = useState("");
  const [deletingCategoryId, setDeletingCategoryId] = useState<string | null>(null);
  const [moveTarget, setMoveTarget] = useState("");

  if (!open) return null;

  const resetDeleteState = () => {
    setDeletingCategoryId(null);
    setMoveTarget("");
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="w-full max-w-2xl rounded-2xl border bg-background shadow-xl">
        <div className="flex items-start justify-between border-b px-6 py-4">
          <div>
            <h2 className="text-xl font-semibold">Manage Categories</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Add, rename, or remove categories. Non-empty categories must move prompts first.
            </p>
          </div>
          <Button variant="ghost" size="icon-sm" onClick={onClose}>
            <span className="text-lg leading-none">×</span>
          </Button>
        </div>

        <div className="space-y-5 px-6 py-5">
          <div className="rounded-xl border bg-muted/20 p-4">
            <p className="mb-3 text-sm font-medium">Add Category</p>
            <div className="flex gap-2">
              <Input value={newCategoryName} onChange={(event) => setNewCategoryName(event.target.value)} placeholder="New category name" />
              <Button
                onClick={async () => {
                  await onAddCategory(newCategoryName);
                  setNewCategoryName("");
                }}
              >
                Add
              </Button>
            </div>
          </div>

          <div className="space-y-3">
            {categories.map((category) => {
              const isEditing = editingCategoryId === category.id;
              const isDeleting = deletingCategoryId === category.id;
              const count = promptCounts[category.id] ?? 0;

              return (
                <div key={category.id} className="rounded-xl border bg-card p-4">
                  <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                    <div>
                      {isEditing ? (
                        <div className="flex gap-2">
                          <Input value={editingValue} onChange={(event) => setEditingValue(event.target.value)} />
                          <Button
                            size="sm"
                            onClick={async () => {
                              await onRenameCategory(category.id, editingValue);
                              setEditingCategoryId(null);
                              setEditingValue("");
                            }}
                          >
                            Save
                          </Button>
                          <Button size="sm" variant="outline" onClick={() => setEditingCategoryId(null)}>
                            Cancel
                          </Button>
                        </div>
                      ) : (
                        <>
                          <p className="text-base font-semibold">{category.name}</p>
                          <p className="text-sm text-muted-foreground">{count} prompts assigned</p>
                        </>
                      )}
                    </div>
                    {!isEditing && (
                      <div className="flex gap-2">
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => {
                            setEditingCategoryId(category.id);
                            setEditingValue(category.name);
                            resetDeleteState();
                          }}
                        >
                          Edit
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => {
                            setDeletingCategoryId(category.id);
                            setMoveTarget("");
                          }}
                        >
                          Delete
                        </Button>
                      </div>
                    )}
                  </div>

                  {isDeleting && (
                    <div className="mt-4 space-y-3 rounded-lg border border-dashed p-3">
                      {count === 0 ? (
                        <div className="flex gap-2">
                          <Button size="sm" variant="destructive" onClick={() => onDeleteCategory(category.id)}>
                            Delete Category
                          </Button>
                          <Button size="sm" variant="outline" onClick={resetDeleteState}>
                            Cancel
                          </Button>
                        </div>
                      ) : (
                        <>
                          <p className="text-sm text-muted-foreground">Move prompts to another category before deleting this one.</p>
                          <div className="flex flex-col gap-2 md:flex-row">
                            <select value={moveTarget} onChange={(event) => setMoveTarget(event.target.value)} className={selectClassName}>
                              <option value="">Select destination</option>
                              {categories
                                .filter((item) => item.id !== category.id)
                                .map((item) => (
                                  <option key={item.id} value={item.id}>
                                    {item.name}
                                  </option>
                                ))}
                            </select>
                            <Button size="sm" variant="destructive" disabled={!moveTarget} onClick={() => onDeleteCategory(category.id, moveTarget)}>
                              Move And Delete
                            </Button>
                            <Button size="sm" variant="outline" onClick={resetDeleteState}>
                              Cancel
                            </Button>
                          </div>
                        </>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}

function PromptModal({
  open,
  mode,
  categories,
  form,
  onClose,
  onChange,
  onToggleModel,
  onSubmit,
}: {
  open: boolean;
  mode: "create" | "edit";
  categories: PromptCategory[];
  form: PromptForm;
  onClose: () => void;
  onChange: (field: keyof PromptForm, value: string) => void;
  onToggleModel: (model: ModelOption) => void;
  onSubmit: () => Promise<void>;
}) {
  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="w-full max-w-2xl rounded-2xl border bg-background shadow-xl">
        <div className="flex items-start justify-between border-b px-6 py-4">
          <div>
            <h2 className="text-xl font-semibold">{mode === "create" ? "Add Prompt" : "Edit Prompt"}</h2>
            <p className="mt-1 text-sm text-muted-foreground">Performance metrics are derived from backend run data.</p>
          </div>
          <Button variant="ghost" size="icon-sm" onClick={onClose}>
            <span className="text-lg leading-none">×</span>
          </Button>
        </div>

        <div className="grid gap-4 px-6 py-5 md:grid-cols-2">
          <label className="space-y-2">
            <span className="text-sm font-medium">Category</span>
            <select value={form.categoryId} onChange={(event) => onChange("categoryId", event.target.value)} className={selectClassName}>
              {categories.map((category) => (
                <option key={category.id} value={category.id}>
                  {category.name}
                </option>
              ))}
            </select>
          </label>

          <label className="space-y-2">
            <span className="text-sm font-medium">Status</span>
            <select value={form.status} onChange={(event) => onChange("status", event.target.value)} className={selectClassName}>
              <option value="draft">Draft</option>
              <option value="active">Active</option>
            </select>
          </label>

          <label className="space-y-2 md:col-span-2">
            <span className="text-sm font-medium">Prompt</span>
            <textarea
              value={form.prompt}
              onChange={(event) => onChange("prompt", event.target.value)}
              rows={5}
              className="w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-xs outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50"
            />
          </label>

          <div className="space-y-2 md:col-span-2">
            <span className="text-sm font-medium">Models</span>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" className="h-9 w-full justify-between px-3 font-normal">
                  <span className="truncate">{form.models.length ? form.models.join(", ") : "Select models"}</span>
                  <span className="text-xs text-muted-foreground">{form.models.length} selected</span>
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="start" className="w-[320px]">
                <DropdownMenuLabel>Tracked Models</DropdownMenuLabel>
                <DropdownMenuSeparator />
                {modelOptions.map((model) => (
                  <DropdownMenuCheckboxItem key={model} checked={form.models.includes(model)} onCheckedChange={() => onToggleModel(model)}>
                    {model}
                  </DropdownMenuCheckboxItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>

        <div className="flex justify-end gap-2 border-t px-6 py-4">
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={() => void onSubmit()}>{mode === "create" ? "Create Prompt" : "Save Changes"}</Button>
        </div>
      </div>
    </div>
  );
}

export function PromptsManager() {
  const { activeWorkspace } = useWorkspace();
  const pageSize = 10;
  const [workspaceId, setWorkspaceId] = useState<string | null>(null);
  const [trackedBrand, setTrackedBrand] = useState("GeoRank AI");
  const [defaultModels, setDefaultModels] = useState<ModelOption[]>(["GPT-5", "Claude"]);
  const [categories, setCategories] = useState<PromptCategory[]>([]);
  const [prompts, setPrompts] = useState<Prompt[]>([]);
  const [promptPage, setPromptPage] = useState<PromptList>({
    items: [],
    total: 0,
    limit: pageSize,
    offset: 0,
    summary: { total: 0, visible_categories: 0, avg_visibility: null },
  });
  const [query, setQuery] = useState("");
  const [selectedCategoryIds, setSelectedCategoryIds] = useState<string[]>([]);
  const [selectedStatus, setSelectedStatus] = useState<PromptStatus | "all">("all");
  const [sortBy, setSortBy] = useState<"created_at" | "updated_at" | "prompt_text" | "status">("created_at");
  const [sortOrder, setSortOrder] = useState<"asc" | "desc">("desc");
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isCategoryModalOpen, setIsCategoryModalOpen] = useState(false);
  const [modalMode, setModalMode] = useState<"create" | "edit">("create");
  const [editingPromptId, setEditingPromptId] = useState<string | null>(null);
  const [form, setForm] = useState<PromptForm>(emptyForm);
  const [collapsedCategories, setCollapsedCategories] = useState<Record<string, boolean>>({});
  const [isRunning, setIsRunning] = useState(false);
  const [runActionError, setRunActionError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!activeWorkspace) return;
    const requestOffset = workspaceId === activeWorkspace.id ? promptPage.offset : 0;
    const [categoryRows, promptRows, settings] = await Promise.all([
      getCategories(activeWorkspace.id),
      getPromptsFiltered(activeWorkspace.id, {
        categoryIds: selectedCategoryIds,
        status: selectedStatus === "all" ? undefined : selectedStatus,
        search: query,
        limit: pageSize,
        offset: requestOffset,
        sortBy,
        sortOrder,
      }),
      getSettings(activeWorkspace.id),
    ]);
    const profileSetting = settings.find((item) => item.key === "workspace_profile");
    const modelsSetting = settings.find((item) => item.key === "default_models");
    startTransition(() => {
      setWorkspaceId(activeWorkspace.id);
      setTrackedBrand((profileSetting?.value_json.tracked_brand as string | undefined) ?? "GeoRank AI");
      setDefaultModels(((modelsSetting?.value_json.models as ModelOption[] | undefined) ?? ["GPT-5", "Claude"]));
      setCategories(categoryRows);
      setPrompts(promptRows.items);
      setPromptPage(promptRows);
      setForm((current) => ({ ...current, categoryId: current.categoryId || categoryRows[0]?.id || "" }));
    });
  }, [activeWorkspace, pageSize, promptPage.offset, query, selectedCategoryIds, selectedStatus, sortBy, sortOrder, workspaceId]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => subscribeToDataUpdated(() => void load()), [load]);

  const groupedPrompts = useMemo(() => {
    return categories
      .map((category) => ({
        category,
        prompts: prompts.filter((prompt) => prompt.category_id === category.id),
      }))
      .filter((group) => group.prompts.length > 0);
  }, [categories, prompts]);

  const promptCounts = useMemo(() => {
    return categories.reduce<Record<string, number>>((acc, category) => {
      acc[category.id] = category.prompt_count ?? 0;
      return acc;
    }, {});
  }, [categories]);

  const avgVisibility = Math.round(promptPage.summary?.avg_visibility ?? 0);
  const hasPromptData = categories.length > 0 && prompts.length > 0;

  const toggleCategoryFilter = (categoryId: string) => {
    setPromptPage((current) => ({ ...current, offset: 0 }));
    setSelectedCategoryIds((current) => (current.includes(categoryId) ? current.filter((item) => item !== categoryId) : [...current, categoryId]));
  };

  const openCreateModal = () => {
    setModalMode("create");
    setEditingPromptId(null);
    setForm({
      categoryId: selectedCategoryIds[0] || categories[0]?.id || "",
      prompt: "",
      models: defaultModels,
      status: "draft",
    });
    setIsModalOpen(true);
  };

  const openEditModal = (prompt: Prompt) => {
    setModalMode("edit");
    setEditingPromptId(prompt.id);
    setForm({
      categoryId: prompt.category_id,
      prompt: prompt.prompt_text,
      models: prompt.selected_models as ModelOption[],
      status: prompt.status,
    });
    setIsModalOpen(true);
  };

  const savePrompt = async () => {
    if (!workspaceId || !form.prompt.trim()) return;
    const payload = {
      category_id: form.categoryId,
      prompt_text: form.prompt.trim(),
      target_brand: trackedBrand,
      expected_competitors: ["Profound", "Semrush", "Ahrefs"],
      selected_models: form.models,
      status: form.status,
    };
    if (editingPromptId) {
      await updatePrompt(editingPromptId, payload);
    } else {
      await createPrompt(workspaceId, payload);
    }
    setIsModalOpen(false);
    await load();
  };

  const saveCategory = async (name: string) => {
    if (!workspaceId || !name.trim()) return;
    await createCategory(workspaceId, { name: name.trim(), sort_order: categories.length + 1, is_active: true });
    await load();
  };

  const triggerRun = async (promptIds?: string[], scopeDescription?: string) => {
    if (!workspaceId || isRunning) return;
    setIsRunning(true);
    setRunActionError(null);
    try {
      await createManualRun(workspaceId, {
        prompt_ids: promptIds ?? null,
        run_type: "prompt_only",
        scope_description: scopeDescription ?? "Manual run from Prompts page",
      });
      await load();
      emitDataUpdated();
    } catch (error) {
      setRunActionError(error instanceof Error ? normalizeRunErrorMessage(error.message) : "Failed to start run");
    } finally {
      setIsRunning(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Prompts</h1>
          <p className="mt-1 text-muted-foreground">Organize tracked prompts by category and compare how they perform across models.</p>
        </div>
        <div className="flex flex-col items-start gap-2 md:items-end">
          <div className="flex gap-2">
            <Button variant="outline" className="flex items-center gap-2" disabled={isRunning} onClick={() => void triggerRun(undefined, "Manual run from Prompts page")}>
              <PlayCircle className="h-4 w-4" />
              {isRunning ? "Queueing..." : "Queue Active Prompts"}
            </Button>
            <Button className="flex items-center gap-2" onClick={openCreateModal}>
              <Plus className="h-4 w-4" />
              Add Prompt
            </Button>
          </div>
          {runActionError ? (
            <div className="max-w-lg rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">
              {runActionError}
            </div>
          ) : null}
        </div>
      </div>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Coverage Snapshot</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-3 sm:grid-cols-3">
          <div className="rounded-xl border bg-muted/20 p-4">
            <p className="text-xs uppercase tracking-[0.22em] text-muted-foreground">Tracked Prompts</p>
            <p className="mt-2 text-2xl font-semibold">{promptPage.total}</p>
          </div>
          <div className="rounded-xl border bg-muted/20 p-4">
            <p className="text-xs uppercase tracking-[0.22em] text-muted-foreground">Visible Categories</p>
            <p className="mt-2 text-2xl font-semibold">{promptPage.summary?.visible_categories ?? 0}</p>
          </div>
          <div className="rounded-xl border bg-muted/20 p-4">
            <p className="text-xs uppercase tracking-[0.22em] text-muted-foreground">Avg Visibility</p>
            <p className="mt-2 text-2xl font-semibold">{avgVisibility}%</p>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="gap-4 border-b pb-4">
          <div className="flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
            <div className="flex flex-wrap gap-2">
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="outline">
                    {selectedCategoryIds.length === 0 ? "All Categories" : `${selectedCategoryIds.length} categories selected`}
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="start" className="w-[280px]">
                  <DropdownMenuLabel>Filter Categories</DropdownMenuLabel>
                  <DropdownMenuSeparator />
                  <DropdownMenuCheckboxItem
                    checked={selectedCategoryIds.length === 0}
                    onCheckedChange={() => {
                      setPromptPage((current) => ({ ...current, offset: 0 }));
                      setSelectedCategoryIds([]);
                    }}
                  >
                    All Categories
                  </DropdownMenuCheckboxItem>
                  <DropdownMenuSeparator />
                  {categories.map((category) => (
                    <DropdownMenuCheckboxItem
                      key={category.id}
                      checked={selectedCategoryIds.includes(category.id)}
                      onCheckedChange={() => toggleCategoryFilter(category.id)}
                    >
                      {category.name}
                    </DropdownMenuCheckboxItem>
                  ))}
                </DropdownMenuContent>
              </DropdownMenu>

              <Button variant="outline" onClick={() => setIsCategoryModalOpen(true)} className="gap-2">
                <FolderPen className="h-4 w-4" />
                Manage Categories
              </Button>

              <select
                value={selectedStatus}
                onChange={(event) => {
                  setPromptPage((current) => ({ ...current, offset: 0 }));
                  setSelectedStatus(event.target.value as PromptStatus | "all");
                }}
                className={selectClassName}
              >
                <option value="all">All Statuses</option>
                <option value="active">Active</option>
                <option value="draft">Draft</option>
              </select>

              <select
                value={`${sortBy}:${sortOrder}`}
                onChange={(event) => {
                  const [nextSortBy, nextSortOrder] = event.target.value.split(":") as [
                    "created_at" | "updated_at" | "prompt_text" | "status",
                    "asc" | "desc",
                  ];
                  setPromptPage((current) => ({ ...current, offset: 0 }));
                  setSortBy(nextSortBy);
                  setSortOrder(nextSortOrder);
                }}
                className={selectClassName}
              >
                <option value="created_at:desc">Newest first</option>
                <option value="created_at:asc">Oldest first</option>
                <option value="updated_at:desc">Recently updated</option>
                <option value="prompt_text:asc">Prompt A-Z</option>
                <option value="status:asc">Status A-Z</option>
              </select>
            </div>

            <div className="relative w-full xl:max-w-sm">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={query}
                onChange={(event) => {
                  setPromptPage((current) => ({ ...current, offset: 0 }));
                  setQuery(event.target.value);
                }}
                placeholder="Search prompts, categories, or models"
                className="pl-9"
              />
            </div>
          </div>
        </CardHeader>

        <CardContent className="p-0">
          {!hasPromptData ? (
            <div className="flex min-h-[320px] flex-col items-center justify-center px-6 text-center">
              <FolderPen className="mb-4 h-10 w-10 text-muted-foreground" />
              <h2 className="text-xl font-semibold">No prompts yet</h2>
              <p className="mt-2 max-w-lg text-sm text-muted-foreground">
                Create categories and add prompts for this workspace to start tracking visibility, sentiment, and mentions.
              </p>
              <div className="mt-6 flex gap-3">
                <Button onClick={() => setIsCategoryModalOpen(true)} variant="outline">
                  Manage Categories
                </Button>
                <Button onClick={openCreateModal}>
                  <Plus className="mr-2 h-4 w-4" />
                  Add Prompt
                </Button>
              </div>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table className="min-w-[1050px] table-fixed">
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-[38%] pl-6">Prompt</TableHead>
                    <TableHead className="w-[10%]">Visibility</TableHead>
                    <TableHead className="w-[10%]">Sentiment</TableHead>
                    <TableHead className="w-[10%]">Mentions</TableHead>
                    <TableHead className="w-[12%]">Last Run</TableHead>
                    <TableHead className="w-[14%]">Models</TableHead>
                    <TableHead className="w-[10%]">Status</TableHead>
                    <TableHead className="sticky right-0 z-10 w-[76px] bg-card pr-8 text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {groupedPrompts.map((group) => {
                    const collapsed = collapsedCategories[group.category.id] ?? false;
                    return (
                      <Fragment key={group.category.id}>
                        <TableRow className="bg-foreground/[0.06] hover:bg-foreground/[0.06]">
                          <TableCell colSpan={8} className="pl-4 pr-6 py-4">
                            <button type="button" onClick={() => setCollapsedCategories((current) => ({ ...current, [group.category.id]: !collapsed }))} className="flex w-full items-center gap-3 py-1 text-left">
                              <ChevronRight className={cn("h-4 w-4 transition-transform text-foreground/80", !collapsed && "rotate-90")} />
                              <span className="text-base font-semibold text-foreground">{group.category.name}</span>
                              <span className="text-sm text-muted-foreground">{group.prompts.length} prompts</span>
                            </button>
                          </TableCell>
                        </TableRow>

                        {!collapsed &&
                          group.prompts.map((prompt) => (
                            <TableRow key={prompt.id}>
                              <TableCell className="pl-6">
                                <p title={prompt.prompt_text} className="overflow-hidden text-sm font-medium text-ellipsis [display:-webkit-box] [-webkit-line-clamp:3] [-webkit-box-orient:vertical] break-words">
                                  {prompt.prompt_text}
                                </p>
                              </TableCell>
                              <TableCell className="font-medium">{Math.round(prompt.visibility ?? 0)}%</TableCell>
                              <TableCell>{Math.round(prompt.sentiment ?? 0)}%</TableCell>
                              <TableCell>{prompt.mentions ?? 0}</TableCell>
                              <TableCell className="truncate">{formatLastRun(prompt.last_run_at)}</TableCell>
                              <TableCell className="text-muted-foreground">{prompt.selected_models.join(", ")}</TableCell>
                              <TableCell>
                                <span className={cn("inline-flex rounded-full border px-2 py-1 text-xs font-medium", statusClasses(prompt.status))}>
                                  {formatStatus(prompt.status)}
                                </span>
                              </TableCell>
                              <TableCell className="sticky right-0 z-10 bg-card pr-6 text-right">
                                <DropdownMenu>
                                  <DropdownMenuTrigger asChild>
                                    <Button variant="ghost" size="icon-sm">
                                      <MoreHorizontal className="h-4 w-4" />
                                    </Button>
                                  </DropdownMenuTrigger>
                                  <DropdownMenuContent align="end">
                                    <DropdownMenuItem onClick={() => openEditModal(prompt)}>Edit prompt</DropdownMenuItem>
                                    <DropdownMenuItem onClick={() => void triggerRun([prompt.id], `Manual run for prompt ${prompt.id}`)}>
                                      Queue prompt
                                    </DropdownMenuItem>
                                    <DropdownMenuItem
                                      onClick={async () => {
                                        await createPrompt(workspaceId!, {
                                          category_id: prompt.category_id,
                                          prompt_text: `${prompt.prompt_text} (Variant)`,
                                          target_brand: trackedBrand,
                                          expected_competitors: prompt.expected_competitors,
                                          selected_models: prompt.selected_models,
                                          status: "draft",
                                        });
                                        await load();
                                      }}
                                    >
                                      Duplicate
                                    </DropdownMenuItem>
                                    <DropdownMenuSeparator />
                                    <DropdownMenuItem className="text-destructive focus:text-destructive" onClick={async () => { await deletePrompt(prompt.id); await load(); }}>
                                      Delete
                                    </DropdownMenuItem>
                                  </DropdownMenuContent>
                                </DropdownMenu>
                              </TableCell>
                            </TableRow>
                          ))}
                      </Fragment>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
        {hasPromptData ? (
          <div className="flex items-center justify-between border-t px-6 py-4 text-sm text-muted-foreground">
            <p>
              Showing {promptPage.offset + 1}-{Math.min(promptPage.offset + prompts.length, promptPage.total)} of {promptPage.total}
            </p>
            <div className="flex gap-2">
              <Button
                variant="outline"
                size="sm"
                disabled={promptPage.offset === 0}
                onClick={() =>
                  setPromptPage((current) => ({ ...current, offset: Math.max(current.offset - current.limit, 0) }))
                }
              >
                Previous
              </Button>
              <Button
                variant="outline"
                size="sm"
                disabled={promptPage.offset + promptPage.limit >= promptPage.total}
                onClick={() =>
                  setPromptPage((current) => ({ ...current, offset: current.offset + current.limit }))
                }
              >
                Next
              </Button>
            </div>
          </div>
        ) : null}
      </Card>

      <PromptModal
        open={isModalOpen}
        mode={modalMode}
        categories={categories}
        form={form}
        onClose={() => setIsModalOpen(false)}
        onChange={(field, value) => setForm((current) => ({ ...current, [field]: value }))}
        onToggleModel={(model) =>
          setForm((current) => ({
            ...current,
            models: current.models.includes(model)
              ? current.models.length === 1
                ? current.models
                : current.models.filter((item) => item !== model)
              : [...current.models, model],
          }))
        }
        onSubmit={savePrompt}
      />

      <CategoryManagerModal
        open={isCategoryModalOpen}
        categories={categories}
        promptCounts={promptCounts}
        onClose={() => setIsCategoryModalOpen(false)}
        onAddCategory={async (name) => {
          await saveCategory(name);
        }}
        onRenameCategory={async (categoryId, name) => {
          await updateCategory(categoryId, { name });
          await load();
        }}
        onDeleteCategory={async (categoryId, moveToCategoryId) => {
          await deleteCategory(categoryId, moveToCategoryId);
          await load();
        }}
      />
    </div>
  );
}
