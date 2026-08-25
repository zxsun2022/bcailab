import type {
  CloudDocumentRecord,
  CloudDocumentSummary,
  CloudPublication,
  CloudSessionState,
  CloudUser
} from "./types";
import type { PublishedView } from "../viewer/published-view";
import {
  createSilentSsoAttempt,
  isSilentSsoSuppressed,
  setSilentSsoSuppressed,
  silentSsoToken
} from "./silent-sso";

interface ApiErrorPayload {
  error?: { code?: string; message?: string; details?: unknown };
}

export class CloudApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
    readonly details?: unknown
  ) {
    super(message);
    this.name = "CloudApiError";
  }
}

async function api<T>(path: string, init: RequestInit = {}): Promise<T> {
  const response = await fetch(path, {
    ...init,
    credentials: "include",
    headers: {
      ...(init.body ? { "Content-Type": "application/json" } : {}),
      ...init.headers
    }
  });
  let payload: unknown = null;
  try {
    payload = await response.json();
  } catch {
    // A structured fallback below keeps proxy/platform failures understandable.
  }
  if (!response.ok) {
    const error = payload as ApiErrorPayload | null;
    throw new CloudApiError(
      response.status,
      error?.error?.code ?? "request_failed",
      error?.error?.message ?? "The Mapdown service could not complete this request.",
      error?.error?.details
    );
  }
  return payload as T;
}

function webOrigin(): string {
  if (import.meta.env.VITE_WEB_ORIGIN) return String(import.meta.env.VITE_WEB_ORIGIN);
  return location.hostname === "localhost" || location.hostname === "127.0.0.1"
    ? "http://localhost:3001"
    : "https://bcailab.com";
}

export async function signInToMapdown(): Promise<CloudUser> {
  setSilentSsoSuppressed(sessionStorage, false);
  const authOrigin = webOrigin();
  const url = new URL("/auth/mapdown", authOrigin);
  url.searchParams.set("origin", location.origin);
  const width = 520;
  const height = 640;
  const popup = window.open(
    url,
    "mapdown-auth",
    `width=${width},height=${height},left=${window.screenX + (window.outerWidth - width) / 2},top=${window.screenY + (window.outerHeight - height) / 2}`
  );
  if (!popup) throw new CloudApiError(0, "popup", "Allow the sign-in popup, then try again.");
  const token = await new Promise<string>((resolve, reject) => {
    const timeout = window.setTimeout(() => finish(new CloudApiError(0, "timeout", "Sign-in took too long. Try again.")), 2 * 60_000);
    const poll = window.setInterval(() => {
      if (popup.closed) finish(new CloudApiError(0, "closed", "Sign-in was closed before it finished."));
    }, 400);
    const onMessage = (event: MessageEvent) => {
      if (event.origin !== authOrigin || event.source !== popup) return;
      const data = event.data as { type?: unknown; token?: unknown };
      if (data?.type === "mapdown-auth" && typeof data.token === "string") finish(null, data.token);
    };
    const finish = (error: Error | null, value?: string) => {
      window.clearTimeout(timeout);
      window.clearInterval(poll);
      window.removeEventListener("message", onMessage);
      if (error) reject(error);
      else resolve(value!);
    };
    window.addEventListener("message", onMessage);
  });
  const result = await api<{ user: CloudUser }>("/api/auth/exchange", {
    method: "POST",
    body: JSON.stringify({ token })
  });
  return result.user;
}

export async function getCloudSession(): Promise<CloudSessionState> {
  const session = await api<CloudSessionState>("/api/auth/session");
  if (session.user || isSilentSsoSuppressed(sessionStorage)) return session;

  const user = await silentlySignInOnce();
  return user ? { user } : session;
}

export async function signOutOfMapdown(): Promise<void> {
  await api("/api/auth/logout", { method: "POST", body: "{}" });
  setSilentSsoSuppressed(sessionStorage, true);
}

async function silentlySignInToMapdown(): Promise<CloudUser | null> {
  const authOrigin = webOrigin();
  const url = new URL("/auth/mapdown/silent", authOrigin);
  url.searchParams.set("origin", location.origin);
  const frame = document.createElement("iframe");
  frame.hidden = true;
  frame.title = "Checking Studio sign-in";
  frame.src = url.toString();

  try {
    const token = await new Promise<string | null>((resolve) => {
      const timeout = window.setTimeout(() => finish(null), 5_000);
      const onMessage = (event: MessageEvent) => {
        if (event.origin !== authOrigin || event.source !== frame.contentWindow) return;
        const token = silentSsoToken(event.data);
        if (token !== undefined) finish(token);
      };
      const finish = (value: string | null) => {
        window.clearTimeout(timeout);
        window.removeEventListener("message", onMessage);
        resolve(value);
      };
      window.addEventListener("message", onMessage);
      document.body.append(frame);
    });
    if (!token) return null;
    const result = await api<{ user: CloudUser }>("/api/auth/exchange", {
      method: "POST",
      body: JSON.stringify({ token })
    });
    return result.user;
  } catch {
    return null;
  } finally {
    frame.remove();
  }
}

const silentlySignInOnce = createSilentSsoAttempt(silentlySignInToMapdown);

export async function listCloudDocuments(): Promise<CloudDocumentSummary[]> {
  return (await api<{ documents: CloudDocumentSummary[] }>("/api/documents")).documents;
}

export async function getCloudDocument(id: string): Promise<CloudDocumentRecord> {
  return (await api<{ document: CloudDocumentRecord }>(`/api/documents/${encodeURIComponent(id)}`)).document;
}

export async function createCloudDocument(input: {
  clientDocumentId: string;
  snapshot: CloudDocumentRecord["snapshot"];
}): Promise<CloudDocumentRecord> {
  return (await api<{ document: CloudDocumentRecord }>("/api/documents", {
    method: "POST",
    body: JSON.stringify(input)
  })).document;
}

export async function updateCloudDocument(input: {
  id: string;
  baseVersion: number;
  snapshot: CloudDocumentRecord["snapshot"];
}): Promise<CloudDocumentRecord> {
  return (await api<{ document: CloudDocumentRecord }>(`/api/documents/${encodeURIComponent(input.id)}`, {
    method: "PUT",
    body: JSON.stringify({ baseVersion: input.baseVersion, snapshot: input.snapshot })
  })).document;
}

export async function deleteCloudDocument(id: string): Promise<void> {
  await api(`/api/documents/${encodeURIComponent(id)}`, { method: "DELETE", body: "{}" });
}

export async function publishCloudDocument(input: {
  id: string;
  baseVersion: number;
  title: string;
  markdown: string;
  svg: string;
  png: string;
  /** The public view snapshot behind the live reader page (D-32). */
  view: PublishedView;
}): Promise<CloudPublication> {
  return (await api<{ publication: CloudPublication }>(`/api/documents/${encodeURIComponent(input.id)}/publish`, {
    method: "POST",
    body: JSON.stringify(input)
  })).publication;
}

/**
 * The read side of **Make a copy** (D-33). Public, unauthenticated, same-origin: the published
 * host has no write path, so the copy is fetched and made here, on the editor origin.
 */
export async function getPublishedMap(publicId: string): Promise<{ title: string; view: unknown }> {
  return api<{ title: string; view: unknown }>(`/api/publications/${encodeURIComponent(publicId)}`);
}

export async function unpublishCloudDocument(id: string): Promise<void> {
  await api(`/api/documents/${encodeURIComponent(id)}/unpublish`, { method: "POST", body: "{}" });
}
