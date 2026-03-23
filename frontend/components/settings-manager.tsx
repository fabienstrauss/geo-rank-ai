"use client";

import { useEffect, useState } from "react";
import { Eye, EyeOff, KeyRound, MoonStar, Save, Sun, WandSparkles } from "lucide-react";

import { Button } from "@/components/ui/button";
import { useWorkspace } from "@/components/workspace-provider";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import {
  createConnector,
  deleteConnector,
  getConnectors,
  getProviderCredentials,
  getSettings,
  updateConnector,
  upsertProviderCredential,
  upsertSetting,
} from "@/lib/api";
import { cn } from "@/lib/utils";

type ThemeMode = "light" | "dark";
type ProviderKey = "openai" | "anthropic" | "google";
type ModelOption = "GPT-5" | "Claude" | "Gemini" | "Perplexity";
type ConnectorType = "llm_api" | "ui_scraper";

const modelOptions: ModelOption[] = ["GPT-5", "Claude", "Gemini", "Perplexity"];

const providers = [
  { key: "openai" as const, label: "OpenAI", placeholder: "sk-...", description: "Used for app requests and API-based scraping when OpenAI is selected." },
  { key: "anthropic" as const, label: "Anthropic", placeholder: "sk-ant-...", description: "Used for Claude-backed requests and API-based scraping." },
  { key: "google" as const, label: "Google AI", placeholder: "AIza...", description: "Used for Gemini-backed requests and API-based scraping." },
];

function maskKey(value: string) {
  if (!value) return "No key saved";
  if (value.length <= 8) return "••••••••";
  return `${value.slice(0, 4)}••••••${value.slice(-4)}`;
}

export function SettingsManager() {
  const { activeWorkspace } = useWorkspace();
  const [workspaceId, setWorkspaceId] = useState<string | null>(null);
  const [theme, setTheme] = useState<ThemeMode>("light");
  const [defaultProvider, setDefaultProvider] = useState<ProviderKey>("openai");
  const [trackedBrand, setTrackedBrand] = useState("GeoRank AI");
  const [defaultModels, setDefaultModels] = useState<ModelOption[]>(["GPT-5", "Claude"]);
  const [defaultConnectorId, setDefaultConnectorId] = useState("");
  const [connectors, setConnectors] = useState<
    { id: string; name: string; connector_type: ConnectorType; provider_key?: string | null; is_enabled: boolean }[]
  >([]);
  const [newConnectorName, setNewConnectorName] = useState("");
  const [newConnectorType, setNewConnectorType] = useState<ConnectorType>("llm_api");
  const [newConnectorProvider, setNewConnectorProvider] = useState<ProviderKey>("openai");
  const [keys, setKeys] = useState<Record<ProviderKey, string>>({ openai: "", anthropic: "", google: "" });
  const [hasKeys, setHasKeys] = useState<Record<ProviderKey, boolean>>({ openai: false, anthropic: false, google: false });
  const [draftKeys, setDraftKeys] = useState<Record<ProviderKey, string>>({ openai: "", anthropic: "", google: "" });
  const [editingProvider, setEditingProvider] = useState<ProviderKey | null>(null);
  const [visibleProvider, setVisibleProvider] = useState<ProviderKey | null>(null);

  useEffect(() => {
    async function load() {
      if (!activeWorkspace) return;
      const [settings, credentials, connectorRows] = await Promise.all([
        getSettings(activeWorkspace.id),
        getProviderCredentials(activeWorkspace.id),
        getConnectors(activeWorkspace.id),
      ]);
      setWorkspaceId(activeWorkspace.id);
      setConnectors(
        connectorRows.map((connector) => ({
          id: connector.id,
          name: connector.name,
          connector_type: connector.connector_type as ConnectorType,
          provider_key: connector.provider_key,
          is_enabled: connector.is_enabled,
        }))
      );

      const themeSetting = settings.find((item) => item.key === "theme");
      const providerSetting = settings.find((item) => item.key === "default_provider");
      const profileSetting = settings.find((item) => item.key === "workspace_profile");
      const modelsSetting = settings.find((item) => item.key === "default_models");
      const connectorSetting = settings.find((item) => item.key === "default_connector");
      const nextTheme = (themeSetting?.value_json.mode as ThemeMode | undefined) ?? "light";
      const nextProvider = (providerSetting?.value_json.provider as ProviderKey | undefined) ?? "openai";
      const nextBrand = (profileSetting?.value_json.tracked_brand as string | undefined) ?? "GeoRank AI";
      const nextModels = (modelsSetting?.value_json.models as ModelOption[] | undefined) ?? ["GPT-5", "Claude"];
      const nextConnectorId = (connectorSetting?.value_json.connector_id as string | undefined) ?? "";
      setTheme(nextTheme);
      setDefaultProvider(nextProvider);
      setTrackedBrand(nextBrand);
      setDefaultModels(nextModels);
      setDefaultConnectorId(nextConnectorId);
      document.documentElement.classList.toggle("dark", nextTheme === "dark");
      window.localStorage.setItem("georank-theme", nextTheme);
      window.localStorage.setItem("georank-default-provider", nextProvider);

      const mapped = credentials.reduce<Record<ProviderKey, string>>(
        (acc, credential) => {
          acc[credential.provider as ProviderKey] = credential.masked_api_key ?? "";
          return acc;
        },
        { openai: "", anthropic: "", google: "" }
      );
      const mappedHasKeys = credentials.reduce<Record<ProviderKey, boolean>>(
        (acc, credential) => {
          acc[credential.provider as ProviderKey] = credential.has_api_key;
          return acc;
        },
        { openai: false, anthropic: false, google: false }
      );
      setKeys(mapped);
      setHasKeys(mappedHasKeys);
      setDraftKeys({ openai: "", anthropic: "", google: "" });
    }

    void load();
  }, [activeWorkspace]);

  const applyTheme = async (nextTheme: ThemeMode) => {
    setTheme(nextTheme);
    document.documentElement.classList.toggle("dark", nextTheme === "dark");
    window.localStorage.setItem("georank-theme", nextTheme);
    if (workspaceId) {
      await upsertSetting(workspaceId, "theme", { mode: nextTheme });
    }
  };

  const saveProviderKey = async (provider: ProviderKey) => {
    if (!workspaceId) return;
    await upsertProviderCredential(workspaceId, provider, {
      api_key: draftKeys[provider] || null,
      is_default: defaultProvider === provider,
      is_enabled: true,
      metadata_json: null,
    });
    const maskedValue = draftKeys[provider] ? maskKey(draftKeys[provider]) : "No key saved";
    setKeys((current) => ({ ...current, [provider]: maskedValue }));
    setHasKeys((current) => ({ ...current, [provider]: Boolean(draftKeys[provider]) }));
    setDraftKeys((current) => ({ ...current, [provider]: "" }));
    setEditingProvider(null);
    setVisibleProvider(null);
  };

  const updateDefault = async (provider: ProviderKey) => {
    setDefaultProvider(provider);
    window.localStorage.setItem("georank-default-provider", provider);
    if (!workspaceId) return;
    await upsertSetting(workspaceId, "default_provider", { provider });
    const credentials = await getProviderCredentials(workspaceId);
    await Promise.all(
      providers.map((item) =>
        upsertProviderCredential(workspaceId, item.key, {
          is_default: item.key === provider,
          is_enabled: credentials.find((credential) => credential.provider === item.key)?.is_enabled ?? true,
          metadata_json: credentials.find((credential) => credential.provider === item.key)?.metadata_json ?? null,
        })
      )
    );
  };

  const syncCredentialState = async () => {
    if (!workspaceId) return;
    const credentials = await getProviderCredentials(workspaceId);
    const mapped = credentials.reduce<Record<ProviderKey, string>>(
      (acc, credential) => {
        acc[credential.provider as ProviderKey] = credential.masked_api_key ?? "";
        return acc;
      },
      { openai: "", anthropic: "", google: "" }
    );
    const mappedHasKeys = credentials.reduce<Record<ProviderKey, boolean>>(
      (acc, credential) => {
        acc[credential.provider as ProviderKey] = credential.has_api_key;
        return acc;
      },
      { openai: false, anthropic: false, google: false }
    );
    setKeys(mapped);
    setHasKeys(mappedHasKeys);
  };

  const setCredentialEnabled = async (provider: ProviderKey, enabled: boolean) => {
    if (!workspaceId) return;
    await upsertProviderCredential(workspaceId, provider, {
      is_enabled: enabled,
      is_default: enabled ? defaultProvider === provider : false,
    });
    if (!enabled && defaultProvider === provider) {
      setDefaultProvider("openai");
      await upsertSetting(workspaceId, "default_provider", { provider: "openai" });
    }
    await syncCredentialState();
  };

  const clearProviderKey = async (provider: ProviderKey) => {
    if (!workspaceId) return;
    await upsertProviderCredential(workspaceId, provider, {
      clear_secret: true,
      is_default: false,
      is_enabled: false,
    });
    if (defaultProvider === provider) {
      setDefaultProvider("openai");
      await upsertSetting(workspaceId, "default_provider", { provider: "openai" });
    }
    setDraftKeys((current) => ({ ...current, [provider]: "" }));
    setEditingProvider(null);
    setVisibleProvider(null);
    await syncCredentialState();
  };

  const saveWorkspaceProfile = async () => {
    if (!workspaceId) return;
    await Promise.all([
      upsertSetting(workspaceId, "workspace_profile", { tracked_brand: trackedBrand, setup_complete: true }),
      upsertSetting(workspaceId, "default_models", { models: defaultModels }),
      upsertSetting(workspaceId, "default_connector", { connector_id: defaultConnectorId || null }),
    ]);
  };

  const reloadConnectors = async () => {
    if (!workspaceId) return;
    const connectorRows = await getConnectors(workspaceId);
    setConnectors(
      connectorRows.map((connector) => ({
        id: connector.id,
        name: connector.name,
        connector_type: connector.connector_type as ConnectorType,
        provider_key: connector.provider_key,
        is_enabled: connector.is_enabled,
      }))
    );
  };

  const addConnector = async () => {
    if (!workspaceId || !newConnectorName.trim()) return;
    await createConnector(workspaceId, {
      name: newConnectorName.trim(),
      connector_type: newConnectorType,
      provider_key: newConnectorProvider,
      is_enabled: true,
      config_json: null,
    });
    setNewConnectorName("");
    await reloadConnectors();
  };

  return (
    <div className="space-y-6 pb-8">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Settings</h1>
        <p className="mt-1 text-muted-foreground">Configure theme, API credentials, and the default provider used by app requests and API-based scraping.</p>
      </div>

      <div className="grid gap-4 xl:grid-cols-[1fr_1.2fr]">
        <Card>
          <CardHeader>
            <CardTitle>Workspace Profile</CardTitle>
            <CardDescription>Define the tracked brand and workspace-level defaults used across the app.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <label className="text-sm font-medium">Tracked Brand</label>
              <Input value={trackedBrand} onChange={(event) => setTrackedBrand(event.target.value)} placeholder="GeoRank AI" />
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium">Default Models</label>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="outline" className="w-full justify-between">
                    {defaultModels.length > 0 ? `${defaultModels.length} models selected` : "Select models"}
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="start" className="w-[240px]">
                  <DropdownMenuLabel>Default Models</DropdownMenuLabel>
                  <DropdownMenuSeparator />
                  {modelOptions.map((model) => (
                    <DropdownMenuCheckboxItem
                      key={model}
                      checked={defaultModels.includes(model)}
                      onCheckedChange={() =>
                        setDefaultModels((current) =>
                          current.includes(model) ? current.filter((item) => item !== model) : [...current, model]
                        )
                      }
                    >
                      {model}
                    </DropdownMenuCheckboxItem>
                  ))}
                </DropdownMenuContent>
              </DropdownMenu>
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium">Default Connector</label>
              <select
                value={defaultConnectorId}
                onChange={(event) => setDefaultConnectorId(event.target.value)}
                className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm shadow-xs outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50"
              >
                <option value="">No default connector</option>
                {connectors.map((connector) => (
                  <option key={connector.id} value={connector.id}>
                    {connector.name}
                  </option>
                ))}
              </select>
            </div>
          </CardContent>
          <CardFooter className="justify-end border-t pt-4">
            <Button onClick={() => void saveWorkspaceProfile()}>
              <Save className="h-4 w-4" />
              Save Workspace Defaults
            </Button>
          </CardFooter>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Appearance</CardTitle>
            <CardDescription>Basic interface theme preference for the dashboard.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-3 sm:grid-cols-2">
              {(["light", "dark"] as const).map((mode) => (
                <button
                  key={mode}
                  type="button"
                  onClick={() => void applyTheme(mode)}
                  className={cn(
                    "rounded-xl border p-4 text-left transition-colors",
                    theme === mode ? "border-foreground/20 bg-accent" : "border-border bg-background"
                  )}
                >
                  <div className="flex items-center gap-2">
                    {mode === "light" ? <Sun className="h-4 w-4" /> : <MoonStar className="h-4 w-4" />}
                    <span className="font-medium">{mode === "light" ? "Light Mode" : "Dark Mode"}</span>
                  </div>
                </button>
              ))}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Default Request Provider</CardTitle>
            <CardDescription>This provider is used by default for application requests and API-based scraping.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {providers.map((provider) => (
              <button
                key={provider.key}
                type="button"
                onClick={() => void updateDefault(provider.key)}
                className={cn(
                  "flex w-full items-start justify-between rounded-xl border p-4 text-left transition-colors",
                  defaultProvider === provider.key ? "border-foreground/20 bg-accent" : "border-border bg-background"
                )}
              >
                <div>
                  <div className="flex items-center gap-2">
                    <WandSparkles className="h-4 w-4" />
                    <span className="font-medium">{provider.label}</span>
                  </div>
                  <p className="mt-2 text-sm text-muted-foreground">{provider.description}</p>
                </div>
                <span className={cn("rounded-full border px-2 py-1 text-xs font-medium", defaultProvider === provider.key ? "border-emerald-200 bg-emerald-100 text-emerald-800" : "border-border bg-background text-muted-foreground")}>
                  {defaultProvider === provider.key ? "Default" : "Available"}
                </span>
              </button>
            ))}
          </CardContent>
        </Card>
      </div>

      <div className="space-y-4">
        <Card>
          <CardHeader>
            <CardTitle>Connectors</CardTitle>
            <CardDescription>Manage the scraper connectors available to this workspace.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-3 rounded-xl border bg-muted/20 p-4 md:grid-cols-[1.2fr_0.8fr_0.8fr_auto]">
              <Input value={newConnectorName} onChange={(event) => setNewConnectorName(event.target.value)} placeholder="Connector name" />
              <select
                value={newConnectorType}
                onChange={(event) => setNewConnectorType(event.target.value as ConnectorType)}
                className="h-9 rounded-md border border-input bg-background px-3 text-sm shadow-xs outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50"
              >
                <option value="llm_api">LLM API</option>
                <option value="ui_scraper">UI Scraper</option>
              </select>
              <select
                value={newConnectorProvider}
                onChange={(event) => setNewConnectorProvider(event.target.value as ProviderKey)}
                className="h-9 rounded-md border border-input bg-background px-3 text-sm shadow-xs outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50"
              >
                {providers.map((provider) => (
                  <option key={provider.key} value={provider.key}>
                    {provider.label}
                  </option>
                ))}
              </select>
              <Button onClick={() => void addConnector()}>Add Connector</Button>
            </div>

            <div className="space-y-3">
              {connectors.length === 0 ? (
                <div className="rounded-xl border border-dashed bg-muted/10 p-4 text-sm text-muted-foreground">
                  No connectors configured for this workspace.
                </div>
              ) : (
                connectors.map((connector) => (
                  <div key={connector.id} className="grid gap-3 rounded-xl border bg-card p-4 md:grid-cols-[1.2fr_0.8fr_0.8fr_auto_auto] md:items-center">
                    <Input
                      value={connector.name}
                      onChange={(event) =>
                        setConnectors((current) =>
                          current.map((item) => (item.id === connector.id ? { ...item, name: event.target.value } : item))
                        )
                      }
                    />
                    <select
                      value={connector.connector_type}
                      onChange={(event) =>
                        setConnectors((current) =>
                          current.map((item) =>
                            item.id === connector.id ? { ...item, connector_type: event.target.value as ConnectorType } : item
                          )
                        )
                      }
                      className="h-9 rounded-md border border-input bg-background px-3 text-sm shadow-xs outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50"
                    >
                      <option value="llm_api">LLM API</option>
                      <option value="ui_scraper">UI Scraper</option>
                    </select>
                    <select
                      value={connector.provider_key ?? ""}
                      onChange={(event) =>
                        setConnectors((current) =>
                          current.map((item) =>
                            item.id === connector.id ? { ...item, provider_key: event.target.value || null } : item
                          )
                        )
                      }
                      className="h-9 rounded-md border border-input bg-background px-3 text-sm shadow-xs outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50"
                    >
                      <option value="">No provider</option>
                      {providers.map((provider) => (
                        <option key={provider.key} value={provider.key}>
                          {provider.label}
                        </option>
                      ))}
                    </select>
                    <Button
                      variant={connector.is_enabled ? "default" : "outline"}
                      onClick={() =>
                        setConnectors((current) =>
                          current.map((item) =>
                            item.id === connector.id ? { ...item, is_enabled: !item.is_enabled } : item
                          )
                        )
                      }
                    >
                      {connector.is_enabled ? "Enabled" : "Disabled"}
                    </Button>
                    <div className="flex gap-2">
                      <Button
                        variant="outline"
                        onClick={async () => {
                          await updateConnector(connector.id, {
                            name: connector.name,
                            connector_type: connector.connector_type,
                            provider_key: connector.provider_key ?? null,
                            is_enabled: connector.is_enabled,
                          });
                          await reloadConnectors();
                        }}
                      >
                        Save
                      </Button>
                      <Button
                        variant="outline"
                        onClick={async () => {
                          await deleteConnector(connector.id);
                          if (defaultConnectorId === connector.id) {
                            setDefaultConnectorId("");
                            if (workspaceId) {
                              await upsertSetting(workspaceId, "default_connector", { connector_id: null });
                            }
                          }
                          await reloadConnectors();
                        }}
                      >
                        Delete
                      </Button>
                    </div>
                  </div>
                ))
              )}
            </div>
          </CardContent>
        </Card>

        {providers.map((provider) => {
          const isEditing = editingProvider === provider.key;
          const isVisible = visibleProvider === provider.key;
          return (
            <Card key={provider.key}>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <KeyRound className="h-4 w-4" />
                  {provider.label} API Key
                </CardTitle>
                <CardDescription>{provider.description}</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                {!isEditing ? (
                  <div className="rounded-xl border bg-muted/20 px-4 py-3">
                    <p className="text-xs uppercase tracking-[0.2em] text-muted-foreground">Stored Key</p>
                    <p className="mt-2 font-mono text-sm">{keys[provider.key] || "No key saved"}</p>
                  </div>
                ) : (
                  <div className="space-y-2">
                    <label className="text-sm font-medium">API Key</label>
                    <div className="flex gap-2">
                      <Input
                        type={isVisible ? "text" : "password"}
                        value={draftKeys[provider.key]}
                        onChange={(event) => setDraftKeys((current) => ({ ...current, [provider.key]: event.target.value }))}
                        placeholder={provider.placeholder}
                      />
                      <Button type="button" variant="outline" size="icon" onClick={() => setVisibleProvider(isVisible ? null : provider.key)}>
                        {isVisible ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                      </Button>
                    </div>
                    <p className="text-xs text-muted-foreground">
                      Existing keys cannot be viewed again. Saving here replaces the stored secret.
                    </p>
                  </div>
                )}
              </CardContent>
              <CardFooter className="flex justify-between border-t pt-4">
                <p className="text-sm text-muted-foreground">{provider.key === defaultProvider ? "Currently selected as the default provider." : "Available for manual selection and API scraping."}</p>
                <div className="flex gap-2">
                  {isEditing ? (
                    <>
                      <Button variant="outline" onClick={() => { setDraftKeys((current) => ({ ...current, [provider.key]: "" })); setEditingProvider(null); setVisibleProvider(null); }}>
                        Cancel
                      </Button>
                      <Button onClick={() => void saveProviderKey(provider.key)}>
                        <Save className="h-4 w-4" />
                        Save Key
                      </Button>
                    </>
                  ) : (
                    <>
                      <Button onClick={() => setEditingProvider(provider.key)}>{hasKeys[provider.key] ? "Replace Key" : "Add Key"}</Button>
                      {hasKeys[provider.key] ? (
                        <>
                          <Button variant="outline" onClick={() => void setCredentialEnabled(provider.key, false)}>
                            Disable
                          </Button>
                          <Button variant="outline" onClick={() => void clearProviderKey(provider.key)}>
                            Remove Key
                          </Button>
                        </>
                      ) : null}
                    </>
                  )}
                </div>
              </CardFooter>
            </Card>
          );
        })}
      </div>
    </div>
  );
}
