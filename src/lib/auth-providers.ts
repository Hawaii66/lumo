const PROVIDER_LABELS: Record<string, string> = {
  temp: "Temp",
  openai: "ChatGPT",
  google: "Google",
  "microsoft-entra-id": "Microsoft",
}

export function authProviderLabel(provider: string): string {
  return PROVIDER_LABELS[provider] ?? provider
}

export function authProvidersLabel(
  providers: Array<{ provider: string }> | undefined,
): string {
  if (!providers || providers.length === 0) return "—"
  return providers.map((p) => authProviderLabel(p.provider)).join(", ")
}
