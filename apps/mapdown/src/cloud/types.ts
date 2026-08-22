import type { MindMapDocument, NodeId } from "../model/types";

export interface CloudSnapshot {
  schemaVersion: number;
  document: MindMapDocument;
  selectedNodeId: NodeId | null;
}

export interface CloudPublication {
  publicId: string;
  publicUrl: string;
  version: number;
  updatedAt: number;
}

export interface CloudDocumentSummary {
  id: string;
  clientDocumentId: string;
  title: string;
  nodeCount: number;
  version: number;
  createdAt: number;
  updatedAt: number;
  publication: CloudPublication | null;
}

export interface CloudDocumentRecord extends CloudDocumentSummary {
  snapshot: CloudSnapshot;
}

export interface CloudUser {
  id: string;
  email: string;
  name: string | null;
  avatarUrl: string | null;
}

export interface CloudSessionState {
  user: CloudUser | null;
}
