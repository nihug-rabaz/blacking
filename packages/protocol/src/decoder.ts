import {
  PROTOCOL_VERSION,
  type DataChunk,
  type QrPayload,
  type ReceiveProgress,
  type SessionManifest,
  type TransferFile,
} from "./types";

function fromBase64(base64: string): Uint8Array {
  const padded = base64 + "=".repeat((4 - (base64.length % 4)) % 4);
  const binary = atob(padded);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

function isManifest(payload: QrPayload): payload is SessionManifest {
  return payload.t === "M";
}

function isDataChunk(payload: QrPayload): payload is DataChunk {
  return payload.t === "D";
}

export class TransferDecoder {
  private sessionId: string | null = null;
  private manifest: SessionManifest | null = null;
  private chunks = new Map<string, Uint8Array>();
  private receivedIndices = new Set<number>();

  reset(): void {
    this.sessionId = null;
    this.manifest = null;
    this.chunks.clear();
    this.receivedIndices.clear();
  }

  ingest(raw: string): { accepted: boolean; duplicate: boolean; complete: boolean } {
    let payload: QrPayload;
    try {
      payload = JSON.parse(raw) as QrPayload;
    } catch {
      return { accepted: false, duplicate: false, complete: false };
    }

    if (payload.v !== PROTOCOL_VERSION) {
      return { accepted: false, duplicate: false, complete: false };
    }

    if (isManifest(payload)) {
      return this.ingestManifest(payload);
    }

    if (isDataChunk(payload)) {
      return this.ingestData(payload);
    }

    return { accepted: false, duplicate: false, complete: false };
  }

  getProgress(): ReceiveProgress {
    const total = this.manifest?.total ?? 0;
    return {
      received: this.receivedIndices.size,
      total,
      filesComplete: this.countCompleteFiles(),
      fileCount: this.manifest?.files.length ?? 0,
    };
  }

  isComplete(): boolean {
    if (!this.manifest) {
      return false;
    }
    return this.receivedIndices.size >= this.manifest.total;
  }

  assemble(): TransferFile[] {
    if (!this.manifest || !this.isComplete()) {
      return [];
    }

    return this.manifest.files.map((file, fileIndex) => {
      const parts: Uint8Array[] = [];
      for (let chunkIndex = 0; chunkIndex < file.n; chunkIndex++) {
        const key = `${fileIndex}:${chunkIndex}`;
        const chunk = this.chunks.get(key);
        if (!chunk) {
          throw new Error(`Missing chunk ${key}`);
        }
        parts.push(chunk);
      }
      const totalSize = parts.reduce((sum, part) => sum + part.length, 0);
      const content = new Uint8Array(totalSize);
      let offset = 0;
      for (const part of parts) {
        content.set(part, offset);
        offset += part.length;
      }
      return { path: file.p, content };
    });
  }

  private ingestManifest(payload: SessionManifest): {
    accepted: boolean;
    duplicate: boolean;
    complete: boolean;
  } {
    if (this.receivedIndices.has(payload.i)) {
      return { accepted: false, duplicate: true, complete: this.isComplete() };
    }

    this.sessionId = payload.id;
    this.manifest = payload;
    this.receivedIndices.add(payload.i);
    return { accepted: true, duplicate: false, complete: this.isComplete() };
  }

  private ingestData(payload: DataChunk): {
    accepted: boolean;
    duplicate: boolean;
    complete: boolean;
  } {
    if (!this.manifest || payload.id !== this.sessionId) {
      return { accepted: false, duplicate: false, complete: false };
    }

    if (payload.i >= this.manifest.total) {
      return { accepted: false, duplicate: false, complete: false };
    }

    if (this.receivedIndices.has(payload.i)) {
      return { accepted: false, duplicate: true, complete: this.isComplete() };
    }

    const file = this.manifest.files[payload.f];
    if (!file || payload.c >= file.n) {
      return { accepted: false, duplicate: false, complete: false };
    }

    this.chunks.set(`${payload.f}:${payload.c}`, fromBase64(payload.d));
    this.receivedIndices.add(payload.i);
    return { accepted: true, duplicate: false, complete: this.isComplete() };
  }

  private countCompleteFiles(): number {
    if (!this.manifest) {
      return 0;
    }

    let complete = 0;
    for (let fileIndex = 0; fileIndex < this.manifest.files.length; fileIndex++) {
      const file = this.manifest.files[fileIndex];
      let fileComplete = true;
      for (let chunkIndex = 0; chunkIndex < file.n; chunkIndex++) {
        if (!this.chunks.has(`${fileIndex}:${chunkIndex}`)) {
          fileComplete = false;
          break;
        }
      }
      if (fileComplete) {
        complete++;
      }
    }
    return complete;
  }
}
