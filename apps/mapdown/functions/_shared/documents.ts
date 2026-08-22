import type { CloudDocumentRecord, CloudDocumentSummary, CloudPublication, CloudSnapshot } from "../../src/cloud/types";
import { ApiError } from "./http";

interface DocumentRow {
  id: string;
  client_document_id: string;
  title: string;
  snapshot_json?: string;
  snapshot_digest?: string;
  node_count: number;
  version: number;
  created_at: number;
  updated_at: number;
  public_id: string | null;
  publication_version: number | null;
  publication_updated_at: number | null;
}

function publication(row: DocumentRow, publishedOrigin: string): CloudPublication | null {
  return row.public_id && row.publication_version !== null && row.publication_updated_at !== null
    ? {
        publicId: row.public_id,
        publicUrl: `${publishedOrigin}/p/${row.public_id}`,
        version: Number(row.publication_version),
        updatedAt: Number(row.publication_updated_at)
      }
    : null;
}

export function summaryFromRow(row: DocumentRow, publishedOrigin: string): CloudDocumentSummary {
  return {
    id: row.id,
    clientDocumentId: row.client_document_id,
    title: row.title,
    nodeCount: Number(row.node_count),
    version: Number(row.version),
    createdAt: Number(row.created_at),
    updatedAt: Number(row.updated_at),
    publication: publication(row, publishedOrigin)
  };
}

const SELECT_DOCUMENT = `
  SELECT d.id, d.client_document_id, d.title, d.snapshot_json, d.snapshot_digest,
    d.node_count, d.version, d.created_at, d.updated_at,
    p.public_id, p.version AS publication_version, p.updated_at AS publication_updated_at
  FROM mapdown_documents d
  LEFT JOIN mapdown_publications p
    ON p.document_id = d.id AND p.revoked_at IS NULL
`;

export async function listDocuments(
  db: D1Database,
  userId: string,
  publishedOrigin: string
): Promise<CloudDocumentSummary[]> {
  const result = await db.prepare(`${SELECT_DOCUMENT}
    WHERE d.user_id = ?
    ORDER BY d.updated_at DESC, d.id DESC
  `).bind(userId).all<DocumentRow>();
  return result.results.map((row) => summaryFromRow(row, publishedOrigin));
}

export async function getDocument(
  db: D1Database,
  userId: string,
  id: string,
  publishedOrigin: string
): Promise<CloudDocumentRecord | null> {
  const row = await db.prepare(`${SELECT_DOCUMENT}
    WHERE d.user_id = ? AND d.id = ?
    LIMIT 1
  `).bind(userId, id).first<DocumentRow>();
  if (!row?.snapshot_json) return null;
  let snapshot: CloudSnapshot;
  try {
    snapshot = JSON.parse(row.snapshot_json) as CloudSnapshot;
  } catch {
    throw new ApiError(500, "stored_snapshot", "The saved online copy is unreadable.");
  }
  return { ...summaryFromRow(row, publishedOrigin), snapshot };
}

export async function findDocumentByClientId(
  db: D1Database,
  userId: string,
  clientDocumentId: string,
  publishedOrigin: string
): Promise<(CloudDocumentRecord & { snapshotDigest: string }) | null> {
  const row = await db.prepare(`${SELECT_DOCUMENT}
    WHERE d.user_id = ? AND d.client_document_id = ?
    LIMIT 1
  `).bind(userId, clientDocumentId).first<DocumentRow>();
  if (!row?.snapshot_json || !row.snapshot_digest) return null;
  return {
    ...summaryFromRow(row, publishedOrigin),
    snapshot: JSON.parse(row.snapshot_json) as CloudSnapshot,
    snapshotDigest: row.snapshot_digest
  };
}

export function withoutSnapshotDigest(
  document: CloudDocumentRecord & { snapshotDigest: string }
): CloudDocumentRecord {
  const { snapshotDigest, ...record } = document;
  void snapshotDigest;
  return record;
}

export function notFound(): ApiError {
  return new ApiError(404, "not_found", "This saved online document could not be found.");
}
