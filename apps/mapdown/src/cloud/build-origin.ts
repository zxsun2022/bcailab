export function resolveMapdownWebOriginForBuild(
  environment: Record<string, string | undefined>
): string | undefined {
  const explicitOrigin = environment.VITE_WEB_ORIGIN?.trim();
  if (explicitOrigin) return explicitOrigin;

  return environment.CF_PAGES_BRANCH === "staging"
    ? "https://staging.bcailab.pages.dev"
    : undefined;
}
