import {
  DEFAULT_CHUNK_BYTES,
  PROTOCOL_VERSION,
  type EncodedTransfer,
  type TransferFile,
} from "./types";

export interface EncodeOptions {
  chunkBytes?: number;
}

function randomSessionId(): string {
  return Math.random().toString(36).slice(2, 8);
}

function toBase64(bytes: Uint8Array): string {
  let binary = "";
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary).replace(/=+$/, "");
}

function chunkFile(content: Uint8Array, chunkBytes: number): Uint8Array[] {
  const chunks: Uint8Array[] = [];
  for (let offset = 0; offset < content.length; offset += chunkBytes) {
    chunks.push(content.slice(offset, offset + chunkBytes));
  }
  if (chunks.length === 0) {
    chunks.push(new Uint8Array(0));
  }
  return chunks;
}

export class TransferEncoder {
  encode(files: TransferFile[], options?: EncodeOptions): EncodedTransfer {
    const chunkBytes = options?.chunkBytes ?? DEFAULT_CHUNK_BYTES;
    const sessionId = randomSessionId();
    const fileChunks = files.map((file) => ({
      path: file.path,
      size: file.content.length,
      chunks: chunkFile(file.content, chunkBytes),
    }));

    const manifest = {
      v: PROTOCOL_VERSION,
      t: "M" as const,
      id: sessionId,
      i: 0,
      cb: chunkBytes,
      files: fileChunks.map((entry) => ({
        p: entry.path,
        s: entry.size,
        n: entry.chunks.length,
      })),
      total: 0,
    };

    const dataPayloads: string[] = [];
    let qrIndex = 1;

    for (let fileIndex = 0; fileIndex < fileChunks.length; fileIndex++) {
      const entry = fileChunks[fileIndex];
      for (let chunkIndex = 0; chunkIndex < entry.chunks.length; chunkIndex++) {
        const payload = {
          v: PROTOCOL_VERSION,
          t: "D" as const,
          id: sessionId,
          i: qrIndex,
          f: fileIndex,
          c: chunkIndex,
          d: toBase64(entry.chunks[chunkIndex]),
        };
        dataPayloads.push(JSON.stringify(payload));
        qrIndex++;
      }
    }

    manifest.total = 1 + dataPayloads.length;
    const payloads = [JSON.stringify(manifest), ...dataPayloads];

    return {
      sessionId,
      payloads,
      fileCount: files.length,
      totalQrs: payloads.length,
    };
  }

  encodeText(text: string, filename = "content.txt", options?: EncodeOptions): EncodedTransfer {
    const encoder = new TextEncoder();
    return this.encode([{ path: filename, content: encoder.encode(text) }], options);
  }
}
