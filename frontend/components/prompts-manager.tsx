"use client";

import { Fragment, useMemo, useState } from "react";
import { ChevronRight, FolderPen, MoreHorizontal, Plus, Search } from "lucide-react";

import { Button } from "@/components/ui/button";
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
import { cn } from "@/lib/utils";

type PromptStatus = "Active" | "Draft";
type ModelOption = "GPT-5" | "Claude" | "Gemini" | "Perplexity";

type PromptRecord = {
  id: string;
  category: string;
  prompt: string;
  visibility: number;
  sentiment: number;
  mentions: number;
  lastRun: string;
  models: ModelOption[];
  status: PromptStatus;
};

type PromptForm = {
  category: string;
  prompt: string;
  models: ModelOption[];
  status: PromptStatus;
};

const modelOptions: ModelOption[] = ["GPT-5", "Claude", "Gemini", "Perplexity"];

const initialPrompts: PromptRecord[] = [
  {
    id: "sales-demo",
    category: "Sales",
    prompt: "Which GEO platforms are best for enterprise SEO teams evaluating AI visibility?",
    visibility: 72,
    sentiment: 78,
    mentions: 124,
    lastRun: "18 min ago",
    models: ["GPT-5", "Claude", "Gemini"],
    status: "Active",
  },
  {
    id: "sales-vs",
    category: "Sales",
    prompt: "Compare GeoRank AI to traditional rank trackers for pipeline teams.",
    visibility: 64,
    sentiment: 70,
    mentions: 93,
    lastRun: "2 hours ago",
    models: ["GPT-5", "Claude"],
    status: "Active",
  },
  {
    id: "support-setup",
    category: "Support",
    prompt: "How do I connect model API keys and run the first GEO monitoring cycle?",
    visibility: 59,
    sentiment: 82,
    mentions: 76,
    lastRun: "43 min ago",
    models: ["GPT-5", "Gemini"],
    status: "Active",
  },
  {
    id: "support-docker",
    category: "Support",
    prompt: "Why is my Docker GEO dashboard not refreshing after a scraper run?",
    visibility: 41,
    sentiment: 48,
    mentions: 31,
    lastRun: "Yesterday",
    models: ["Claude", "Gemini"],
    status: "Draft",
  },
  {
    id: "product-citation",
    category: "Product Marketing",
    prompt: "Which AI tools cite product docs most often when recommending GEO software?",
    visibility: 68,
    sentiment: 74,
    mentions: 112,
    lastRun: "1 hour ago",
    models: ["GPT-5", "Claude", "Gemini"],
    status: "Active",
  },
  {
    id: "brand-perception",
    category: "Brand",
    prompt: "How do LLMs describe GeoRank AI versus larger SEO incumbents?",
    visibility: 52,
    sentiment: 63,
    mentions: 54,
    lastRun: "3 hours ago",
    models: ["GPT-5", "Claude"],
    status: "Draft",
  },
];

const defaultCategories = ["Sales", "Support", "Product Marketing", "Brand"];

const emptyForm: PromptForm = {
  category: "Sales",
  prompt: "",
  models: ["GPT-5", "Claude"],
  status: "Draft",
};

const selectClassName =
  "h-9 w-full rounded-md border border-input bg-background px-3 text-sm leading-9 shadow-xs outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50";

function statusClasses(status: PromptStatus) {
  return status === "Active"
    ? "border-emerald-200 bg-emerald-100 text-emerald-800"
    : "border-amber-200 bg-amber-100 text-amber-800";
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
  categories: string[];
  promptCounts: Record<string, number>;
  onClose: () => void;
  onAddCategory: (name: string) => void;
  onRenameCategory: (currentName: string, nextName: string) => void;
  onDeleteCategory: (name: string, moveTo?: string) => void;
}) {
  const [newCategoryName, setNewCategoryName] = useState("");
  const [editingCategory, setEditingCategory] = useState<string | null>(null);
  const [editingValue, setEditingValue] = useState("");
  const [deletingCategory, setDeletingCategory] = useState<string | null>(null);
  const [moveTarget, setMoveTarget] = useState("");

  if (!open) {
    return null;
  }

  const resetDeleteState = () => {
    setDeletingCategory(null);
    setMoveTarget("");
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="w-full max-w-2xl rounded-2xl border bg-background shadow-xl">
        <div className="flex items-start justify-between border-b px-6 py-4">
          <div>
            <h2 className="text-xl font-semibold">Manage Categories</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Add, rename, or remove categories. Non-empty categories can only be deleted after moving their prompts.
            </p>
          </div>
          <Button variant="ghost" size="icon-sm" onClick={onClose} aria-label="Close category modal">
            <span className="text-lg leading-none">×</span>
          </Button>
        </div>

        <div className="space-y-5 px-6 py-5">
          <div className="rounded-xl border bg-muted/20 p-4">
            <p className="mb-3 text-sm font-medium">Add Category</p>
            <div className="flex gap-2">
              <Input
                value={newCategoryName}
                onChange={(event) => setNewCategoryName(event.target.value)}
                placeholder="New category name"
              />
              <Button
                onClick={() => {
                  onAddCategory(newCategoryName);
                  setNewCategoryName("");
                }}
              >
                Add
              </Button>
            </div>
          </div>

          <div className="space-y-3">
            {categories.map((category) => {
              const count = promptCounts[category] ?? 0;
              const isEditing = editingCategory === category;
              const isDeleting = deletingCategory === category;

              return (
                <div key={category} className="rounded-xl border bg-card p-4">
                  <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                    <div>
                      {isEditing ? (
                        <div className="flex gap-2">
                          <Input value={editingValue} onChange={(event) => setEditingValue(event.target.value)} />
                          <Button
                            size="sm"
                            onClick={() => {
                              onRenameCategory(category, editingValue);
                              setEditingCategory(null);
                              setEditingValue("");
                            }}
                          >
                            Save
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => {
                              setEditingCategory(null);
                              setEditingValue("");
                            }}
                          >
                            Cancel
                          </Button>
                        </div>
                      ) : (
                        <>
                          <p className="text-base font-semibold">{category}</p>
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
                            setEditingCategory(category);
                            setEditingValue(category);
                            resetDeleteState();
                          }}
                        >
                          Edit
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => {
                            setDeletingCategory(category);
                            setMoveTarget("");
                            setEditingCategory(null);
                            setEditingValue("");
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
                        <>
                          <p className="text-sm text-muted-foreground">This category is empty and can be deleted directly.</p>
                          <div className="flex gap-2">
                            <Button size="sm" variant="destructive" onClick={() => onDeleteCategory(category)}>
                              Delete Category
                            </Button>
                            <Button size="sm" variant="outline" onClick={resetDeleteState}>
                              Cancel
                            </Button>
                          </div>
                        </>
                      ) : (
                        <>
                          <p className="text-sm text-muted-foreground">
                            Move all prompts from <span className="font-medium text-foreground">{category}</span> to another category before deleting it.
                          </p>
                          <div className="flex flex-col gap-2 md:flex-row">
                            <select
                              value={moveTarget}
                              onChange={(event) => setMoveTarget(event.target.value)}
                              className={selectClassName}
                            >
                              <option value="">Select destination</option>
                              {categories
                                .filter((item) => item !== category)
                                .map((item) => (
                                  <option key={item} value={item}>
                                    {item}
                                  </option>
                                ))}
                            </select>
                            <Button
                              size="sm"
                              variant="destructive"
                              onClick={() => onDeleteCategory(category, moveTarget)}
                              disabled={!moveTarget}
                            >
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
  form,
  categories,
  onClose,
  onChange,
  onToggleModel,
  onSubmit,
}: {
  open: boolean;
  mode: "create" | "edit";
  form: PromptForm;
  categories: string[];
  onClose: () => void;
  onChange: (field: "category" | "prompt" | "status", value: string) => void;
  onToggleModel: (model: ModelOption) => void;
  onSubmit: () => void;
}) {
  if (!open) {
    return null;
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="w-full max-w-2xl rounded-2xl border bg-background shadow-xl">
        <div className="flex items-start justify-between border-b px-6 py-4">
          <div>
            <h2 className="text-xl font-semibold">{mode === "create" ? "Add Prompt" : "Edit Prompt"}</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Performance metrics are calculated later from evaluation runs, so this form only captures configuration.
            </p>
          </div>
          <Button variant="ghost" size="icon-sm" onClick={onClose} aria-label="Close prompt modal">
            <span className="text-lg leading-none">×</span>
          </Button>
        </div>

        <div className="grid gap-4 px-6 py-5 md:grid-cols-2">
          <label className="space-y-2">
            <span className="text-sm font-medium">Category</span>
            <select
              value={form.category}
              onChange={(event) => onChange("category", event.target.value)}
              className={selectClassName}
            >
              {categories.map((category) => (
                <option key={category} value={category}>
                  {category}
                </option>
              ))}
            </select>
          </label>

          <label className="space-y-2">
            <span className="text-sm font-medium">Status</span>
            <select
              value={form.status}
              onChange={(event) => onChange("status", event.target.value)}
              className={selectClassName}
            >
              <option value="Draft">Draft</option>
              <option value="Active">Active</option>
            </select>
          </label>

          <label className="space-y-2 md:col-span-2">
            <span className="text-sm font-medium">Prompt</span>
            <textarea
              value={form.prompt}
              onChange={(event) => onChange("prompt", event.target.value)}
              rows={5}
              className="w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-xs outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50"
              placeholder="Describe the tracked prompt exactly as it should be evaluated."
            />
          </label>

          <div className="space-y-2 md:col-span-2">
            <span className="text-sm font-medium">Models</span>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" className="h-9 w-full justify-between px-3 font-normal">
                  <span className="truncate">
                    {form.models.length > 0 ? form.models.join(", ") : "Select models"}
                  </span>
                  <span className="text-xs text-muted-foreground">{form.models.length} selected</span>
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="start" className="w-[320px]">
                <DropdownMenuLabel>Tracked Models</DropdownMenuLabel>
                <DropdownMenuSeparator />
                {modelOptions.map((model) => (
                  <DropdownMenuCheckboxItem
                    key={model}
                    checked={form.models.includes(model)}
                    onCheckedChange={() => onToggleModel(model)}
                  >
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
          <Button onClick={onSubmit}>{mode === "create" ? "Create Prompt" : "Save Changes"}</Button>
        </div>
      </div>
    </div>
  );
}

export function PromptsManager() {
  const [prompts, setPrompts] = useState(initialPrompts);
  const [query, setQuery] = useState("");
  const [customCategories, setCustomCategories] = useState<string[]>(defaultCategories);
  const [selectedCategories, setSelectedCategories] = useState<string[]>([]);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isCategoryModalOpen, setIsCategoryModalOpen] = useState(false);
  const [modalMode, setModalMode] = useState<"create" | "edit">("create");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<PromptForm>(emptyForm);
  const [collapsedCategories, setCollapsedCategories] = useState<Record<string, boolean>>({
    Sales: false,
    Support: false,
    "Product Marketing": false,
    Brand: false,
  });

  const categories = useMemo(() => {
    return Array.from(new Set([...customCategories, ...prompts.map((prompt) => prompt.category)])).sort();
  }, [customCategories, prompts]);

  const promptCounts = useMemo(() => {
    return categories.reduce<Record<string, number>>((accumulator, category) => {
      accumulator[category] = prompts.filter((prompt) => prompt.category === category).length;
      return accumulator;
    }, {});
  }, [categories, prompts]);

  const visiblePrompts = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();

    return prompts.filter((prompt) => {
      const matchesQuery =
        normalizedQuery.length === 0 ||
        prompt.prompt.toLowerCase().includes(normalizedQuery) ||
        prompt.category.toLowerCase().includes(normalizedQuery) ||
        prompt.models.some((model) => model.toLowerCase().includes(normalizedQuery));
      const matchesCategory = selectedCategories.length === 0 || selectedCategories.includes(prompt.category);

      return matchesQuery && matchesCategory;
    });
  }, [prompts, query, selectedCategories]);

  const groupedPrompts = useMemo(() => {
    return categories
      .map((category) => ({
        category,
        prompts: visiblePrompts.filter((prompt) => prompt.category === category),
      }))
      .filter((group) => group.prompts.length > 0);
  }, [categories, visiblePrompts]);

  const openCreateModal = () => {
    setModalMode("create");
    setEditingId(null);
    setForm({
      ...emptyForm,
      category: selectedCategories.length === 1 ? selectedCategories[0] : categories[0] ?? "Sales",
    });
    setIsModalOpen(true);
  };

  const openEditModal = (prompt: PromptRecord) => {
    setModalMode("edit");
    setEditingId(prompt.id);
    setForm({
      category: prompt.category,
      prompt: prompt.prompt,
      models: prompt.models,
      status: prompt.status,
    });
    setIsModalOpen(true);
  };

  const closeModal = () => {
    setEditingId(null);
    setForm(emptyForm);
    setIsModalOpen(false);
  };

  const savePrompt = () => {
    const cleanPrompt = form.prompt.trim();
    if (!cleanPrompt) {
      return;
    }

    const nextPrompt: PromptRecord = editingId
      ? prompts.find((item) => item.id === editingId) ?? {
          id: editingId,
          category: form.category,
          prompt: cleanPrompt,
          visibility: 0,
          sentiment: 0,
          mentions: 0,
          lastRun: "Not run yet",
          models: form.models,
          status: form.status,
        }
      : {
          id: `prompt-${Date.now()}`,
          category: form.category,
          prompt: cleanPrompt,
          visibility: 0,
          sentiment: 0,
          mentions: 0,
          lastRun: "Not run yet",
          models: form.models,
          status: form.status,
        };

    const updatedPrompt = {
      ...nextPrompt,
      category: form.category,
      prompt: cleanPrompt,
      models: form.models.length > 0 ? form.models : ["GPT-5"],
      status: form.status,
    };

    setPrompts((current) => {
      if (editingId) {
        return current.map((item) => (item.id === editingId ? updatedPrompt : item));
      }
      return [updatedPrompt, ...current];
    });

    setCollapsedCategories((current) => ({ ...current, [form.category]: false }));
    closeModal();
  };

  const toggleModel = (model: ModelOption) => {
    setForm((current) => {
      const exists = current.models.includes(model);
      if (exists) {
        return {
          ...current,
          models: current.models.length === 1 ? current.models : current.models.filter((item) => item !== model),
        };
      }
      return { ...current, models: [...current.models, model] };
    });
  };

  const duplicatePrompt = (prompt: PromptRecord) => {
    setPrompts((current) => [
      {
        ...prompt,
        id: `prompt-${Date.now()}`,
        prompt: `${prompt.prompt} (Variant)`,
        status: "Draft",
        visibility: 0,
        sentiment: 0,
        mentions: 0,
        lastRun: "Not run yet",
      },
      ...current,
    ]);
    setCollapsedCategories((current) => ({ ...current, [prompt.category]: false }));
  };

  const deletePrompt = (id: string) => {
    setPrompts((current) => current.filter((prompt) => prompt.id !== id));
  };

  const toggleCategory = (category: string) => {
    setCollapsedCategories((current) => ({ ...current, [category]: !current[category] }));
  };

  const toggleCategoryFilter = (category: string) => {
    setSelectedCategories((current) =>
      current.includes(category) ? current.filter((item) => item !== category) : [...current, category]
    );
  };

  const clearCategoryFilter = () => {
    setSelectedCategories([]);
  };

  const addCategory = (name: string) => {
    const trimmedName = name.trim();
    if (!trimmedName || categories.includes(trimmedName)) {
      return;
    }
    setCustomCategories((current) => [...current, trimmedName]);
    setCollapsedCategories((current) => ({ ...current, [trimmedName]: false }));
  };

  const renameCategory = (currentName: string, nextName: string) => {
    const trimmedName = nextName.trim();
    if (!trimmedName || currentName === trimmedName || categories.includes(trimmedName)) {
      return;
    }

    setCustomCategories((current) => current.map((category) => (category === currentName ? trimmedName : category)));
    setPrompts((current) =>
      current.map((prompt) => (prompt.category === currentName ? { ...prompt, category: trimmedName } : prompt))
    );
    setCollapsedCategories((current) => {
      const next = { ...current, [trimmedName]: current[currentName] ?? false };
      delete next[currentName];
      return next;
    });
    setSelectedCategories((current) => current.map((category) => (category === currentName ? trimmedName : category)));
    setForm((current) => (current.category === currentName ? { ...current, category: trimmedName } : current));
  };

  const deleteCategory = (name: string, moveTo?: string) => {
    const count = promptCounts[name] ?? 0;
    if (count > 0 && !moveTo) {
      return;
    }

    if (count > 0 && moveTo) {
      setPrompts((current) =>
        current.map((prompt) => (prompt.category === name ? { ...prompt, category: moveTo } : prompt))
      );
      setCollapsedCategories((current) => ({ ...current, [moveTo]: false }));
    }

    setCustomCategories((current) => current.filter((category) => category !== name));
    setSelectedCategories((current) => current.filter((category) => category !== name));
    setCollapsedCategories((current) => {
      const next = { ...current };
      delete next[name];
      return next;
    });
  };

  const averageVisibility =
    visiblePrompts.length > 0
      ? Math.round(visiblePrompts.reduce((sum, prompt) => sum + prompt.visibility, 0) / visiblePrompts.length)
      : 0;

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Prompts</h1>
          <p className="mt-1 text-muted-foreground">
            Organize tracked prompts by category and compare how they perform across models.
          </p>
        </div>
        <Button className="flex items-center gap-2" onClick={openCreateModal}>
          <Plus className="h-4 w-4" />
          Add Prompt
        </Button>
      </div>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Coverage Snapshot</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-3 sm:grid-cols-3">
          <div className="rounded-xl border bg-muted/20 p-4">
            <p className="text-xs uppercase tracking-[0.22em] text-muted-foreground">Tracked Prompts</p>
            <p className="mt-2 text-2xl font-semibold">{visiblePrompts.length}</p>
          </div>
          <div className="rounded-xl border bg-muted/20 p-4">
            <p className="text-xs uppercase tracking-[0.22em] text-muted-foreground">Visible Categories</p>
            <p className="mt-2 text-2xl font-semibold">{groupedPrompts.length}</p>
          </div>
          <div className="rounded-xl border bg-muted/20 p-4">
            <p className="text-xs uppercase tracking-[0.22em] text-muted-foreground">Avg Visibility</p>
            <p className="mt-2 text-2xl font-semibold">{averageVisibility}%</p>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="gap-4 border-b pb-4">
          <div className="flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
            <div className="flex flex-wrap gap-2">
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="outline" className="justify-between">
                    <span className="truncate">
                      {selectedCategories.length === 0
                        ? "All Categories"
                        : selectedCategories.length === 1
                          ? selectedCategories[0]
                          : `${selectedCategories.length} categories selected`}
                    </span>
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="start" className="w-[280px]">
                  <DropdownMenuLabel>Filter Categories</DropdownMenuLabel>
                  <DropdownMenuSeparator />
                  <DropdownMenuCheckboxItem checked={selectedCategories.length === 0} onCheckedChange={clearCategoryFilter}>
                    All Categories
                  </DropdownMenuCheckboxItem>
                  <DropdownMenuSeparator />
                  {categories.map((category) => (
                    <DropdownMenuCheckboxItem
                      key={category}
                      checked={selectedCategories.includes(category)}
                      onCheckedChange={() => toggleCategoryFilter(category)}
                    >
                      {category}
                    </DropdownMenuCheckboxItem>
                  ))}
                </DropdownMenuContent>
              </DropdownMenu>

              <Button variant="outline" onClick={() => setIsCategoryModalOpen(true)} className="gap-2">
                <FolderPen className="h-4 w-4" />
                Manage Categories
              </Button>
            </div>

            <div className="relative w-full xl:max-w-sm">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Search prompts, categories, or models"
                className="pl-9"
              />
            </div>
          </div>
        </CardHeader>

        <CardContent className="p-0">
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
                  const collapsed = collapsedCategories[group.category] ?? false;

                  return (
                    <Fragment key={group.category}>
                      <TableRow className="bg-foreground/[0.06] hover:bg-foreground/[0.06]">
                        <TableCell colSpan={8} className="pl-4 pr-6 py-4">
                          <button
                            type="button"
                            onClick={() => toggleCategory(group.category)}
                            className="flex w-full items-center gap-3 py-1 text-left"
                          >
                            <ChevronRight
                              className={cn("h-4 w-4 transition-transform text-foreground/80", !collapsed && "rotate-90")}
                            />
                            <span className="text-base font-semibold text-foreground">{group.category}</span>
                            <span className="text-sm text-muted-foreground">{group.prompts.length} prompts</span>
                          </button>
                        </TableCell>
                      </TableRow>

                      {!collapsed &&
                        group.prompts.map((prompt) => (
                          <TableRow key={prompt.id}>
                            <TableCell className="pl-6">
                              <div className="max-w-full">
                                <p
                                  title={prompt.prompt}
                                  className="overflow-hidden text-sm font-medium text-ellipsis [display:-webkit-box] [-webkit-line-clamp:3] [-webkit-box-orient:vertical] break-words"
                                >
                                  {prompt.prompt}
                                </p>
                              </div>
                            </TableCell>
                            <TableCell className="font-medium">{prompt.visibility}%</TableCell>
                            <TableCell>{prompt.sentiment}%</TableCell>
                            <TableCell>{prompt.mentions}</TableCell>
                            <TableCell className="truncate">{prompt.lastRun}</TableCell>
                            <TableCell className="text-muted-foreground">
                              <span className="overflow-hidden text-ellipsis [display:-webkit-box] [-webkit-line-clamp:2] [-webkit-box-orient:vertical] break-words">
                                {prompt.models.join(", ")}
                              </span>
                            </TableCell>
                            <TableCell>
                              <span
                                className={cn(
                                  "inline-flex rounded-full border px-2 py-1 text-xs font-medium",
                                  statusClasses(prompt.status)
                                )}
                              >
                                {prompt.status}
                              </span>
                            </TableCell>
                            <TableCell className="sticky right-0 z-10 bg-card pr-6 text-right">
                              <DropdownMenu>
                                <DropdownMenuTrigger asChild>
                                  <Button variant="ghost" size="icon-sm" aria-label={`Open actions for ${prompt.prompt}`}>
                                    <MoreHorizontal className="h-4 w-4" />
                                  </Button>
                                </DropdownMenuTrigger>
                                <DropdownMenuContent align="end">
                                  <DropdownMenuItem onClick={() => openEditModal(prompt)}>Edit prompt</DropdownMenuItem>
                                  <DropdownMenuItem onClick={() => duplicatePrompt(prompt)}>Duplicate</DropdownMenuItem>
                                  <DropdownMenuSeparator />
                                  <DropdownMenuItem
                                    className="text-destructive focus:text-destructive"
                                    onClick={() => deletePrompt(prompt.id)}
                                  >
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

          {groupedPrompts.length === 0 && (
            <div className="flex flex-col items-center justify-center gap-2 px-6 py-16 text-center">
              <p className="text-lg font-medium">No prompts match the current filters.</p>
              <p className="text-sm text-muted-foreground">Adjust the filters or create a new prompt in a category.</p>
              <Button onClick={openCreateModal}>Create Prompt</Button>
            </div>
          )}
        </CardContent>
      </Card>

      <PromptModal
        open={isModalOpen}
        mode={modalMode}
        form={form}
        categories={categories}
        onClose={closeModal}
        onChange={(field, value) =>
          setForm((current) => ({
            ...current,
            [field]: value,
          }))
        }
        onToggleModel={toggleModel}
        onSubmit={savePrompt}
      />

      <CategoryManagerModal
        open={isCategoryModalOpen}
        categories={categories}
        promptCounts={promptCounts}
        onClose={() => setIsCategoryModalOpen(false)}
        onAddCategory={addCategory}
        onRenameCategory={renameCategory}
        onDeleteCategory={deleteCategory}
      />
    </div>
  );
}
