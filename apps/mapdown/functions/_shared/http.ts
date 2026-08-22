export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
    readonly details?: unknown
  ) {
    super(message);
    this.name = "ApiError";
  }
}

const PRIVATE_HEADERS = {
  "Cache-Control": "private, no-store",
  "Content-Type": "application/json; charset=utf-8",
  "X-Content-Type-Options": "nosniff"
};

export function jsonResponse(value: unknown, status = 200): Response {
  return new Response(JSON.stringify(value), { status, headers: PRIVATE_HEADERS });
}

export async function withApiErrors(run: () => Promise<Response>, request: Request): Promise<Response> {
  try {
    return await run();
  } catch (error) {
    if (error instanceof ApiError) {
      return jsonResponse(
        { error: { code: error.code, message: error.message, details: error.details } },
        error.status
      );
    }
    console.error(JSON.stringify({
      message: "mapdown api request failed",
      method: request.method,
      path: new URL(request.url).pathname,
      errorClass: error instanceof Error ? error.name : "unknown"
    }));
    return jsonResponse(
      { error: { code: "internal", message: "The Mapdown service could not complete this request." } },
      500
    );
  }
}

export function requireSameOriginMutation(request: Request): void {
  const origin = request.headers.get("Origin");
  if (!origin || origin !== new URL(request.url).origin) {
    throw new ApiError(403, "origin", "This request did not come from the Mapdown editor.");
  }
}

export async function readBoundedJson(
  request: Request,
  maximumBytes: number
): Promise<unknown> {
  if (!request.headers.get("Content-Type")?.toLowerCase().startsWith("application/json")) {
    throw new ApiError(415, "content_type", "Send this request as JSON.");
  }
  const declared = Number(request.headers.get("Content-Length"));
  if (Number.isFinite(declared) && declared > maximumBytes) {
    throw new ApiError(413, "too_large", "This request is larger than Mapdown allows.");
  }
  if (!request.body) throw new ApiError(400, "invalid_json", "The request body is missing.");

  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > maximumBytes) {
      await reader.cancel();
      throw new ApiError(413, "too_large", "This request is larger than Mapdown allows.");
    }
    chunks.push(value);
  }
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  try {
    return JSON.parse(new TextDecoder().decode(bytes));
  } catch {
    throw new ApiError(400, "invalid_json", "The request body is not valid JSON.");
  }
}

export function stringParam(value: string | string[] | undefined): string {
  if (typeof value !== "string" || !value) {
    throw new ApiError(404, "not_found", "This item could not be found.");
  }
  return value;
}
