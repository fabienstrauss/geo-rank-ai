"use client";

import { useState } from "react";
import { Eye, EyeOff, KeyRound, MoonStar, Save, Sun, WandSparkles } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

type ThemeMode = "light" | "dark";
type ProviderKey = "openai" | "anthropic" | "google";

type ProviderConfig = {
  key: ProviderKey;
  label: string;
  placeholder: string;
  description: string;
};

const providers: ProviderConfig[] = [
  {
    key: "openai",
    label: "OpenAI",
    placeholder: "sk-...",
    description: "Used for app requests and API-based scraping when OpenAI is selected.",
  },
  {
    key: "anthropic",
    label: "Anthropic",
    placeholder: "sk-ant-...",
    description: "Used for Claude-backed requests and API-based scraping.",
  },
  {
    key: "google",
    label: "Google AI",
    placeholder: "AIza...",
    description: "Used for Gemini-backed requests and API-based scraping.",
  },
];

function maskKey(value: string) {
  if (!value) return "No key saved";
  if (value.length <= 8) return "••••••••";
  return `${value.slice(0, 4)}••••••${value.slice(-4)}`;
}

export function SettingsManager() {
  const [theme, setTheme] = useState<ThemeMode>(() => {
    if (typeof window === "undefined") {
      return "light";
    }
    return window.localStorage.getItem("georank-theme") === "dark" ? "dark" : "light";
  });
  const [defaultProvider, setDefaultProvider] = useState<ProviderKey>(() => {
    if (typeof window === "undefined") {
      return "openai";
    }
    const storedProvider = window.localStorage.getItem("georank-default-provider") as ProviderKey | null;
    return storedProvider && providers.some((provider) => provider.key === storedProvider) ? storedProvider : "openai";
  });
  const [keys, setKeys] = useState<Record<ProviderKey, string>>({
    openai: "sk-demo-openai-1234",
    anthropic: "sk-ant-demo-9876",
    google: "",
  });
  const [draftKeys, setDraftKeys] = useState<Record<ProviderKey, string>>(keys);
  const [editingProvider, setEditingProvider] = useState<ProviderKey | null>(null);
  const [visibleProvider, setVisibleProvider] = useState<ProviderKey | null>(null);

  const applyTheme = (nextTheme: ThemeMode) => {
    setTheme(nextTheme);
    document.documentElement.classList.toggle("dark", nextTheme === "dark");
    window.localStorage.setItem("georank-theme", nextTheme);
  };

  const saveProviderKey = (provider: ProviderKey) => {
    setKeys((current) => ({ ...current, [provider]: draftKeys[provider] }));
    setEditingProvider(null);
    setVisibleProvider(null);
  };

  const updateDefaultProvider = (provider: ProviderKey) => {
    setDefaultProvider(provider);
    window.localStorage.setItem("georank-default-provider", provider);
  };

  return (
    <div className="space-y-6 pb-8">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Settings</h1>
        <p className="mt-1 text-muted-foreground">
          Configure theme, API credentials, and the default provider used by app requests and API-based scraping.
        </p>
      </div>

      <div className="grid gap-4 xl:grid-cols-[1fr_1.2fr]">
        <Card>
          <CardHeader>
            <CardTitle>Appearance</CardTitle>
            <CardDescription>Basic interface theme preference for the dashboard.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-3 sm:grid-cols-2">
              <button
                type="button"
                onClick={() => applyTheme("light")}
                className={cn(
                  "rounded-xl border p-4 text-left transition-colors",
                  theme === "light" ? "border-foreground/20 bg-accent" : "border-border bg-background"
                )}
              >
                <div className="flex items-center gap-2">
                  <Sun className="h-4 w-4" />
                  <span className="font-medium">Light Mode</span>
                </div>
                <p className="mt-2 text-sm text-muted-foreground">Clean neutral interface for daytime work.</p>
              </button>

              <button
                type="button"
                onClick={() => applyTheme("dark")}
                className={cn(
                  "rounded-xl border p-4 text-left transition-colors",
                  theme === "dark" ? "border-foreground/20 bg-accent" : "border-border bg-background"
                )}
              >
                <div className="flex items-center gap-2">
                  <MoonStar className="h-4 w-4" />
                  <span className="font-medium">Dark Mode</span>
                </div>
                <p className="mt-2 text-sm text-muted-foreground">Reduced glare for monitoring and debugging sessions.</p>
              </button>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Default Request Provider</CardTitle>
            <CardDescription>
              This provider is used by default for application requests. The same key is used by the scraper when API mode is selected.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {providers.map((provider) => (
              <button
                key={provider.key}
                type="button"
                onClick={() => updateDefaultProvider(provider.key)}
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
                <span
                  className={cn(
                    "rounded-full border px-2 py-1 text-xs font-medium",
                    defaultProvider === provider.key
                      ? "border-emerald-200 bg-emerald-100 text-emerald-800"
                      : "border-border bg-background text-muted-foreground"
                  )}
                >
                  {defaultProvider === provider.key ? "Default" : "Available"}
                </span>
              </button>
            ))}
          </CardContent>
        </Card>
      </div>

      <div className="space-y-4">
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
                    <p className="mt-2 font-mono text-sm">{maskKey(keys[provider.key])}</p>
                  </div>
                ) : (
                  <div className="space-y-2">
                    <label className="text-sm font-medium">API Key</label>
                    <div className="flex gap-2">
                      <Input
                        type={isVisible ? "text" : "password"}
                        value={draftKeys[provider.key]}
                        onChange={(event) =>
                          setDraftKeys((current) => ({ ...current, [provider.key]: event.target.value }))
                        }
                        placeholder={provider.placeholder}
                      />
                      <Button
                        type="button"
                        variant="outline"
                        size="icon"
                        aria-label={isVisible ? "Hide API key" : "Show API key"}
                        onClick={() => setVisibleProvider(isVisible ? null : provider.key)}
                      >
                        {isVisible ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                      </Button>
                    </div>
                  </div>
                )}
              </CardContent>
              <CardFooter className="flex justify-between border-t pt-4">
                <p className="text-sm text-muted-foreground">
                  {provider.key === defaultProvider
                    ? "Currently selected as the default provider."
                    : "Available for manual selection and API scraping."}
                </p>
                <div className="flex gap-2">
                  {isEditing ? (
                    <>
                      <Button
                        variant="outline"
                        onClick={() => {
                          setDraftKeys((current) => ({ ...current, [provider.key]: keys[provider.key] }));
                          setEditingProvider(null);
                          setVisibleProvider(null);
                        }}
                      >
                        Cancel
                      </Button>
                      <Button onClick={() => saveProviderKey(provider.key)}>
                        <Save className="h-4 w-4" />
                        Save Key
                      </Button>
                    </>
                  ) : (
                    <Button onClick={() => setEditingProvider(provider.key)}>
                      {keys[provider.key] ? "Edit Key" : "Add Key"}
                    </Button>
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
