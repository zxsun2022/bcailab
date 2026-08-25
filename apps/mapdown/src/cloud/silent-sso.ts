const SUPPRESSION_KEY = "mapdown-silent-sso-suppressed";

interface SessionStorageLike {
  getItem(key: string): string | null;
  removeItem(key: string): void;
  setItem(key: string, value: string): void;
}

export function createSilentSsoAttempt<T>(attempt: () => Promise<T>): () => Promise<T | null> {
  let attempted = false;
  let inFlight: Promise<T> | null = null;

  return () => {
    if (inFlight) return inFlight;
    if (attempted) return Promise.resolve(null);

    attempted = true;
    inFlight = attempt().finally(() => {
      inFlight = null;
    });
    return inFlight;
  };
}

export function isSilentSsoSuppressed(storage: SessionStorageLike): boolean {
  try {
    return storage.getItem(SUPPRESSION_KEY) === "1";
  } catch {
    return false;
  }
}

export function setSilentSsoSuppressed(storage: SessionStorageLike, suppressed: boolean): void {
  try {
    if (suppressed) storage.setItem(SUPPRESSION_KEY, "1");
    else storage.removeItem(SUPPRESSION_KEY);
  } catch {
    // Storage denial must not block explicit authentication or sign-out.
  }
}

export function silentSsoToken(data: unknown): string | null | undefined {
  if (!data || typeof data !== "object" || Array.isArray(data)) return undefined;
  const message = data as { type?: unknown; token?: unknown };
  if (message.type !== "mapdown-silent-auth") return undefined;
  return typeof message.token === "string" ? message.token : null;
}
