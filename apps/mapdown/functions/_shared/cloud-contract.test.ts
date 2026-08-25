import { describe, expect, it } from "vitest";
import {
  allowedMapdownOrigin,
  createMapdownHandoff,
  hashMapdownNonce
} from "../../../web/app/utils/mapdown-handoff.server";
import { ApiError } from "./http";
import { verifyMapdownHandoff } from "./handoff";
import { serializeMapdownSessionCookie } from "./session";
import {
  validateCloudSnapshot,
  validatePublishedMarkdown,
  validatePublishedPng,
  validatePublishedSvg,
  validatePublishedView
} from "./validation";
import { createDocument, SCHEMA_VERSION } from "../../src/model/types";
import { toPublishedView } from "../../src/viewer/published-view";
import { PUBLISHED_VIEW_MAX_BYTES } from "./limits";

const SECRET = "test-secret-with-enough-entropy-for-a-contract-test";
const AUDIENCE = "https://map.bcailab.com";
const PREVIEW_AUDIENCE = "https://review.mapdown.pages.dev";
const NOW = Date.UTC(2026, 7, 21, 12);
const NONCE = "123e4567-e89b-12d3-a456-426614174000";

function pngDataUrl(width = 1200, height = 630): string {
  const bytes = new Uint8Array(24);
  bytes.set([137, 80, 78, 71, 13, 10, 26, 10]);
  bytes.set([73, 72, 68, 82], 12);
  new DataView(bytes.buffer).setUint32(16, width);
  new DataView(bytes.buffer).setUint32(20, height);
  return `data:image/png;base64,${btoa(String.fromCharCode(...bytes))}`;
}

describe("Mapdown sign-in handoff", () => {
  it("round-trips a short-lived, audience-bound token and nonce digest", async () => {
    const created = await createMapdownHandoff({
      secret: SECRET,
      userId: "user-1",
      audience: AUDIENCE,
      nowMs: NOW,
      nonce: NONCE
    });
    const verified = await verifyMapdownHandoff({
      secret: SECRET,
      token: created.token,
      audience: AUDIENCE,
      nowMs: NOW + 59_000
    });

    expect(verified).toMatchObject({ userId: "user-1", nonce: NONCE, audience: AUDIENCE });
    expect(created.nonceHash).toBe(await hashMapdownNonce(NONCE));
  });

  it("rejects tampering, expiry, and a different audience", async () => {
    const { token } = await createMapdownHandoff({
      secret: SECRET,
      userId: "user-1",
      audience: AUDIENCE,
      nowMs: NOW,
      nonce: NONCE
    });

    await expect(verifyMapdownHandoff({
      secret: SECRET,
      token: `${token.slice(0, -1)}x`,
      audience: AUDIENCE,
      nowMs: NOW
    })).rejects.toThrow("invalid handoff");
    await expect(verifyMapdownHandoff({
      secret: SECRET,
      token,
      audience: "http://localhost:5173",
      nowMs: NOW
    })).rejects.toThrow("invalid handoff");
    await expect(verifyMapdownHandoff({
      secret: SECRET,
      token,
      audience: AUDIENCE,
      nowMs: NOW + 61_000
    })).rejects.toThrow("expired handoff");
  });

  it("allows only production, an explicitly configured preview, and local HTTP development", () => {
    expect(allowedMapdownOrigin("https://map.bcailab.com")).toBe(AUDIENCE);
    expect(allowedMapdownOrigin("http://localhost:5173")).toBe("http://localhost:5173");
    expect(allowedMapdownOrigin(PREVIEW_AUDIENCE, PREVIEW_AUDIENCE)).toBe(PREVIEW_AUDIENCE);
    expect(allowedMapdownOrigin(PREVIEW_AUDIENCE)).toBeNull();
    expect(allowedMapdownOrigin(
      "https://attacker.mapdown.pages.dev",
      PREVIEW_AUDIENCE
    )).toBeNull();
    expect(allowedMapdownOrigin("https://evil.example")).toBeNull();
    expect(allowedMapdownOrigin("https://map.bcailab.com/attacker-path")).toBeNull();
  });

  it("round-trips a handoff for the explicitly configured preview origin", async () => {
    const created = await createMapdownHandoff({
      secret: SECRET,
      userId: "user-1",
      audience: PREVIEW_AUDIENCE,
      previewOrigin: PREVIEW_AUDIENCE,
      nowMs: NOW,
      nonce: NONCE
    });
    await expect(verifyMapdownHandoff({
      secret: SECRET,
      token: created.token,
      audience: PREVIEW_AUDIENCE,
      nowMs: NOW + 1_000
    })).resolves.toMatchObject({ audience: PREVIEW_AUDIENCE });
  });
});

describe("Mapdown cloud contracts", () => {
  it("accepts a valid lossless snapshot and rejects inconsistent trees", async () => {
    const document = { ...createDocument("Root"), title: "Roadmap" };
    const snapshot = { schemaVersion: SCHEMA_VERSION, document, selectedNodeId: document.rootId };
    const validated = await validateCloudSnapshot(snapshot);

    expect(validated.nodeCount).toBe(1);
    expect(validated.snapshot).toEqual(snapshot);
    await expect(validateCloudSnapshot({
      ...snapshot,
      document: {
        ...document,
        nodes: {
          ...document.nodes,
          [document.rootId]: { ...document.nodes[document.rootId], childIds: ["missing"] }
        }
      }
    })).rejects.toMatchObject({ status: 400, code: "snapshot" });
  });

  it("requires canonical Markdown and a safe exporter SVG", () => {
    expect(validatePublishedMarkdown("# Root\n")).toBe("# Root\n");
    expect(validatePublishedMarkdown(
      "---\nmindmap:\n  version: 1\n  shape: dark\n  palette: night-glow\n---\n\n# Root\n"
    )).toContain("# Root");
    expect(() => validatePublishedMarkdown("---\nshape: pill\n# Root\n")).toThrow(ApiError);
    expect(validatePublishedSvg(
      '<svg xmlns="http://www.w3.org/2000/svg" aria-label="url(foo) onclick = handler href = note"><desc>Generated by Mapdown</desc><text>url(foo) onclick = handler href = note</text></svg>'
    )).toContain("Generated by Mapdown");
    expect(() => validatePublishedSvg(
      '<svg xmlns="http://www.w3.org/2000/svg"><desc>Generated by Mapdown</desc><script>alert(1)</script></svg>'
    )).toThrow(ApiError);
    expect(() => validatePublishedSvg(
      '<svg xmlns="http://www.w3.org/2000/svg"><desc>Generated by Mapdown</desc><text onclick="alert(1)">Root</text></svg>'
    )).toThrow(ApiError);
    expect(() => validatePublishedSvg(
      '<svg xmlns="http://www.w3.org/2000/svg"><desc>Generated by Mapdown</desc><rect fill="url(https://evil.example/image)" /></svg>'
    )).toThrow(ApiError);
  });

  it("accepts only the fixed-size PNG generated for link previews", () => {
    expect(validatePublishedPng(pngDataUrl()).byteLength).toBe(24);
    expect(() => validatePublishedPng(pngDataUrl(1199, 630))).toThrow(ApiError);
    expect(() => validatePublishedPng("data:image/png;base64,bm90IGEgcG5n")).toThrow(ApiError);
  });

  it("keeps the Mapdown session host-only and secure in production", () => {
    const production = serializeMapdownSessionCookie(
      new Request("https://map.bcailab.com/api/session"),
      "token",
      60
    );
    expect(production).toContain("HttpOnly");
    expect(production).toContain("SameSite=Lax");
    expect(production).toContain("Secure");
    expect(production).not.toContain("Domain=");

    const local = serializeMapdownSessionCookie(
      new Request("http://localhost:5173/api/session"),
      "token",
      60
    );
    expect(local).not.toContain("Secure");
  });
});

describe("published view snapshot", () => {
  const document = createDocument("Root");

  it("accepts the view the client renders from the document it is publishing", () => {
    const { view, json } = validatePublishedView(toPublishedView(document), 1);
    expect(view.rootId).toBe(document.rootId);
    expect(JSON.parse(json)).toEqual(view);
  });

  it("rejects a view that describes a different document than the one being published", () => {
    // The frozen SVG and the live view are rendered from one document; a node-count mismatch
    // means the reader would be shown something the author did not publish.
    expect(() => validatePublishedView(toPublishedView(document), 2)).toThrow(ApiError);
  });

  it("rejects an unsupported format, a broken tree, and an oversized payload", () => {
    expect(() => validatePublishedView({ formatVersion: 99 }, 1)).toThrow(ApiError);
    expect(() => validatePublishedView(null, 1)).toThrow(ApiError);

    const cyclic = toPublishedView(document);
    cyclic.nodes[document.rootId]!.childIds = [document.rootId];
    expect(() => validatePublishedView(cyclic, 1)).toThrow(ApiError);

    const huge = toPublishedView(document);
    huge.nodes[document.rootId]!.text = "x".repeat(PUBLISHED_VIEW_MAX_BYTES + 1);
    expect(() => validatePublishedView(huge, 1)).toThrow(ApiError);
  });

  it("rejects a node id that could not have come from the editor", () => {
    const view = toPublishedView(document);
    view.nodes["bad id"] = { id: "bad id", text: "", parentId: document.rootId, childIds: [], collapsed: false, side: null };
    view.nodes[document.rootId]!.childIds = ["bad id"];
    expect(() => validatePublishedView(view, 2)).toThrow(ApiError);
  });
});
