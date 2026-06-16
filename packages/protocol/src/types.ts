export const PROTOCOL_VERSION = 1;
export const CHUNK_BYTES = 480;

export type QrType = "M" | "D";

export interface FileManifestEntry {
  p: string;
  s: number;
  n: number;
}

export interface SessionManifest {
  v: number;
  t: "M";
  id: string;
  i: number;
  files: FileManifestEntry[];
  total: number;
}

export interface DataChunk {
  v: number;
  t: "D";
  id: string;
  i: number;
  f: number;
  c: number;
  d: string;
}

export type QrPayload = SessionManifest | DataChunk;

export interface TransferFile {
  path: string;
  content: Uint8Array;
}

export interface EncodedTransfer {
  sessionId: string;
  payloads: string[];
  fileCount: number;
  totalQrs: number;
}

export interface ReceiveProgress {
  received: number;
  total: number;
  filesComplete: number;
  fileCount: number;
}
