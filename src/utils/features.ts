export type Feature = { name: string; enabled: boolean };

// Only development builds may override Firestore; missing flags stay disabled.
export function isAccountEnabled(
  features: readonly Feature[],
  mode = process.env.NODE_ENV,
  override = process.env.REACT_APP_ACCOUNT_OVERRIDE,
): boolean {
  if (mode === "development") {
    if (override === "true") return true;
    if (override === "false") return false;
  }
  return features.some((feature) => feature.name === "account" && feature.enabled === true);
}

export function parseFeature(name: string, data: Record<string, unknown>): Feature {
  return { name, enabled: data.enabled === true };
}
